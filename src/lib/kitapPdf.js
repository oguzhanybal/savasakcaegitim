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

// sorular: [{ kitap: {id, pdf_yolu, olcek}, sayfa_no, x, y, genislik, yukseklik, ders_adi, konu, soru_no }]
// ilerlemeCallback(oran) — 0..1 arası, admin'e "X/Y soru işlendi" göstermek için.
//
// SAYFA DÜZENİ (kullanıcı isteğiyle değişti): ÖNCEDEN her soru görüntüsü
// SAYFA GENİŞLİĞİNİN TAMAMINA gerilip tek bir sütun halinde alt alta
// diziliyordu — kesilen kutular genelde dar/uzun bir sütun kırpması olduğu
// için (kaynak kitaptaki tek bir sütun genişliğinde) tam sayfa genişliğine
// gerilince boyu da orantılı olarak devasa büyüyordu; sonuçta 50 soru ~60
// sayfa tutuyordu (neredeyse her soru kendi sayfasını dolduruyordu, kâğıt
// israfı). Şimdi 2 SÜTUNLU bir "en boş sütuna yerleştir" (greedy bin-packing)
// düzeni kullanıyoruz: her soru kendi doğal en-boy oranıyla, en fazla bir
// sütun genişliğine sığacak şekilde (gerekirse hafifçe büyütülüp/küçültülüp)
// yerleştirilir, o an en az dolu olan sütuna eklenir — böylece sayfa başına
// çok daha fazla soru sığar ve yazıcıdan çıkarıldığında kâğıt israfı olmaz.
export async function testPdfOlustur(sorular, ilerlemeCallback) {
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

  // Her sütunun o anki doluluk (y) konumu — yeni sayfaya geçildiğinde sıfırlanır.
  let sutunYler = new Array(sutunSayisi).fill(kenar)

  function yeniSayfaBaslat() {
    doc.addPage()
    sutunYler = new Array(sutunSayisi).fill(kenar)
  }

  for (let i = 0; i < sorular.length; i++) {
    const s = sorular[i]
    if (ilerlemeCallback) ilerlemeCallback((i + 1) / sorular.length)

    // Etiket SADECE gerçekten anlamlı bir şey varsa (soru no / ders / konu)
    // yazılır — kullanıcı isteğiyle kaldırılan otomatik "1.2.3..." numaralama
    // ve etiketsiz sorularda kitap adının tek başına tekrar tekrar yazılması
    // hem gereksiz yer kaplıyor hem de bazı durumlarda kırpılan görüntünün
    // (kutu tam hizalanmadığında) hemen üstüne binip soruyu "kapatıyormuş"
    // gibi görünüyordu. Etiketlenmemiş bir soru için bu satır TAMAMEN
    // atlanır — o soru sadece kırpılmış görüntüsüyle sayfaya konur, ekstra
    // dikey boşluk da harcanmaz (bu da sayfa başına daha çok soru sığmasına
    // yardımcı olur).
    const etiketParcalari = [s.soru_no ? `${s.soru_no}.` : null, s.ders_adi, s.konu].filter(Boolean)
    const etiketVar = etiketParcalari.length > 0
    const etiketAlaniYuksekligi = etiketVar ? etiketYuksekligi + etiketBosluk : 0

    const sayfaCanvas = await sayfaCanvasGetir(s.kitap, s.sayfa_no)
    let kirpilan = canvasKirp(sayfaCanvas, s.x, s.y, s.genislik, s.yukseklik)
    // Kutu genelde bir sonraki sorunun başladığı yere kadar (fazla boşluklu)
    // çizilmiş olabilir — HataKitapcigi.jsx'teki aynı düzeltme burada da uygulanıyor.
    kirpilan = alttakiBosluguKirp(kirpilan)

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

    // O an EN AZ dolu olan sütunu seç (greedy bin-packing).
    let sutunIndex = 0
    for (let k = 1; k < sutunSayisi; k++) {
      if (sutunYler[k] < sutunYler[sutunIndex]) sutunIndex = k
    }

    // Seçilen (en boş) sütuna bile sığmıyorsa, sayfa dolmuş demektir — yeni
    // sayfaya geç ve baştan (0. sütundan) devam et.
    if (sutunYler[sutunIndex] > kenar && sutunYler[sutunIndex] + gerekliYukseklik > sayfaYuksekligi - kenar) {
      yeniSayfaBaslat()
      sutunIndex = 0
    }

    const x = kenar + sutunIndex * (sutunGenisligi + sutunAraligi)
    let y = sutunYler[sutunIndex]

    if (etiketVar) {
      const etiket = [...etiketParcalari, s.kitap?.ad].filter(Boolean).join('  ·  ')
      doc.setFontSize(9)
      doc.setTextColor(107, 114, 128)
      doc.text(etiket, x, y + 9, { maxWidth: sutunGenisligi })
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

    sutunYler[sutunIndex] = y + gosterilenYukseklik + altBosluk
  }

  return doc.output('blob')
}
