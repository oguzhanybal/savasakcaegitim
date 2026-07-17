import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ilkHarfleriBuyukYap } from '../lib/adSoyadFormat'
import {
  pdfBelgesiAc,
  sayfayiGoruntuyeCevir,
  sayfadaSoruNumaralariniTespitEt,
  soruNumarasiWorkerOlustur,
  soruNumarasiWorkerKapat,
  girintiliAdaylariEle,
  sutunSiralaTahmini,
  ardisikDiziyeGoreFiltrele,
  baslangicKutulariUret,
} from '../lib/kitapcikOcr'

const DERS_ONERILERI = [
  'Türkçe', 'Matematik', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü',
  'Fizik', 'Kimya', 'Biyoloji', 'Sosyal Bilimler', 'Fen Bilimleri', 'Geometri',
]

// Sayfa üzerine soru kutularını çizen / kutu yeniden çizmeyi (mouse ile
// sürükle-bırak) yöneten katman. Koordinatlar her zaman sayfanın DOĞAL piksel
// boyutunda (canvas render boyutu) saklanır; ekranda ne kadar küçük/büyük
// gösterilirse gösterilsin, % tabanlı konumlandırma sayesinde eşleşme bozulmaz.
function KutuKatmani({ sayfaGoruntusu, sorularBuSayfada, seciliGeciciId, cizimModu, onCizimBitti }) {
  const containerRef = useRef(null)
  const [cizilen, setCizilen] = useState(null)

  function ekrandanDogalKoordinata(clientX, clientY) {
    const rect = containerRef.current.getBoundingClientRect()
    const oranX = sayfaGoruntusu.genislik / rect.width
    const oranY = sayfaGoruntusu.yukseklik / rect.height
    return { x: (clientX - rect.left) * oranX, y: (clientY - rect.top) * oranY }
  }

  function mouseDown(e) {
    if (!cizimModu) return
    const p = ekrandanDogalKoordinata(e.clientX, e.clientY)
    setCizilen({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  function mouseMove(e) {
    if (!cizimModu || !cizilen) return
    const p = ekrandanDogalKoordinata(e.clientX, e.clientY)
    setCizilen((c) => ({ ...c, x1: p.x, y1: p.y }))
  }
  function mouseUp() {
    if (!cizimModu || !cizilen) return
    const x = Math.min(cizilen.x0, cizilen.x1)
    const y = Math.min(cizilen.y0, cizilen.y1)
    const genislik = Math.abs(cizilen.x1 - cizilen.x0)
    const yukseklik = Math.abs(cizilen.y1 - cizilen.y0)
    setCizilen(null)
    if (genislik > 5 && yukseklik > 5) onCizimBitti({ x, y, genislik, yukseklik })
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ cursor: cizimModu ? 'crosshair' : 'default' }}
      onMouseDown={mouseDown}
      onMouseMove={mouseMove}
      onMouseUp={mouseUp}
      onMouseLeave={() => setCizilen(null)}
    >
      {cizimModu && (
        <div className="absolute inset-x-0 -top-11 z-10 bg-orange text-white text-sm font-semibold text-center py-2 rounded-lg shadow-md animate-pulse">
          👇 Aşağıdaki sayfada, sorunun SOL ÜST köşesine tıklayıp basılı tutarak SAĞ ALT köşesine kadar sürükle, sonra bırak.
        </div>
      )}
      <img
        src={sayfaGoruntusu.dataUrl}
        alt={`Sayfa ${sayfaGoruntusu.sayfaNo}`}
        className="w-full block rounded-lg border border-gray-200"
        draggable={false}
      />
      {sorularBuSayfada.map((s) => (
        <div
          key={s.gecici_id}
          className={`absolute border-2 pointer-events-none ${
            s.gecici_id === seciliGeciciId
              ? 'border-orange bg-orange/20'
              : s.ders_adi.trim()
              ? 'border-green-500 bg-green-500/10'
              : 'border-blue-400 bg-blue-400/10'
          }`}
          style={{
            left: `${(s.x / sayfaGoruntusu.genislik) * 100}%`,
            top: `${(s.y / sayfaGoruntusu.yukseklik) * 100}%`,
            width: `${(s.genislik / sayfaGoruntusu.genislik) * 100}%`,
            height: `${(s.yukseklik / sayfaGoruntusu.yukseklik) * 100}%`,
          }}
        >
          <span className="absolute -top-5 left-0 text-[10px] font-semibold bg-navy text-white px-1 rounded">
            {s.ders_adi || '?'} {s.soru_no}
          </span>
        </div>
      ))}
      {cizilen && (
        <div
          className="absolute border-2 border-orange bg-orange/20 pointer-events-none"
          style={{
            left: `${(Math.min(cizilen.x0, cizilen.x1) / sayfaGoruntusu.genislik) * 100}%`,
            top: `${(Math.min(cizilen.y0, cizilen.y1) / sayfaGoruntusu.yukseklik) * 100}%`,
            width: `${(Math.abs(cizilen.x1 - cizilen.x0) / sayfaGoruntusu.genislik) * 100}%`,
            height: `${(Math.abs(cizilen.y1 - cizilen.y0) / sayfaGoruntusu.yukseklik) * 100}%`,
          }}
        />
      )}
    </div>
  )
}

// ============================================================================
// HIZLI ELLE İŞARETLEME — OCR'a hiç güvenmeden, admin her sorunun sadece SOL
// ÜST köşesine (soru numarasının olduğu yere) TEK TIKLAMA yapar, sürükleme
// YOK. Kutunun boyutu otomatik hesaplanır: genişlik, tıklanan noktanın sayfa
// sol/sağ yarısında olmasına göre (2 sütunlu düzen varsayımıyla) o sütunun
// kalan genişliği; yükseklik ise AYNI SÜTUNDAKİ bir SONRAKİ tıklamaya kadar
// olan mesafe (sütunda son soru ise sayfa altına kadar). Bu, karmaşık/eşit
// olmayan yükseklikte sorular (grafik, tablo, resim içeren AYT matematik
// soruları gibi) içeren kitapçıklarda OCR'dan çok daha güvenilir sonuç verir
// — çünkü admin zaten soruyu insan gözüyle görüp doğru yeri işaretliyor.
function NoktaIsaretlemeKatmani({ sayfaGoruntusu, buSayfadakiNoktalar, onNoktaEkle }) {
  const containerRef = useRef(null)

  function tiklandi(e) {
    const rect = containerRef.current.getBoundingClientRect()
    const oranX = sayfaGoruntusu.genislik / rect.width
    const oranY = sayfaGoruntusu.yukseklik / rect.height
    onNoktaEkle({ x: (e.clientX - rect.left) * oranX, y: (e.clientY - rect.top) * oranY })
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ cursor: 'crosshair' }}
      onClick={tiklandi}
    >
      <img
        src={sayfaGoruntusu.dataUrl}
        alt={`Sayfa ${sayfaGoruntusu.sayfaNo}`}
        className="w-full block rounded-lg border border-gray-200"
        draggable={false}
      />
      {buSayfadakiNoktalar.map((n, i) => (
        <div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-orange text-white text-xs font-bold flex items-center justify-center border-2 border-white shadow pointer-events-none"
          style={{
            left: `${(n.x / sayfaGoruntusu.genislik) * 100}%`,
            top: `${(n.y / sayfaGoruntusu.yukseklik) * 100}%`,
          }}
        >
          {n.globalSira}
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// TOPLU DERS ATAMA — OCR'ın bulduğu soru kutuları (doğru sırada) hazır olunca,
// admin'in her birine TEK TEK ders adı + soru no yazması (100+ soru için
// saatler süren bir iş) yerine, sadece "hangi dersten kaç soru var" bilgisini
// (ör. Türkçe 40, Matematik 40, Fizik 14...) tek seferde girmesini sağlar.
// Sistem bunu, kutuların zaten doğru okuma sırasında olmasından yararlanarak,
// hepsine birden otomatik dağıtır. Admin'e sadece İSTİSNALARI (yanlış yerdeki
// birkaç kutu) tek tek düzeltmek kalır.
// ============================================================================
function TopluDersAtamaPaneli({ toplamSoru, onUygula, onVazgec }) {
  const [bloklar, setBloklar] = useState([{ id: 1, ders: '', sayi: '' }])

  const toplamGirilen = bloklar.reduce((t, b) => t + (Number(b.sayi) || 0), 0)

  function blokGuncelle(id, alanlar) {
    setBloklar((liste) => liste.map((b) => (b.id === id ? { ...b, ...alanlar } : b)))
  }
  function blokEkle() {
    setBloklar((liste) => [...liste, { id: Date.now(), ders: '', sayi: '' }])
  }
  function blokSil(id) {
    setBloklar((liste) => liste.filter((b) => b.id !== id))
  }

  function uygula() {
    const gecerliBloklar = bloklar.filter((b) => b.ders.trim() && Number(b.sayi) > 0)
    if (gecerliBloklar.length === 0) return
    onUygula(gecerliBloklar.map((b) => ({ ders: b.ders.trim(), sayi: Number(b.sayi) })))
  }

  return (
    <div className="bg-blue/5 border border-blue/20 rounded-2xl p-5 mb-6">
      <p className="font-semibold text-navy mb-1">Toplu Ders Ataması (önerilen — çok zaman kazandırır)</p>
      <p className="text-sm text-gray-600 mb-4">
        Sistem toplam <b>{toplamSoru}</b> soru kutusu buldu ve bunlar zaten kitapçıktaki okuma sırasında (baştan
        sona). Her birini tek tek doldurmak yerine, hangi dersten kaç soru olduğunu aşağıya sırayla yazın —
        sistem hepsine otomatik ders adı ve soru numarası verecek. Sonra sadece nadir hatalı kutuları tek tek
        düzeltirsiniz.
      </p>

      <div className="space-y-2 mb-3">
        {bloklar.map((b, i) => (
          <div key={b.id} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-5 shrink-0">{i + 1}.</span>
            <input
              list="ders-onerileri"
              value={b.ders}
              onChange={(e) => blokGuncelle(b.id, { ders: e.target.value })}
              placeholder="örn. Türkçe"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue bg-white"
            />
            <input
              type="number"
              min="1"
              value={b.sayi}
              onChange={(e) => blokGuncelle(b.id, { sayi: e.target.value })}
              placeholder="soru sayısı"
              className="w-28 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue bg-white"
            />
            {bloklar.length > 1 && (
              <button
                type="button"
                onClick={() => blokSil(b.id)}
                className="text-red-400 text-sm px-2 hover:text-red-600"
                title="Bu satırı sil"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={blokEkle}
            className="text-navy text-sm font-semibold hover:underline"
          >
            + Ders Ekle
          </button>
          <span
            className={`text-xs font-semibold ${
              toplamGirilen === toplamSoru ? 'text-green-600' : 'text-gray-400'
            }`}
          >
            Toplam: {toplamGirilen} / {toplamSoru} soru
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onVazgec}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-500 hover:bg-white"
          >
            Bunu atla, tek tek gireceğim
          </button>
          <button
            type="button"
            onClick={uygula}
            disabled={toplamGirilen === 0}
            className="bg-navy text-white font-semibold px-4 py-1.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-40"
          >
            Uygula
          </button>
        </div>
      </div>
      {toplamGirilen !== 0 && toplamGirilen !== toplamSoru && (
        <p className="text-xs text-orange mt-2">
          Girdiğiniz toplam ({toplamGirilen}), tespit edilen soru sayısından ({toplamSoru}) farklı — yine de
          uygulayabilirsiniz, kalan kutulara ders adı boş atanır, onları tek tek düzeltirsiniz.
        </p>
      )}
    </div>
  )
}

export default function SinavKitapciklari() {
  const [sinavlar, setSinavlar] = useState([])
  const [kitapciklar, setKitapciklar] = useState([])
  const [silinenKitapcikId, setSilinenKitapcikId] = useState(null)
  const [seciliSinavId, setSeciliSinavId] = useState('')
  const [yeniSinavAdi, setYeniSinavAdi] = useState('')
  const [yeniSinavTarihi, setYeniSinavTarihi] = useState('')
  const [kitapcikTuru, setKitapcikTuru] = useState('A')
  const [dosya, setDosya] = useState(null)

  const [analizEdiliyor, setAnalizEdiliyor] = useState(false)
  const [analizDurumu, setAnalizDurumu] = useState('')
  const [sayfaGoruntuleri, setSayfaGoruntuleri] = useState([])
  const [sorular, setSorular] = useState([])
  const [seciliIndex, setSeciliIndex] = useState(0)
  const [cizimModu, setCizimModu] = useState(false)
  // Yeni bir analiz sonucu geldiğinde varsayılan olarak TOPLU DERS ATAMA
  // paneli gösterilir (bkz. TopluDersAtamaPaneli) — admin isterse "Bunu atla"
  // deyip eski tek-tek düzenleme akışına geçebilir.
  const [blokPaneliGoster, setBlokPaneliGoster] = useState(false)

  // "Hızlı Elle İşaretleme" modu — OCR kullanmadan, admin sayfa sayfa
  // gezinip her sorunun sol üst köşesine tıklar. elleNoktalar TÜM sayfalar
  // boyunca, TIKLAMA SIRASINA göre (yani zaten doğru okuma sırasında) tutulur.
  const [elleIsaretlemeModu, setElleIsaretlemeModu] = useState(false)
  const [elleNoktalar, setElleNoktalar] = useState([])
  const [elleSayfaIndex, setElleSayfaIndex] = useState(0)

  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState('')
  const [basari, setBasari] = useState('')

  function veriyiYenile() {
    supabase.from('sinavlar').select('*').order('sinav_tarihi', { ascending: false }).then(({ data }) => {
      setSinavlar(data || [])
    })
    supabase
      .from('sinav_kitapciklari')
      .select('*, sinavlar(sinav_adi)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setKitapciklar(data || []))
  }

  // Bir kitapçığı (ör. deneme amaçlı yüklenmiş, yanlış yüklenmiş vb.) kalıcı
  // olarak siler: önce o kitapçığa bağlı soru haritasını (sinav_kitapcik_sorulari),
  // sonra Storage'daki taranmış PDF dosyasını, en son da kitapçık satırının
  // kendisini kaldırır. "Sınav" kaydının kendisi (ör. "1. TYT") silinmez —
  // aynı sınava başka bir kitapçık (B gibi) daha sonra yüklenebilsin diye.
  async function kitapcikSil(k) {
    if (
      !confirm(
        `"${k.sinavlar?.sinav_adi || 'Bu sınav'}" — "${k.kitapcik}" kitapçığını kalıcı olarak silmek istediğinize emin misiniz?\n\n` +
          `Bu kitapçığa ait soru işaretlemeleri de silinir. Bu işlem GERİ ALINAMAZ.`
      )
    )
      return
    setSilinenKitapcikId(k.id)
    try {
      const { error: soruHatasi } = await supabase.from('sinav_kitapcik_sorulari').delete().eq('kitapcik_id', k.id)
      if (soruHatasi) throw soruHatasi
      if (k.pdf_yolu) {
        // Depolamadaki dosya silinemese bile (ör. zaten yoksa) kitapçık
        // kaydının silinmesini engellemesin diye hatasını sadece konsola yazıyoruz.
        const { error: dosyaHatasi } = await supabase.storage.from('sinav-kitapciklari').remove([k.pdf_yolu])
        if (dosyaHatasi) console.error('PDF dosyası silinemedi:', dosyaHatasi.message)
      }
      const { error: kitapcikHatasi } = await supabase.from('sinav_kitapciklari').delete().eq('id', k.id)
      if (kitapcikHatasi) throw kitapcikHatasi
      veriyiYenile()
    } catch (e) {
      alert('Hata: ' + e.message)
    } finally {
      setSilinenKitapcikId(null)
    }
  }

  useEffect(() => {
    veriyiYenile()
  }, [])

  function girdileriDogrula() {
    if (!dosya) {
      setHata('Lütfen önce bir PDF seçin.')
      return false
    }
    if (!seciliSinavId) {
      setHata('Lütfen bir sınav seçin ya da yeni sınav ekleyin.')
      return false
    }
    if (seciliSinavId === '__yeni__' && !yeniSinavAdi.trim()) {
      setHata('Yeni sınavın adını girin.')
      return false
    }
    return true
  }

  // OCR'a HİÇ başvurmadan — sadece sayfaları görüntüye çevirip "Hızlı Elle
  // İşaretleme" moduna geçiyoruz. OCR'ın güvenilir olmadığı (grafik/tablo/
  // resim ağırlıklı, düzensiz yükseklikte sorular içeren) kitapçıklarda bu
  // çok daha hızlı ve hatasız sonuç veriyor.
  async function elleIsaretlemeyeBasla() {
    setHata('')
    setBasari('')
    if (!girdileriDogrula()) return
    setAnalizEdiliyor(true)
    setSayfaGoruntuleri([])
    setSorular([])
    setElleNoktalar([])
    try {
      setAnalizDurumu('PDF açılıyor...')
      const belge = await pdfBelgesiAc(dosya)
      const sayfaSayisi = belge.numPages
      const goruntuler = []
      for (let s = 1; s <= sayfaSayisi; s++) {
        setAnalizDurumu(`Sayfa ${s}/${sayfaSayisi} hazırlanıyor...`)
        const { dataUrl, genislik, yukseklik } = await sayfayiGoruntuyeCevir(belge, s, 2)
        goruntuler.push({ sayfaNo: s, dataUrl, genislik, yukseklik })
      }
      setSayfaGoruntuleri(goruntuler)
      setElleSayfaIndex(0)
      setElleIsaretlemeModu(true)
      setAnalizDurumu('')
    } catch (e) {
      setHata('Hata: ' + e.message)
    } finally {
      setAnalizEdiliyor(false)
    }
  }

  function elleNoktaEkle(sayfaNo, nokta) {
    setElleNoktalar((liste) => [...liste, { sayfaNo, x: nokta.x, y: nokta.y }])
  }

  function elleSonNoktayiGeriAl() {
    setElleNoktalar((liste) => {
      if (liste.length === 0) return liste
      const yeni = liste.slice(0, -1)
      const silinen = liste[liste.length - 1]
      // Silinen nokta başka bir sayfadaysa, admin'in onu görebilmesi için o
      // sayfaya geri dön.
      const silinenSayfaIndex = sayfaGoruntuleri.findIndex((g) => g.sayfaNo === silinen.sayfaNo)
      if (silinenSayfaIndex !== -1) setElleSayfaIndex(silinenSayfaIndex)
      return yeni
    })
  }

  // Tıklama noktalarını (doğru okuma sırasında) gerçek kutulara çevirir —
  // bkz. NoktaIsaretlemeKatmani üstündeki açıklama: genişlik sütuna (sayfanın
  // sol/sağ yarısı) göre, yükseklik aynı sütundaki bir sonraki noktaya kadar.
  function noktalariKutuyaCevir() {
    const sayfaMap = new Map(sayfaGoruntuleri.map((g) => [g.sayfaNo, g]))
    const kenarBosluk = 12
    const kutular = elleNoktalar.map((nokta, i) => {
      const g = sayfaMap.get(nokta.sayfaNo)
      const solYarida = nokta.x < g.genislik / 2
      const genislik = Math.max(60, (solYarida ? g.genislik / 2 - nokta.x : g.genislik - nokta.x) - kenarBosluk)

      const sonraki = elleNoktalar[i + 1]
      const sonrakiAyniSutunda =
        sonraki && sonraki.sayfaNo === nokta.sayfaNo && sonraki.x < g.genislik / 2 === solYarida ? sonraki : null

      const yukseklik = Math.max(
        30,
        (sonrakiAyniSutunda ? sonrakiAyniSutunda.y - nokta.y : g.yukseklik - nokta.y) - 6
      )

      return {
        gecici_id: `m${nokta.sayfaNo}-${i}`,
        ders_adi: '',
        soru_no: i + 1,
        sayfa_no: nokta.sayfaNo,
        x: nokta.x,
        y: nokta.y,
        genislik,
        yukseklik,
      }
    })
    setSorular(kutular)
    setSeciliIndex(0)
    setElleIsaretlemeModu(false)
    setBlokPaneliGoster(kutular.length > 0)
    setBasari(
      `${kutular.length} soru işaretlendi. Şimdi hangi dersten kaç soru olduğunu girip toplu atayabilirsiniz.`
    )
  }

  async function analizEt() {
    setHata('')
    setBasari('')
    if (!dosya) {
      setHata('Lütfen önce bir PDF seçin.')
      return
    }
    if (!seciliSinavId) {
      setHata('Lütfen bir sınav seçin ya da yeni sınav ekleyin.')
      return
    }
    if (seciliSinavId === '__yeni__' && !yeniSinavAdi.trim()) {
      setHata('Yeni sınavın adını girin.')
      return
    }
    setAnalizEdiliyor(true)
    setSayfaGoruntuleri([])
    setSorular([])
    try {
      setAnalizDurumu('PDF açılıyor...')
      const belge = await pdfBelgesiAc(dosya)
      const sayfaSayisi = belge.numPages
      const goruntuler = []
      // Önce TÜM sayfalardaki adayları toplayıp (sayfa sırasına göre) tek bir
      // okuma-sırası dizisi oluşturuyoruz — bir dersin soruları (örn. Türkçe
      // testinin 40 sorusu) birden fazla sayfaya yayılabildiği için ardışıklık
      // kontrolünü SAYFA BAZINDA değil, TÜM belge üzerinde yapmamız gerekiyor.
      const sayfaVerileri = []
      const tumAdaylarSirali = []
      // OCR işçisi (worker) TÜM belge için BİR KEZ kuruluyor ve her sayfada
      // yeniden kullanılıyor (hem hızlı hem de sayfa başına ayarları tekrar
      // kurma derdi yok) — bkz. kitapcikOcr.js açıklaması.
      const ocrWorker = await soruNumarasiWorkerOlustur()
      try {
        for (let s = 1; s <= sayfaSayisi; s++) {
          setAnalizDurumu(`Sayfa ${s}/${sayfaSayisi} görüntüye çevriliyor...`)
          // olcek: 2 yerine 3 kullanılıyor — küçük puntolu/çok sütunlu (AYT
          // matematik gibi) kitapçıklarda soru numaraları çok küçük kaldığı
          // için Tesseract çoğunu okuyamıyordu (160 sorudan sadece 25'i
          // bulunabilmişti). Daha yüksek çözünürlük tanıma oranını artırıyor.
          const { dataUrl, genislik, yukseklik, canvas } = await sayfayiGoruntuyeCevir(belge, s, 3)
          goruntuler.push({ sayfaNo: s, dataUrl, genislik, yukseklik })
          setAnalizDurumu(`Sayfa ${s}/${sayfaSayisi} taranıyor (OCR)...`)
          const adaylarHam = await sayfadaSoruNumaralariniTespitEt(ocrWorker, canvas, genislik, yukseklik, (ilerleme) => {
            setAnalizDurumu(`Sayfa ${s}/${sayfaSayisi} taranıyor (OCR) — %${Math.round(ilerleme * 100)}`)
          })
          const adaylar = girintiliAdaylariEle(adaylarHam, genislik)
          const sutunlu = sutunSiralaTahmini(adaylar, genislik).map((a) => ({ ...a, sayfa_no: s }))
          sayfaVerileri.push({ sayfaNo: s, genislik, yukseklik, sutunluAdaylar: sutunlu })
          tumAdaylarSirali.push(...sutunlu)
        }
      } finally {
        await soruNumarasiWorkerKapat(ocrWorker)
      }

      // Sadece yeterince UZUN, artan bir dizinin parçası olan adaylar gerçek
      // soru sayılır — yönergedeki kısa "1. ... 2. ..." gibi kopuk
      // numaralandırmalar burada elenir (bkz. kitapcikOcr.js açıklaması).
      let guvenilirAdaylar = ardisikDiziyeGoreFiltrele(tumAdaylarSirali)
      let siraFiltresiUygulanmadi = false
      // Güvenlik: taramanın kalitesi düşükse bu filtre HER ŞEYİ eleyebilir —
      // o zaman admin'i elle işaretlemeye tek başına bırakmak yerine,
      // filtrelemeden önceki (daha ham ama en azından dolu) listeye geri
      // dönüyoruz; admin zaten her adayı gözden geçirip yanlışları silecek.
      if (guvenilirAdaylar.length === 0 && tumAdaylarSirali.length > 0) {
        guvenilirAdaylar = tumAdaylarSirali
        siraFiltresiUygulanmadi = true
      }
      const guvenilirSet = new Set(guvenilirAdaylar)

      const tumSorular = []
      for (const sayfaVerisi of sayfaVerileri) {
        const buSayfaGuvenilirler = sayfaVerisi.sutunluAdaylar.filter((a) => guvenilirSet.has(a))
        const kutular = baslangicKutulariUret(buSayfaGuvenilirler, sayfaVerisi.genislik, sayfaVerisi.yukseklik)
        kutular.forEach((k) => {
          tumSorular.push({
            gecici_id: `s${sayfaVerisi.sayfaNo}-${tumSorular.length}`,
            ders_adi: '',
            soru_no: tumSorular.length + 1,
            sayfa_no: sayfaVerisi.sayfaNo,
            x: k.x,
            y: k.y,
            genislik: k.genislik,
            yukseklik: k.yukseklik,
          })
        })
      }
      setSayfaGoruntuleri(goruntuler)
      setSorular(tumSorular)
      setSeciliIndex(0)
      setAnalizDurumu('')
      // Yeni bir analiz sonrası, önce hızlı toplu atama paneli gösterilir —
      // admin isterse "Bunu atla" diyip eski tek-tek akışa geçebilir.
      setBlokPaneliGoster(tumSorular.length > 0)
      if (tumSorular.length === 0) {
        setHata('Hiç soru başlangıcı tespit edilemedi. Aşağıdan "Soru Ekle" ile elle işaretleyebilirsiniz.')
      } else if (siraFiltresiUygulanmadi) {
        setBasari(
          `${tumSorular.length} olası soru tespit edildi. Bu taramanın kalitesi düşük olduğu için sıralama kontrolü hiçbir şey bulamadı, o yüzden TÜM adaylar (yönerge gibi yanlış olanlar dahil) gösteriliyor — her birini dikkatlice gözden geçirip yanlış olanları "Bu Soruyu Sil" ile çıkarın.`
        )
      } else {
        setBasari(
          `${tumSorular.length} olası soru tespit edildi (yönerge gibi kısa/kopuk numaralar otomatik elendi). Bu bir İLK TAHMİN — şimdi her birinin ders adını/numarasını girip kutucuğu gerekirse düzeltin.`
        )
      }
    } catch (e) {
      setHata('Hata: ' + e.message)
    } finally {
      setAnalizEdiliyor(false)
    }
  }

  // TopluDersAtamaPaneli'nden gelen [{ders, sayi}, ...] blok listesini,
  // `sorular` dizisindeki (zaten okuma sırasında olan) kutulara sırayla
  // dağıtır. Örn. [{ders:'Türkçe', sayi:40}, {ders:'Matematik', sayi:40}]
  // verilirse, ilk 40 kutuya "Türkçe 1..40", sonraki 40'a "Matematik 1..40" yazılır.
  function topluAta(bloklar) {
    setSorular((liste) => {
      let kalan = [...bloklar]
      let mevcutBlok = kalan.shift()
      let sayacBuBlokta = 0
      return liste.map((s) => {
        while (mevcutBlok && sayacBuBlokta >= mevcutBlok.sayi) {
          mevcutBlok = kalan.shift()
          sayacBuBlokta = 0
        }
        if (!mevcutBlok) return s
        sayacBuBlokta += 1
        return { ...s, ders_adi: mevcutBlok.ders, soru_no: sayacBuBlokta }
      })
    })
    setBlokPaneliGoster(false)
    setBasari('Toplu atama uygulandı. Şimdi sayfaları hızlıca gözden geçirip, varsa yanlış yerdeki nadir kutuları düzeltin.')
  }

  function soruGuncelle(gecici_id, alanlar) {
    setSorular((liste) => liste.map((s) => (s.gecici_id === gecici_id ? { ...s, ...alanlar } : s)))
  }

  function soruSil(gecici_id) {
    setSorular((liste) => liste.filter((s) => s.gecici_id !== gecici_id))
    setSeciliIndex((i) => Math.max(0, i - 1))
  }

  function soruEkle() {
    const buSayfa = sorular[seciliIndex]?.sayfa_no || sayfaGoruntuleri[0]?.sayfaNo || 1
    const yeni = {
      gecici_id: `manuel-${Date.now()}`,
      ders_adi: '',
      soru_no: sorular.length + 1,
      sayfa_no: buSayfa,
      x: 20,
      y: 20,
      genislik: 200,
      yukseklik: 150,
    }
    setSorular((liste) => {
      const yeniListe = [...liste, yeni]
      setSeciliIndex(yeniListe.length - 1)
      return yeniListe
    })
    setCizimModu(true)
  }

  async function kaydet() {
    setHata('')
    setBasari('')
    if (sorular.length === 0) {
      setHata('Kaydedilecek soru yok.')
      return
    }
    const eksikler = sorular.filter((s) => !s.ders_adi.trim() || !s.soru_no)
    if (eksikler.length > 0) {
      setHata(`${eksikler.length} sorunun ders adı ya da soru numarası eksik — önce onları tamamlayın.`)
      return
    }
    setKaydediliyor(true)
    try {
      let sinavId = seciliSinavId
      if (sinavId === '__yeni__') {
        const { data, error } = await supabase
          .from('sinavlar')
          .insert({ sinav_adi: ilkHarfleriBuyukYap(yeniSinavAdi.trim()), sinav_tarihi: yeniSinavTarihi || null })
          .select()
          .single()
        if (error && error.code === '23505') {
          // Bu isimde bir sınav zaten var (muhtemelen A kitapçığını kaydederken
          // oluşturulmuş, şimdi B kitapçığı için ya da yanlışlıkla "+ Yeni sınav
          // ekle" ile aynı isim tekrar yazılmış olabilir). Hata vermek yerine
          // var olan sınavı bulup ONA kaydediyoruz — admin'in dropdown'dan
          // seçmesini beklemek yerine bunu otomatik toparlıyoruz.
          const { data: mevcutSinav, error: bulmaHatasi } = await supabase
            .from('sinavlar')
            .select('id')
            .eq('sinav_adi', yeniSinavAdi.trim())
            .single()
          if (bulmaHatasi || !mevcutSinav) throw error
          sinavId = mevcutSinav.id
        } else if (error) {
          throw error
        } else {
          sinavId = data.id
        }
      }

      const dosyaYolu = `${sinavId}/${kitapcikTuru}-${Date.now()}.pdf`
      const { error: yuklemeHatasi } = await supabase.storage
        .from('sinav-kitapciklari')
        .upload(dosyaYolu, dosya, { contentType: 'application/pdf' })
      if (yuklemeHatasi) throw yuklemeHatasi

      const { data: kitapcikVerisi, error: kitapcikHatasi } = await supabase
        .from('sinav_kitapciklari')
        .upsert(
          { sinav_id: sinavId, kitapcik: kitapcikTuru, pdf_yolu: dosyaYolu, sayfa_sayisi: sayfaGoruntuleri.length, onaylandi: true },
          { onConflict: 'sinav_id,kitapcik' }
        )
        .select()
        .single()
      if (kitapcikHatasi) throw kitapcikHatasi

      // Aynı kitapçık daha önce kaydedilmişse eski soru haritasını temizleyip yeniden yazıyoruz.
      await supabase.from('sinav_kitapcik_sorulari').delete().eq('kitapcik_id', kitapcikVerisi.id)

      const satirlar = sorular.map((s) => ({
        kitapcik_id: kitapcikVerisi.id,
        ders_adi: ilkHarfleriBuyukYap(s.ders_adi.trim()),
        soru_no: Number(s.soru_no),
        sayfa_no: s.sayfa_no,
        x: s.x,
        y: s.y,
        genislik: s.genislik,
        yukseklik: s.yukseklik,
      }))
      const { error: soruHatasi } = await supabase.from('sinav_kitapcik_sorulari').insert(satirlar)
      if (soruHatasi) throw soruHatasi

      setBasari(`✓ ${satirlar.length} soru kaydedildi. Bu kitapçık artık öğrenci hata kitapçıkları için hazır.`)
      setSeciliSinavId('')
      setYeniSinavAdi('')
      setYeniSinavTarihi('')
      setDosya(null)
      setSayfaGoruntuleri([])
      setSorular([])
      veriyiYenile()
    } catch (e) {
      setHata('Hata: ' + e.message)
    } finally {
      setKaydediliyor(false)
    }
  }

  const seciliSoru = sorular[seciliIndex]
  const buSayfaGoruntusu = sayfaGoruntuleri.find((g) => g.sayfaNo === seciliSoru?.sayfa_no)
  const buSayfadakiSorular = sorular.filter((s) => s.sayfa_no === seciliSoru?.sayfa_no)
  const tamamlananSayisi = sorular.filter((s) => s.ders_adi.trim() && s.soru_no).length

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-2">Sınav Kitapçıkları</h1>
      <p className="text-sm text-gray-500 mb-6">
        Bir kitapçığın (A/B) taranmış PDF'ini yükleyin, sistem soruların yaklaşık yerini otomatik bulmaya çalışır,
        siz her birini kontrol edip onaylarsınız. Bu işlem her kitapçık için SADECE BİR KERE yapılır — sonra o
        sınavı giren her öğrencinin yanlış sorularını buradan otomatik kesip kişiye özel kitapçık üretebiliriz.
      </p>

      {kitapciklar.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto mb-6">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-gray-700">Kayıtlı Kitapçıklar</h2>
          </div>
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Sınav</th>
                <th className="px-4 py-2 font-medium">Kitapçık</th>
                <th className="px-4 py-2 font-medium">Sayfa</th>
                <th className="px-4 py-2 font-medium">Durum</th>
                <th className="px-4 py-2 font-medium text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {kitapciklar.map((k) => (
                <tr key={k.id} className="border-t border-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{k.sinavlar?.sinav_adi}</td>
                  <td className="px-4 py-2">{k.kitapcik}</td>
                  <td className="px-4 py-2 text-gray-500">{k.sayfa_sayisi}</td>
                  <td className="px-4 py-2">
                    {k.onaylandi ? (
                      <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-full">Hazır</span>
                    ) : (
                      <span className="text-xs font-semibold bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">Onay bekliyor</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => kitapcikSil(k)}
                      disabled={silinenKitapcikId === k.id}
                      className="text-red-500 text-sm hover:underline disabled:opacity-50"
                    >
                      {silinenKitapcikId === k.id ? 'Siliniyor...' : 'Sil'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <p className="font-semibold text-gray-700 mb-3">Yeni Kitapçık Yükle</p>
        <div className="flex flex-wrap gap-3 items-end mb-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sınav</label>
            <select
              value={seciliSinavId}
              onChange={(e) => setSeciliSinavId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
            >
              <option value="">Seçiniz...</option>
              <option value="__yeni__">+ Yeni sınav ekle</option>
              {sinavlar.map((s) => (
                <option key={s.id} value={s.id}>{s.sinav_adi}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[130px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Kitapçık</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setKitapcikTuru('A')}
                className={`px-3 py-2 rounded-lg text-sm font-semibold ${kitapcikTuru === 'A' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
              >
                A
              </button>
              <button
                type="button"
                onClick={() => setKitapcikTuru('B')}
                className={`px-3 py-2 rounded-lg text-sm font-semibold ${kitapcikTuru === 'B' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
              >
                B
              </button>
            </div>
          </div>
        </div>

        {seciliSinavId === '__yeni__' && (
          <div className="flex flex-wrap gap-3 items-end mb-3 bg-gray-50 border border-gray-100 rounded-lg p-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Yeni Sınav Adı</label>
              <input
                value={yeniSinavAdi}
                onChange={(e) => setYeniSinavAdi(e.target.value)}
                placeholder="örn. 50. TYT Denemesi"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>
            <div className="min-w-[150px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tarih (opsiyonel)</label>
              <input
                type="date"
                value={yeniSinavTarihi}
                onChange={(e) => setYeniSinavTarihi(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Kitapçık PDF'i</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setDosya(e.target.files?.[0] || null)}
              className="w-full text-sm"
            />
          </div>
          <button
            type="button"
            onClick={analizEt}
            disabled={analizEdiliyor}
            className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {analizEdiliyor ? 'Hazırlanıyor...' : 'Kitapçığı Analiz Et (OCR)'}
          </button>
          <button
            type="button"
            onClick={elleIsaretlemeyeBasla}
            disabled={analizEdiliyor}
            className="bg-navy text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {analizEdiliyor ? 'Hazırlanıyor...' : 'Hızlı Elle İşaretle (OCR\'sız)'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Grafik/tablo/resim içeren, düzensiz uzunlukta sorulardan oluşan kitapçıklarda (ör. AYT Matematik) OCR
          çoğu soruyu bulamayabilir — bu durumda "Hızlı Elle İşaretle" ile her sorunun sol üst köşesine sırayla
          tek tıklayarak çok daha hızlı ve hatasız sonuç alırsınız.
        </p>

        {analizEdiliyor && <p className="text-sm text-blue mt-3">{analizDurumu} (sayfa sayısına göre birkaç dakika sürebilir, sayfayı kapatmayın.)</p>}
        {hata && <p className="text-red-600 text-sm mt-3">{hata}</p>}
        {!hata && basari && <p className="text-green-600 text-sm mt-3">{basari}</p>}
      </div>

      {elleIsaretlemeModu && sayfaGoruntuleri[elleSayfaIndex] && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
          <div className="bg-blue/5 border border-blue/20 rounded-lg p-3 mb-4 text-sm text-gray-700">
            <p className="font-semibold text-navy mb-1">Nasıl kullanılır:</p>
            <p>
              Sayfada, HER sorunun numarasının olduğu SOL ÜST köşeye, okuma sırasına göre (yukarıdan aşağı, sonra
              soldan sağa sütuna) TEK TEK tıklayın. Kutu boyutunu siz çizmiyorsunuz — bir sonraki tıklamaya kadar
              olan alanı sistem otomatik kutu yapıyor. Sayfada soru yoksa (kapak, boş sayfa vb.) hiç tıklamadan
              sonraki sayfaya geçin.
            </p>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <p className="font-semibold text-gray-700">
              Sayfa {elleSayfaIndex + 1} / {sayfaGoruntuleri.length} — toplam işaretlenen: {elleNoktalar.length}
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={elleSonNoktayiGeriAl}
                disabled={elleNoktalar.length === 0}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              >
                ↺ Son Noktayı Geri Al
              </button>
              <button
                type="button"
                onClick={() => setElleSayfaIndex((i) => Math.max(0, i - 1))}
                disabled={elleSayfaIndex === 0}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              >
                ← Önceki Sayfa
              </button>
              <button
                type="button"
                onClick={() => setElleSayfaIndex((i) => Math.min(sayfaGoruntuleri.length - 1, i + 1))}
                disabled={elleSayfaIndex === sayfaGoruntuleri.length - 1}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              >
                Sonraki Sayfa →
              </button>
              <button
                type="button"
                onClick={() => setElleIsaretlemeModu(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-100"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={noktalariKutuyaCevir}
                disabled={elleNoktalar.length === 0}
                className="bg-orange text-white font-semibold px-4 py-1.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-40"
              >
                Tamamla → Kutulara Çevir ({elleNoktalar.length})
              </button>
            </div>
          </div>

          <NoktaIsaretlemeKatmani
            sayfaGoruntusu={sayfaGoruntuleri[elleSayfaIndex]}
            buSayfadakiNoktalar={elleNoktalar
              .map((n, i) => ({ ...n, globalSira: i + 1 }))
              .filter((n) => n.sayfaNo === sayfaGoruntuleri[elleSayfaIndex].sayfaNo)}
            onNoktaEkle={(nokta) => elleNoktaEkle(sayfaGoruntuleri[elleSayfaIndex].sayfaNo, nokta)}
          />
        </div>
      )}

      {sorular.length > 0 && blokPaneliGoster && (
        <TopluDersAtamaPaneli
          toplamSoru={sorular.length}
          onUygula={topluAta}
          onVazgec={() => setBlokPaneliGoster(false)}
        />
      )}

      {sorular.length > 0 && !blokPaneliGoster && seciliSoru && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
          <div className="bg-blue/5 border border-blue/20 rounded-lg p-3 mb-4 text-sm text-gray-700 space-y-1">
            <p className="font-semibold text-navy">Nasıl kullanılır — her aday için tek tek:</p>
            <p>1. Turuncu kutu sayfada GERÇEK bir soruyu mu gösteriyor bak. Değilse (logo, başlık, yönerge yazısı gibi bir yeri işaretlemişse) sağdan <b>"Bu Soruyu Sil"</b>e bas, sıradaki adaya geç.</p>
            <p>2. Gerçek bir soruysa sağa <b>Ders Adı</b> (örn. Türkçe) ve <b>Soru No</b>'yu yaz.</p>
            <p>3. Kutu soruyu tam kapsamıyorsa <b>"Kutuyu Yeniden Çiz"</b>e basıp sayfada soruyu fare ile sürükleyerek yeniden kutula.</p>
            <p>4. <b>Sonraki →</b> ile devam et. Hepsini bitirince en alttaki <b>"Onayla ve Kaydet"</b>e bas.</p>
            <p className="pt-1 border-t border-blue/10 mt-1">
              <b>Not:</b> "Kutuyu Yeniden Çiz" ya da "+ Eksik Soru Ekle"ye bastığında sayfanın üstünde turuncu bir
              uyarı çıkar ve fare imleci artı işaretine döner — o an sayfada, sorunun sol üst köşesinden sağ alt
              köşesine kadar fareyi BASILI TUTARAK sürüklemen bekleniyor. Yanlışlıkla bu moda girdiysen sağdaki
              <b> "Vazgeç"</b>e bas, hiçbir şey değişmez.
            </p>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <p className="font-semibold text-gray-700">
                Soru {seciliIndex + 1} / {sorular.length} — {tamamlananSayisi} tanesi dolduruldu
              </p>
              <button
                type="button"
                onClick={() => setBlokPaneliGoster(true)}
                className="text-xs text-navy font-semibold hover:underline"
              >
                ↺ Toplu Ders Atamaya Dön
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSeciliIndex(0)}
                disabled={seciliIndex === 0}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              >
                ⏮ Başa Dön
              </button>
              <button
                type="button"
                onClick={() => setSeciliIndex((i) => Math.max(0, i - 1))}
                disabled={seciliIndex === 0}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              >
                ← Önceki
              </button>
              <button
                type="button"
                onClick={() => setSeciliIndex((i) => Math.min(sorular.length - 1, i + 1))}
                disabled={seciliIndex === sorular.length - 1}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              >
                Sonraki →
              </button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-5">
            <div className="lg:w-2/3">
              {buSayfaGoruntusu && (
                <KutuKatmani
                  sayfaGoruntusu={buSayfaGoruntusu}
                  sorularBuSayfada={buSayfadakiSorular}
                  seciliGeciciId={seciliSoru.gecici_id}
                  cizimModu={cizimModu}
                  onCizimBitti={(kutu) => {
                    soruGuncelle(seciliSoru.gecici_id, kutu)
                    setCizimModu(false)
                  }}
                />
              )}
              <p className="text-xs text-gray-400 mt-2">Sayfa {seciliSoru.sayfa_no}</p>
            </div>

            <div className="lg:w-1/3 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ders Adı</label>
                <input
                  list="ders-onerileri"
                  value={seciliSoru.ders_adi}
                  onChange={(e) => soruGuncelle(seciliSoru.gecici_id, { ders_adi: e.target.value })}
                  placeholder="örn. Türkçe"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
                />
                <datalist id="ders-onerileri">
                  {DERS_ONERILERI.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Soru No (bu ders içinde)</label>
                <input
                  type="number"
                  min="1"
                  value={seciliSoru.soru_no}
                  onChange={(e) => soruGuncelle(seciliSoru.gecici_id, { soru_no: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
                />
              </div>

              <button
                type="button"
                onClick={() => setCizimModu(true)}
                className={`w-full px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  cizimModu ? 'bg-orange text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {cizimModu ? '👆 Yukarıda sayfada sürükleyerek kutu çiz' : 'Kutuyu Yeniden Çiz'}
              </button>
              {cizimModu && (
                <button
                  type="button"
                  onClick={() => setCizimModu(false)}
                  className="w-full px-3 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-100"
                >
                  Vazgeç (kutu çizmeden çık)
                </button>
              )}

              <button
                type="button"
                onClick={() => soruSil(seciliSoru.gecici_id)}
                className="w-full px-3 py-2 rounded-lg text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50"
              >
                Bu Soruyu Sil (yanlış tespit)
              </button>

              <button
                type="button"
                onClick={soruEkle}
                className="w-full px-3 py-2 rounded-lg text-sm font-semibold text-navy border border-navy/20 hover:bg-navy/5"
              >
                + Eksik Soru Ekle
              </button>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-gray-400">
              Kaydetmeden önce tüm soruların ders adı ve numarası dolu olmalı. Kutu konumu tam oturmasa da olur,
              önemli olan doğru soruyu kapsaması.
            </p>
            <button
              type="button"
              onClick={kaydet}
              disabled={kaydediliyor}
              className="bg-orange text-white font-semibold px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
            >
              {kaydediliyor ? 'Kaydediliyor...' : 'Onayla ve Kaydet'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
