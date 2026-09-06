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
  const altSinir = sayfaYuksekligi * 0.95
  // Soru numarası, sütununun sol kenarına yaslı olur (bkz. kitapcikOcr.js'teki
  // aynı varsayım) — bu bant dışında kalan (ör. sayfa numarası, "Test - 1"
  // gibi köşe etiketleri) izole rakamlar burada elenir.
  const seritGenisligiOrani = 0.2
  const bantlar = [
    { x0: 0, x1: ortaX * seritGenisligiOrani },
    { x0: ortaX, x1: ortaX + ortaX * seritGenisligiOrani },
  ]

  const adaylar = []
  for (const item of textContent.items) {
    const metin = (item.str || '').trim()
    if (!/^\d{1,3}[.)]?$/.test(metin)) continue
    // item.transform[4], [5]: PDF kullanıcı uzayında TABAN ÇİZGİSİ (baseline)
    // konumu — viewport.convertToViewportPoint bunu render edilen canvas'ın
    // piksel uzayına (ölçek + döndürme + y ekseni çevirisi dahil) doğru
    // şekilde çevirir. AMA bu, rakamın ALT kenarına yakın bir nokta —
    // baslangicKutulariUret (kitapcikOcr.js) "y"nin OCR'daki gibi rakamın
    // ÜST kenarı (w.bbox.y0) olmasını bekliyor ve kutunun üstünü
    // "simdi.y - 6" ile belirliyor. Taban çizgisini olduğu gibi versek kutu
    // sorunun birkaç punto AŞAĞISINDAN başlıyor — yani sorunun (ve varsa
    // numarasının) üst kısmı kutunun DIŞINDA kalıyordu (kullanıcının
    // bildirdiği "bir tık sorunun üstünü almıyor" hatası). Bunu düzeltmek
    // için taban çizgisinden, karakterin (yaklaşık) yüksekliği kadar YUKARI
    // çıkıp asıl üst kenarı buluyoruz — rakamlarda çıkıntı/kuyruk (descender)
    // olmadığı için bu yaklaşım pratikte çok isabetli.
    const [x, yTaban] = viewport.convertToViewportPoint(item.transform[4], item.transform[5])
    const glifYuksekligiPdfBirimi = item.height || Math.abs(item.transform[3]) || 0
    const y = yTaban - glifYuksekligiPdfBirimi * olcek
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
