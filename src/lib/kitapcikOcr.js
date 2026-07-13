// Sınav kitapçığı (taranmış PDF) sayfalarını görüntüye çevirip, Tesseract.js
// ile soruların sayfadaki YAKLAŞIK başlangıç noktalarını tahmin eden yardımcı
// fonksiyonlar. Bu tespit KUSURSUZ DEĞİLDİR — SinavKitapciklari.jsx'teki
// "gözden geçir / düzelt" ekranı, buradaki sonuçları sadece bir başlangıç
// noktası olarak kullanır, admin hepsini elle onaylar/düzeltir.
//
// Kütüphaneler npm yerine CDN'den, kullanıcı sayfayı ilk açtığında dinamik
// olarak yükleniyor — bu projede Kantin.jsx'teki QuaggaJS ile aynı desen
// (kullanıcı yerelde npm install çalıştıramıyor, sadece GitHub'a dosya
// yüklüyor, o yüzden yeni bir npm bağımlılığı eklemek yerine CDN kullanıyoruz).

let pdfJsYuklemePromise = null
export function pdfJsYukle() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib)
  if (pdfJsYuklemePromise) return pdfJsYuklemePromise
  pdfJsYuklemePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
      resolve(window.pdfjsLib)
    }
    script.onerror = () => reject(new Error('pdf.js yüklenemedi (internet bağlantınızı kontrol edin).'))
    document.head.appendChild(script)
  })
  return pdfJsYuklemePromise
}

let tesseractYuklemePromise = null
export function tesseractYukle() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract)
  if (tesseractYuklemePromise) return tesseractYuklemePromise
  tesseractYuklemePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
    script.onload = () => resolve(window.Tesseract)
    script.onerror = () => reject(new Error('Tesseract.js yüklenemedi (internet bağlantınızı kontrol edin).'))
    document.head.appendChild(script)
  })
  return tesseractYuklemePromise
}

// Bir PDF dosyasını (File/Blob) pdf.js belgesine çevirir.
export async function pdfBelgesiAc(dosya) {
  const pdfjsLib = await pdfJsYukle()
  const arrayBuffer = await dosya.arrayBuffer()
  const yukleme = pdfjsLib.getDocument({ data: arrayBuffer })
  return yukleme.promise
}

// Bir sayfayı canvas'a çizip görüntü olarak döner. olcek arttıkça hem OCR
// kalitesi hem de dosya boyutu artar. DAHA ÖNCE 2 kullanılıyordu; küçük
// puntolu, çok sütunlu (matematik/AYT gibi) kitapçıklarda soru numaraları
// çok küçük kaldığı için Tesseract çoğunu hiç okuyamıyordu (bir kitapçıkta
// 160 sorudan sadece 25'i bulunabildi). 3'e çıkarmak metni belirgin şekilde
// netleştirip tanıma oranını artırıyor — bedeli biraz daha yavaş analiz ve
// biraz daha fazla bellek kullanımı, ama doğruluk için buna değer.
export async function sayfayiGoruntuyeCevir(pdfBelge, sayfaNo, olcek = 3) {
  const sayfa = await pdfBelge.getPage(sayfaNo)
  const viewport = sayfa.getViewport({ scale: olcek })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  await sayfa.render({ canvasContext: ctx, viewport }).promise
  return {
    canvas,
    genislik: viewport.width,
    yukseklik: viewport.height,
    dataUrl: canvas.toDataURL('image/png'),
  }
}

// Sayfa taramasından ÖNCE bir kez oluşturulup TÜM belge boyunca yeniden
// kullanılan Tesseract işçisi (worker). ÖNCEDEN her sayfada `Tesseract.recognize()`
// (tek seferlik kısayol) çağrılıyordu — bu hem her sayfada yeni bir worker
// kurup yıktığı için YAVAŞTI, hem de sayfanın TAMAMINI normal bir belge gibi
// (varsayılan otomatik sayfa/paragraf analiziyle) okumaya çalışıyordu. Çok
// sütunlu, diyagram/tablo dolu kitapçıklarda bu analiz motoru soru
// numaralarının çoğunu kaçırıyordu (160 soruda sadece 25-46 tespit).
//
// Burada worker'ı "dağınık metin" moduna (PSM 11 — sparse text: görüntüde
// metnin belirli bir okuma sırası/paragraf yapısında OLMADIĞINI varsayar,
// tek tek izole kelimeleri aramaya çalışır) ve SADECE rakam+nokta
// karakterlerini tanıyacak şekilde (tessedit_char_whitelist) ayarlıyoruz.
export async function soruNumarasiWorkerOlustur() {
  const Tesseract = await tesseractYukle()
  const worker = await Tesseract.createWorker('eng')
  await worker.setParameters({
    tessedit_pageseg_mode: '11', // PSM.SPARSE_TEXT
    tessedit_char_whitelist: '0123456789.',
  })
  return worker
}

export async function soruNumarasiWorkerKapat(worker) {
  if (worker) await worker.terminate()
}

// Bir sayfa görüntüsünde OLASI soru numarası konumlarını tahmin eder. Sadece
// rakam+nokta desenini arıyoruz ("12.", "3" gibi) — konu/gövde metnini
// anlamlandırmaya çalışmıyoruz, o yüzden Türkçe karakterler yanlış okunsa
// bile bu tespiti etkilemez.
//
// ÖNEMLİ DEĞİŞİKLİK: OCR artık sayfanın TAMAMINA değil, her sütunun SADECE
// SOL KENARINDAKİ dar bir şeride uygulanıyor. Soru numaraları zaten HER ZAMAN
// sütunun soluna yaslanır (girintiliAdaylariEle filtresi de bu varsayıma
// dayanıyor) — bu yüzden Tesseract'ın önüne artık diyagram/tablo/uzun
// paragraf metni GELMİYOR, sadece izole rakamlar geliyor. Bu hem OCR'ın
// kafasını karıştıran görsel karmaşıklığı ortadan kaldırıyor (bir soru
// numarasının hemen ardından bir DİYAGRAM/TABLO/DENKLEM geldiği, yanında
// aynı satırda metin OLMADIĞI durumları da artık sorunsuz okuyor) hem de
// "17. yüzyıl" gibi gövde metni içi sahte eşleşmeleri baştan imkansız
// kılıyor (o metin artık şeridin dışında, hiç taranmıyor).
//
// Sayfa NUMARASI (üst/alt bantta) hâlâ ustSinir/altSinir ile ayrıca elenir;
// soru gövdesindeki girintili alt madde işaretleri (Roma rakamları vb.) ise
// çağıran taraftaki girintiliAdaylariEle ile elenir.
export async function sayfadaSoruNumaralariniTespitEt(worker, canvas, sayfaGenisligi, sayfaYuksekligi, ilerlemeCallback) {
  const ortaX = sayfaGenisligi / 2
  const ustSinir = sayfaYuksekligi * 0.06
  const altSinir = sayfaYuksekligi * 0.95

  // Şerit genişliği: yarı sütun genişliğinin %20'si. Soru numaraları normal
  // sayfa kenar boşluğunun (%5-10) hemen bitişiğinde başlar; %20 payı, sayfa
  // kenar boşluğu biraz farklı kitapçıklarda değişse bile numaraları
  // kırpmadan yakalamak için yeterli güvenlik marjı bırakıyor.
  const seritGenisligiOrani = 0.2
  const seritler = [
    { x0: 0, x1: ortaX * seritGenisligiOrani },
    { x0: ortaX, x1: ortaX + ortaX * seritGenisligiOrani },
  ]

  const adaylar = []
  for (let i = 0; i < seritler.length; i++) {
    const serit = seritler[i]
    const seritGenislik = Math.max(1, Math.round(serit.x1 - serit.x0))
    const seritCanvas = document.createElement('canvas')
    seritCanvas.width = seritGenislik
    seritCanvas.height = sayfaYuksekligi
    const ctx = seritCanvas.getContext('2d')
    ctx.drawImage(canvas, serit.x0, 0, seritGenislik, sayfaYuksekligi, 0, 0, seritGenislik, sayfaYuksekligi)

    const { data } = await worker.recognize(seritCanvas)
    if (ilerlemeCallback) ilerlemeCallback((i + 1) / seritler.length)

    const kelimeler = (data.words || []).filter((w) => w.text && w.text.trim())
    for (const w of kelimeler) {
      const metin = w.text.trim()
      if (!/^\d{1,3}\.?$/.test(metin)) continue
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

// Bir sütunun GERÇEK sol kenarına (o sütundaki en küçük x) yakın olmayan
// adayları eler — soru gövdesi içinde girintili duran "I." "II." gibi alt
// madde işaretleri, gerçek soru numaralarının aksine sütunun sol kenarına
// tam yaslanmaz, birkaç piksel/santim içeride başlar.
export function girintiliAdaylariEle(adaylar, sayfaGenisligi, tolerans = 25) {
  const ortaX = sayfaGenisligi / 2
  const filtrele = (liste) => {
    if (liste.length === 0) return liste
    const minX = Math.min(...liste.map((a) => a.x))
    return liste.filter((a) => a.x - minX <= tolerans)
  }
  return [...filtrele(adaylar.filter((a) => a.x < ortaX)), ...filtrele(adaylar.filter((a) => a.x >= ortaX))]
}

// Okuma sırasına dizilmiş (sayfa, sütun, y) aday listesini, GERÇEK bir soru
// numarası dizisi gibi ARTAN bir sırada gidip gitmediğine göre süzer. Bu,
// "yanında 3-5 satır metin var diye soru sanma" problemini çözer: kitapçığın
// başındaki YÖNERGE de kendi içinde "1. Bu testte..." "2. Cevaplarınızı..."
// diye numaralanmış oluyor ve her ikisinin de yanında bol metin var, ama bu
// sadece 2 elemanlık kısa/kopuk bir dizi — hemen ardından asıl 1. soru
// yeniden "1." diye başlıyor.
//
// ÖNEMLİ: taranmış/fotoğraflanmış sayfalarda OCR bazı soru numaralarını hiç
// OKUYAMAZ (atlar) — bu yüzden "tam +1" şartı koyarsak taramanın kalitesine
// göre GERÇEK sorular da zincirden düşüp hepsi elenebilir. Bunun yerine
// aradaki BİRKAÇ numaranın kaçırılmış olabileceğini kabul ediyoruz: bir
// sonraki aday, öncekinden BÜYÜKSE ve makul bir sıçrama içindeyse
// (maksimumSicrama) aynı diziye sayılır. maksimumSicrama DAHA ÖNCE 6'ydı;
// yoğun/çok sütunlu kitapçıklarda OCR üst üste birkaç numarayı art arda
// kaçırabildiği görüldüğü için (160 sorudan sadece 25'i tespit edilebilen
// kitapçıkta olduğu gibi) 10'a çıkarıldı — gerçek soru zincirlerinin daha
// fazla kopması engellensin diye. Sadece yeterince UZUN (>= minDiziUzunlugu)
// artan diziler gerçek soru akışı sayılır; kısa/aykırı diziler (yönerge vb.)
// yine elenir — bu güvenlik payı BİLEREK değiştirilmedi.
export function ardisikDiziyeGoreFiltrele(siraliAdaylar, minDiziUzunlugu = 3, maksimumSicrama = 10) {
  const sonuc = []
  let mevcutDizi = []

  function diziyiSonlandir() {
    if (mevcutDizi.length >= minDiziUzunlugu) sonuc.push(...mevcutDizi)
    mevcutDizi = []
  }

  for (const aday of siraliAdaylar) {
    const deger = parseInt(aday.metin, 10)
    if (Number.isNaN(deger)) continue
    const sonAday = mevcutDizi[mevcutDizi.length - 1]
    const sonDeger = sonAday ? parseInt(sonAday.metin, 10) : null
    if (sonDeger !== null && deger > sonDeger && deger - sonDeger <= maksimumSicrama) {
      mevcutDizi.push(aday)
    } else {
      diziyiSonlandir()
      mevcutDizi.push(aday)
    }
  }
  diziyiSonlandir()
  return sonuc
}

// Aday konumlarını sayfanın sütun yapısına göre gruplar (basitçe sayfa
// genişliğinin ortasına göre sol/sağ) ve yukarıdan aşağıya sıralar. İki
// sütunlu (ya da tek sütunlu) klasik soru kitapçığı düzenine uygun bir ilk
// tahmindir — admin önizlemede yanlışları düzeltebilir.
export function sutunSiralaTahmini(adaylar, sayfaGenisligi) {
  const ortaX = sayfaGenisligi / 2
  const sutunlu = adaylar.map((a) => ({ ...a, sutun: a.x < ortaX ? 0 : 1 }))
  sutunlu.sort((a, b) => (a.sutun !== b.sutun ? a.sutun - b.sutun : a.y - b.y))
  return sutunlu
}

// Bir sütun içindeki, sırayla dizilmiş aday başlangıç noktalarından, her
// soru için bir "ilk tahmin" dikdörtgeni üretir: genişlik sütunun tamamı,
// yükseklik ise bir sonraki adayın başladığı yere kadar (son soru için
// sayfa sonuna kadar).
export function baslangicKutulariUret(sutunluAdaylar, sayfaGenisligi, sayfaYuksekligi, sutunKenarBosluk = 20) {
  const sutunlar = [0, 1]
  const kutular = []
  for (const sutun of sutunlar) {
    const buSutundakiler = sutunluAdaylar.filter((a) => a.sutun === sutun).sort((a, b) => a.y - b.y)
    const solX = sutun === 0 ? sutunKenarBosluk : sayfaGenisligi / 2 + sutunKenarBosluk / 2
    const sagX = sutun === 0 ? sayfaGenisligi / 2 - sutunKenarBosluk / 2 : sayfaGenisligi - sutunKenarBosluk
    for (let i = 0; i < buSutundakiler.length; i++) {
      const simdi = buSutundakiler[i]
      const sonraki = buSutundakiler[i + 1]
      const ustY = Math.max(0, simdi.y - 6)
      const altY = sonraki ? sonraki.y - 6 : sayfaYuksekligi - 10
      kutular.push({
        metin: simdi.metin,
        x: solX,
        y: ustY,
        genislik: Math.max(10, sagX - solX),
        yukseklik: Math.max(10, altY - ustY),
      })
    }
  }
  return kutular
}
