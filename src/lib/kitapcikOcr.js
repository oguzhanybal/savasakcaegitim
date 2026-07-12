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
// kalitesi hem de dosya boyutu artar — 2 makul bir denge.
export async function sayfayiGoruntuyeCevir(pdfBelge, sayfaNo, olcek = 2) {
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
export async function sayfadaSoruNumaralariniTespitEt(canvas, ilerlemeCallback) {
  const Tesseract = await tesseractYukle()
  const { data } = await Tesseract.recognize(canvas, 'eng', {
    logger: (m) => {
      if (ilerlemeCallback && m.status === 'recognizing text') {
        ilerlemeCallback(m.progress || 0)
      }
    },
  })
  const kelimeler = (data.words || []).filter((w) => w.text && w.text.trim())
  const adaylar = []
  for (const k of kelimeler) {
    const metin = k.text.trim()
    if (/^\d{1,3}\.?$/.test(metin) && k.confidence >= 30) {
      const { x0, y0, x1, y1 } = k.bbox
      adaylar.push({ metin, x: x0, y: y0, genislik: x1 - x0, yukseklik: y1 - y0 })
    }
  }
  return adaylar
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
