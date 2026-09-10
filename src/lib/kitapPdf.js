// "Kitap Yükle" özelliğinde seçilen soruların koordinatlarına (kitap_id,
// sayfa_no, x, y, genislik, yukseklik) göre kaynak kitap PDF'lerini indirip
// ilgili bölgeleri kırpar ve TEK bir test PDF'inde birleştirir.
//
// ÖNEMLİ (depolama/performans): burada hiçbir kırpılmış görüntü Storage'a
// KAYDEDİLMİYOR — sadece bu fonksiyon çalışırken tarayıcı belleğinde anlık
// üretilip doğrudan çıktı PDF'ine gömülüyor. Aynı kitaptan/sayfadan birden
// fazla soru seçilse bile o kitabın PDF'i ve o sayfanın render'ı SADECE BİR
// KEZ yapılır (belgeCache/sayfaCache) — bkz. kitapcikOcr.js'teki aynı "tek
// seferde render, tekrar kullan" deseni.
import { pdfBelgesiAc, sayfayiGoruntuyeCevir, alttakiBosluguKirp } from './kitapcikOcr'
import { jspdfYukle } from './pdfOlustur'
import { kitapPdfBlobuGetir } from './kitapDrive'
import {
  kitapMetinKatmanindanSoruNumaralariniTespitEt,
  kitapSoruNumarasiWorkerOlustur,
  kitapSoruNumarasiWorkerKapat,
  kitapSayfasindaSoruNumaralariniTespitEt,
} from './kitapOcr'

function canvasKirp(canvas, x, y, genislik, yukseklik) {
  const g = Math.max(1, Math.round(genislik))
  const h = Math.max(1, Math.round(yukseklik))
  const yeni = document.createElement('canvas')
  yeni.width = g
  yeni.height = h
  yeni
    .getContext('2d')
    .drawImage(canvas, Math.round(x), Math.round(y), g, h, 0, 0, g, h)
  return yeni
}

// Kullanıcı isteğiyle eklendi: "sorular kesilirken gerçek kitaptaki soru
// numaraları da görünüyor, onlar görünmese" — kutu, admin kutuyu çizerken
// genelde kaynak kitabın KENDİ soru numarasının (ör. "12.") üzerinden
// başladığı için, bu numara test PDF'indeki YENİ sıra numarasıyla (ör. bu
// testte 3. soru olması) ÇAKIŞIP kafa karıştırabiliyor.
//
// OTOMATİK YÖNTEM (aşağıdaki numaraAlaniniBul + numarayiBeyazlat): kutunun
// ait olduğu sayfa YENİDEN taranır ve bu kutunun tam olarak HANGİ numaradan
// üretildiği (satırın y konumu üzerinden, ±birkaç piksel toleransla) bulunur;
// bulunan numaranın GERÇEK ölçülen konumu ve tahmini boyutu kadar bir alan,
// kutunun SADECE o köşesinde beyazla boyanır — geri kalan soru metnine
// dokunulmaz. Eşleşen bir numara bulunamazsa (ör. kutu elle çizildi/yeniden
// çizildi, dolayısıyla otomatik tespitin ürettiği desenle uyuşmuyor) HİÇBİR
// ŞEY yapılmaz — "belki doğrudur" diye tahmin yürütülmez, güvenli tarafta
// kalınır.
//
// İKİ AŞAMALI TESPİT (kullanıcının "ENS MATEMATİK" kitabıyla canlıda test
// edilip TARANMIŞ kitaplarda numaraların gizlenmediği tespit edildikten SONRA
// eklendi): ÖNCE kitapOcr.js'teki Yöntem 1 (PDF metin katmanı) denenir —
// dijital kitaplarda anında ve %100 doğru sonuç verir. Bu sayfada Yöntem 1
// HİÇ aday bulamazsa (metin katmanı yok — kitap TARANMIŞ/fotoğraflanmış),
// "Bu Sayfada Soruları Otomatik Tespit Et" özelliğinde ZATEN kullanılan ve
// kanıtlanmış olan Yöntem 2'ye (Tesseract OCR, PSM 6) otomatik olarak
// düşülür — yani otomatik gizleme artık HEM dijital HEM taranmış kitaplarda
// çalışıyor, elle hiçbir şey seçmeye gerek yok. OCR bir sayfa için pahalı
// olduğundan worker TEMBEL oluşturulur ve testin TAMAMI için TEK SEFER
// kullanılır (aşağıdaki ocrWorkerGetir, testPdfOlustur içinde tanımlanıyor);
// sadece GERÇEKTEN taranmış bir kitap seçildiğinde bu ek maliyete girilir.
// Bu ikinci aşama da bir eşleşme bulamazsa yine HİÇBİR ŞEY yapılmaz — aynı
// güvenli-taraf kuralı geçerli. Son çare olarak aşağıdaki ustKirp (elle, %
// ile) her zaman ek/yedek olarak kullanılabilir durumda kalıyor.
const numaraAlaniCache = new Map() // "kitapId|sayfaNo" -> tespit edilen adaylar (Yöntem 1 veya Yöntem 2)

async function numaraAlaniniBul(belgeGetir, s, sayfaCanvas, ocrWorkerGetir) {
  try {
    const anahtar = `${s.kitap.id}|${s.sayfa_no}`
    let adaylar = numaraAlaniCache.get(anahtar)
    if (!adaylar) {
      const belge = await belgeGetir(s.kitap)
      adaylar = await kitapMetinKatmanindanSoruNumaralariniTespitEt(
        belge,
        s.sayfa_no,
        Number(s.kitap.olcek) || 3,
        sayfaCanvas.width,
        sayfaCanvas.height
      )
      // Yöntem 1 bu sayfada hiçbir şey bulamadıysa (muhtemelen taranmış bir
      // kitap) OCR yedeğine düş — bkz. yukarıdaki "İKİ AŞAMALI TESPİT" notu.
      if (adaylar.length === 0 && ocrWorkerGetir) {
        const worker = await ocrWorkerGetir()
        if (worker) {
          adaylar = await kitapSayfasindaSoruNumaralariniTespitEt(
            worker,
            sayfaCanvas,
            sayfaCanvas.width,
            sayfaCanvas.height
          )
        }
      }
      numaraAlaniCache.set(anahtar, adaylar)
    }
    // Bu kutu HANGİ adaydan üretildi? baslangicKutulariUret (kitapcikOcr.js)
    // kutunun üst kenarını "aday.y - 6" olarak ayarlıyor — yani doğru eşleşen
    // adayın y'si, kutunun y'sinden yaklaşık 6 piksel AŞAĞIDA olmalı. Küçük
    // bir tolerans (±10px) yuvarlama farklarını kapsıyor. x için sıkı bir
    // eşleşme ARANMIYOR (kutunun x'i sabit bir sütun kenar boşluğu, numaranın
    // gerçek x'i kitaba göre değişebilir) — bunun yerine adayın x'inin bu
    // kutunun sütunu İÇİNDE olup olmadığına bakılıyor.
    const hedefY = s.y + 6
    let enYakin = null
    let enYakinFark = Infinity
    for (const a of adaylar) {
      if (a.x < s.x - 4 || a.x > s.x + s.genislik) continue // yanlış sütun/kutu
      const fark = Math.abs(a.y - hedefY)
      if (fark < enYakinFark) {
        enYakinFark = fark
        enYakin = a
      }
    }
    if (!enYakin || enYakinFark > 10) return null

    // Numaranın kutuya göre GÖRECELİ konumu — (0,0) VARSAYILMIYOR, gerçek
    // ölçülen fark kullanılıyor (bazı kitaplarda numara kutunun tam sol
    // kenarında değil, birkaç piksel içeride olabilir).
    const gorelX = Math.max(0, enYakin.x - s.x)
    const gorelY = Math.max(0, enYakin.y - s.y)
    // Güvenlik payı: tahmini boyutu biraz büyüt (numarayı TAM kapsasın diye)
    // ama kutunun makul bir bölümünü (en fazla %45 genişlik, %35 yükseklik)
    // ASLA aşmasın — bir eşleşme hatası olsa bile soru metninin büyük kısmı
    // her zaman korunur.
    const genislik = Math.min(enYakin.genislik * 1.3, s.genislik * 0.45)
    const yukseklik = Math.min(enYakin.yukseklik * 1.25, s.yukseklik * 0.35)
    return { x: gorelX, y: gorelY, genislik, yukseklik }
  } catch {
    // Herhangi bir hata (ör. sayfa okunamadı) sessizce yutulur — "en kötü
    // ihtimalle numara gizlenmez" güvenlik ağı, test PDF'i üretimini
    // ASLA durdurmaz.
    return null
  }
}

// Verilen (x,y,genislik,yukseklik) BÖLGESİNİ (kutuya göre GÖRECELİ, doğal
// piksel biriminde) canvas üzerinde beyazla boyar — numaraAlaniniBul'un
// bulduğu alanı gizlemek için.
function alanBeyazlat(canvas, alan) {
  if (!alan) return canvas
  const ctx = canvas.getContext('2d')
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(
    Math.round(alan.x),
    Math.round(alan.y),
    Math.min(canvas.width - Math.round(alan.x), Math.round(alan.genislik)),
    Math.min(canvas.height - Math.round(alan.y), Math.round(alan.yukseklik))
  )
  ctx.restore()
  return canvas
}

// Kullanıcı isteğiyle eklendi (yukarıdaki otomatik yönteme EK, isteğe bağlı
// bir araç — özellikle metin katmanı OLMAYAN/taranmış kitaplarda otomatik
// yöntem çalışmadığı için): her kutunun ÜSTÜNDEN sabit bir YÜZDE kırpılır
// (varsayılan %0 — hiçbir şey değişmez). Admin test PDF'ini önizleyip bu
// oranı ihtiyaca göre artırıp azaltabilir; veritabanındaki kutu
// koordinatlarına HİÇ dokunulmuyor (sadece bu PDF'e gömülen görüntüde), o
// yüzden yanlış bir % denenirse tek yapılması gereken PDF'i farklı bir
// oranla yeniden oluşturmak — hiçbir veri kaybı riski yok.
function ustKirp(canvas, oran) {
  if (!oran || oran <= 0) return canvas
  const kirpilacakYukseklik = Math.round(canvas.height * Math.min(oran, 0.4)) // güvenlik payı: en fazla %40
  if (kirpilacakYukseklik <= 0 || kirpilacakYukseklik >= canvas.height) return canvas
  const kalanYukseklik = canvas.height - kirpilacakYukseklik
  const yeni = document.createElement('canvas')
  yeni.width = canvas.width
  yeni.height = kalanYukseklik
  yeni
    .getContext('2d')
    .drawImage(canvas, 0, kirpilacakYukseklik, canvas.width, kalanYukseklik, 0, 0, canvas.width, kalanYukseklik)
  return yeni
}

// Bir canvas'ı, PDF'e gömülmeden ÖNCE hedef piksel boyutuna küçültür.
// ÖNEMLİ (kullanıcının bildirdiği "2 sayfalık PDF 145 MB" hatasının kök
// nedeni): kitap sayfaları admin ekranında YÜKSEK bir ölçekte (kitap.olcek,
// genelde 3 — bazı kitaplarda sayfa boyutu da olağandışı büyük olduğundan
// bu, binlerce piksel eninde/boyunda devasa bir canvas anlamına gelebiliyor)
// render ediliyor; bu YÜKSEK çözünürlük otomatik tespit/OCR doğruluğu için
// gerekli. AMA test PDF'inde bu kırpılmış görüntü, PDF içinde sadece küçük
// bir sütun genişliğinde (birkaç cm) GÖSTERİLİYOR — doc.addImage'a verilen
// w/h sadece GÖRÜNTÜLEME boyutunu belirliyor, PNG'nin kendi piksel verisini
// KüÇÜLTMÜYOR; yani ekranda küçük görünse bile PDF'e binlerce piksellik HAM
// veri gömülüyordu (birkaç soru bile onlarca/yüzlerce MB tutabiliyordu).
// Burada, gömülecek görüntüyü PDF'teki GERÇEK gösterim boyutunun (punto)
// makul bir baskı çözünürlüğüne (punto başına ~3 piksel ≈ 216 DPI — hem
// ekranda hem yazıcıda net) karşılık gelen piksel boyutuna küçültüyoruz.
function baskiIcinKucult(canvas, hedefGenislikPuan, hedefYukseklikPuan, punoBasinaPiksel = 3) {
  const hedefG = Math.max(1, Math.round(hedefGenislikPuan * punoBasinaPiksel))
  const hedefY = Math.max(1, Math.round(hedefYukseklikPuan * punoBasinaPiksel))
  // Zaten hedeften küçük/yakınsa (ör. kaynak kitap düşük çözünürlükte
  // yüklenmişse) büyütmeye gerek yok, olduğu gibi kullan.
  if (canvas.width <= hedefG * 1.05 && canvas.height <= hedefY * 1.05) return canvas
  const kucuk = document.createElement('canvas')
  kucuk.width = hedefG
  kucuk.height = hedefY
  kucuk.getContext('2d').drawImage(canvas, 0, 0, hedefG, hedefY)
  return kucuk
}

// sorular: [{ kitap: {id, pdf_yolu, olcek}, sayfa_no, x, y, genislik, yukseklik, ders_adi, konu, soru_no, cevap }]
// ilerlemeCallback(oran) — 0..1 arası, admin'e "X/Y soru işlendi" göstermek için.
// testBasligi (opsiyonel): kullanıcı isteğiyle eklendi ("test başlığı seçince
// de pdfte görünsün") — girilmişse SADECE ilk sayfanın en üstüne, ortalanmış
// ve kalın olarak yazılır (bir "testmaker" uygulamasındaki gibi).
//
// SAYFA DÜZENİ (kullanıcı isteğiyle değişti): ÖNCEDEN her soru görüntüsü
// SAYFA GENİŞLİĞİNİN TAMAMINA gerilip tek bir sütun halinde alt alta
// diziliyordu — kesilen kutular genelde dar/uzun bir sütun kırpması olduğu
// için (kaynak kitaptaki tek bir sütun genişliğinde) tam sayfa genişliğine
// gerilince boyu da orantılı olarak devasa büyüyordu; sonuçta 50 soru ~60
// sayfa tutuyordu (neredeyse her soru kendi sayfasını dolduruyordu, kâğıt
// israfı). Şimdi 2 SÜTUNLU bir düzen kullanıyoruz: her soru kendi doğal
// en-boy oranıyla, en fazla bir sütun genişliğine sığacak şekilde (gerekirse
// hafifçe büyütülüp/küçültülüp) yerleştirilir.
//
// SÜTUN DOLDURMA SIRASI (kullanıcı bildirimi: "sorular böyle biri solda biri
// sağda duruyor" — yani okuma sırası kafa karıştırıcıydı): ÖNCEDEN o an EN AZ
// DOLU olan sütun seçiliyordu (greedy bin-packing) — kâğıdı biraz daha sıkı
// dolduruyordu ama sonuç, soruların sütunlar arasında ÖNGÖRÜLEMEZ şekilde
// zıplaması oluyordu (ör. 1. soru sol sütunda, 2. sağda, 3. YİNE sağda, 4.
// tekrar solda gibi) — ne kaynak kitabın kendi düzeniyle (önce sol sütun
// tepeden tabana, SONRA sağ sütun) ne de normal bir test kâğıdının okuma
// sırasıyla uyuşuyordu. Artık SIRAYLA dolduruyoruz: aktif sütun tamamen
// dolana (bir sonraki soru sığmayana) kadar hep ONA yazılır, o zaman bir
// SONRAKİ sütuna geçilir — yani 1,2,3... hep sol sütunda tepeden aşağı
// dizilir, sol sütun dolunca 4,5,6... sağ sütunda tepeden aşağı devam eder.
// Kullanılan toplam kâğıt miktarı öncekiyle AYNI (yine 2 sütun tam
// dolduruluyor) — sadece HANGİ sorunun hangi sütuna gittiği değişti.
// ustKirmaOrani (opsiyonel, 0..1): her kutunun üstünden kırpılacak pay —
// bkz. yukarıdaki ustKirp açıklaması. Varsayılan 0, yani hiçbir şey değişmez.
export async function testPdfOlustur(sorular, ilerlemeCallback, testBasligi, ustKirpmaOrani = 0) {
  const jsPDF = await jspdfYukle()
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const sayfaGenisligi = doc.internal.pageSize.getWidth()
  const sayfaYuksekligi = doc.internal.pageSize.getHeight()
  const kenar = 24
  const sutunSayisi = 2
  const sutunAraligi = 16
  const sutunGenisligi = (sayfaGenisligi - kenar * 2 - sutunAraligi * (sutunSayisi - 1)) / sutunSayisi
  const etiketYuksekligi = 14
  const etiketBosluk = 6
  const altBosluk = 18
  // Kırpılmış görüntü sütun genişliğinden DAHA DAR ise (ör. tek satırlık kısa
  // bir soru), onu sütun genişliğine kadar büyütüyoruz ama makul bir sınırla
  // (1.35x) — aksi halde küçük bir kırpma aşırı büyütülüp bulanıklaşabilir;
  // bu durumda görüntü sütun içinde ortalanır.
  const enFazlaBuyutmeOrani = 1.35
  const enKucukAlanKazanci = sayfaYuksekligi - kenar * 2 // bir sütunun kullanılabilir tam boyu (tek soruluk güvenlik payı için)

  const belgeCache = new Map() // kitap_id -> pdf.js belgesi
  const sayfaCache = new Map() // "kitapId|sayfaNo" -> canvas (o sayfanın tam render'ı)

  // Taranmış (metin katmanı olmayan) kitaplarda otomatik numara gizleme için
  // OCR yedeği (bkz. numaraAlaniniBul'daki "İKİ AŞAMALI TESPİT" notu) — worker
  // TEMBEL oluşturulur (ilk gerçekten ihtiyaç duyulduğunda) ve bu testin
  // TAMAMI boyunca TEK SEFER kullanılıp en sonda kapatılır (aşağıdaki finally).
  let ocrWorker = null
  let ocrWorkerHata = false
  async function ocrWorkerGetir() {
    if (ocrWorkerHata) return null
    if (!ocrWorker) {
      try {
        ocrWorker = await kitapSoruNumarasiWorkerOlustur()
      } catch {
        // OCR worker hiç başlatılamazsa (ör. tarayıcı desteği yok) otomatik
        // gizleme sessizce devre dışı kalır — test PDF'i yine de üretilir,
        // sadece taranmış kitaplarda numaralar gizlenmez.
        ocrWorkerHata = true
        return null
      }
    }
    return ocrWorker
  }

  async function belgeGetir(kitap) {
    if (belgeCache.has(kitap.id)) return belgeCache.get(kitap.id)
    let pdfBlobu
    try {
      pdfBlobu = await kitapPdfBlobuGetir(kitap)
    } catch (error) {
      throw new Error(`"${kitap.ad || kitap.id}" kitabının PDF'i indirilemedi: ${error.message}`)
    }
    const belge = await pdfBelgesiAc(pdfBlobu)
    belgeCache.set(kitap.id, belge)
    return belge
  }

  async function sayfaCanvasGetir(kitap, sayfaNo) {
    const anahtar = `${kitap.id}|${sayfaNo}`
    if (sayfaCache.has(anahtar)) return sayfaCache.get(anahtar)
    const belge = await belgeGetir(kitap)
    const { canvas } = await sayfayiGoruntuyeCevir(belge, sayfaNo, Number(kitap.olcek) || 3)
    sayfaCache.set(anahtar, canvas)
    return canvas
  }

  // Aşağıdaki try/finally: OCR worker'ı (yukarıdaki ocrWorkerGetir ile
  // tembel/lazy oluşturulmuş olabilir) her koşulda — üretim başarılı olsa da
  // ortada bir hata fırlatılsa da — kapatmak için. Aksi halde tarayıcıda
  // sonlandırılmamış bir Tesseract worker'ı boşuna bellekte kalabilir.
  try {
  // Her sütunun o anki doluluk (y) konumu — yeni sayfaya geçildiğinde sıfırlanır.
  // sayfaBaslangicY: o an geçerli sayfada sütunların BOŞ (henüz hiç soru
  // eklenmemiş) durumdaki y konumu — "bu sütun boş mu" kontrolü (aşağıda)
  // bununla karşılaştırılıyor, sabit "kenar" ile DEĞİL — ilk sayfada başlık
  // varsa bu daha aşağıda başlar (bkz. baslikAlaniYuksekligi).
  let sayfaBaslangicY = kenar
  let sutunYler = new Array(sutunSayisi).fill(sayfaBaslangicY)
  // Sorular hangi sütuna yazılıyor — SIRAYLA dolduruyoruz (bkz. yukarıdaki
  // "SÜTUN DOLDURMA SIRASI" notu), bu yüzden "en az dolu sütun" aramak yerine
  // tek bir "şu an aktif sütun" işaretçisi tutuyoruz.
  let aktifSutun = 0

  // Test başlığı SADECE ilk sayfanın üstüne yazılır (sonraki sayfalarda
  // tekrarlanmaz) — üstteki alan bu kadar sütunların başlangıç y'sinden düşülür.
  const baslikAlaniYuksekligi = 34
  if (testBasligi && testBasligi.trim()) {
    doc.setFontSize(15)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text(testBasligi.trim(), sayfaGenisligi / 2, kenar + 12, { align: 'center' })
    doc.setFont(undefined, 'normal')
    doc.setTextColor(0, 0, 0)
    sayfaBaslangicY = kenar + baslikAlaniYuksekligi
    sutunYler = new Array(sutunSayisi).fill(sayfaBaslangicY)
  }

  // Kullanıcı isteğiyle eklendi: "ortaya çizgi çeksek, soruları bir sayfada
  // ikiye bölüyoruz ya" — iki sütun arasındaki boşluğun (sutunAraligi) tam
  // ortasına, ince, açık gri dikey bir çizgi çizilir. Üstten sayfaBaslangicY'de
  // (kenar, ya da ilk sayfada başlık varsa başlığın ALTINDA) başlar — böylece
  // ilk sayfada test başlığının ÜZERİNDEN geçip onu bölmez. Her sayfada (ilk
  // sayfa dahil) TEKRAR çizilmesi gerekir — jsPDF'te her doc.addPage() BOŞ,
  // çizgisiz yeni bir sayfa açar.
  function sutunAyracCizgisiCiz() {
    if (sutunSayisi < 2) return
    const cizgiX = kenar + sutunGenisligi + sutunAraligi / 2
    doc.setDrawColor(210, 210, 210)
    doc.setLineWidth(0.6)
    doc.line(cizgiX, sayfaBaslangicY, cizgiX, sayfaYuksekligi - kenar)
  }
  sutunAyracCizgisiCiz()

  function yeniSayfaBaslat() {
    doc.addPage()
    sayfaBaslangicY = kenar // başlık sadece ilk sayfada tekrarlanmaz
    sutunYler = new Array(sutunSayisi).fill(sayfaBaslangicY)
    aktifSutun = 0
    sutunAyracCizgisiCiz()
  }

  for (let i = 0; i < sorular.length; i++) {
    const s = sorular[i]
    if (ilerlemeCallback) ilerlemeCallback((i + 1) / sorular.length)

    // Kullanıcı isteğiyle (2. istek turu) otomatik sıra numarası GERİ
    // GETİRİLDİ — "pdfte soru seçti ya otomatik yazsın birinci soru ikinci
    // soru üçüncü soru diye". ÖNCEKİ turda bu tamamen kaldırılmıştı çünkü o
    // zamanki kutu-hizalama hatası yüzünden etiket sorunun üzerine BİNİYORDU.
    // Artık her soru için (etiketli olsun olmasın) ayrı bir dikey alan
    // (etiketAlaniYuksekligi) HER ZAMAN ayrılıyor, bu yüzden üzerine binme
    // riski yok. Sıra numarası: admin elle bir "Soru No" girmişse ONU,
    // girmemişse bu test PDF'indeki YERLEŞİM SIRASINI (i+1) kullanır.
    const siraNo = s.soru_no || i + 1
    // Kullanıcı isteğiyle (3. istek turu) SADECE sıra numarası basılıyor —
    // ÖNCEDEN burada ders/konu VE en sonda kaynak kitabın adı da ekleniyordu
    // ("kitabın ismi de yazıyor, sadece soru numarası yazsa yeter"). Artık
    // etiket tek başına "1." gibi görünüyor; ders_adi/konu/kitap.ad hâlâ
    // veritabanında duruyor (sadece PDF'e basılmıyor), istenirse geri eklenir.
    const etiketVar = true
    const etiketAlaniYuksekligi = etiketYuksekligi + etiketBosluk

    const sayfaCanvas = await sayfaCanvasGetir(s.kitap, s.sayfa_no)
    // Kaynak kitabın kendi soru numarasını (varsa) OTOMATİK olarak gizlemek
    // için — bkz. dosya başındaki numaraAlaniniBul açıklaması. Kırpmadan
    // ÖNCE, tüm SAYFA üzerindeki koordinatlarla bulunuyor (kutunun kendi x/y
    // hâlâ sayfa uzayında), sonra kırpılmış görüntüye göreceli konuma çevrilip
    // uygulanıyor.
    const numaraAlani = await numaraAlaniniBul(belgeGetir, s, sayfaCanvas, ocrWorkerGetir)
    let kirpilan = canvasKirp(sayfaCanvas, s.x, s.y, s.genislik, s.yukseklik)
    kirpilan = alanBeyazlat(kirpilan, numaraAlani)
    // Kutu genelde bir sonraki sorunun başladığı yere kadar (fazla boşluklu)
    // çizilmiş olabilir — HataKitapcigi.jsx'teki aynı düzeltme burada da uygulanıyor.
    kirpilan = alttakiBosluguKirp(kirpilan)
    // Kaynak kitabın kendi soru numarasını (varsa) elle gizlemek için isteğe
    // bağlı üst kırpma (özellikle otomatik yöntemin çalışmadığı TARANMIŞ
    // kitaplarda) — bkz. dosya başındaki ustKirp açıklaması.
    kirpilan = ustKirp(kirpilan, ustKirpmaOrani)

    let olcek = sutunGenisligi / kirpilan.width
    if (olcek > enFazlaBuyutmeOrani) olcek = enFazlaBuyutmeOrani
    let gosterilenGenislik = kirpilan.width * olcek
    let gosterilenYukseklik = kirpilan.height * olcek
    let gerekliYukseklik = etiketAlaniYuksekligi + gosterilenYukseklik + altBosluk

    // Tek bir soru, TAM boş bir sütunun tamamına bile sığmayacak kadar
    // uzunsa (çok nadir — ör. yanlışlıkla çok büyük bir alan kesilmişse),
    // sayfanın tam boyuna sığacak şekilde orantılı olarak küçültüyoruz —
    // yoksa sonsuz döngüde hep "sığmıyor, yeni sayfa" derdik.
    if (gerekliYukseklik > enKucukAlanKazanci) {
      const kucultmeOrani = (enKucukAlanKazanci - etiketAlaniYuksekligi - altBosluk) / gosterilenYukseklik
      gosterilenGenislik *= kucultmeOrani
      gosterilenYukseklik *= kucultmeOrani
      gerekliYukseklik = enKucukAlanKazanci
    }

    // Aktif sütuna sığmıyorsa (ve aktif sütun zaten boş DEĞİLSE — yoksa boş
    // bir sütuna bile sığmayan tek bir devasa soru için sonsuz döngüye
    // girerdik, o durumda yukarıdaki küçültme zaten devreye girmiş olur) bir
    // SONRAKİ sütuna geç; son sütundan sonrası yeni sayfa demektir. Bu döngü,
    // "en az dolu sütunu bul" yerine soruları SIRAYLA (önce sol sütun
    // tepeden tabana, sonra sağ sütun) yerleştirir — bkz. dosya başındaki not.
    while (
      sutunYler[aktifSutun] > sayfaBaslangicY &&
      sutunYler[aktifSutun] + gerekliYukseklik > sayfaYuksekligi - kenar
    ) {
      aktifSutun++
      if (aktifSutun >= sutunSayisi) yeniSayfaBaslat()
    }

    const x = kenar + aktifSutun * (sutunGenisligi + sutunAraligi)
    let y = sutunYler[aktifSutun]

    if (etiketVar) {
      // Kullanıcı isteğiyle: soru sıra numarası daha KALIN ve SİYAH —
      // ÖNCEDEN ince/gri (107,114,128) idi, fark etmesi zor olabiliyordu.
      const etiket = `${siraNo}.`
      doc.setFontSize(11)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text(etiket, x, y + 9, { maxWidth: sutunGenisligi })
      doc.setFont(undefined, 'normal')
      y += etiketAlaniYuksekligi
    }

    // Gömülecek görüntüyü PDF'teki gerçek gösterim boyutuna göre küçült —
    // bkz. baskiIcinKucult açıklaması (dosya boyutu patlamasının kök nedeni).
    const gomulecekCanvas = baskiIcinKucult(kirpilan, gosterilenGenislik, gosterilenYukseklik)
    const resim = gomulecekCanvas.toDataURL('image/png')
    // Görüntü sütun genişliğinden darsa (küçültme sınırına takılıp tam
    // dolduramadıysa) sütun içinde ortalanır.
    const resimX = x + Math.max(0, (sutunGenisligi - gosterilenGenislik) / 2)
    doc.addImage(resim, 'PNG', resimX, y, gosterilenGenislik, gosterilenYukseklik)

    sutunYler[aktifSutun] = y + gosterilenYukseklik + altBosluk
  }

  // ============================================================================
  // CEVAP ANAHTARI — kullanıcı isteğiyle eklendi: her sorunun doğru cevabı
  // (A/B/C/D/E) sorunun ÜZERİNDE/YANINDA DEĞİL, testin EN SONUNA, tek bir
  // "Cevap Anahtarı" sayfasında, yukarıdaki İLE AYNI sıra numaralarıyla
  // (siraNo) eşleşecek şekilde listelenir. Hiçbir soruya cevap girilmemişse
  // (öğretmen bu alanı hiç kullanmadıysa) bu sayfa HİÇ eklenmez — eski
  // testler ve cevap girmeyen kullanıcılar için çıktı değişmez.
  // ============================================================================
  const cevapliVarMi = sorular.some((s) => s.cevap)
  if (cevapliVarMi) {
    doc.addPage()
    const cSutunSayisi = 5
    const cSutunGenisligi = (sayfaGenisligi - kenar * 2) / cSutunSayisi
    const cSatirYuksekligi = 24
    let cY = kenar
    let cSutun = 0

    doc.setFontSize(16)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('CEVAP ANAHTARI', sayfaGenisligi / 2, cY + 14, { align: 'center' })
    doc.setFont(undefined, 'normal')
    doc.setTextColor(30, 41, 59)
    cY += 40

    doc.setFontSize(11)
    for (let i = 0; i < sorular.length; i++) {
      const s = sorular[i]
      if (cSutun === 0 && cY > sayfaYuksekligi - kenar - cSatirYuksekligi) {
        doc.addPage()
        cY = kenar
      }
      const siraNo = s.soru_no || i + 1
      const cevap = (s.cevap || '-').toString().toUpperCase()
      const x = kenar + cSutun * cSutunGenisligi
      doc.text(`${siraNo}. ${cevap}`, x, cY + 14)
      cSutun++
      if (cSutun >= cSutunSayisi) {
        cSutun = 0
        cY += cSatirYuksekligi
      }
    }
  }

  return doc.output('blob')
  } finally {
    // Yukarıdaki try'ın açıklaması: OCR worker'ı (ocrWorkerGetir ile taranmış
    // bir kitap yüzünden gerçekten oluşturulmuşsa) burada, üretim başarılı
    // olsun ya da bir hata fırlatılsın, HER ZAMAN kapatılır.
    if (ocrWorker) await kitapSoruNumarasiWorkerKapat(ocrWorker)
  }
}
