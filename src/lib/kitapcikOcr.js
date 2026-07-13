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

// Bir sayfa görüntüsünde OLASI soru numarası konumlarını tahmin eder. Sadece
// rakam+nokta desenini arıyoruz ("12.", "3" gibi) — konu/gövde metnini
// anlamlandırmaya çalışmıyoruz, o yüzden Türkçe karakterler yanlış okunsa
// bile bu tespiti etkilemez.
//
// Ham OCR çıktısında bu deseni gerçek soru numaraları DIŞINDA da eşleşen çok
// sayıda "yanlış alarm" oluyor — özellikle sayfa altındaki SAYFA NUMARASI
// ("1", "2"... tek başına, satırda başka hiçbir şey yokken) ve soru gövdesi
// içindeki alt madde işaretleri ("I." "II." gibi Roma rakamlarının OCR
// tarafından "1." "11." diye yanlış okunması, ya da metin içi "17. yüzyıl"
// gibi ifadeler). Bu yüzden aşağıdaki filtreler uygulanıyor:
//   1) Sayfanın en üst %6'sı (başlık/logo bandı) ve en alt %5'i (sayfa no
//      bandı) tamamen dışarıda bırakılır — SAYFA NUMARASI bu bantta kalır.
//   2) (KALDIRILDI) Daha önce "aday kendi satırında yalnızsa (yanında başka
//      kelime yoksa) ele" kuralı da vardı — bu, soru numarasının hemen
//      ardından bir DİYAGRAM/TABLO/DENKLEM geldiği (yanında aynı satırda
//      metin OLMADIĞI) durumlarda GERÇEK soru numaralarını da yanlışlıkla
//      eliyordu (bir kitapçıkta 160 sorudan sadece 25'i bulunabilmesinin
//      başlıca nedeni buydu). Sayfa numarası zaten (1) numaralı üst/alt
//      bant filtresiyle elendiği için bu ek kural artık gereksizdi, kaldırıldı.
export async function sayfadaSoruNumaralariniTespitEt(canvas, sayfaGenisligi, sayfaYuksekligi, ilerlemeCallback) {
  const Tesseract = await tesseractYukle()
  const { data } = await Tesseract.recognize(canvas, 'eng', {
    logger: (m) => {
      if (ilerlemeCallback && m.status === 'recognizing text') {
        ilerlemeCallback(m.progress || 0)
      }
    },
  })
  const tumKelimeler = (data.words || []).filter((w) => w.text && w.text.trim())

  // Kelimeleri satırlara grupla (y merkezine göre yakınlık).
  const YAKINLIK = 8
  const satirlar = []
  for (const w of tumKelimeler) {
    const merkezY = (w.bbox.y0 + w.bbox.y1) / 2
    let satir = satirlar.find((s) => Math.abs(s.y - merkezY) <= YAKINLIK)
    if (!satir) {
      satir = { y: merkezY, kelimeler: [] }
      satirlar.push(satir)
    }
    satir.kelimeler.push(w)
  }

  const ustSinir = sayfaYuksekligi * 0.06
  const altSinir = sayfaYuksekligi * 0.95

  const adaylar = []
  for (const satir of satirlar) {
    const siraliKelimeler = [...satir.kelimeler].sort((a, b) => a.bbox.x0 - b.bbox.x0)
    const ilk = siraliKelimeler[0]
    if (!ilk) continue
    const metin = ilk.text.trim()
    if (!/^\d{1,3}\.?$/.test(metin)) continue
    if (ilk.confidence < 30) continue
    if (ilk.bbox.y0 < ustSinir || ilk.bbox.y0 > altSinir) continue
    adaylar.push({
      metin,
      x: ilk.bbox.x0,
      y: ilk.bbox.y0,
      genislik: ilk.bbox.x1 - ilk.bbox.x0,
      yukseklik: ilk.bbox.y1 - ilk.bbox.y0,
    })
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
