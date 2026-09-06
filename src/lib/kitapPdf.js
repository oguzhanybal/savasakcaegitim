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
import { supabase } from './supabase'
import { pdfBelgesiAc, sayfayiGoruntuyeCevir, alttakiBosluguKirp } from './kitapcikOcr'
import { jspdfYukle } from './pdfOlustur'

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

// sorular: [{ kitap: {id, pdf_yolu, olcek}, sayfa_no, x, y, genislik, yukseklik, ders_adi, konu, soru_no }]
// ilerlemeCallback(oran) — 0..1 arası, admin'e "X/Y soru işlendi" göstermek için.
export async function testPdfOlustur(sorular, ilerlemeCallback) {
  const jsPDF = await jspdfYukle()
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const sayfaGenisligi = doc.internal.pageSize.getWidth()
  const sayfaYuksekligi = doc.internal.pageSize.getHeight()
  const kenar = 28
  let y = kenar

  const belgeCache = new Map() // kitap_id -> pdf.js belgesi
  const sayfaCache = new Map() // "kitapId|sayfaNo" -> canvas (o sayfanın tam render'ı)

  async function belgeGetir(kitap) {
    if (belgeCache.has(kitap.id)) return belgeCache.get(kitap.id)
    const { data: pdfBlobu, error } = await supabase.storage.from('kitaplar').download(kitap.pdf_yolu)
    if (error) throw new Error(`"${kitap.ad || kitap.id}" kitabının PDF'i indirilemedi: ${error.message}`)
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

  for (let i = 0; i < sorular.length; i++) {
    const s = sorular[i]
    if (ilerlemeCallback) ilerlemeCallback((i + 1) / sorular.length)

    const sayfaCanvas = await sayfaCanvasGetir(s.kitap, s.sayfa_no)
    let kirpilan = canvasKirp(sayfaCanvas, s.x, s.y, s.genislik, s.yukseklik)
    // Kutu genelde bir sonraki sorunun başladığı yere kadar (fazla boşluklu)
    // çizilmiş olabilir — HataKitapcigi.jsx'teki aynı düzeltme burada da uygulanıyor.
    kirpilan = alttakiBosluguKirp(kirpilan)

    const hedefGenislik = sayfaGenisligi - kenar * 2
    const oran = hedefGenislik / kirpilan.width
    const gosterilenYukseklik = kirpilan.height * oran
    const etiketYuksekligi = 16
    const gerekliYukseklik = etiketYuksekligi + gosterilenYukseklik + 22

    // Sayfanın başında değilsek ve kalan yer yetmiyorsa yeni sayfaya geç.
    if (y > kenar && y + gerekliYukseklik > sayfaYuksekligi - kenar) {
      doc.addPage()
      y = kenar
    }

    doc.setFontSize(10)
    doc.setTextColor(107, 114, 128)
    const etiket = [
      s.soru_no ? `${s.soru_no}.` : `${i + 1}.`,
      s.ders_adi,
      s.konu,
      s.kitap?.ad,
    ]
      .filter(Boolean)
      .join('  ·  ')
    doc.text(etiket, kenar, y + 10)
    y += etiketYuksekligi

    const resim = kirpilan.toDataURL('image/png')
    doc.addImage(resim, 'PNG', kenar, y, hedefGenislik, gosterilenYukseklik)
    y += gosterilenYukseklik + 22
  }

  return doc.output('blob')
}
