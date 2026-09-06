// "Kitap Yükle" özelliğine ÖZEL soru numarası tespit yardımcıları.
//
// ÖNEMLİ: kitapcikOcr.js, Sınav Kitapçıkları/Hata Raporu sisteminde de
// kullanıldığı için (SinavKitapciklari.jsx vb.) İÇİNDE HİÇBİR DEĞİŞİKLİK
// YAPILMADI — kullanıcı isteğiyle iki sistem birbirinden tamamen ayrı
// tutuluyor, oradaki dosyaya dokunmak o sistemi de etkileme riski taşırdı.
// Buradaki her şey Kitap Yükle'ye özel, ayrı bir kopya/ek mantık.
//
// CANLIDA YAPILAN GERÇEK TEŞHİS (kullanıcının kendi yüklediği "ENS Türkçe
// Soru Bankası" kitabı üzerinde, tarayıcı konsoluna doğrudan kod çalıştırarak
// test edildi — bkz. sohbet geçmişi): "Bu Sayfada Soruları Otomatik Tespit
// Et" bir gerçek soru sayfasında 6 sorudan sadece 1'ini bulabiliyordu.
// Bunun nedeni OCR karakter beyaz listesi/deseni DEĞİL — bu kitabın PDF'i
// TARANMIŞ bir görüntü değil, GERÇEK BİR METİN KATMANI olan "dijital" bir
// PDF (pdf.js'in getTextContent() ile sayfadaki "1.", "2.", "3." gibi soru
// numaraları TAM OLARAK ve %100 doğrulukla, hiç OCR'a gerek kalmadan
// okunabiliyor). Tesseract ile piksel görüntüsünü "tahmin etmeye" çalışmak
// (özellikle çok dar/uzun şeritlerde) yerine, PDF'in metin katmanı VARSA
// önce onu kullanmak çok daha güvenilir ve hızlı.
//
// Bu yüzden burada İKİ yöntem var:
//   1) kitapMetinKatmanindanSoruNumaralariniTespitEt — ÖNCE bu denenir.
//      PDF'in gerçek metin katmanını okur, soru numaralarının TAM piksel
//      konumunu verir. Dijital (taranmamış) kitaplarda neredeyse %100
//      doğru ve anlık sonuç verir.
//   2) kitapSayfasindaSoruNumaralariniTespitEt — SADECE 1. yöntem hiçbir
//      şey bulamazsa (yani kitap gerçekten TARANMIŞ/fotoğraflanmış bir PDF,
//      metin katmanı yok) devreye giren OCR YEDEĞİ. kitapcikOcr.js'teki
//      SinavKitapciklari.jsx'in de kullandığı, kanıtlanmış (kusursuz
//      olmasa da makul oranda çalışan) orijinal tek-şerit yöntemle AYNI —
//      SADECE kabul edilen numara deseni "12." yanında "12)" formatını da
//      kapsayacak şekilde genişletildi (bazı kitaplarda nokta yerine
//      parantez kullanılıyor).
import { tesseractYukle, ocrIcinGriVeKontrastliCanvasUret } from './kitapcikOcr'

// ============================================================================
// YÖNTEM 1 (ÖNCELİKLİ): PDF'in gerçek metin katmanından tespit.
// ============================================================================
// belge: pdfBelgesiAc() ile açılmış pdf.js belgesi
// sayfaNo: 1 tabanlı sayfa numarası
// olcek: sayfanın render edildiği ölçek (kitap.olcek, genelde 3) — koordinatları
//        sayfayiGoruntuyeCevir ile üretilen canvas'la AYNI piksel uzayına
//        getirmek için şart.
export async function kitapMetinKatmanindanSoruNumaralariniTespitEt(belge, sayfaNo, olcek, sayfaGenisligi, sayfaYuksekligi) {
  const sayfa = await belge.getPage(sayfaNo)
  const viewport = sayfa.getViewport({ scale: olcek })
  const textContent = await sayfa.getTextContent()

  const ortaX = sayfaGenisligi / 2
  const ustSinir = sayfaYuksekligi * 0.06
  // ÖNCEDEN 0.95'ti — bazı kitaplarda sayfa altındaki SAYFA NUMARASI (ör. bu
  // kitapta "12" sayfa numarası) 0.95 sınırının içine düşüp YANLIŞLIKLA bir
  // "soru" adayı sayılabiliyordu; bu da kendisinden önceki GERÇEK son sorunun
  // kutusunun sayfa numarasında ERKEN kesilmesine yol açıyordu. 0.92'ye
  // çekmek bu tür sayfa-altı etiketlerini güvenlik payıyla dışarıda bırakıyor.
  const altSinir = sayfaYuksekligi * 0.92
  // Soru numarası, sütununun sol kenarına yaslı olur (bkz. kitapcikOcr.js'teki
  // aynı varsayım) — bu bant dışında kalan (ör. sayfa numarası, "Test - 1"
  // gibi köşe etiketleri) izole rakamlar burada elenir.
  const seritGenisligiOrani = 0.2
  const bantlar = [
    { x0: 0, x1: ortaX * seritGenisligiOrani },
    { x0: ortaX, x1: ortaX + ortaX * seritGenisligiOrani },
  ]

  // ÖNEMLİ (canlıda doğrudan bu kitabın PDF'i üzerinde incelenerek keşfedildi):
  // bu tür kitaplarda pdf.js'in item.height / item.width / transform[3] alanları
  // GERÇEK görsel punto boyutunu YANSITMIYOR — PDF, görünmez/aranabilir bir OCR
  // metin katmanı içeriyor ve bu katmandaki her karakter, görsel boyutundan
  // bağımsız SABİT/anlamsız bir "1.5" gibi ölçek değeriyle yazılmış (aynı
  // satırdaki "7." ile yanındaki "Aşağıdaki..." kelimesi bile FARKLI ve gerçek
  // dışı height değerlerine sahip). Bu yüzden glif yüksekliğini font
  // metrikeriyle DEĞİL, sayfadaki metin satırlarının GERÇEK dikey konumlarından
  // (taban çizgisi pozisyonları HER ZAMAN doğru, sadece boyut alanları sahte)
  // tahmin ediyoruz: sayfadaki tüm metin öğelerinin y konumları arasındaki
  // TİPİK (medyan) satır arası mesafeyi bulup, bunu bir soru numarasının
  // taban çizgisinden YUKARI çıkmak için kullanıyoruz.
  const tumYler = []
  for (const item of textContent.items) {
    if (!(item.str || '').trim()) continue
    const [, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5])
    tumYler.push(Math.round(y))
  }
  const benzersizYler = Array.from(new Set(tumYler)).sort((a, b) => a - b)
  const satirFarklari = []
  for (let i = 1; i < benzersizYler.length; i++) {
    const fark = benzersizYler[i] - benzersizYler[i - 1]
    // Çok küçük farklar (aynı satır içindeki karakterler arası ufak kayma) ve
    // çok büyük farklar (paragraf/görsel/tablo boşlukları) elenir — geriye
    // sayfanın TİPİK gövde metni satır aralığı kalır.
    if (fark >= 8 * olcek && fark <= 100 * olcek) satirFarklari.push(fark)
  }
  satirFarklari.sort((a, b) => a - b)
  const tipikSatirYuksekligi = satirFarklari.length > 0 ? satirFarklari[Math.floor(satirFarklari.length / 2)] : 16 * olcek

  const adaylar = []
  for (const item of textContent.items) {
    const metin = (item.str || '').trim()
    if (!/^\d{1,3}[.)]?$/.test(metin)) continue
    // item.transform[4], [5]: PDF kullanıcı uzayında TABAN ÇİZGİSİ (baseline)
    // konumu. Taban çizgisini olduğu gibi versek kutu sorunun birkaç punto
    // AŞAĞISINDAN başlıyor — yani sorunun (ve varsa numarasının) üst kısmı
    // kutunun DIŞINDA kalıyordu (kullanıcının bildirdiği "sorunun üstünü
    // almıyor" hatası). Yukarıdaki tipikSatirYuksekligi kadar yukarı çıkarak
    // asıl üst kenara ulaşıyoruz.
    const [x, yTaban] = viewport.convertToViewportPoint(item.transform[4], item.transform[5])
    const y = yTaban - tipikSatirYuksekligi
    if (y < ustSinir || y > altSinir) continue
    const bantIcinde = bantlar.some((b) => x >= b.x0 - 4 && x <= b.x1)
    if (!bantIcinde) continue
    adaylar.push({ metin, x, y, genislik: 0, yukseklik: 0 })
  }
  return adaylar
}

// ============================================================================
// YÖNTEM 2 (YEDEK — sadece 1. yöntem sonuç vermezse, taranmış/fotoğraflanmış
// kitaplar için): kitapcikOcr.js'teki sayfadaSoruNumaralariniTespitEt ile
// YAPISAL OLARAK AYNI (aynı tek şerit, aynı üst/alt sınır mantığı) — sadece
// kabul edilen numara deseni ve OCR beyaz listesi "12)" formatını da
// kapsayacak şekilde genişletildi.
// ============================================================================
export async function kitapSoruNumarasiWorkerOlustur() {
  const Tesseract = await tesseractYukle()
  const worker = await Tesseract.createWorker('eng')
  await worker.setParameters({
    tessedit_pageseg_mode: '11', // PSM.SPARSE_TEXT — kitapcikOcr.js ile aynı
    tessedit_char_whitelist: '0123456789.)',
  })
  return worker
}

export async function kitapSoruNumarasiWorkerKapat(worker) {
  if (worker) await worker.terminate()
}

export async function kitapSayfasindaSoruNumaralariniTespitEt(worker, canvas, sayfaGenisligi, sayfaYuksekligi, ilerlemeCallback) {
  const ortaX = sayfaGenisligi / 2
  const ustSinir = sayfaYuksekligi * 0.06
  const altSinir = sayfaYuksekligi * 0.95

  const seritGenisligiOrani = 0.2
  const seritler = [
    { x0: 0, x1: ortaX * seritGenisligiOrani },
    { x0: ortaX, x1: ortaX + ortaX * seritGenisligiOrani },
  ]

  const adaylar = []
  for (let i = 0; i < seritler.length; i++) {
    const serit = seritler[i]
    const seritGenislik = Math.max(1, Math.round(serit.x1 - serit.x0))
    const seritCanvasHam = document.createElement('canvas')
    seritCanvasHam.width = seritGenislik
    seritCanvasHam.height = sayfaYuksekligi
    const ctxHam = seritCanvasHam.getContext('2d')
    ctxHam.drawImage(canvas, serit.x0, 0, seritGenislik, sayfaYuksekligi, 0, 0, seritGenislik, sayfaYuksekligi)

    const seritCanvas = ocrIcinGriVeKontrastliCanvasUret(seritCanvasHam)

    const { data } = await worker.recognize(seritCanvas)
    if (ilerlemeCallback) ilerlemeCallback((i + 1) / seritler.length)

    const kelimeler = (data.words || []).filter((w) => w.text && w.text.trim())
    for (const w of kelimeler) {
      const metin = w.text.trim()
      if (!/^\d{1,3}[.)]?$/.test(metin)) continue
      if (w.confidence < 30) continue
      const gercekY = w.bbox.y0
      if (gercekY < ustSinir || gercekY > altSinir) continue
      adaylar.push({
        metin,
        x: serit.x0 + w.bbox.x0,
        y: gercekY,
        genislik: w.bbox.x1 - w.bbox.x0,
        yukseklik: w.bbox.y1 - w.bbox.y0,
      })
    }
  }
  return adaylar
}
