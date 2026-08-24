import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { pdfBelgesiAc, sayfayiGoruntuyeCevir, alttakiBosluguKirp } from '../lib/kitapcikOcr'

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
  // ?ders=Türkçe gibi bir sorgu parametresi verilirse, o tek sınavın TÜM
  // derslerini değil, sadece SEÇİLEN dersin yanlış/boş sorularını kesip
  // gösteriyoruz — Karnem.jsx'teki ders seçicisi bu parametreyi ekliyor.
  // Parametre yoksa (eski davranış) tüm dersler birlikte çıkıyor.
  const [searchParams] = useSearchParams()
  const dersFiltresi = searchParams.get('ders') || ''

  const [durum, setDurum] = useState('yukleniyor') // yukleniyor | hazir | bos | hata
  const [ilerlemeMetni, setIlerlemeMetni] = useState('Hazırlanıyor...')
  const [hataMetni, setHataMetni] = useState('')

  const [ogrenciAdi, setOgrenciAdi] = useState('')
  const [sinavAdi, setSinavAdi] = useState('')
  const [kitapcikTuru, setKitapcikTuru] = useState('')
  const [ozet, setOzet] = useState(null)
  const [sorular, setSorular] = useState([])
  const [eslesmeyenler, setEslesmeyenler] = useState([])
  // Hangi soruların PDF/yazdırma çıktısına dahil edileceği — varsayılan
  // olarak hepsi seçili başlıyor (Karnem.jsx'teki Derse Göre Hata
  // Kitapçığı'ndaki (DersBazliHataKitapcigi.jsx) aynı desen). Kullanıcı
  // istemediği soruların işaretini kaldırınca o kart no-print olup ekranda
  // soluk kalıyor ama Ctrl+P/PDF çıktısına hiç girmiyor.
  const [seciliSorular, setSeciliSorular] = useState(new Set())

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
        const { data: soruSonuclariHam, error: soruHatasi } = await supabase
          .from('sinav_soru_sonuclari')
          .select('*')
          .eq('sonuc_id', sonucId)
          .in('sonuc', ['yanlis', 'bos'])
        if (soruHatasi) throw soruHatasi

        // Ders adları farklı yazım/boşluk içerebildiği için (bkz. dosya
        // başındaki not) .eq() ile veritabanında değil, burada normalize
        // edilmiş karşılaştırmayla filtreliyoruz.
        const normalizeErken = (s) => (s || '').toLocaleLowerCase('tr-TR').trim()
        const soruSonuclari = dersFiltresi
          ? (soruSonuclariHam || []).filter((s) => normalizeErken(s.ders_adi) === normalizeErken(dersFiltresi))
          : soruSonuclariHam

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

        // Yanlış/boş soruları KARNENİN alfabetik ders sırasında değil,
        // kitapçıktaki GERÇEK okuma sırasında (sayfa → sütun → yukarıdan
        // aşağı) göstermek için — admin Toplu Ders Ataması'nı hangi sırayla
        // yaptıysa o sıra esas alınıyor. sinav_kitapcik_sorulari tablosu
        // satır sırasını garanti etmediğinden, x/y konumlarından kendimiz
        // hesaplıyoruz (Sınav Kitapçıkları > Düzenle'deki mantıkla aynı).
        const siraMap = new Map()
        if (kutular && kutular.length > 0) {
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
            .forEach((k, i) => siraMap.set(`${normalize(k.ders_adi)}|${k.soru_no}`, i))
        }

        // BELLEK: her sayfanın canvas'ını (scale=3'te tam bir A4 canvas'ı
        // onlarca MB tutabiliyor) aynı anda bellekte tutmak, iPhone/iPad
        // Safari'de sekmenin "bir sorun oluştu" diyip tekrar tekrar
        // çökmesine yol açıyordu — özellikle çok sayfalı kitapçıklarda.
        // Bunu önlemek için aynı anda EN FAZLA TEK sayfanın canvas'ı
        // bellekte tutuluyor (LRU-1); bir sonraki sayfaya geçilince
        // önceki canvas hemen serbest bırakılıyor (width/height=0).
        // Bunun işe yaraması için soruları da rastgele değil, KENDİ sayfa
        // numarasına göre gruplu işliyoruz — nihai gösterim sırası zaten
        // aşağıda siraMap'e göre yeniden diziliyor, bu sadece işleme sırası.
        let aktifSayfaNo = null
        let aktifSayfaCanvas = null
        async function sayfaCanvasGetir(sayfaNo) {
          if (aktifSayfaNo === sayfaNo && aktifSayfaCanvas) return aktifSayfaCanvas
          if (aktifSayfaCanvas) {
            aktifSayfaCanvas.width = 0
            aktifSayfaCanvas.height = 0
          }
          const { canvas } = await sayfayiGoruntuyeCevir(belge, sayfaNo, olcek)
          aktifSayfaNo = sayfaNo
          aktifSayfaCanvas = canvas
          return canvas
        }

        const soruSonuclariSirali = soruSonuclari.slice().sort((a, b) => {
          const ka = kutuMap.get(`${normalize(a.ders_adi)}|${a.soru_no}`)
          const kb = kutuMap.get(`${normalize(b.ders_adi)}|${b.soru_no}`)
          const sa = ka ? ka.sayfa_no : Infinity
          const sb = kb ? kb.sayfa_no : Infinity
          return sa - sb
        })

        const hazirSorular = []
        const bulunamayanlar = []
        for (let i = 0; i < soruSonuclariSirali.length; i++) {
          const s = soruSonuclariSirali[i]
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
          let soruKirpmaCanvas = document.createElement('canvas')
          soruKirpmaCanvas.width = genislikPx
          soruKirpmaCanvas.height = yukseklikPx
          soruKirpmaCanvas
            .getContext('2d')
            .drawImage(sayfaCanvas, kutu.x, kutu.y, kutu.genislik, kutu.yukseklik, 0, 0, genislikPx, yukseklikPx)
          // Soru sayfada/sütunda tek başınaysa kutu sayfa sonuna kadar
          // uzatılmış olabilir (bkz. kitapcikOcr.js'teki açıklama) — burada
          // fazla boşluk otomatik kesiliyor.
          soruKirpmaCanvas = alttakiBosluguKirp(soruKirpmaCanvas)

          // ORTAK PARÇA (bkz. migration_sinav_kitapcik_ortak_parca.sql ve
          // SinavKitapciklari.jsx'teki "Ortak Parça" bölümü) — "39-40. soruları
          // aşağıdaki parçaya göre cevaplayınız" gibi, bir okuma parçasının
          // birden fazla soruya bağlı olduğu durumlar için. Bu soruda parça
          // tanımlıysa, parça görüntüsü ayrıca kesilip sorunun kendi
          // görüntüsünün ÜSTÜNE eklenir — tek bir dikdörtgenle mümkün olmayan
          // "parça + kendi kutusu" birleşimini burada iki ayrı kırpmayı
          // dikey olarak üst üste bindirerek elde ediyoruz.
          let nihaiCanvas = soruKirpmaCanvas
          let nihaiGenislikPt = kutu.genislik / olcek
          // Kırpma sonrası yükseklik (soruKirpmaCanvas.height) kutu.yukseklik'ten
          // KÜÇÜK olabilir (bkz. alttakiBosluguKirp) — o yüzden burada kutu.yukseklik
          // yerine canvas'ın GERÇEK yüksekliği kullanılıyor.
          let nihaiYukseklikPt = soruKirpmaCanvas.height / olcek
          if (kutu.parca_x != null && kutu.parca_y != null && kutu.parca_genislik != null && kutu.parca_yukseklik != null) {
            const parcaSayfaNo = kutu.parca_sayfa_no || kutu.sayfa_no
            const parcaSayfaCanvas = await sayfaCanvasGetir(parcaSayfaNo)
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
            const birlesikYukseklikPx = parcaYukseklikPx + araBosluk + soruKirpmaCanvas.height
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
          })
        }
        if (iptalEdildi) return
        // Kitapçıktaki gerçek sıraya göre diz (bkz. yukarıdaki siraMap) —
        // eşleşmesi bulunamayan (dolayısıyla siraMap'te yeri olmayan)
        // sorular listenin sonuna düşer.
        hazirSorular.sort((a, b) => {
          const ia = siraMap.get(`${normalize(a.ders_adi)}|${a.soru_no}`)
          const ib = siraMap.get(`${normalize(b.ders_adi)}|${b.soru_no}`)
          if (ia === undefined && ib === undefined) return 0
          if (ia === undefined) return 1
          if (ib === undefined) return -1
          return ia - ib
        })
        setSorular(hazirSorular)
        setSeciliSorular(new Set(hazirSorular.map((s) => s.id)))
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
  }, [sonucId, dersFiltresi])

  // İndirilen PDF/yazdırma çıktısının dosya adı (ve tarayıcı sekme başlığı)
  // öğrenci ve sınav adını göstersin diye — "Savaş Akça Eğitim Portalı" gibi
  // genel bir isimle kaydedilmesin.
  useEffect(() => {
    if (!ogrenciAdi) return
    const dersEki = dersFiltresi ? ` — ${dersFiltresi}` : ''
    document.title = `${ogrenciAdi} — Hata Kitapçığı${dersEki}${sinavAdi ? ` (${sinavAdi})` : ''}`
    return () => {
      document.title = 'Savaş Akça Eğitim Portalı'
    }
  }, [ogrenciAdi, sinavAdi, dersFiltresi])

  function soruSecimiDegistir(soruId) {
    setSeciliSorular((onceki) => {
      const yeni = new Set(onceki)
      if (yeni.has(soruId)) yeni.delete(soruId)
      else yeni.add(soruId)
      return yeni
    })
  }
  function tumunuSec() {
    setSeciliSorular(new Set(sorular.map((s) => s.id)))
  }
  function tumunuKaldir() {
    setSeciliSorular(new Set())
  }
  const hepsiSecili = seciliSorular.size === sorular.length && sorular.length > 0
  // Bir dersin başlığı, o dersten hiç seçili soru kalmadıysa (kullanıcı
  // hepsinin işaretini kaldırdıysa) yazdırma çıktısında yalnız başına
  // asılı kalmasın diye ayrıca no-print oluyor — bkz. aşağıdaki render.
  const dersSeciliVarMi = new Set(sorular.filter((s) => seciliSorular.has(s.id)).map((s) => s.ders_adi))

  return (
    <div className="min-h-screen bg-cream py-8 px-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          /* break-inside hem de eski takma adı page-break-inside — Safari/iOS
             (iPhone/iPad) hâlâ eski adı kullanıyor, sadece break-inside
             yazınca orada hiç etkisi olmuyordu. */
          .soru-karti { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto">
        <div className="no-print flex items-center justify-between mb-4 flex-wrap gap-2">
          <Link to="/sinav-yukle" className="text-sm text-blue hover:underline">← Sınav Sonucu Yükle'ye Dön</Link>
          {durum === 'hazir' && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-gray-500">{seciliSorular.size} / {sorular.length} soru seçili</span>
              <button
                onClick={hepsiSecili ? tumunuKaldir : tumunuSec}
                className="text-sm font-semibold text-navy border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {hepsiSecili ? 'Tümünü Kaldır' : 'Tümünü Seç'}
              </button>
              <button
                onClick={() => window.print()}
                disabled={seciliSorular.size === 0}
                className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Yazdır / PDF Kaydet
              </button>
            </div>
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
              {dersFiltresi
                ? `${ogrenciAdi} bu sınavda "${dersFiltresi}" dersindeki tüm soruları doğru cevaplamış — kesilecek bir soru yok.`
                : `${ogrenciAdi} bu sınavdaki tüm soruları doğru cevaplamış — kesilecek bir soru yok.`}
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
                  <p className="font-bold text-lg text-navy">
                    HATA KİTAPÇIĞI{dersFiltresi && <span className="text-orange"> — {dersFiltresi}</span>}
                  </p>
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
                  <tr className="no-print">
                    <td className="px-3 py-2 font-semibold text-gray-600">Yazdırılacak soru sayısı</td>
                    <td className="px-3 py-2 text-gray-700">{seciliSorular.size}</td>
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
            {/* NOT: ne "grid" ne "flex" — ikisinde de Chrome/Safari'nin
                yazdırma motorları break-inside:avoid'i çocuklarda güvenilir
                uygulamıyor (Chrome'da grid'de, Safari/iOS'ta hem grid hem
                flex'te bozuk çıktı — iPhone/iPad'de aynı soru yine
                bölünüyordu). En eski ve en yaygın desteklenen yöntem olan
                inline-block + simetrik margin kullanılıyor; break-inside
                orada tüm tarayıcılarda güvenilir çalışıyor. Ders başlığı da
                tam genişlik (calc(100%-12px)) vererek kendi satırına
                alınıyor. */}
            <div style={{ margin: '0 -6px' }}>
              {sorular.flatMap((s, i) => {
                const dersBasligiGoster = i === 0 || sorular[i - 1].ders_adi !== s.ders_adi
                const secili = seciliSorular.has(s.id)
                const kart = (
                  <div
                    key={s.id}
                    className={`soru-karti bg-white rounded-lg border p-2 ${secili ? 'border-gray-200' : 'border-gray-100 no-print opacity-50'}`}
                    style={{ display: 'inline-block', verticalAlign: 'top', width: 'calc(50% - 12px)', margin: '0 6px 12px 6px' }}
                  >
                    <label className="no-print flex items-center gap-1.5 mb-1 text-[11px] font-medium text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={secili}
                        onChange={() => soruSecimiDegistir(s.id)}
                        className="w-3.5 h-3.5"
                      />
                      PDF'e dahil et
                    </label>
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
                      alt={`${s.ders_adi} soru ${s.soru_no}`}
                      className="border border-gray-200 rounded"
                      style={{ maxWidth: '100%', width: `${Math.min(s.genislikPt, 250)}pt`, height: 'auto' }}
                    />
                  </div>
                )
                if (!dersBasligiGoster) return [kart]
                const dersSecili = dersSeciliVarMi.has(s.ders_adi)
                const baslik = (
                  <p
                    key={`baslik-${s.id}`}
                    className={`text-sm font-bold text-navy border-b border-navy/20 pb-1 mt-1 first:mt-0 ${!dersSecili ? 'no-print' : ''}`}
                    style={{ display: 'inline-block', width: 'calc(100% - 12px)', margin: '4px 6px' }}
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
