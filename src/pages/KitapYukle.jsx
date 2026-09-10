// "Kitap Yükle" — bir kitabın (ders kitabı, soru bankası vb.) taranmış/dijital
// PDF'ini yükleyip, içinden istenen soruları "kesip" (aslında sadece
// koordinatlarını kaydedip) derse/konuya etiketlemeyi, sonra bu sorulardan
// seçim yaparak yeni bir test PDF'i oluşturup doğrudan öğrenciye ödev olarak
// göndermeyi sağlayan sayfa.
//
// BİLEREK Hata Kitapçığı / Sınav Kitapçıkları sistemine (sinav_kitapciklari,
// sinav_kitapcik_sorulari tabloları, sinav-kitapciklari bucket'ı,
// SinavKitapciklari.jsx/HataKitapcigi.jsx dosyaları) HİÇ DOKUNMUYOR — tamamen
// ayrı tablolar (kitaplar, kitap_sorulari) ve ayrı bir Storage bucket'ı
// (kitaplar) kullanıyor. Sadece genel amaçlı, sınava özel olmayan yardımcı
// fonksiyonları (kitapcikOcr.js, pdfOlustur.js) DEĞİŞTİRMEDEN içe aktarıyor.
//
// DEPOLAMA NOTU: her kitabın PDF'i Storage'a SADECE BİR KEZ yüklenir. Kesilen
// sorular için ayrı bir görüntü dosyası HİÇ oluşturulmaz — sadece "hangi
// kitap, hangi sayfa, hangi x/y/genişlik/yükseklik" bilgisi (birkaç sayı)
// veritabanına yazılır. Bir soru daha sonra bir testte kullanılacağı zaman,
// kitabın PDF'i indirilip ilgili sayfa anlık olarak yeniden çizilip kırpılır
// (bkz. src/lib/kitapPdf.js) — bu yüzden kaç soru kesildiğinin Storage
// kullanımına HİÇBİR etkisi yoktur, sadece kitapların kendisi yer kaplar.
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { KONU_DERSLERI } from '../lib/konuDersleri'
import {
  pdfBelgesiAc,
  sayfayiGoruntuyeCevir,
  girintiliAdaylariEle,
  ardisikDiziyeGoreFiltrele,
  sutunSiralaTahmini,
  baslangicKutulariUret,
} from '../lib/kitapcikOcr'
// Soru numarası OCR'ı ("12." VEYA "12)" tanıma) kitapcikOcr.js'ten DEĞİL, bu
// sayfaya özel kitapOcr.js'ten alınıyor — bkz. o dosyadaki açıklama (Sınav
// Kitapçıkları/Hata Raporu sistemi kitapcikOcr.js'i kullandığı için orada
// değişiklik yapılmadı, burada genişletilmiş bir kopyası var).
import {
  kitapMetinKatmanindanSoruNumaralariniTespitEt,
  kitapSoruNumarasiWorkerOlustur,
  kitapSoruNumarasiWorkerKapat,
  kitapSayfasindaSoruNumaralariniTespitEt,
} from '../lib/kitapOcr'
import { testPdfOlustur } from '../lib/kitapPdf'
import { driveyeKitapYukle, driveDenKitapSil, kitapPdfBlobuGetir, DriveBagliDegilHatasi } from '../lib/kitapDrive'

const MAKSIMUM_KITAP_BOYUTU = 150 * 1024 * 1024 // 150 MB — ücretsiz 1 GB'lık Storage kotasını gözeten makul bir üst sınır
const AKTIF_EGITIM_YILI = '2026-2027' // Odev.jsx/Siniflar.jsx'teki ile aynı sabit — yeni yıla geçilince birlikte güncellenmeli

// ============================================================================
// KUTU KATMANI — bir sayfa görüntüsünün üzerine, soru kutularını (ve varsa
// yeni bir kutu ÇİZME etkileşimini) bindiren saydam katman. SinavKitapciklari
// .jsx'teki KutuKatmani ile AYNI mantık (Pointer Events, doğal piksel
// koordinatları % olarak konumlandırma) — ama bu sayfa için AYRI bir kopya,
// var olan dosyaya hiç dokunulmadı.
// ============================================================================
function KutuKatmani({
  sayfaGoruntusu,
  sorularBuSayfada,
  seciliGeciciId,
  cizimModu,
  cizimMesaji,
  secilenIdler,
  onKutuTiklandi,
  onCizimBitti,
  onSecimCikar,
  // Kullanıcı isteğiyle eklendi: "soru karesinin üzerine tıklayabileyim,
  // üzerine tıklayınca cevap şıkları çıksın işaretleyebileyim" — sağdaki
  // panele bakmak zorunda kalmadan, kutunun HEMEN ALTINDA küçük bir A-E
  // seçici açılır. Verilirse (gecici_id, yeniHarf) ile çağrılır; sağdaki
  // panelin "Doğru Cevap" alanıyla AYNI veriye (soru.cevap) yazar, ikisi de
  // güncel kalır — biri diğerini geçersiz kılmıyor, sadece iki farklı yerden
  // aynı şeyi işaretleme imkanı.
  onCevapDegistir,
}) {
  const [cizilen, setCizilen] = useState(null) // {x0,y0,x1,y1} doğal koordinatlarda
  const kapRef = useRef(null)

  function ekrandanDogalKoordinata(clientX, clientY) {
    const dikdortgen = kapRef.current.getBoundingClientRect()
    const oranX = sayfaGoruntusu.genislik / dikdortgen.width
    const oranY = sayfaGoruntusu.yukseklik / dikdortgen.height
    return { x: (clientX - dikdortgen.left) * oranX, y: (clientY - dikdortgen.top) * oranY }
  }

  function pointerDown(e) {
    if (!cizimModu) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const nokta = ekrandanDogalKoordinata(e.clientX, e.clientY)
    setCizilen({ x0: nokta.x, y0: nokta.y, x1: nokta.x, y1: nokta.y })
  }
  function pointerMove(e) {
    if (!cizimModu || !cizilen) return
    const nokta = ekrandanDogalKoordinata(e.clientX, e.clientY)
    setCizilen((c) => ({ ...c, x1: nokta.x, y1: nokta.y }))
  }
  function bitir() {
    if (!cizilen) return
    const x = Math.min(cizilen.x0, cizilen.x1)
    const y = Math.min(cizilen.y0, cizilen.y1)
    const genislik = Math.abs(cizilen.x1 - cizilen.x0)
    const yukseklik = Math.abs(cizilen.y1 - cizilen.y0)
    setCizilen(null)
    if (genislik < 8 || yukseklik < 8) return // yanlışlıkla tıklama — çok küçük kutuyu yok say
    onCizimBitti({ x, y, genislik, yukseklik })
  }

  const yuzdeStil = (k) => ({
    left: `${(k.x / sayfaGoruntusu.genislik) * 100}%`,
    top: `${(k.y / sayfaGoruntusu.yukseklik) * 100}%`,
    width: `${(k.genislik / sayfaGoruntusu.genislik) * 100}%`,
    height: `${(k.yukseklik / sayfaGoruntusu.yukseklik) * 100}%`,
  })

  return (
    <div
      ref={kapRef}
      className="relative inline-block select-none"
      style={{ touchAction: cizimModu ? 'none' : 'pan-x pan-y', cursor: cizimModu ? 'crosshair' : 'default' }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={bitir}
      onPointerLeave={bitir}
      onPointerCancel={() => setCizilen(null)}
    >
      <img src={sayfaGoruntusu.dataUrl} alt="Sayfa" className="max-h-[72vh] w-auto block" draggable={false} />
      {sorularBuSayfada.map((s) => (
        <div
          key={s.gecici_id}
          onClick={() => onKutuTiklandi(s.gecici_id)}
          className={`absolute border-2 pointer-events-auto cursor-pointer ${
            s.gecici_id === seciliGeciciId
              ? 'border-orange bg-orange/10'
              : s.ders_adi
              ? 'border-green-500 bg-green-500/5'
              : 'border-blue-400 bg-blue-400/5'
          }`}
          style={yuzdeStil(s)}
        >
          <span
            className={`absolute -top-5 left-0 flex items-center gap-1 text-[10px] font-semibold px-1 rounded whitespace-nowrap ${
              s.gecici_id === seciliGeciciId ? 'bg-orange text-white' : 'bg-white/90 text-gray-600 border border-gray-200'
            }`}
          >
            {s.ders_adi || 'Soru'}
            {/* Kullanıcı isteği: otomatik/elle tespit sonrası TÜM sorular
                varsayılan olarak testte seçili sayılır (bkz. sayfaAnaliziYap/
                cizimBitti) — bir soruyu kutunun kendi üzerinden, sol listeye
                gitmeden, tek tıkla testten çıkarmak için bu "✕". */}
            {secilenIdler?.has(s.gecici_id) && onSecimCikar && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onSecimCikar(s.gecici_id)
                }}
                title="Bu soruyu testten çıkar"
                className="pointer-events-auto text-red-500 hover:text-red-700 font-bold leading-none"
              >
                ✕
              </button>
            )}
          </span>
          {/* Bu kutu seçiliyken (üzerine tıklanınca), hemen altında küçük bir
              A-E cevap seçici — sağdaki "Doğru Cevap" paneline gitmeden,
              kutunun üzerinden tek tıkla işaretlenebilsin diye. Çizim
              modundayken (yeni kutu çiziliyorken) karışıklık olmasın diye
              gösterilmiyor. */}
          {s.gecici_id === seciliGeciciId && !cizimModu && onCevapDegistir && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute top-full left-0 mt-1 z-20 flex items-center gap-1 bg-white border border-orange rounded-lg shadow-lg px-1.5 py-1 whitespace-nowrap"
            >
              <span className="text-[9px] font-semibold text-gray-400 pr-0.5">Cevap:</span>
              {['A', 'B', 'C', 'D', 'E'].map((harf) => (
                <button
                  key={harf}
                  type="button"
                  onClick={() => onCevapDegistir(s.gecici_id, s.cevap === harf ? null : harf)}
                  className={`w-5 h-5 leading-none text-[10px] font-semibold rounded ${
                    s.cevap === harf ? 'bg-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {harf}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onKutuTiklandi(null)}
                title="Kapat"
                className="text-gray-300 hover:text-gray-500 text-xs font-bold pl-1"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      ))}
      {cizilen && (
        <div
          className="absolute border-2 border-dashed border-orange bg-orange/10 pointer-events-none"
          style={yuzdeStil({
            x: Math.min(cizilen.x0, cizilen.x1),
            y: Math.min(cizilen.y0, cizilen.y1),
            genislik: Math.abs(cizilen.x1 - cizilen.x0),
            yukseklik: Math.abs(cizilen.y1 - cizilen.y0),
          })}
        />
      )}
      {cizimModu && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-orange text-white text-xs font-semibold px-3 py-1 rounded-full shadow animate-pulse pointer-events-none">
          {cizimMesaji || 'Bir sorunun köşesinden diğer köşesine sürükleyerek kutu çizin'}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// KİTAP YÜKLE FORMU
// ============================================================================
function KitapYukleFormu({ onYuklendi }) {
  const [ad, setAd] = useState('')
  const [dersAdi, setDersAdi] = useState('')
  const [dosya, setDosya] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [ilerlemeMetni, setIlerlemeMetni] = useState('')
  const [hata, setHata] = useState('')
  const inputRef = useRef(null)

  function dosyaSecildi(f) {
    setHata('')
    if (f && f.type !== 'application/pdf') {
      setHata('Sadece PDF dosyası yüklenebilir.')
      setDosya(null)
      return
    }
    if (f && f.size > MAKSIMUM_KITAP_BOYUTU) {
      setHata(
        `Bu dosya ${(f.size / (1024 * 1024)).toFixed(1)} MB — ${MAKSIMUM_KITAP_BOYUTU / (1024 * 1024)} MB sınırını aşıyor. ` +
          `Taramayı biraz daha düşük çözünürlükte (150-200 DPI yeterli) yeniden alıp tekrar deneyin.`
      )
      setDosya(null)
      return
    }
    setDosya(f)
  }

  async function yukle(e) {
    e.preventDefault()
    if (!ad.trim()) return setHata('Lütfen kitaba bir ad verin.')
    if (!dosya) return setHata('Lütfen bir PDF dosyası seçin.')
    setHata('')
    setYukleniyor(true)
    try {
      setIlerlemeMetni('PDF kontrol ediliyor...')
      const belge = await pdfBelgesiAc(dosya)
      const sayfaSayisi = belge.numPages

      const kitapId = crypto.randomUUID()

      // ARTIK Supabase Storage'a DEĞİL, doğrudan Google Drive'a yükleniyor —
      // kullanıcı isteğiyle: ücretsiz Supabase planında alan sıkıntısı
      // yaşanıyordu (bkz. src/lib/kitapDrive.js'teki açıklama). Var olan
      // kitaplar (Supabase'te duran) buna dokunmuyor, sadece bundan sonraki
      // yeni yüklemeler Drive'a gidiyor.
      setIlerlemeMetni('PDF Google Drive\'a yükleniyor... %0')
      const driveDosyaId = await driveyeKitapYukle(dosya, `${ad.trim()}.pdf`, (oran) =>
        setIlerlemeMetni(`PDF Google Drive'a yükleniyor... %${Math.round(oran * 100)}`)
      )

      const { data: kitapSatiri, error: kayitHatasi } = await supabase
        .from('kitaplar')
        .insert({
          id: kitapId,
          ad: ad.trim(),
          ders_adi: dersAdi || null,
          pdf_yolu: null,
          drive_dosya_id: driveDosyaId,
          sayfa_sayisi: sayfaSayisi,
          olcek: 3,
        })
        .select()
        .single()
      if (kayitHatasi) throw kayitHatasi

      setAd('')
      setDersAdi('')
      setDosya(null)
      if (inputRef.current) inputRef.current.value = ''
      onYuklendi(kitapSatiri)
    } catch (err) {
      setHata(err instanceof DriveBagliDegilHatasi ? err.message : 'Yükleme hatası: ' + err.message)
    } finally {
      setYukleniyor(false)
      setIlerlemeMetni('')
    }
  }

  return (
    <form onSubmit={yukle} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
      <h2 className="font-semibold text-gray-700 mb-3">Yeni Kitap Yükle</h2>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Kitap Adı</label>
          <input
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            placeholder="örn. TYT Matematik Soru Bankası"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
        <div className="min-w-[180px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Ders (opsiyonel)</label>
          <input
            list="kitap-ders-listesi"
            value={dersAdi}
            onChange={(e) => setDersAdi(e.target.value)}
            placeholder="örn. Matematik (TYT)"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
          />
          <datalist id="kitap-ders-listesi">
            {KONU_DERSLERI.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">PDF Dosyası</label>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            onChange={(e) => dosyaSecildi(e.target.files?.[0] || null)}
            className="w-full text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={yukleniyor}
          className="bg-orange text-white font-semibold px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {yukleniyor ? 'Yükleniyor...' : 'Kitabı Yükle'}
        </button>
      </div>
      {ilerlemeMetni && <p className="text-xs text-blue mt-2">{ilerlemeMetni}</p>}
      {hata && <p className="text-xs text-red-600 mt-2">{hata}</p>}
    </form>
  )
}

// ============================================================================
// KİTAP DÜZENLE — bir kitabın sayfalarını gösterip soru kutularını
// oluşturma/düzenleme/etiketleme ekranı.
// ============================================================================
function KitapDuzenle({ kitap, onGeriDon, onKitapGuncellendi, onSeciliSorularlaTestOlustur }) {
  const [belge, setBelge] = useState(null)
  const [belgeYukleniyor, setBelgeYukleniyor] = useState(true)
  // "PDF indiriliyor..." yazısında yüzde göstermek için — kullanıcı isteğiyle
  // eklendi ("bu şekilde takıldı" — aslında takılı değil, sadece ilerleme
  // görünmediği için öyle sanılıyordu, bkz. kitapDrive.js'teki not).
  const [indirmeOrani, setIndirmeOrani] = useState(0)
  const [hata, setHata] = useState('')
  const [sayfaNo, setSayfaNo] = useState(1)
  const [sayfaGoruntusu, setSayfaGoruntusu] = useState(null)
  const sayfaGoruntusuRef = useRef(null)
  const [sorular, setSorular] = useState([])
  const [sorularYukleniyor, setSorularYukleniyor] = useState(true)
  const [seciliGeciciId, setSeciliGeciciId] = useState(null)
  const [cizimModu, setCizimModu] = useState(false)
  // "Seçili Kutuyu Yeniden Çiz" modu — kullanıcı isteğiyle eklendi ("otomatik
  // yap dediğimizde düzenle çıksa düzenlerken elle tekrar kutuyu çizsek"):
  // otomatik tespitin bazı sorularda üstü tam almayan/yanlış hizalı bir kutu
  // ürettiği durumlarda, o kutuyu SİLİP YENİDEN oluşturmak yerine, seçili
  // kutunun koordinatlarını doğrudan elle çizilen yeni bir dikdörtgenle
  // DEĞİŞTİRMEK için. Normal "Elle Kutu Çiz" (cizimModu) ile karıştırılmasın
  // diye ayrı bir state — ikisi birbirini dışlar (biri açılınca diğeri kapanır).
  const [yenidenCizimModu, setYenidenCizimModu] = useState(false)
  const [analizEdiliyor, setAnalizEdiliyor] = useState(false)
  const [analizIlerleme, setAnalizIlerleme] = useState(0)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [kaydedildiMesaji, setKaydedildiMesaji] = useState('')
  // Ders/Konu/Soru No etiketlemesi TAMAMEN OPSİYONEL — hoca hiç etiketlemeden
  // sadece kutucuklarla (checkbox) istediği kadar soruyu işaretleyip doğrudan
  // Test Oluştur'a aktarabilsin diye eklendi (kullanıcı isteği: "her birinde
  // konu seçmeyecek ... seçtiği 20 soru varsa bunu test olarak oluşturacak").
  // Bu seçim SAYFALAR ARASI kalıcıdır (gecici_id bazlı bir Set) — hoca birkaç
  // sayfa gezip her sayfadan birkaç soru işaretleyebilir.
  const [secilenIdler, setSecilenIdler] = useState(() => new Set())

  const toplamSayfa = belge?.numPages || kitap.sayfa_sayisi || 1

  // Kitabın PDF'ini indirip pdf.js belgesine çevir (bir kez). kitapPdfBlobuGetir
  // kitabın Drive'da mı Supabase Storage'da mı olduğuna göre otomatik dallanır
  // (bkz. src/lib/kitapDrive.js).
  useEffect(() => {
    let iptal = false
    setBelgeYukleniyor(true)
    setIndirmeOrani(0)
    kitapPdfBlobuGetir(kitap, (oran) => !iptal && setIndirmeOrani(oran))
      .then(async (data) => {
        const b = await pdfBelgesiAc(data)
        if (!iptal) setBelge(b)
      })
      .catch((e) => !iptal && setHata('PDF açılamadı: ' + e.message))
      .finally(() => !iptal && setBelgeYukleniyor(false))
    return () => {
      iptal = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitap.id])

  // Daha önce kaydedilmiş soru kutularını yükle.
  useEffect(() => {
    let iptal = false
    supabase
      .from('kitap_sorulari')
      .select('*')
      .eq('kitap_id', kitap.id)
      .then(({ data, error }) => {
        if (error) throw error
        if (!iptal) setSorular((data || []).map((s) => ({ ...s, gecici_id: s.id })))
      })
      .catch((e) => !iptal && setHata('Sorular yüklenemedi: ' + e.message))
      .finally(() => !iptal && setSorularYukleniyor(false))
    return () => {
      iptal = true
    }
  }, [kitap.id])

  // Geçerli sayfayı görüntüye çevir — BELLEK: aynı anda en fazla TEK sayfanın
  // canvas'ı bellekte tutulur (bkz. kitapcikOcr.js'teki aynı gerekçe: yüksek
  // scale'de her sayfa onlarca MB tutabiliyor, iPad/iPhone Safari'de sekme
  // çökmesin diye bir önceki sayfa hemen serbest bırakılıyor).
  useEffect(() => {
    if (!belge) return
    let iptal = false
    sayfayiGoruntuyeCevir(belge, sayfaNo, Number(kitap.olcek) || 3).then((g) => {
      if (iptal) return
      const onceki = sayfaGoruntusuRef.current
      setSayfaGoruntusu(g)
      sayfaGoruntusuRef.current = g
      if (onceki?.canvas) {
        onceki.canvas.width = 0
        onceki.canvas.height = 0
      }
    })
    return () => {
      iptal = true
    }
  }, [belge, sayfaNo, kitap.olcek])

  const sorularBuSayfada = useMemo(
    () =>
      sorular
        .filter((s) => s.sayfa_no === sayfaNo)
        .slice()
        .sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y)),
    [sorular, sayfaNo]
  )
  const seciliSoru = sorular.find((s) => s.gecici_id === seciliGeciciId) || null

  function soruGuncelle(gecici_id, alanlar) {
    setSorular((liste) => liste.map((s) => (s.gecici_id === gecici_id ? { ...s, ...alanlar } : s)))
  }
  function soruSil(gecici_id) {
    setSorular((liste) => liste.filter((s) => s.gecici_id !== gecici_id))
    if (seciliGeciciId === gecici_id) setSeciliGeciciId(null)
    setSecilenIdler((s) => {
      if (!s.has(gecici_id)) return s
      const yeni = new Set(s)
      yeni.delete(gecici_id)
      return yeni
    })
  }
  function secimDegistir(gecici_id) {
    setSecilenIdler((s) => {
      const yeni = new Set(s)
      if (yeni.has(gecici_id)) yeni.delete(gecici_id)
      else yeni.add(gecici_id)
      return yeni
    })
  }
  function sayfadakileriHepsiniSec() {
    setSecilenIdler((s) => {
      const yeni = new Set(s)
      sorularBuSayfada.forEach((q) => yeni.add(q.gecici_id))
      return yeni
    })
  }
  function cizimBitti(kutu) {
    // Yeniden çizim modundaysa VE hâlâ geçerli bir seçili soru varsa: yeni
    // bağımsız bir soru EKLEMEK yerine, seçili sorunun koordinatlarını yeni
    // çizilen dikdörtgenle DEĞİŞTİR (etiketi/ders/konu/soru_no aynen kalır —
    // sadece kutunun konumu düzeltiliyor).
    if (yenidenCizimModu && seciliGeciciId) {
      soruGuncelle(seciliGeciciId, { x: kutu.x, y: kutu.y, genislik: kutu.genislik, yukseklik: kutu.yukseklik })
      setYenidenCizimModu(false)
      return
    }
    const yeni = {
      gecici_id: crypto.randomUUID(),
      kitap_id: kitap.id,
      sayfa_no: sayfaNo,
      x: kutu.x,
      y: kutu.y,
      genislik: kutu.genislik,
      yukseklik: kutu.yukseklik,
      ders_adi: '',
      konu: '',
      soru_no: null,
      cevap: null,
    }
    setSorular((liste) => [...liste, yeni])
    setSeciliGeciciId(yeni.gecici_id)
    // Elle çizilen soru da (otomatik tespit gibi) varsayılan olarak seçili sayılır.
    setSecilenIdler((s) => new Set(s).add(yeni.gecici_id))
  }

  async function sayfaAnaliziYap() {
    if (!sayfaGoruntusu || !belge) return
    setAnalizEdiliyor(true)
    setAnalizIlerleme(0)
    setHata('')
    let worker = null
    try {
      // ÖNCE PDF'in gerçek metin katmanından tespit deniyoruz — kitap
      // TARANMIŞ/fotoğraflanmış değil, dijital (seçilebilir metinli) bir
      // PDF ise bu, OCR'a hiç gerek kalmadan anlık ve neredeyse %100 doğru
      // sonuç verir (canlıda "ENS Türkçe Soru Bankası" ile doğrulandı —
      // OCR'ın 6 sorudan sadece 1'ini bulabildiği bir sayfada bu yöntem
      // 6'sını da doğru buldu). Metin katmanı yoksa (gerçek tarama), bu
      // yöntem hiçbir aday bulamaz ve aşağıda OCR'a düşülür.
      const metinAdaylari = await kitapMetinKatmanindanSoruNumaralariniTespitEt(
        belge,
        sayfaNo,
        Number(kitap.olcek) || 3,
        sayfaGoruntusu.genislik,
        sayfaGoruntusu.yukseklik
      )
      setAnalizIlerleme(1)

      let kutular = []
      if (metinAdaylari.length > 0) {
        // Metin katmanı verisi zaten çok temiz/kesin olduğu için (yanlış
        // pozitifler bant/girinti filtreleriyle elendi), OCR'a özgü
        // "ardışık dizi" güvenlik filtresi burada UYGULANMIYOR — aksi halde
        // bir sayfada 1-2 soru gibi kısa (3'ten az) bir dizi varsa (ör. bir
        // ünitenin son sayfası) bu geçerli sorular yanlışlıkla elenebilirdi.
        const girintisizler = girintiliAdaylariEle(metinAdaylari, sayfaGoruntusu.genislik)
        const sutunlu = sutunSiralaTahmini(girintisizler, sayfaGoruntusu.genislik)
        kutular = baslangicKutulariUret(sutunlu, sayfaGoruntusu.genislik, sayfaGoruntusu.yukseklik)
      } else {
        // YEDEK: metin katmanı yok (taranmış/fotoğraflanmış kitap) — OCR ile dene.
        worker = await kitapSoruNumarasiWorkerOlustur()
        const adaylarHam = await kitapSayfasindaSoruNumaralariniTespitEt(
          worker,
          sayfaGoruntusu.canvas,
          sayfaGoruntusu.genislik,
          sayfaGoruntusu.yukseklik,
          (oran) => setAnalizIlerleme(oran)
        )
        const girintisizler = girintiliAdaylariEle(adaylarHam, sayfaGoruntusu.genislik)
        const sutunlu = sutunSiralaTahmini(girintisizler, sayfaGoruntusu.genislik)
        const filtreli = ardisikDiziyeGoreFiltrele(sutunlu)
        const kullanilacaklar = filtreli.length > 0 ? filtreli : sutunlu
        kutular = baslangicKutulariUret(kullanilacaklar, sayfaGoruntusu.genislik, sayfaGoruntusu.yukseklik)
      }

      if (kutular.length === 0) {
        setHata('Bu sayfada otomatik olarak soru bulunamadı — "Elle Kutu Çiz" ile kendiniz işaretleyebilirsiniz.')
      }
      const yeniler = kutular.map((k) => ({
        gecici_id: crypto.randomUUID(),
        kitap_id: kitap.id,
        sayfa_no: sayfaNo,
        x: k.x,
        y: k.y,
        genislik: k.genislik,
        yukseklik: k.yukseklik,
        ders_adi: '',
        konu: '',
        soru_no: null,
        cevap: null,
      }))
      // Mevcut kutulara EKLENİR, üzerine yazılmaz — admin daha önce elle
      // düzelttiği/etiketlediği bir kutuyu kaybetmesin diye.
      setSorular((liste) => [...liste, ...yeniler])
      // Kullanıcı isteği: "otomatik seçti ya orada tümü işaretli olsun ama
      // üstünde bu soruyu çıkar gibi bir şey çıksın" — otomatik tespit
      // edilen TÜM sorular varsayılan olarak test için SEÇİLİ sayılır;
      // hoca istemediğini tek tıkla (kutunun üzerindeki ✕ ya da soldaki
      // kutucuk ile) çıkarır, tek tek işaretlemek zorunda kalmaz.
      setSecilenIdler((s) => {
        const yeni = new Set(s)
        yeniler.forEach((y) => yeni.add(y.gecici_id))
        return yeni
      })
    } catch (e) {
      setHata('Otomatik tespit hatası: ' + e.message)
    } finally {
      if (worker) await kitapSoruNumarasiWorkerKapat(worker)
      setAnalizEdiliyor(false)
    }
  }

  async function kaydet() {
    setKaydediliyor(true)
    setKaydedildiMesaji('')
    setHata('')
    try {
      const { error: silmeHatasi } = await supabase.from('kitap_sorulari').delete().eq('kitap_id', kitap.id)
      if (silmeHatasi) throw silmeHatasi
      if (sorular.length > 0) {
        const satirlar = sorular.map((s) => ({
          id: s.gecici_id,
          kitap_id: kitap.id,
          ders_adi: s.ders_adi || null,
          konu: s.konu || null,
          soru_no: s.soru_no || null,
          cevap: s.cevap || null,
          sayfa_no: s.sayfa_no,
          x: s.x,
          y: s.y,
          genislik: s.genislik,
          yukseklik: s.yukseklik,
        }))
        const { error: eklemeHatasi } = await supabase.from('kitap_sorulari').insert(satirlar)
        if (eklemeHatasi) throw eklemeHatasi
      }
      setKaydedildiMesaji(`Kaydedildi — toplam ${sorular.length} soru.`)
      onKitapGuncellendi?.()
      return true
    } catch (e) {
      setHata('Kaydetme hatası: ' + e.message)
      return false
    } finally {
      setKaydediliyor(false)
    }
  }

  // Seçilen (checkbox'lı) soruları, hiç Ders/Konu etiketlemeye ZORLAMADAN
  // doğrudan Test Oluştur sekmesine aktarır. Önce mevcut tüm değişiklikleri
  // (yeni tespit edilen/çizilen kutular, varsa yapılan etiketler) kaydediyoruz
  // — aksi halde sekme değişince kaydedilmemiş işaretlemeler kaybolurdu.
  async function secilenlerleTestOlustur() {
    if (secilenIdler.size === 0 || !onSeciliSorularlaTestOlustur) return
    const basarili = await kaydet()
    if (!basarili) return // kaydet() hata mesajını zaten gösterdi, sekme değiştirmiyoruz
    const secilenSorular = sorular
      .filter((s) => secilenIdler.has(s.gecici_id))
      .map((s) => ({ ...s, id: s.gecici_id, kitaplar: kitap }))
    onSeciliSorularlaTestOlustur(secilenSorular)
  }

  const etiketliSayisi = sorular.filter((s) => s.ders_adi).length

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <button type="button" onClick={onGeriDon} className="text-sm text-gray-500 hover:text-gray-700 hover:underline">
          ← Kitaplarıma Dön
        </button>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className="text-xs text-gray-400">
            {sorular.length} soru işaretlendi ({etiketliSayisi} etiketli)
          </span>
          {secilenIdler.size > 0 && (
            <>
              <span className="text-xs font-semibold text-orange">{secilenIdler.size} soru seçili</span>
              <button
                type="button"
                onClick={secilenlerleTestOlustur}
                disabled={kaydediliyor}
                className="bg-orange text-white font-semibold px-3 py-2 rounded-lg text-xs hover:opacity-90 disabled:opacity-40"
              >
                {kaydediliyor ? 'Kaydediliyor...' : 'Seçilenlerle Test Oluştur →'}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={kaydet}
            disabled={kaydediliyor || sorularYukleniyor}
            className="bg-navy text-white font-semibold px-4 py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-40"
          >
            {kaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>

      <h1 className="text-xl font-bold text-navy mb-1">{kitap.ad}</h1>
      {kitap.ders_adi && <p className="text-sm text-gray-400 mb-4">{kitap.ders_adi}</p>}

      {hata && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{hata}</p>}
      {kaydedildiMesaji && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">✓ {kaydedildiMesaji}</p>
      )}

      {belgeYukleniyor ? (
        <p className="text-gray-400">
          PDF indiriliyor{indirmeOrani > 0 ? `... %${Math.round(indirmeOrani * 100)}` : '...'}
        </p>
      ) : !sayfaGoruntusu ? (
        <p className="text-gray-400">Sayfa hazırlanıyor...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSayfaNo((n) => Math.max(1, n - 1))}
                  disabled={sayfaNo <= 1}
                  className="px-2 py-1 rounded-lg border border-gray-200 text-sm disabled:opacity-30"
                >
                  ← Önceki
                </button>
                <span className="text-sm text-gray-600">
                  Sayfa {sayfaNo} / {toplamSayfa}
                </span>
                <button
                  type="button"
                  onClick={() => setSayfaNo((n) => Math.min(toplamSayfa, n + 1))}
                  disabled={sayfaNo >= toplamSayfa}
                  className="px-2 py-1 rounded-lg border border-gray-200 text-sm disabled:opacity-30"
                >
                  Sonraki →
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={sayfaAnaliziYap}
                  disabled={analizEdiliyor}
                  className="text-xs font-semibold bg-blue text-white px-3 py-1.5 rounded-full hover:opacity-90 disabled:opacity-40"
                >
                  {analizEdiliyor ? `Taranıyor... %${Math.round(analizIlerleme * 100)}` : 'Bu Sayfada Soruları Otomatik Tespit Et'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCizimModu((v) => !v)
                    setYenidenCizimModu(false) // iki mod birbirini dışlar
                  }}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                    cizimModu ? 'bg-orange text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {cizimModu ? 'Çizmeyi Bitir' : 'Elle Kutu Çiz'}
                </button>
                {yenidenCizimModu && (
                  <button
                    type="button"
                    onClick={() => setYenidenCizimModu(false)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full bg-orange text-white"
                  >
                    Yeniden Çizmeyi İptal Et
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-auto flex justify-center bg-gray-50 rounded-lg p-2">
              <KutuKatmani
                sayfaGoruntusu={sayfaGoruntusu}
                sorularBuSayfada={sorularBuSayfada}
                seciliGeciciId={seciliGeciciId}
                cizimModu={cizimModu || yenidenCizimModu}
                cizimMesaji={
                  yenidenCizimModu
                    ? 'Seçili kutunun yeni konumunu köşeden köşeye sürükleyerek çizin'
                    : undefined
                }
                secilenIdler={secilenIdler}
                onKutuTiklandi={setSeciliGeciciId}
                onCizimBitti={cizimBitti}
                onSecimCikar={secimDegistir}
                onCevapDegistir={(gecici_id, yeniCevap) => soruGuncelle(gecici_id, { cevap: yeniCevap })}
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 h-fit">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-gray-700">Bu Sayfadaki Sorular ({sorularBuSayfada.length})</h3>
              {sorularBuSayfada.length > 0 && (
                <button type="button" onClick={sayfadakileriHepsiniSec} className="text-[11px] font-semibold text-blue hover:underline shrink-0">
                  Tümünü Seç
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mb-3">
              Ders/Konu hiçbiri ZORUNLU DEĞİL — bu ekranda sadece istediğiniz soruları kutucukla işaretleyip
              (isterseniz her birine "Doğru Cevap" da girip) üstteki "Seçilenlerle Test Oluştur" ile devam edin.
              Soru numaraları OTOMATİK verilir; testin adını, dersini ve soruların SIRASINI bir sonraki ekranda
              belirleyeceksiniz.
            </p>
            {sorularBuSayfada.length === 0 && (
              <p className="text-xs text-gray-400 mb-3">
                Henüz kutu yok — üstteki "Otomatik Tespit Et" ya da "Elle Kutu Çiz" ile ekleyin.
              </p>
            )}
            <div className="space-y-1 mb-4 max-h-40 overflow-y-auto">
              {sorularBuSayfada.map((s) => (
                <div key={s.gecici_id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={secilenIdler.has(s.gecici_id)}
                    onChange={() => secimDegistir(s.gecici_id)}
                    className="shrink-0 cursor-pointer"
                    title="Test oluşturmak için seç"
                  />
                  <button
                    type="button"
                    onClick={() => setSeciliGeciciId(s.gecici_id)}
                    className={`flex-1 min-w-0 text-left px-2 py-1.5 rounded-lg text-xs truncate ${
                      s.gecici_id === seciliGeciciId ? 'bg-orange/10 text-orange font-semibold' : 'hover:bg-gray-50 text-gray-600'
                    }`}
                  >
                    {s.ders_adi || 'Soru'}
                    {s.konu ? ` · ${s.konu}` : ''}
                  </button>
                </div>
              ))}
            </div>

            {seciliSoru ? (
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Ders (opsiyonel)</label>
                  <input
                    list="kitap-ders-listesi"
                    value={seciliSoru.ders_adi || ''}
                    onChange={(e) => soruGuncelle(seciliSoru.gecici_id, { ders_adi: e.target.value })}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                  />
                  <datalist id="kitap-ders-listesi">
                    {KONU_DERSLERI.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Konu (opsiyonel)</label>
                  <input
                    value={seciliSoru.konu || ''}
                    onChange={(e) => soruGuncelle(seciliSoru.gecici_id, { konu: e.target.value })}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Doğru Cevap (opsiyonel)</label>
                  <div className="flex gap-1">
                    {['A', 'B', 'C', 'D', 'E'].map((harf) => (
                      <button
                        key={harf}
                        type="button"
                        onClick={() =>
                          soruGuncelle(seciliSoru.gecici_id, { cevap: seciliSoru.cevap === harf ? null : harf })
                        }
                        className={`flex-1 text-xs font-semibold rounded-lg py-1.5 border ${
                          seciliSoru.cevap === harf
                            ? 'bg-navy text-white border-navy'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {harf}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Girilirse soru üzerinde DEĞİL, testin sonundaki "Cevap Anahtarı" sayfasında görünür.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCizimModu(false) // iki mod birbirini dışlar
                    setYenidenCizimModu((v) => !v)
                  }}
                  className={`text-xs font-semibold rounded-lg px-3 py-1.5 w-full ${
                    yenidenCizimModu ? 'bg-orange text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {yenidenCizimModu ? 'Çiziyorsunuz — köşeden köşeye sürükleyin' : 'Seçili Kutuyu Yeniden Çiz'}
                </button>
                <button
                  type="button"
                  onClick={() => soruSil(seciliSoru.gecici_id)}
                  className="text-xs font-semibold text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 w-full"
                >
                  Bu Soruyu Sil
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
                Etiketlemek için soldaki sayfada ya da yukarıdaki listeden bir kutu seçin.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// ÖDEV HEDEF SEÇİCİ — Odev.jsx'teki OdevVerForm'un hedef-seçim kısmının
// sadeleştirilmiş hâli (o dosyaya dokunmadan, burada ayrı/küçük bir kopya).
// ============================================================================
function OdevHedefSecici({ ogrenciler, siniflarListesi, sinifOgrenciMap, gonderiliyor, onGonder }) {
  const [hedefTuru, setHedefTuru] = useState('tek')
  const [seciliOgrenci, setSeciliOgrenci] = useState('')
  const [seciliOgrenciler, setSeciliOgrenciler] = useState([])
  const [arama, setArama] = useState('')
  const [baslik, setBaslik] = useState('')
  const [ders, setDers] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [sonTarih, setSonTarih] = useState('')

  const filtreliOgrenciler = useMemo(() => {
    const a = arama.trim().toLocaleLowerCase('tr-TR')
    if (!a) return ogrenciler
    return ogrenciler.filter((o) => (o.ad_soyad || '').toLocaleLowerCase('tr-TR').includes(a))
  }, [ogrenciler, arama])

  function ogrenciSecimiDegistir(id) {
    setSeciliOgrenciler((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }
  function sinifSec(sinifId) {
    if (!sinifId) return
    const idler = sinifOgrenciMap[sinifId] || []
    setSeciliOgrenciler((s) => Array.from(new Set([...s, ...idler])))
  }

  function gonder() {
    const hedefIdler = hedefTuru === 'tek' ? (seciliOgrenci ? [seciliOgrenci] : []) : seciliOgrenciler
    if (hedefIdler.length === 0) return
    if (!baslik.trim()) return
    onGonder({ hedefIdler, baslik: baslik.trim(), ders: ders.trim(), aciklama: aciklama.trim(), sonTarih })
  }

  const hedefIdler = hedefTuru === 'tek' ? (seciliOgrenci ? [seciliOgrenci] : []) : seciliOgrenciler
  const gonderilebilir = hedefIdler.length > 0 && baslik.trim().length > 0 && !gonderiliyor

  return (
    <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mt-3">
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setHedefTuru('tek')}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full ${hedefTuru === 'tek' ? 'bg-navy text-white' : 'border border-gray-200 text-gray-600'}`}
        >
          Tek Öğrenci
        </button>
        <button
          type="button"
          onClick={() => setHedefTuru('toplu')}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full ${hedefTuru === 'toplu' ? 'bg-navy text-white' : 'border border-gray-200 text-gray-600'}`}
        >
          Birden Fazla / Sınıf
        </button>
      </div>

      {hedefTuru === 'tek' ? (
        <select
          value={seciliOgrenci}
          onChange={(e) => setSeciliOgrenci(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white mb-3"
        >
          <option value="">Öğrenci seçin...</option>
          {ogrenciler.map((o) => (
            <option key={o.id} value={o.id}>
              {o.ad_soyad}
            </option>
          ))}
        </select>
      ) : (
        <div className="mb-3">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {siniflarListesi.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => sinifSec(s.id)}
                className="text-xs font-semibold border border-gray-200 bg-white px-2.5 py-1 rounded-full hover:bg-gray-100"
              >
                + {s.ad}
              </button>
            ))}
          </div>
          <input
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="Öğrenci ara..."
            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm mb-2"
          />
          <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg bg-white divide-y divide-gray-50">
            {filtreliOgrenciler.map((o) => (
              <label key={o.id} className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={seciliOgrenciler.includes(o.id)} onChange={() => ogrenciSecimiDegistir(o.id)} />
                {o.ad_soyad}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">{seciliOgrenciler.length} öğrenci seçildi</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
        <input
          value={baslik}
          onChange={(e) => setBaslik(e.target.value)}
          placeholder="Ödev başlığı"
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
        <input
          value={ders}
          onChange={(e) => setDers(e.target.value)}
          placeholder="Ders (opsiyonel)"
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
      </div>
      <textarea
        value={aciklama}
        onChange={(e) => setAciklama(e.target.value)}
        placeholder="Açıklama (opsiyonel)"
        rows={2}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-2"
      />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <input
          type="date"
          value={sonTarih}
          onChange={(e) => setSonTarih(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
        <button
          type="button"
          onClick={gonder}
          disabled={!gonderilebilir}
          className="bg-orange text-white font-semibold px-4 py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-40"
        >
          {gonderiliyor ? 'Gönderiliyor...' : 'Ödev Olarak Gönder'}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// TEST OLUŞTUR SEKMESİ
// ============================================================================
function TestOlusturSekmesi({ initialSeciliSorular, onInitialSeciliSorularTuketildi }) {
  const { profile } = useAuth()
  const [tumSorular, setTumSorular] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kitapFiltre, setKitapFiltre] = useState('')
  const [dersFiltre, setDersFiltre] = useState('')
  const [arama, setArama] = useState('')
  const [seciliSorular, setSeciliSorular] = useState([])
  const [testBasligi, setTestBasligi] = useState('')
  const [aktarilanMesaji, setAktarilanMesaji] = useState('')

  // KitapDuzenle ekranından "Seçilenlerle Test Oluştur" ile gelen sorular —
  // hoca hiç ders/konu etiketlemeden, sadece kutucukla işaretleyip buraya
  // doğrudan aktarabiliyor (bkz. KitapYukle'deki kitapDenTesteAktar).
  useEffect(() => {
    if (initialSeciliSorular && initialSeciliSorular.length > 0) {
      setSeciliSorular(initialSeciliSorular)
      setAktarilanMesaji(
        `Kitap düzenleme ekranından ${initialSeciliSorular.length} soru aktarıldı — dilerseniz aşağıdan ekleyip çıkarabilir, bir test başlığı girip oluşturabilirsiniz.`
      )
      onInitialSeciliSorularTuketildi?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSeciliSorular])

  const [uretimDurumu, setUretimDurumu] = useState('bos') // bos | uretiliyor | hazir | hata
  const [ilerleme, setIlerleme] = useState(0)
  const [pdfBlob, setPdfBlob] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [hata, setHata] = useState('')

  const [gonderPaneliAcik, setGonderPaneliAcik] = useState(false)
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [gonderSonucu, setGonderSonucu] = useState('')
  const [ogrenciler, setOgrenciler] = useState([])
  const [siniflarListesi, setSiniflarListesi] = useState([])
  const [sinifOgrenciMap, setSinifOgrenciMap] = useState({})

  useEffect(() => {
    supabase
      .from('kitap_sorulari')
      .select('*, kitaplar(id, ad, ders_adi, pdf_yolu, drive_dosya_id, olcek)')
      .then(({ data, error }) => {
        if (error) throw error
        setTumSorular(data || [])
      })
      .catch((e) => setHata('Sorular yüklenemedi: ' + e.message))
      .finally(() => setYukleniyor(false))

    supabase.from('ogrenciler').select('id, ad_soyad').order('ad_soyad').then(({ data }) => setOgrenciler(data || []))
    supabase
      .from('siniflar')
      .select('id, ad')
      .eq('egitim_yili', AKTIF_EGITIM_YILI)
      .order('ad')
      .then(async ({ data }) => {
        const liste = data || []
        setSiniflarListesi(liste)
        const idler = liste.map((s) => s.id)
        if (idler.length === 0) return
        const { data: kayitlar } = await supabase.from('sinif_ogrenciler').select('sinif_id, ogrenci_id').in('sinif_id', idler)
        const harita = {}
        ;(kayitlar || []).forEach((k) => {
          if (!harita[k.sinif_id]) harita[k.sinif_id] = []
          harita[k.sinif_id].push(k.ogrenci_id)
        })
        setSinifOgrenciMap(harita)
      })
  }, [])

  const kitapListesi = useMemo(() => {
    const map = new Map()
    tumSorular.forEach((s) => s.kitaplar && map.set(s.kitaplar.id, s.kitaplar))
    return Array.from(map.values())
  }, [tumSorular])

  const dersListesi = useMemo(() => {
    return Array.from(new Set(tumSorular.map((s) => s.ders_adi).filter(Boolean))).sort()
  }, [tumSorular])

  const filtrelenmisSorular = useMemo(() => {
    const a = arama.trim().toLocaleLowerCase('tr-TR')
    return tumSorular.filter((s) => {
      if (kitapFiltre && s.kitaplar?.id !== kitapFiltre) return false
      if (dersFiltre && s.ders_adi !== dersFiltre) return false
      if (a && !`${s.ders_adi || ''} ${s.konu || ''} ${s.kitaplar?.ad || ''}`.toLocaleLowerCase('tr-TR').includes(a)) return false
      return true
    })
  }, [tumSorular, kitapFiltre, dersFiltre, arama])

  function seciliMi(id) {
    return seciliSorular.some((s) => s.id === id)
  }
  function seciminiDegistir(soru) {
    setSeciliSorular((liste) => (liste.some((s) => s.id === soru.id) ? liste.filter((s) => s.id !== soru.id) : [...liste, soru]))
  }
  function siradanCikar(id) {
    setSeciliSorular((liste) => liste.filter((s) => s.id !== id))
  }
  // Kullanıcı isteği: soru numaraları OTOMATİK verilsin ama kullanıcı
  // soruların YERLERİNİ (dolayısıyla numaralarını) değiştirebilsin — bu
  // yüzden elle "Soru No" girme alanı kaldırıldı, onun yerine burada basit
  // yukarı/aşağı taşıma eklendi. PDF'teki sıra No'su hep bu listedeki SIRAYA
  // göre belirlenir (bkz. pdfUret -> kitapPdf.js).
  function siraDegistir(index, yon) {
    setSeciliSorular((liste) => {
      const hedef = index + yon
      if (hedef < 0 || hedef >= liste.length) return liste
      const yeni = [...liste]
      ;[yeni[index], yeni[hedef]] = [yeni[hedef], yeni[index]]
      return yeni
    })
  }

  async function pdfUret() {
    if (seciliSorular.length === 0) return
    setUretimDurumu('uretiliyor')
    setIlerleme(0)
    setHata('')
    setGonderSonucu('')
    try {
      const girdi = seciliSorular.map((s) => ({
        kitap: s.kitaplar,
        sayfa_no: s.sayfa_no,
        x: s.x,
        y: s.y,
        genislik: s.genislik,
        yukseklik: s.yukseklik,
        ders_adi: s.ders_adi,
        konu: s.konu,
        // soru_no KASITLI OLARAK gönderilmiyor: numaralandırma artık her zaman
        // "Seçilen Sorular" listesindeki SIRAYA göre otomatik veriliyor (bkz.
        // kitapPdf.js -> siraNo = i + 1). Kullanıcı sırayı ▲▼ ile değiştirince
        // numaralar da otomatik güncellenir — eskiden var olan "Soru No" elle
        // giriş alanı kafa karıştırdığı için kaldırıldı.
        cevap: s.cevap,
      }))
      const blob = await testPdfOlustur(girdi, (oran) => setIlerleme(oran), testBasligi)
      setPdfBlob(blob)
      setPdfUrl((eski) => {
        if (eski) URL.revokeObjectURL(eski)
        return URL.createObjectURL(blob)
      })
      setUretimDurumu('hazir')
    } catch (e) {
      setHata('Test PDF\'i oluşturulamadı: ' + e.message)
      setUretimDurumu('hata')
    }
  }

  async function odevOlarakGonder({ hedefIdler, baslik, ders, aciklama, sonTarih }) {
    if (!pdfBlob) return
    setGonderiliyor(true)
    setHata('')
    try {
      const guvenliAd = (baslik || 'test').replace(/[^a-zA-Z0-9-_ğüşıöçĞÜŞİÖÇ]+/g, '-')
      const dosyaYolu = `${Date.now()}-${Math.random().toString(36).slice(2)}-${guvenliAd}.pdf`
      const { error: yuklemeHatasi } = await supabase.storage
        .from('odev-ekleri')
        .upload(dosyaYolu, pdfBlob, { contentType: 'application/pdf' })
      if (yuklemeHatasi) throw yuklemeHatasi

      const atamaGrubuId = hedefIdler.length > 1 ? crypto.randomUUID() : null
      const satirlar = hedefIdler.map((ogrenciId) => ({
        ogrenci_id: ogrenciId,
        ogretmen_profile_id: profile.id,
        ders: ders || null,
        baslik,
        aciklama: aciklama || null,
        son_tarih: sonTarih || null,
        dosya_yolu: dosyaYolu,
        atama_grubu_id: atamaGrubuId,
      }))
      const { error } = await supabase.from('odevler').insert(satirlar)
      if (error) throw error
      setGonderSonucu(`✓ ${hedefIdler.length} öğrenciye ödev olarak gönderildi.`)
      setGonderPaneliAcik(false)
    } catch (e) {
      setHata('Gönderilemedi: ' + e.message)
    } finally {
      setGonderiliyor(false)
    }
  }

  if (yukleniyor) return <p className="text-gray-400">Yükleniyor...</p>

  return (
    <div>
      {tumSorular.length === 0 ? (
        <p className="text-sm text-gray-400">
          Henüz hiçbir kitaptan soru işaretlenmedi — önce "Kitaplarım" sekmesinden bir kitap yükleyip soru kesin.
        </p>
      ) : (
        <>
          {aktarilanMesaji && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">
              ✓ {aktarilanMesaji}
            </p>
          )}
          {/* Adım 1 ve 2: önce (istenirse) ders seçilir, sonra teste bir başlık
              verilir — soru seçimi bundan SONRA yapılır (kullanıcı isteğiyle
              sıralama netleştirildi: eskiden ders filtresi soru listesinin
              yanındaki sıradan bir filtreydi, test başlığı da en sonda kalıyordu). */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">1) Ders (opsiyonel)</label>
                <select
                  value={dersFiltre}
                  onChange={(e) => setDersFiltre(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                >
                  <option value="">Tüm Dersler</option>
                  {dersListesi.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">2) Test Başlığı</label>
                <input
                  value={testBasligi}
                  onChange={(e) => setTestBasligi(e.target.value)}
                  placeholder="örn. Geometri Tekrar Testi"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h3 className="font-semibold text-gray-700 mb-1">3) İstediğiniz Kadar Soru Seçin</h3>
              <p className="text-xs text-gray-400 mb-3">
                Yukarıda ders seçtiyseniz liste otomatik daraldı — isterseniz kitaba göre de daraltabilir ya da konuya göre
                arayabilirsiniz.
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                <select value={kitapFiltre} onChange={(e) => setKitapFiltre(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
                  <option value="">Tüm Kitaplar</option>
                  {kitapListesi.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.ad}
                    </option>
                  ))}
                </select>
                <input
                  value={arama}
                  onChange={(e) => setArama(e.target.value)}
                  placeholder="Konu ara..."
                  className="flex-1 min-w-[140px] px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
                {filtrelenmisSorular.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 py-2 text-sm cursor-pointer hover:bg-gray-50 px-1 rounded">
                    <input type="checkbox" checked={seciliMi(s.id)} onChange={() => seciminiDegistir(s)} />
                    <span className="flex-1">
                      <span className="font-medium text-gray-700">{s.ders_adi || 'Soru'}</span>
                      {s.konu && <span className="text-gray-400"> · {s.konu}</span>}
                      <span className="text-gray-400"> · {s.kitaplar?.ad}</span>
                      <span className="text-gray-300"> · s.{s.sayfa_no}</span>
                    </span>
                  </label>
                ))}
                {filtrelenmisSorular.length === 0 && <p className="text-xs text-gray-400 py-4">Filtreye uyan soru yok.</p>}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 h-fit">
              <h3 className="font-semibold text-gray-700 mb-1">Seçilen Sorular ({seciliSorular.length})</h3>
              {seciliSorular.length > 1 && (
                <p className="text-[11px] text-gray-400 mb-2">
                  Soru numaraları buradaki SIRAYA göre otomatik verilir — ▲▼ ile sırayı değiştirebilirsiniz.
                </p>
              )}
              <div className="space-y-1 max-h-48 overflow-y-auto mb-3">
                {seciliSorular.map((s, i) => (
                  <div key={s.id} className="flex items-center justify-between gap-1 text-xs bg-gray-50 rounded-lg px-2 py-1.5">
                    <span className="truncate flex-1">
                      {i + 1}. {s.ders_adi || 'Soru'} {s.konu ? `· ${s.konu}` : ''}
                    </span>
                    <div className="flex items-center shrink-0">
                      <button
                        type="button"
                        onClick={() => siraDegistir(i, -1)}
                        disabled={i === 0}
                        title="Yukarı taşı"
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed px-1 py-0.5"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => siraDegistir(i, 1)}
                        disabled={i === seciliSorular.length - 1}
                        title="Aşağı taşı"
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed px-1 py-0.5"
                      >
                        ▼
                      </button>
                      <button type="button" onClick={() => siradanCikar(s.id)} className="text-red-500 hover:text-red-700 px-1 py-0.5" title="Listeden çıkar">
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                {seciliSorular.length === 0 && <p className="text-xs text-gray-400">Soldan soru seçin.</p>}
              </div>

              <button
                type="button"
                onClick={pdfUret}
                disabled={seciliSorular.length === 0 || uretimDurumu === 'uretiliyor'}
                className="w-full bg-navy text-white font-semibold px-4 py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-40 mb-2"
              >
                {uretimDurumu === 'uretiliyor' ? `Oluşturuluyor... %${Math.round(ilerleme * 100)}` : '4) Testi Oluştur'}
              </button>

              {hata && <p className="text-xs text-red-600 mb-2">{hata}</p>}
              {gonderSonucu && <p className="text-xs text-green-700 mb-2">{gonderSonucu}</p>}

              {uretimDurumu === 'hazir' && pdfUrl && (
                <div className="border-t border-gray-100 pt-3">
                  <a
                    href={pdfUrl}
                    download={`${testBasligi || 'test'}.pdf`}
                    className="block text-center text-sm font-semibold border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 mb-2"
                  >
                    PDF'i İndir
                  </a>
                  <button
                    type="button"
                    onClick={() => setGonderPaneliAcik((v) => !v)}
                    className="w-full bg-orange text-white font-semibold px-4 py-2 rounded-lg text-sm hover:opacity-90"
                  >
                    Öğrenciye Ödev Olarak Gönder
                  </button>
                  {gonderPaneliAcik && (
                    <OdevHedefSecici
                      ogrenciler={ogrenciler}
                      siniflarListesi={siniflarListesi}
                      sinifOgrenciMap={sinifOgrenciMap}
                      gonderiliyor={gonderiliyor}
                      onGonder={odevOlarakGonder}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================================
// ANA SAYFA
// ============================================================================
export default function KitapYukle() {
  const [sekme, setSekme] = useState('kitaplarim') // 'kitaplarim' | 'test-olustur'
  const [kitaplar, setKitaplar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [seciliKitap, setSeciliKitap] = useState(null)
  const [hata, setHata] = useState('')
  // KitapDuzenle'de "Seçilenlerle Test Oluştur" ile aktarılan sorular — Test
  // Oluştur sekmesi açılınca bir kerelik ön-seçim olarak kullanılır, sonra
  // sıfırlanır (bkz. TestOlusturSekmesi'ndeki initialSeciliSorular efekti).
  const [testIcinOnSecili, setTestIcinOnSecili] = useState(null)

  function kitapDenTesteAktar(sorularListesi) {
    setTestIcinOnSecili(sorularListesi)
    setSeciliKitap(null)
    setSekme('test-olustur')
    kitaplariYenile()
  }

  function kitaplariYenile() {
    setYukleniyor(true)
    supabase
      .from('kitaplar')
      .select('*, kitap_sorulari(count)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) throw error
        setKitaplar(data || [])
      })
      .catch((e) => setHata('Kitaplar yüklenemedi: ' + e.message))
      .finally(() => setYukleniyor(false))
  }

  useEffect(() => {
    kitaplariYenile()
  }, [])

  async function kitabiSil(kitap) {
    if (!confirm(`"${kitap.ad}" kitabını ve içindeki tüm işaretli soruları kalıcı olarak silmek istediğinize emin misiniz?`)) return
    try {
      if (kitap.drive_dosya_id) {
        await driveDenKitapSil(kitap.drive_dosya_id)
      } else {
        await supabase.storage.from('kitaplar').remove([kitap.pdf_yolu])
      }
      const { error } = await supabase.from('kitaplar').delete().eq('id', kitap.id)
      if (error) throw error
      kitaplariYenile()
    } catch (e) {
      setHata('Silinemedi: ' + e.message)
    }
  }

  if (seciliKitap) {
    return (
      <KitapDuzenle
        kitap={seciliKitap}
        onGeriDon={() => {
          setSeciliKitap(null)
          kitaplariYenile()
        }}
        onKitapGuncellendi={kitaplariYenile}
        onSeciliSorularlaTestOlustur={kitapDenTesteAktar}
      />
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-2">Kitap Yükle</h1>
      <p className="text-sm text-gray-500 mb-6">
        Bir kitabın PDF'ini yükleyip içinden istediğiniz soruları işaretleyin, derse/konuya etiketleyin; sonra istediğiniz soruları
        seçip yeni bir test oluşturup doğrudan öğrenciye ödev olarak gönderebilirsiniz. Bu, Sınav Kitapçıkları/Hata Raporu
        sisteminden tamamen ayrıdır.
      </p>

      <div className="flex gap-2 mb-6 border-b border-gray-100">
        <button
          type="button"
          onClick={() => setSekme('kitaplarim')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
            sekme === 'kitaplarim' ? 'border-orange text-orange' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Kitaplarım
        </button>
        <button
          type="button"
          onClick={() => setSekme('test-olustur')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
            sekme === 'test-olustur' ? 'border-orange text-orange' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Test Oluştur
        </button>
      </div>

      {hata && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{hata}</p>}

      {sekme === 'kitaplarim' ? (
        <>
          <KitapYukleFormu
            onYuklendi={(kitap) => {
              kitaplariYenile()
              setSeciliKitap(kitap)
            }}
          />
          {yukleniyor ? (
            <p className="text-gray-400">Yükleniyor...</p>
          ) : kitaplar.length === 0 ? (
            <p className="text-sm text-gray-400">Henüz hiç kitap yüklenmedi.</p>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="font-semibold text-gray-700">Yüklenen Kitaplar ({kitaplar.length})</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {kitaplar.map((k) => (
                  <div key={k.id} className="p-4 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{k.ad}</p>
                      <p className="text-xs text-gray-400">
                        {k.ders_adi ? `${k.ders_adi} · ` : ''}
                        {k.sayfa_sayisi} sayfa · {k.kitap_sorulari?.[0]?.count ?? 0} soru işaretli
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSeciliKitap(k)}
                        className="text-xs font-semibold bg-navy text-white px-3 py-1.5 rounded-full hover:opacity-90"
                      >
                        Düzenle
                      </button>
                      <button
                        type="button"
                        onClick={() => kitabiSil(k)}
                        className="text-xs font-semibold text-red-600 border border-red-200 px-3 py-1.5 rounded-full hover:bg-red-50"
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <TestOlusturSekmesi
          initialSeciliSorular={testIcinOnSecili}
          onInitialSeciliSorularTuketildi={() => setTestIcinOnSecili(null)}
        />
      )}
    </div>
  )
}
