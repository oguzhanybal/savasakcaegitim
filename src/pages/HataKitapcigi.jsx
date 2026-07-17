import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { pdfBelgesiAc, sayfayiGoruntuyeCevir } from '../lib/kitapcikOcr'

// Bir öğrencinin YANLIŞ ve BOŞ bıraktığı soruları, sınav kitapçığının
// taranmış PDF'inden otomatik KESİP, yazdırılabilir (Ctrl+P → PDF olarak
// kaydet) tek bir "hata kitapçığı" sayfası olarak gösterir.
//
// Eşleştirme mantığı: sinav_soru_sonuclari (SinavYukle.jsx'in sonuç PDF'inden
// ayrıştırdığı, sonuc='yanlis'|'bos' olan satırlar) ile sinav_kitapcik_sorulari
// (SinavKitapciklari.jsx'te admin'in bir kere işaretleyip onayladığı "hangi
// soru sayfada nerede" haritası), ders_adi + soru_no ÇİFTİYLE eşleştirilir.
// Bu yüzden iki tarafta da ders adlarının BİREBİR aynı (ör. "Tarih", "Sosyal"
// değil) yazılmış olması şart — bkz. SinavKitapciklari.jsx'teki uyarı notu.
//
// Kesme işlemi: kitapçığın PDF'i, kaydedilirken kullanılan ÖLÇEKLE (bkz.
// sinav_kitapciklari.olcek) birebir aynı ölçekte tekrar görüntüye çevrilir —
// aksi halde saklı x/y/genişlik/yükseklik koordinatları başka bir piksel
// ölçeğinde yanlış hizalanır. Sonra canvas üzerinde o dikdörtgen kırpılıp
// PNG'ye çevrilir ve <img> olarak sayfaya basılır.
export default function HataKitapcigi() {
  const { sonucId } = useParams()

  const [durum, setDurum] = useState('yukleniyor') // yukleniyor | hazir | bos | hata
  const [ilerlemeMetni, setIlerlemeMetni] = useState('Hazırlanıyor...')
  const [hataMetni, setHataMetni] = useState('')

  const [ogrenciAdi, setOgrenciAdi] = useState('')
  const [sinavAdi, setSinavAdi] = useState('')
  const [kitapcikTuru, setKitapcikTuru] = useState('')
  const [ozet, setOzet] = useState(null)
  const [sorular, setSorular] = useState([])
  const [eslesmeyenler, setEslesmeyenler] = useState([])

  useEffect(() => {
    let iptalEdildi = false

    async function hazirla() {
      try {
        setIlerlemeMetni('Sonuç bilgisi alınıyor...')
        const { data: sonuc, error: sonucHatasi } = await supabase
          .from('ogrenci_sinav_sonuclari')
          .select('*, ogrenciler(ad_soyad), sinavlar(sinav_adi)')
          .eq('id', sonucId)
          .single()
        if (sonucHatasi || !sonuc) throw new Error('Bu sonuç kaydı bulunamadı.')
        if (iptalEdildi) return

        setOgrenciAdi(sonuc.ogrenciler?.ad_soyad || '')
        setSinavAdi(sonuc.sinavlar?.sinav_adi || '')
        setKitapcikTuru(sonuc.kitapcik || '')
        setOzet({
          toplamSoru: sonuc.toplam_soru,
          dogru: sonuc.toplam_dogru,
          yanlis: sonuc.toplam_yanlis,
          bos: sonuc.toplam_bos,
          net: sonuc.toplam_net,
        })

        if (!sonuc.kitapcik) {
          throw new Error(
            'Bu sonuçta hangi kitapçığın (A/B) çözüldüğü bilgisi yok, bu yüzden hangi kitapçıktan kesim yapılacağı belli değil.'
          )
        }

        setIlerlemeMetni('Yanlış/boş sorular listeleniyor...')
        const { data: soruSonuclari, error: soruHatasi } = await supabase
          .from('sinav_soru_sonuclari')
          .select('*')
          .eq('sonuc_id', sonucId)
          .in('sonuc', ['yanlis', 'bos'])
          .order('ders_adi', { ascending: true })
          .order('soru_no', { ascending: true })
        if (soruHatasi) throw soruHatasi

        if (!soruSonuclari || soruSonuclari.length === 0) {
          setDurum('bos')
          return
        }

        setIlerlemeMetni('Sınav kitapçığı aranıyor...')
        const { data: kitapcikVerisi, error: kitapcikHatasi } = await supabase
          .from('sinav_kitapciklari')
          .select('*')
          .eq('sinav_id', sonuc.sinav_id)
          .eq('kitapcik', sonuc.kitapcik)
          .maybeSingle()
        if (kitapcikHatasi) throw kitapcikHatasi
        if (!kitapcikVerisi) {
          throw new Error(
            `Bu sınavın "${sonuc.kitapcik}" kitapçığı sisteme henüz yüklenmemiş. Önce "Sınav Kitapçıkları" sayfasından bu kitapçığı yükleyip soru haritasını kaydedin, sonra buraya dönün.`
          )
        }

        const { data: kutular, error: kutuHatasi } = await supabase
          .from('sinav_kitapcik_sorulari')
          .select('*')
          .eq('kitapcik_id', kitapcikVerisi.id)
        if (kutuHatasi) throw kutuHatasi

        const normalize = (s) => (s || '').toLocaleLowerCase('tr-TR').trim()
        const kutuMap = new Map((kutular || []).map((k) => [`${normalize(k.ders_adi)}|${k.soru_no}`, k]))

        setIlerlemeMetni('Kitapçık PDF\'i indiriliyor...')
        const { data: pdfBlobu, error: indirmeHatasi } = await supabase.storage
          .from('sinav-kitapciklari')
          .download(kitapcikVerisi.pdf_yolu)
        if (indirmeHatasi) throw indirmeHatasi
        if (iptalEdildi) return

        const belge = await pdfBelgesiAc(pdfBlobu)
        const olcek = Number(kitapcikVerisi.olcek) || 3

        const sayfaCanvasOnbellek = new Map()
        async function sayfaCanvasGetir(sayfaNo) {
          if (sayfaCanvasOnbellek.has(sayfaNo)) return sayfaCanvasOnbellek.get(sayfaNo)
          const { canvas } = await sayfayiGoruntuyeCevir(belge, sayfaNo, olcek)
          sayfaCanvasOnbellek.set(sayfaNo, canvas)
          return canvas
        }

        const hazirSorular = []
        const bulunamayanlar = []
        for (let i = 0; i < soruSonuclari.length; i++) {
          const s = soruSonuclari[i]
          setIlerlemeMetni(`Sorular kesiliyor (${i + 1}/${soruSonuclari.length})...`)
          const anahtar = `${normalize(s.ders_adi)}|${s.soru_no}`
          const kutu = kutuMap.get(anahtar)
          if (!kutu) {
            bulunamayanlar.push(s)
            continue
          }
          const sayfaCanvas = await sayfaCanvasGetir(kutu.sayfa_no)
          const genislikPx = Math.max(1, Math.round(kutu.genislik))
          const yukseklikPx = Math.max(1, Math.round(kutu.yukseklik))
          const kirpmaCanvas = document.createElement('canvas')
          kirpmaCanvas.width = genislikPx
          kirpmaCanvas.height = yukseklikPx
          kirpmaCanvas
            .getContext('2d')
            .drawImage(sayfaCanvas, kutu.x, kutu.y, kutu.genislik, kutu.yukseklik, 0, 0, genislikPx, yukseklikPx)
          hazirSorular.push({
            ...s,
            dataUrl: kirpmaCanvas.toDataURL('image/png'),
            genislikPt: kutu.genislik / olcek,
            yukseklikPt: kutu.yukseklik / olcek,
          })
        }
        if (iptalEdildi) return
        setSorular(hazirSorular)
        setEslesmeyenler(bulunamayanlar)
        // hazirSorular boş ama aslında yanlış/boş soru VARDI (hepsi eşleşme
        // kurulamadığı için elendi) — bu durumu "tebrikler, hata yok" ile
        // KARIŞTIRMAMAK için ayrı bir durum kullanıyoruz.
        setDurum(hazirSorular.length > 0 ? 'hazir' : bulunamayanlar.length > 0 ? 'hicEslesmedi' : 'bos')
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
  }, [sonucId])

  return (
    <div className="min-h-screen bg-cream py-8 px-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .soru-karti { break-inside: avoid; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto">
        <div className="no-print flex items-center justify-between mb-4 flex-wrap gap-2">
          <Link to="/sinav-yukle" className="text-sm text-blue hover:underline">← Sınav Sonucu Yükle'ye Dön</Link>
          {durum === 'hazir' && (
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

        {durum === 'bos' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <p className="font-semibold text-navy mb-1">Hata kitapçığı gerekmiyor</p>
            <p className="text-sm text-gray-500">
              {ogrenciAdi} bu sınavdaki tüm soruları doğru cevaplamış — kesilecek bir soru yok.
            </p>
          </div>
        )}

        {durum === 'hicEslesmedi' && (
          <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-8">
            <p className="font-semibold text-red-600 mb-1">Yanlış/boş sorular var ama hiçbiri eşleştirilemedi</p>
            <p className="text-sm text-gray-600 mb-3">
              {ogrenciAdi} için {eslesmeyenler.length} yanlış/boş soru var, ama hiçbiri kitapçığın soru
              haritasında bulunamadı — muhtemelen ders adları farklı yazılmış (ör. karnede "Tarih"/"Coğrafya"
              ayrı geçerken kitapçıkta "Sosyal" olarak tek satır girilmiş olabilir).
            </p>
            <ul className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
              {eslesmeyenler.map((s) => (
                <li key={s.id}>{s.ders_adi} {s.soru_no}</li>
              ))}
            </ul>
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
                  <p className="font-bold text-lg text-navy">HATA KİTAPÇIĞI</p>
                  <p className="text-sm text-gray-500">{sinavAdi} {kitapcikTuru && `· Kitapçık ${kitapcikTuru}`}</p>
                </div>
              </div>
              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <tbody>
                  <tr className="bg-gray-50">
                    <td className="px-3 py-2 font-semibold text-gray-600 w-1/3">Öğrenci</td>
                    <td className="px-3 py-2 font-bold text-navy">{ogrenciAdi}</td>
                  </tr>
                  {ozet && (
                    <tr>
                      <td className="px-3 py-2 font-semibold text-gray-600">Sonuç</td>
                      <td className="px-3 py-2 text-gray-700">
                        {ozet.toplamSoru} soru · <span className="text-green-700">{ozet.dogru} doğru</span> ·{' '}
                        <span className="text-red-700">{ozet.yanlis} yanlış</span> ·{' '}
                        <span className="text-gray-500">{ozet.bos} boş</span> ·{' '}
                        <span className="text-navy font-semibold">{ozet.net} net</span>
                      </td>
                    </tr>
                  )}
                  <tr className="bg-gray-50">
                    <td className="px-3 py-2 font-semibold text-gray-600">Bu kitapçıktaki soru sayısı</td>
                    <td className="px-3 py-2 text-gray-700">{sorular.length}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {eslesmeyenler.length > 0 && (
              <div className="no-print bg-orange/10 border border-orange/20 rounded-2xl p-4 mb-5">
                <p className="text-sm font-semibold text-orange mb-1">
                  {eslesmeyenler.length} soru kitapçıkta bulunamadı, aşağıdaki listeye eklenemedi:
                </p>
                <p className="text-xs text-gray-600 mb-2">
                  Muhtemel neden: "Sınav Kitapçıkları" sayfasında bu ders adı farklı yazılmış (ör. "Sosyal"
                  yazılmış ama karnede "Tarih"/"Coğrafya" ayrı ayrı geçiyor). Kitapçık soru haritasını düzeltip
                  bu sayfayı yenileyin.
                </p>
                <ul className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
                  {eslesmeyenler.map((s) => (
                    <li key={s.id}>{s.ders_adi} {s.soru_no}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* İki sütunlu, derse göre gruplanmış kompakt düzen — tek sütunda
                her soru kendi kartıyla dururken kağıt israfı çok fazlaydı
                (bir öğrenci için onlarca sayfa çıkıyordu). Ders değişince
                başlık tam genişlikte (col-span-full) araya giriyor, sorular
                onun altında 2'şerli sıralanıyor. */}
            <div className="grid grid-cols-2 gap-3">
              {sorular.flatMap((s, i) => {
                const dersBasligiGoster = i === 0 || sorular[i - 1].ders_adi !== s.ders_adi
                const kart = (
                  <div key={s.id} className="soru-karti bg-white rounded-lg border border-gray-200 p-2">
                    <p className="text-[11px] font-semibold text-navy leading-tight">
                      Soru {s.soru_no}
                      {s.konu && <span className="text-gray-400 font-normal"> · {s.konu}</span>}
                    </p>
                    <p className="text-[10px] text-gray-400 mb-1 leading-tight">
                      {s.sonuc === 'bos'
                        ? 'Boş bırakılmış'
                        : `Yanlış — İşaretlenen: ${s.ogrenci_cevap || '—'}, Doğru: ${s.dogru_cevap || '—'}`}
                    </p>
                    <img
                      src={s.dataUrl}
                      alt={`${s.ders_adi} soru ${s.soru_no}`}
                      className="border border-gray-200 rounded"
                      style={{ maxWidth: '100%', width: `${Math.min(s.genislikPt, 250)}pt`, height: 'auto' }}
                    />
                  </div>
                )
                if (!dersBasligiGoster) return [kart]
                const baslik = (
                  <p
                    key={`baslik-${s.id}`}
                    className="col-span-2 text-sm font-bold text-navy border-b border-navy/20 pb-1 mt-1 first:mt-0"
                  >
                    {s.ders_adi}
                  </p>
                )
                return [baslik, kart]
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
