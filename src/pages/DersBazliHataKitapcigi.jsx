import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { pdfBelgesiAc, sayfayiGoruntuyeCevir } from '../lib/kitapcikOcr'

// HataKitapcigi.jsx'in "tek sınav, tek kitapçık" mantığının, "bir öğrencinin
// SEÇTİĞİ TEK bir dersteki (ör. Kimya), BİRDEN FAZLA sınavdaki tüm yanlış/boş
// sorularını TEK bir yazdırılabilir kitapçıkta birleştiren" hali. Kesme
// mekanizması (kitapçık PDF'ini kaydedildiği ölçekte tekrar görüntüye çevirip
// x/y/genişlik/yükseklik'e göre kırpma) HataKitapcigi ile BİREBİR aynı —
// tek fark, burada bunu tek bir (sinav_id, kitapcik) çifti yerine, öğrencinin
// o dersten yanlış/boş sorusu olan HER sınavı için ayrı ayrı yapıp sonuçları
// sınava göre gruplanmış tek sayfada art arda diziyoruz.
//
// Route: /ders-hata-kitapcigi/:ogrenciId/:ders  (?tur=TYT|AYT|Konu Analiz|Diğer|Tümü)
export default function DersBazliHataKitapcigi() {
  const { ogrenciId, ders: dersParam } = useParams()
  const [searchParams] = useSearchParams()
  const tur = searchParams.get('tur') || 'TYT'
  const { profile } = useAuth()

  const [durum, setDurum] = useState('yukleniyor') // yukleniyor | hazir | temiz | hata
  const [ilerlemeMetni, setIlerlemeMetni] = useState('Hazırlanıyor...')
  const [hataMetni, setHataMetni] = useState('')
  const [temizMetni, setTemizMetni] = useState('')

  const [ogrenciAdi, setOgrenciAdi] = useState('')
  const [sinavGruplari, setSinavGruplari] = useState([]) // [{sonucId, sinavAdi, sinavTarihi, kitapcikTuru, sorular:[...]}]
  const [eksikKitapciklar, setEksikKitapciklar] = useState([]) // [{sinavAdi, soruSayisi}]
  const [bulunamayanlar, setBulunamayanlar] = useState([]) // [{sinavAdi, soru_no}]
  const [toplamSoruSayisi, setToplamSoruSayisi] = useState(0)

  const ders = decodeURIComponent(dersParam || '')

  useEffect(() => {
    let iptalEdildi = false

    async function hazirla() {
      try {
        if (!profile) return

        setIlerlemeMetni('Öğrenci bilgisi doğrulanıyor...')
        const { data: ogrenci, error: ogrenciHatasi } = await supabase
          .from('ogrenciler')
          .select('id, ad_soyad, veli_profile_id, ogrenci_profile_id')
          .eq('id', ogrenciId)
          .maybeSingle()
        if (ogrenciHatasi || !ogrenci) throw new Error('Bu öğrenci kaydı bulunamadı.')
        if (iptalEdildi) return

        // GÜVENLİK: Karnem.jsx'teki AYNI kanıtlanmış yöntem — sunucudaki RLS'ye
        // körü körüne güvenmek yerine, İSTEMCİ TARAFINDA da sadece yönetici
        // veya bu öğrencinin kendisine/velisine bağlı profil bu sayfayı görebilsin.
        const erisimVar =
          profile.rol === 'yonetici' ||
          ogrenci.veli_profile_id === profile.id ||
          ogrenci.ogrenci_profile_id === profile.id
        if (!erisimVar) throw new Error('Bu öğrenciye erişim yetkiniz yok.')
        setOgrenciAdi(ogrenci.ad_soyad || '')

        setIlerlemeMetni('Sınav sonuçları listeleniyor...')
        const { data: sonuclarHam, error: sonucHatasi } = await supabase
          .from('ogrenci_sinav_sonuclari')
          .select('*, sinavlar(sinav_adi, sinav_tarihi, tur)')
          .eq('ogrenci_id', ogrenciId)
        if (sonucHatasi) throw sonucHatasi
        if (iptalEdildi) return

        const turFiltreli = (sonuclarHam || []).filter((s) => {
          if (tur === 'Tümü') return true
          const buTur = s.sinavlar?.tur || 'Diğer'
          return buTur === tur
        })
        // Eskiden yeniye — sınavlar kronolojik sırayla, "1. TYT, 2. TYT..." gibi
        // görünsün diye.
        turFiltreli.sort((a, b) => {
          const ta = a.sinavlar?.sinav_tarihi || a.created_at || ''
          const tb = b.sinavlar?.sinav_tarihi || b.created_at || ''
          return ta < tb ? -1 : ta > tb ? 1 : 0
        })

        if (turFiltreli.length === 0) {
          setTemizMetni(
            `${ogrenci.ad_soyad || 'Bu öğrencinin'} ${tur === 'Tümü' ? '' : tur + ' türünde '}henüz kaydedilmiş bir sınav sonucu yok.`
          )
          setDurum('temiz')
          return
        }

        setIlerlemeMetni('Yanlış/boş sorular aranıyor...')
        const sonucIdleri = turFiltreli.map((s) => s.id)
        const { data: soruSonuclariHam, error: soruHatasi } = await supabase
          .from('sinav_soru_sonuclari')
          .select('*')
          .in('sonuc_id', sonucIdleri)
          .in('sonuc', ['yanlis', 'bos'])
        if (soruHatasi) throw soruHatasi
        if (iptalEdildi) return

        const normalize = (s) => (s || '').toLocaleLowerCase('tr-TR').trim()
        const dersNorm = normalize(ders)
        const soruMapBySonuc = new Map()
        for (const s of soruSonuclariHam || []) {
          if (normalize(s.ders_adi) !== dersNorm) continue
          if (!soruMapBySonuc.has(s.sonuc_id)) soruMapBySonuc.set(s.sonuc_id, [])
          soruMapBySonuc.get(s.sonuc_id).push(s)
        }

        const gruplarHam = turFiltreli
          .filter((s) => soruMapBySonuc.has(s.id))
          .map((s) => ({
            sonucId: s.id,
            sinavId: s.sinav_id,
            kitapcik: s.kitapcik,
            sinavAdi: s.sinavlar?.sinav_adi || 'Sınav',
            sinavTarihi: s.sinavlar?.sinav_tarihi || null,
            soruSonuclari: soruMapBySonuc.get(s.id),
          }))

        if (gruplarHam.length === 0) {
          setTemizMetni(
            `${ogrenci.ad_soyad || 'Bu öğrencinin'} girdiği ${tur === 'Tümü' ? '' : tur + ' '}sınavlarında "${ders}" dersinde yanlış/boş sorusu yok — tebrikler!`
          )
          setDurum('temiz')
          return
        }

        setIlerlemeMetni('Sınav kitapçıkları aranıyor...')
        const sinavIdleriBenzersiz = [...new Set(gruplarHam.map((g) => g.sinavId).filter(Boolean))]
        const { data: kitapciklarData, error: kitapcikHatasi } =
          sinavIdleriBenzersiz.length > 0
            ? await supabase
                .from('sinav_kitapciklari')
                .select('*')
                .in('sinav_id', sinavIdleriBenzersiz)
                .eq('onaylandi', true)
            : { data: [] }
        if (kitapcikHatasi) throw kitapcikHatasi
        if (iptalEdildi) return

        const kitapcikBul = (sinavId, kitapcikTuru) =>
          (kitapciklarData || []).find((k) => k.sinav_id === sinavId && k.kitapcik === kitapcikTuru)

        const eksikler = []
        const gruplarKitapcikli = []
        for (const g of gruplarHam) {
          if (!g.kitapcik) {
            eksikler.push({ sinavAdi: g.sinavAdi, soruSayisi: g.soruSonuclari.length })
            continue
          }
          const kv = kitapcikBul(g.sinavId, g.kitapcik)
          if (!kv) {
            eksikler.push({ sinavAdi: g.sinavAdi, soruSayisi: g.soruSonuclari.length })
            continue
          }
          gruplarKitapcikli.push({ ...g, kitapcikVerisi: kv })
        }
        setEksikKitapciklar(eksikler)

        if (gruplarKitapcikli.length === 0) {
          // Hiçbiri için kitapçık yok — kesilecek bir şey kalmadı.
          setDurum('hazir')
          setSinavGruplari([])
          setToplamSoruSayisi(0)
          return
        }

        setIlerlemeMetni('Soru haritaları alınıyor...')
        const kitapcikIdleri = [...new Set(gruplarKitapcikli.map((g) => g.kitapcikVerisi.id))]
        const { data: tumKutular, error: kutuHatasi } = await supabase
          .from('sinav_kitapcik_sorulari')
          .select('*')
          .in('kitapcik_id', kitapcikIdleri)
        if (kutuHatasi) throw kutuHatasi
        if (iptalEdildi) return

        const kutularByKitapcik = new Map()
        for (const k of tumKutular || []) {
          if (!kutularByKitapcik.has(k.kitapcik_id)) kutularByKitapcik.set(k.kitapcik_id, [])
          kutularByKitapcik.get(k.kitapcik_id).push(k)
        }

        // Her kitapçığın PDF'i ve sayfa genişlikleri, o kitapçığın KENDİ
        // ölçeğinde (sinav_kitapciklari.olcek) bir kere açılıp önbelleğe
        // alınır — aynı kitapçıktan birden fazla soru kesiliyorsa PDF'i
        // tekrar tekrar indirip açmamak için (HataKitapcigi'deki aynı mantık,
        // burada birden fazla kitapçık için tekrarlanıyor).
        const belgeCache = new Map() // kitapcik_id -> { belge, olcek }
        const sayfaCanvasOnbellek = new Map() // `${kitapcik_id}:${sayfa_no}` -> canvas
        async function belgeGetir(kitapcikVerisi) {
          if (belgeCache.has(kitapcikVerisi.id)) return belgeCache.get(kitapcikVerisi.id)
          const { data: pdfBlobu, error: indirmeHatasi } = await supabase.storage
            .from('sinav-kitapciklari')
            .download(kitapcikVerisi.pdf_yolu)
          if (indirmeHatasi) throw indirmeHatasi
          const belge = await pdfBelgesiAc(pdfBlobu)
          const olcek = Number(kitapcikVerisi.olcek) || 3
          const paket = { belge, olcek }
          belgeCache.set(kitapcikVerisi.id, paket)
          return paket
        }
        async function sayfaCanvasGetir(kitapcikVerisi, sayfaNo) {
          const anahtar = `${kitapcikVerisi.id}:${sayfaNo}`
          if (sayfaCanvasOnbellek.has(anahtar)) return sayfaCanvasOnbellek.get(anahtar)
          const { belge, olcek } = await belgeGetir(kitapcikVerisi)
          const { canvas } = await sayfayiGoruntuyeCevir(belge, sayfaNo, olcek)
          sayfaCanvasOnbellek.set(anahtar, canvas)
          return canvas
        }

        const sonucGruplar = []
        let toplamSayac = 0
        let islenenSoru = 0
        const toplamSoruBeklenen = gruplarKitapcikli.reduce((acc, g) => acc + g.soruSonuclari.length, 0)

        for (const g of gruplarKitapcikli) {
          const kv = g.kitapcikVerisi
          const kutular = kutularByKitapcik.get(kv.id) || []
          const normalizeYerel = (s) => (s || '').toLocaleLowerCase('tr-TR').trim()
          const kutuMap = new Map(kutular.map((k) => [`${normalizeYerel(k.ders_adi)}|${k.soru_no}`, k]))

          // Bu kitapçığın KENDİ gerçek okuma sırası (sayfa → sütun → yukarıdan
          // aşağı) — HataKitapcigi.jsx'teki aynı hesap, sadece bu kitapçığa özel.
          const siraMap = new Map()
          if (kutular.length > 0) {
            const { belge, olcek } = await belgeGetir(kv)
            const benzersizSayfalar = [...new Set(kutular.map((k) => k.sayfa_no))]
            const genislikMap = new Map()
            for (const sayfaNo of benzersizSayfalar) {
              const sayfa = await belge.getPage(sayfaNo)
              genislikMap.set(sayfaNo, sayfa.getViewport({ scale: olcek }).width)
            }
            kutular
              .slice()
              .sort((a, b) => {
                if (a.sayfa_no !== b.sayfa_no) return a.sayfa_no - b.sayfa_no
                const genislik = genislikMap.get(a.sayfa_no) || 0
                const sutunA = Number(a.x) < genislik / 2 ? 0 : 1
                const sutunB = Number(b.x) < genislik / 2 ? 0 : 1
                if (sutunA !== sutunB) return sutunA - sutunB
                return Number(a.y) - Number(b.y)
              })
              .forEach((k, i) => siraMap.set(`${normalizeYerel(k.ders_adi)}|${k.soru_no}`, i))
          }

          const hazirSorular = []
          for (const s of g.soruSonuclari) {
            islenenSoru++
            setIlerlemeMetni(`Sorular kesiliyor (${islenenSoru}/${toplamSoruBeklenen})...`)
            const anahtar = `${normalizeYerel(s.ders_adi)}|${s.soru_no}`
            const kutu = kutuMap.get(anahtar)
            if (!kutu) {
              setBulunamayanlar((onceki) => [...onceki, { sinavAdi: g.sinavAdi, soru_no: s.soru_no, ders_adi: s.ders_adi }])
              continue
            }
            const olcek = (await belgeGetir(kv)).olcek
            const sayfaCanvas = await sayfaCanvasGetir(kv, kutu.sayfa_no)
            const genislikPx = Math.max(1, Math.round(kutu.genislik))
            const yukseklikPx = Math.max(1, Math.round(kutu.yukseklik))
            const soruKirpmaCanvas = document.createElement('canvas')
            soruKirpmaCanvas.width = genislikPx
            soruKirpmaCanvas.height = yukseklikPx
            soruKirpmaCanvas
              .getContext('2d')
              .drawImage(sayfaCanvas, kutu.x, kutu.y, kutu.genislik, kutu.yukseklik, 0, 0, genislikPx, yukseklikPx)

            // Ortak Parça — bkz. HataKitapcigi.jsx'teki aynı mantık.
            let nihaiCanvas = soruKirpmaCanvas
            let nihaiGenislikPt = kutu.genislik / olcek
            let nihaiYukseklikPt = kutu.yukseklik / olcek
            if (kutu.parca_x != null && kutu.parca_y != null && kutu.parca_genislik != null && kutu.parca_yukseklik != null) {
              const parcaSayfaNo = kutu.parca_sayfa_no || kutu.sayfa_no
              const parcaSayfaCanvas = await sayfaCanvasGetir(kv, parcaSayfaNo)
              const parcaGenislikPx = Math.max(1, Math.round(kutu.parca_genislik))
              const parcaYukseklikPx = Math.max(1, Math.round(kutu.parca_yukseklik))
              const parcaKirpmaCanvas = document.createElement('canvas')
              parcaKirpmaCanvas.width = parcaGenislikPx
              parcaKirpmaCanvas.height = parcaYukseklikPx
              parcaKirpmaCanvas
                .getContext('2d')
                .drawImage(parcaSayfaCanvas, kutu.parca_x, kutu.parca_y, kutu.parca_genislik, kutu.parca_yukseklik, 0, 0, parcaGenislikPx, parcaYukseklikPx)

              const araBosluk = 6
              const birlesikGenislikPx = Math.max(genislikPx, parcaGenislikPx)
              const birlesikYukseklikPx = parcaYukseklikPx + araBosluk + yukseklikPx
              const birlesikCanvas = document.createElement('canvas')
              birlesikCanvas.width = birlesikGenislikPx
              birlesikCanvas.height = birlesikYukseklikPx
              const bctx = birlesikCanvas.getContext('2d')
              bctx.fillStyle = '#ffffff'
              bctx.fillRect(0, 0, birlesikGenislikPx, birlesikYukseklikPx)
              bctx.drawImage(parcaKirpmaCanvas, 0, 0)
              bctx.strokeStyle = '#d1d5db'
              bctx.lineWidth = 1
              bctx.strokeRect(0.5, 0.5, parcaGenislikPx - 1, parcaYukseklikPx - 1)
              bctx.drawImage(soruKirpmaCanvas, 0, parcaYukseklikPx + araBosluk)

              nihaiCanvas = birlesikCanvas
              nihaiGenislikPt = birlesikGenislikPx / olcek
              nihaiYukseklikPt = birlesikYukseklikPx / olcek
            }

            hazirSorular.push({
              ...s,
              dataUrl: nihaiCanvas.toDataURL('image/png'),
              genislikPt: nihaiGenislikPt,
              yukseklikPt: nihaiYukseklikPt,
              siraNo: siraMap.get(anahtar),
            })
          }
          if (iptalEdildi) return
          hazirSorular.sort((a, b) => {
            if (a.siraNo === undefined && b.siraNo === undefined) return 0
            if (a.siraNo === undefined) return 1
            if (b.siraNo === undefined) return -1
            return a.siraNo - b.siraNo
          })
          if (hazirSorular.length > 0) {
            sonucGruplar.push({
              sonucId: g.sonucId,
              sinavAdi: g.sinavAdi,
              sinavTarihi: g.sinavTarihi,
              kitapcik: g.kitapcik,
              sorular: hazirSorular,
            })
            toplamSayac += hazirSorular.length
          }
        }
        if (iptalEdildi) return

        setSinavGruplari(sonucGruplar)
        setToplamSoruSayisi(toplamSayac)
        setDurum('hazir')
      } catch (e) {
        if (!iptalEdildi) {
          setHataMetni(e.message)
          setDurum('hata')
        }
      }
    }

    hazirla()
    return () => {
      iptalEdildi = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ogrenciId, dersParam, tur, profile?.id])

  useEffect(() => {
    if (!ogrenciAdi) return
    document.title = `${ogrenciAdi} — ${ders} Hata Kitapçığı`
    return () => {
      document.title = 'Savaş Akça Eğitim Portalı'
    }
  }, [ogrenciAdi, ders])

  return (
    <div className="min-h-screen bg-cream py-8 px-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .soru-karti { break-inside: avoid; }
          .sinav-baslik { break-after: avoid; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto">
        <div className="no-print flex items-center justify-between mb-4 flex-wrap gap-2">
          <Link to="/karnem" className="text-sm text-blue hover:underline">← Karnem'e Dön</Link>
          {durum === 'hazir' && sinavGruplari.length > 0 && (
            <button
              onClick={() => window.print()}
              className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity"
            >
              Yazdır / PDF Kaydet
            </button>
          )}
        </div>

        {durum === 'yukleniyor' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <p className="text-gray-500">{ilerlemeMetni}</p>
          </div>
        )}

        {durum === 'hata' && (
          <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-8">
            <p className="text-red-600 font-semibold mb-1">Hata Kitapçığı Oluşturulamadı</p>
            <p className="text-sm text-gray-600">{hataMetni}</p>
          </div>
        )}

        {durum === 'temiz' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <p className="font-semibold text-navy mb-1">Hata kitapçığı gerekmiyor</p>
            <p className="text-sm text-gray-500">{temizMetni}</p>
          </div>
        )}

        {durum === 'hazir' && (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-white rounded-lg p-1 shrink-0 border border-gray-100">
                  <img src="/logo.png" alt="Savaş Akça Eğitim" className="w-10 h-10 object-contain" />
                </div>
                <div>
                  <p className="font-bold text-lg text-navy">DERS HATA KİTAPÇIĞI</p>
                  <p className="text-sm text-gray-500">
                    {ders} · {tur === 'Tümü' ? 'Tüm Sınav Türleri' : tur}
                  </p>
                </div>
              </div>
              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <tbody>
                  <tr className="bg-gray-50">
                    <td className="px-3 py-2 font-semibold text-gray-600 w-1/3">Öğrenci</td>
                    <td className="px-3 py-2 font-bold text-navy">{ogrenciAdi}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-semibold text-gray-600">Kapsanan Sınav Sayısı</td>
                    <td className="px-3 py-2 text-gray-700">{sinavGruplari.length}</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="px-3 py-2 font-semibold text-gray-600">Toplam Soru Sayısı</td>
                    <td className="px-3 py-2 text-gray-700">{toplamSoruSayisi}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {eksikKitapciklar.length > 0 && (
              <div className="no-print bg-orange/10 border border-orange/20 rounded-2xl p-4 mb-5">
                <p className="text-sm font-semibold text-orange mb-1">
                  {eksikKitapciklar.length} sınavın kitapçığı henüz yüklenmediği için o sınavlardaki sorular bu
                  kitapçığa dahil edilemedi:
                </p>
                <ul className="text-xs text-gray-600 flex flex-col gap-0.5">
                  {eksikKitapciklar.map((e, i) => (
                    <li key={i}>{e.sinavAdi} — {e.soruSayisi} soru</li>
                  ))}
                </ul>
              </div>
            )}

            {bulunamayanlar.length > 0 && (
              <div className="no-print bg-orange/10 border border-orange/20 rounded-2xl p-4 mb-5">
                <p className="text-sm font-semibold text-orange mb-1">
                  {bulunamayanlar.length} soru, sınavının kitapçık soru haritasında bulunamadı:
                </p>
                <ul className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
                  {bulunamayanlar.map((s, i) => (
                    <li key={i}>{s.sinavAdi}: {s.ders_adi} {s.soru_no}</li>
                  ))}
                </ul>
              </div>
            )}

            {sinavGruplari.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
                <p className="text-sm text-gray-500">
                  Kesilecek bir soru kalmadı (yukarıdaki uyarıları kontrol edin).
                </p>
              </div>
            )}

            {sinavGruplari.map((grup) => (
              <div key={grup.sonucId} className="mb-6">
                <p className="sinav-baslik text-sm font-bold text-navy border-b border-navy/20 pb-1 mb-3">
                  {grup.sinavAdi}
                  {grup.sinavTarihi && (
                    <span className="text-gray-400 font-normal"> · {new Date(grup.sinavTarihi).toLocaleDateString('tr-TR')}</span>
                  )}
                  {grup.kitapcik && <span className="text-gray-400 font-normal"> · Kitapçık {grup.kitapcik}</span>}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {grup.sorular.map((s) => (
                    <div key={s.id} className="soru-karti bg-white rounded-lg border border-gray-200 p-2">
                      <p className="text-[11px] font-semibold text-navy leading-tight">
                        Soru {s.soru_no}
                        {s.konu && <span className="text-gray-400 font-normal"> · {s.konu}</span>}
                      </p>
                      <p className="text-[10px] text-gray-400 mb-1 leading-tight">
                        {s.sonuc === 'bos'
                          ? `Boş bırakılmış — Doğru: ${s.dogru_cevap || '—'}`
                          : `Yanlış — İşaretlenen: ${s.ogrenci_cevap || '—'}, Doğru: ${s.dogru_cevap || '—'}`}
                      </p>
                      <img
                        src={s.dataUrl}
                        alt={`${ders} soru ${s.soru_no}`}
                        className="border border-gray-200 rounded"
                        style={{ maxWidth: '100%', width: `${Math.min(s.genislikPt, 250)}pt`, height: 'auto' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
