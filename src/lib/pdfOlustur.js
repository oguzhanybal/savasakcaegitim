// jsPDF + jspdf-autotable'ı CDN'den yükleyip (tıpkı kitapcikOcr.js'teki
// pdfJsYukle/tesseractYukle deseninde — büyük kütüphaneleri npm'e eklemek
// yerine ihtiyaç anında <script> etiketiyle yüklüyoruz), bir öğrencinin
// ekstre verisini GERÇEK bir PDF dosyasına (Blob) çeviren yardımcı
// fonksiyon. Toplu Ekstre'deki "PDF ile Gönder" butonu bunu kullanır —
// WhatsApp'a artık interaktif sayfa linki değil, gerçek bir PDF dosyasının
// linki gidiyor.
//
// autoTable, uzun tabloları (onlarca satır) OTOMATİK olarak sayfalar
// arasında böler — bir satırı asla ortadan kesmeden, ve her yeni sayfada
// başlık satırını tekrar çizerek. Bu yüzden Ekstre.jsx'teki yazdırma CSS'i
// için uğraştığımız "break-inside/break-after" hilelerine burada gerek yok;
// autoTable bunu kendiliğinden doğru yapıyor.

import { tutarYaziyla } from './sayiYaziyla'

let jspdfYuklemePromise = null
export function jspdfYukle() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF)
  if (jspdfYuklemePromise) return jspdfYuklemePromise
  jspdfYuklemePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'
    script.onload = () => {
      // jspdf-autotable eklentisi, jsPDF global'i hazır olduktan SONRA
      // yüklenmeli (kendini jsPDF.API'ye ekliyor).
      const autoTableScript = document.createElement('script')
      autoTableScript.src = 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'
      autoTableScript.onload = () => resolve(window.jspdf.jsPDF)
      autoTableScript.onerror = () => reject(new Error('jspdf-autotable yüklenemedi (internet bağlantınızı kontrol edin).'))
      document.head.appendChild(autoTableScript)
    }
    script.onerror = () => reject(new Error('jsPDF yüklenemedi (internet bağlantınızı kontrol edin).'))
    document.head.appendChild(script)
  })
  return jspdfYuklemePromise
}

// --- Türkçe karakter desteği --------------------------------------------
// jsPDF'in dahili 14 standart fontu (helvetica dahil) sadece WinAnsi/Latin-1
// alt kümesini destekliyor — Ç, Ö, Ü sorunsuz basılıyor ama İ, ı, Ş, ş, Ğ, ğ
// bu kümede YOK, bu yüzden PDF'te "SAVA^ AKÇA E 0T0M" gibi anlamsız
// karakterlere dönüşüyorlardı. Çözüm: Türkçe karakterleri tam destekleyen
// gerçek bir Unicode TTF fontu (Roboto) jsPDF'e gömmek (addFileToVFS +
// addFont). Fontu kendimiz CDN'den TTF olarak indirip base64'e çevirmek
// yerine — CDN üzerindeki tam dosya yolunu kör noktada tahmin etmemek
// için — pdfmake kütüphanesinin resmi "vfs_fonts.js" dosyasını kullanıyoruz:
// bu dosya (npm'de milyonlarca indirmesi olan pdfmake paketinin standart
// parçası) Roboto'yu TAM OLARAK jsPDF'in beklediği base64 TTF formatında,
// window.pdfMake.vfs objesinin içinde hazır barındırıyor. Sadece bu veri
// dosyasını <script> ile yüklüyoruz — pdfmake'in kendisine ihtiyacımız yok.
const PDFMAKE_VFS_URL = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.9/build/vfs_fonts.js'
const LOGO_URL = 'https://savasakcaportal.com/logo.png'

let vfsYuklemePromise = null
function pdfmakeVfsYukle() {
  if (window.pdfMake?.vfs?.['Roboto-Regular.ttf']) return Promise.resolve(window.pdfMake.vfs)
  if (vfsYuklemePromise) return vfsYuklemePromise
  vfsYuklemePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = PDFMAKE_VFS_URL
    script.onload = () => {
      const vfs = window.pdfMake?.vfs
      if (vfs?.['Roboto-Regular.ttf']) resolve(vfs)
      else reject(new Error('vfs_fonts.js beklenen formatta gelmedi.'))
    }
    script.onerror = () => reject(new Error('Türkçe font verisi (vfs_fonts.js) yüklenemedi.'))
    document.head.appendChild(script)
  }).catch((err) => {
    vfsYuklemePromise = null // başarısız olduysa bir sonraki PDF'te tekrar denensin
    throw err
  })
  return vfsYuklemePromise
}

// vfs içindeki bazı sürümlerde değerler "data:...;base64,XXXX" öneki ile,
// bazılarında çıplak base64 string olarak tutulabiliyor — ikisini de kabul et.
function base64Temizle(deger) {
  if (typeof deger !== 'string') return deger
  const virgulIndex = deger.indexOf(',')
  return deger.startsWith('data:') && virgulIndex !== -1 ? deger.slice(virgulIndex + 1) : deger
}

// Her yeni jsPDF() belgesi kendi font listesini tutar, bu yüzden fontu
// (indirilen vfs'ten) her belge için tekrar addFont ile kaydetmemiz
// gerekiyor — ama indirmenin kendisi (ağ isteği) sadece ilk seferde olur.
async function turkceFontHazirla(doc) {
  const vfs = await pdfmakeVfsYukle()
  const regular = base64Temizle(vfs['Roboto-Regular.ttf'])
  // pdfmake'in varsayılan font setinde "bold" karşılığı ayrı bir Bold
  // dosyası değil, Roboto-Medium.ttf'tir (Google'ın Material tasarımında
  // UI kalınlaştırması için kullandığı ağırlık) — aynısını burada da
  // "kalın" stil olarak kullanıyoruz.
  const bold = base64Temizle(vfs['Roboto-Medium.ttf'] || vfs['Roboto-Bold.ttf'])
  if (!regular || !bold) throw new Error('Font verisi eksik.')
  doc.addFileToVFS('Roboto-Regular.ttf', regular)
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
  doc.addFileToVFS('Roboto-Bold.ttf', bold)
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold')
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('Dosya okunamadı.'))
    reader.readAsDataURL(blob)
  })
}

async function urlIndirDataUrl(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} indirilemedi (HTTP ${res.status})`)
  const blob = await res.blob()
  return blobToDataUrl(blob)
}

let logoPromise = null
function logoHazirla() {
  if (!logoPromise) {
    logoPromise = urlIndirDataUrl(LOGO_URL).catch((err) => {
      logoPromise = null
      throw err
    })
  }
  return logoPromise
}

// --- Marka renkleri -------------------------------------------------------
// Sitenin gerçek görünümünden (canlı ekstre sayfası) ölçülen tam renkler —
// eskiden burada gelişigüzel bir lacivert tonu kullanılıyordu ve site ile
// PDF birbirini tutmuyordu.
const NAVY = [44, 77, 118] // site: bg-navy
const ORANGE = [210, 109, 60] // site: bg-orange / text-orange
const NAVY_ACIK = [244, 246, 248] // site: bg-navy/5
const ORANGE_ACIK = [251, 240, 236] // site: bg-orange/10
const GRI_ACIK = [249, 250, 251] // site: bg-gray-50
const KIRMIZI = [185, 28, 28] // site: text-red-700
const KIRMIZI_ACIK = [254, 242, 242] // site: bg-red-50
const YESIL = [21, 128, 61] // site: text-green-700
const YESIL_ACIK = [240, 253, 244] // site: bg-green-50
const MOR = [107, 33, 168] // site: text-purple-800

function paraStr(n) {
  return `${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`
}

// veri: ekstreHesap.js -> ekstreVerisiGetir()'in döndürdüğü obje.
export async function ekstrePdfOlustur(veri) {
  const jsPDF = await jspdfYukle()
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const sayfaGenisligi = doc.internal.pageSize.getWidth()
  const sayfaYuksekligi = doc.internal.pageSize.getHeight()
  const kenar = 32

  // Türkçe font yüklenemezse (ör. internet kesintisi) PDF'in tamamen
  // patlaması yerine sessizce standart fonta dönüyoruz — o durumda sadece
  // İ/ı/Ş/ş/Ğ/ğ harfleri eskisi gibi bozuk görünür ama PDF yine de gider.
  let font = 'helvetica'
  try {
    await turkceFontHazirla(doc)
    font = 'Roboto'
  } catch (e) {
    console.warn('Türkçe font yüklenemedi, temel fontla devam ediliyor:', e)
  }

  let logoDataUrl = null
  try {
    logoDataUrl = await logoHazirla()
  } catch (e) {
    // logosuz da devam edilebilir
  }

  // Üst başlık şeridi (site: bg-navy başlık + beyaz kutuda logo)
  const basligYuksekligi = 64
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, sayfaGenisligi, basligYuksekligi, 'F')

  let metinX = kenar
  if (logoDataUrl) {
    const kutu = 40
    const kutuY = (basligYuksekligi - kutu) / 2
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(kenar, kutuY, kutu, kutu, 5, 5, 'F')
    try {
      doc.addImage(logoDataUrl, 'PNG', kenar + 4, kutuY + 4, kutu - 8, kutu - 8)
      metinX = kenar + kutu + 14
    } catch (e) {
      // görsel formatı algılanamazsa logosuz devam
    }
  }

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont(font, 'bold')
  doc.text('SAVAŞ AKÇA EĞİTİM', metinX, basligYuksekligi / 2 - 4)
  doc.setFontSize(10)
  doc.setFont(font, 'normal')
  doc.text('AYLIK ÖĞRENCİ EKSTRESİ', metinX, basligYuksekligi / 2 + 12)

  let y = basligYuksekligi + 22
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(11)
  const ayMetni = new Date(veri.seciliAy + '-01').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
  doc.setFont(font, 'bold')
  doc.text('Öğrenci Adı:', kenar, y)
  doc.setFont(font, 'normal')
  doc.text(veri.ogrenciAdi, kenar + 90, y)
  y += 16
  doc.setFont(font, 'bold')
  doc.text('Bilgilendirme Dönemi:', kenar, y)
  doc.setFont(font, 'normal')
  doc.text(ayMetni, kenar + 130, y)
  y += 20

  if (veri.faturaDigerleri.length > 0) {
    doc.setFontSize(9)
    doc.setTextColor(...MOR)
    const isimler = veri.faturaDigerleri.map((o) => o.ad_soyad).join(', ')
    const satir = doc.splitTextToSize(
      `Birleşik ekstre: aşağıdaki tutarlar ${isimler} ile ortak tutuluyor.`,
      sayfaGenisligi - kenar * 2
    )
    doc.text(satir, kenar, y)
    y += satir.length * 11 + 6
    doc.setTextColor(30, 30, 30)
  }

  const cokluOgrenci = veri.faturaDigerleri.length > 0

  // Kalemler tablosu
  doc.autoTable({
    startY: y,
    margin: { left: kenar, right: kenar },
    head: [['Açıklama / Kalem', 'Vade / Durum', 'Bu Ayın Tutarı', 'Geçmiş Borç', 'Toplam Ödenecek']],
    body:
      veri.satirlar.length > 0
        ? veri.satirlar.map((s) => {
            const alacakli = s.fazlaOdeme > 0.01 && s.toplamOdenecek <= 0.01
            return [
              s.label,
              s.durum,
              paraStr(s.buAyTutar),
              s.gecmisBorc > 0 ? paraStr(s.gecmisBorc) : '—',
              alacakli ? `+ ${paraStr(s.fazlaOdeme)}` : paraStr(s.toplamOdenecek),
            ]
          })
        : [[{ content: 'Bu dönem için kayıt bulunamadı.', colSpan: 5, styles: { halign: 'center', textColor: [156, 163, 175] } }]],
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9, font },
    bodyStyles: { fontSize: 9, font },
    didParseCell: (data) => {
      if (data.section !== 'body' || !veri.satirlar[data.row.index]) return
      const satir = veri.satirlar[data.row.index]
      const alacakli = satir.fazlaOdeme > 0.01 && satir.toplamOdenecek <= 0.01
      if (satir.gecmisBorc > 0) {
        data.cell.styles.fillColor = KIRMIZI_ACIK
        data.cell.styles.textColor = KIRMIZI
      } else if (alacakli) {
        data.cell.styles.fillColor = YESIL_ACIK
        data.cell.styles.textColor = YESIL
      }
    },
  })
  y = doc.lastAutoTable.finalY + 14

  // Özet kutuları (site: gri/turuncu/lacivert vurgulu satırlar)
  doc.autoTable({
    startY: y,
    margin: { left: kenar, right: kenar },
    body: [
      ['BU AYKİ TAKSİT VE HARCAMALAR TOPLAMI', paraStr(veri.buAyToplam)],
      ['GEÇMİŞTEN KALAN BORÇ TOPLAMI', paraStr(veri.gecmisBorcToplam)],
      ['BU AY ÖDENMESİ GEREKEN MİKTAR', paraStr(veri.buAyOdenmesiGereken)],
      ['GENEL KALAN BAKİYE (TÜM ZAMANLAR)', paraStr(veri.genelKalanBakiye)],
    ],
    theme: 'plain',
    styles: { fontSize: 10, fontStyle: 'bold', font, cellPadding: { top: 7, bottom: 7, left: 10, right: 10 } },
    columnStyles: { 1: { halign: 'right' } },
    didParseCell: (data) => {
      if (data.row.index === 0) {
        data.cell.styles.fillColor = GRI_ACIK
      } else if (data.row.index === 1) {
        data.cell.styles.fillColor = GRI_ACIK
        if (veri.gecmisBorcToplam > 0) data.cell.styles.textColor = KIRMIZI
      } else if (data.row.index === 2) {
        data.cell.styles.fillColor = ORANGE_ACIK
        data.cell.styles.textColor = ORANGE
        data.cell.styles.fontSize = 11.5
      } else if (data.row.index === 3) {
        data.cell.styles.fillColor = NAVY_ACIK
        data.cell.styles.textColor = NAVY
        data.cell.styles.fontSize = 11.5
      }
    },
  })
  y = doc.lastAutoTable.finalY + 16

  function sayfaKontrol(gerekliYukseklik) {
    if (y + gerekliYukseklik > sayfaYuksekligi - 40) {
      doc.addPage()
      y = 40
    }
  }

  function bolumBasligi(metin) {
    sayfaKontrol(50)
    doc.setFontSize(11)
    doc.setFont(font, 'bold')
    doc.setTextColor(...NAVY)
    doc.text(metin, kenar, y)
    y += 8
    doc.setTextColor(30, 30, 30)
  }

  if (veri.bireBirDersleri.length > 0) {
    bolumBasligi('Bire Bir Ders Dökümü')
    doc.autoTable({
      startY: y,
      margin: { left: kenar, right: kenar },
      head: [['Tarih', 'Saat', 'Öğretmen', ...(cokluOgrenci ? ['Öğrenci'] : []), 'Tutar']],
      body: veri.bireBirDersleri.map((d) => [
        new Date(d.tarih + 'T12:00:00').toLocaleDateString('tr-TR'),
        d.bitisSaat ? `${d.baslangicSaat}–${d.bitisSaat}` : d.baslangicSaat,
        d.ogretmenBransi ? `${d.ogretmenAdi} (${d.ogretmenBransi})` : d.ogretmenAdi,
        ...(cokluOgrenci ? [d.ogrenciAdi] : []),
        paraStr(d.tutar),
      ]),
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9, font },
      bodyStyles: { fontSize: 8.5, font },
      alternateRowStyles: { fillColor: GRI_ACIK },
    })
    y = doc.lastAutoTable.finalY + 16
  }

  if (veri.kantinAlislari.length > 0) {
    bolumBasligi('Kantin Alış Dökümü')
    doc.autoTable({
      startY: y,
      margin: { left: kenar, right: kenar },
      head: [['Tarih', 'Ürün', 'Adet', 'Birim Fiyat', 'Tutar']],
      body: veri.kantinAlislari.map((k) => [
        new Date(k.tarih + 'T12:00:00').toLocaleDateString('tr-TR'),
        k.urunAdi || '—',
        String(k.adet),
        paraStr(k.birimFiyat),
        paraStr(k.tutar),
      ]),
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9, font },
      bodyStyles: { fontSize: 8.5, font },
      alternateRowStyles: { fillColor: GRI_ACIK },
    })
    y = doc.lastAutoTable.finalY + 16
  }

  bolumBasligi(`Ödeme Geçmişi (${veri.odemeler.length} Kayıt)`)
  const odemeSutunSayisi = 3 + (cokluOgrenci ? 1 : 0)
  const toplamOdenen = veri.odemeler.reduce((t, o) => t + Number(o.tutar), 0)
  doc.autoTable({
    startY: y,
    margin: { left: kenar, right: kenar },
    head: [['Tarih', ...(cokluOgrenci ? ['Öğrenci'] : []), 'Kalem', 'Tutar']],
    body:
      veri.odemeler.length > 0
        ? veri.odemeler.map((o) => [
            new Date(o.tarih).toLocaleDateString('tr-TR'),
            ...(cokluOgrenci ? [o.ogrenciler?.ad_soyad || '—'] : []),
            o.kalem || '—',
            paraStr(o.tutar),
          ])
        : [[{ content: 'Ödeme kaydı yok.', colSpan: odemeSutunSayisi, styles: { halign: 'center', textColor: [156, 163, 175] } }]],
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9, font },
    bodyStyles: { fontSize: 8.5, font },
    alternateRowStyles: { fillColor: GRI_ACIK },
    foot:
      veri.odemeler.length > 0
        ? [[{ content: 'TOPLAM ÖDENEN', colSpan: odemeSutunSayisi - 1, styles: { halign: 'right', fontStyle: 'bold' } }, paraStr(toplamOdenen)]]
        : undefined,
    footStyles: { fillColor: GRI_ACIK, textColor: 30, fontStyle: 'bold', font },
  })

  return doc.output('blob')
}

// ============================================================================
// MAKBUZ PDF — Muhasebe.jsx'teki "Makbuz Yazdır" (MakbuzGunluk.jsx sayfasının
// bastığı kart) ile AYNI gün-birleştirme mantığıyla, o günün TÜM kalemlerini
// TEK bir gerçek PDF dosyasında toplar — "WhatsApp'tan Gönder" butonu bunu
// kullanır (Toplu Ekstre'deki "PDF ile Gönder" ile birebir aynı desen: PDF
// üretilir, Storage'a yüklenir, kısa link ile WhatsApp mesajına eklenir).
// veli: { ogrenciAdi, tarihMetni, odemeler: [{kalem, tutar, ogrenci_id}],
//         toplam, ogrenciSutunuGoster, adBul(ogrenciId) }
// ============================================================================
export async function makbuzPdfOlustur({ ogrenciAdi, tarihMetni, odemeler, toplam, ogrenciSutunuGoster, adBul }) {
  const jsPDF = await jspdfYukle()
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const sayfaGenisligi = doc.internal.pageSize.getWidth()
  const kenar = 32

  let font = 'helvetica'
  try {
    await turkceFontHazirla(doc)
    font = 'Roboto'
  } catch (e) {
    console.warn('Türkçe font yüklenemedi, temel fontla devam ediliyor:', e)
  }

  let logoDataUrl = null
  try {
    logoDataUrl = await logoHazirla()
  } catch (e) {
    // logosuz da devam edilebilir
  }

  const basligYuksekligi = 64
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, sayfaGenisligi, basligYuksekligi, 'F')

  let metinX = kenar
  if (logoDataUrl) {
    const kutu = 40
    const kutuY = (basligYuksekligi - kutu) / 2
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(kenar, kutuY, kutu, kutu, 5, 5, 'F')
    try {
      doc.addImage(logoDataUrl, 'PNG', kenar + 4, kutuY + 4, kutu - 8, kutu - 8)
      metinX = kenar + kutu + 14
    } catch (e) {
      // görsel formatı algılanamazsa logosuz devam
    }
  }

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont(font, 'bold')
  doc.text('SAVAŞ AKÇA EĞİTİM', metinX, basligYuksekligi / 2 - 4)
  doc.setFontSize(10)
  doc.setFont(font, 'normal')
  doc.text('TAHSİLAT MAKBUZU', metinX, basligYuksekligi / 2 + 12)

  let y = basligYuksekligi + 22
  // "Nüsha: ÖĞRENCİ KOPYASI" — MakbuzGunluk.jsx'teki (yazdırılan) kartla
  // BİREBİR AYNI görünüm olsun diye; WhatsApp'a giden bu PDF her zaman
  // öğrenci kopyası — kurum kopyası (fiziksel dosyalama içindir) burada yok.
  doc.setFontSize(9)
  doc.setFont(font, 'normal')
  doc.setTextColor(156, 163, 175) // site: text-gray-400
  doc.text('Nüsha: ÖĞRENCİ KOPYASI', kenar, y)
  y += 14

  doc.autoTable({
    startY: y,
    margin: { left: kenar, right: kenar },
    body: [
      ['Öğrenci', ogrenciAdi],
      ['Tarih', tarihMetni],
    ],
    theme: 'plain',
    styles: { fontSize: 10, font, cellPadding: { top: 6, bottom: 6, left: 8, right: 8 } },
    columnStyles: { 0: { fontStyle: 'bold', textColor: [75, 85, 99], cellWidth: 90 } }, // site: text-gray-600
    didParseCell: (data) => {
      if (data.row.index === 0) {
        data.cell.styles.fillColor = GRI_ACIK // site: bg-gray-50
        if (data.column.index === 1) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.textColor = NAVY // site: font-bold text-navy
        }
      } else {
        data.cell.styles.fillColor = 255
      }
    },
  })
  y = doc.lastAutoTable.finalY + 10

  const sutunSayisi = 1 + (ogrenciSutunuGoster ? 1 : 0)
  doc.autoTable({
    startY: y,
    margin: { left: kenar, right: kenar },
    head: [['Kalem', ...(ogrenciSutunuGoster ? ['Öğrenci'] : []), 'Tutar']],
    body: odemeler.map((o) => [
      o.kalem || '—',
      ...(ogrenciSutunuGoster ? [adBul ? adBul(o.ogrenci_id) : '—'] : []),
      paraStr(o.tutar),
    ]),
    foot: [
      [
        { content: 'TOPLAM', colSpan: sutunSayisi, styles: { halign: 'right', fontStyle: 'bold' } },
        paraStr(toplam),
      ],
    ],
    headStyles: { fillColor: GRI_ACIK, textColor: [75, 85, 99], fontSize: 9, font, fontStyle: 'bold' }, // site: bg-gray-50 text-gray-600
    bodyStyles: { fontSize: 9, font },
    footStyles: { fillColor: ORANGE_ACIK, textColor: ORANGE, fontStyle: 'bold', font, fontSize: 10 }, // site: bg-orange/10 text-orange
  })
  y = doc.lastAutoTable.finalY + 16

  try {
    doc.setFontSize(9)
    doc.setFont(font, 'normal')
    doc.setTextColor(75, 85, 99) // site: text-gray-600
    const yazi = doc.splitTextToSize(tutarYaziyla(toplam), sayfaGenisligi - kenar * 2)
    doc.text(yazi, kenar, y)
    y += yazi.length * 11 + 14
  } catch (e) {
    // yazıyla tutar üretilemezse (beklenmeyen bir format hatası) sessizce atla
    y += 14
  }

  // "Ad Soyad / İmza" — site: text-right text-sm text-gray-500 mt-3
  doc.setFontSize(9)
  doc.setFont(font, 'normal')
  doc.setTextColor(107, 114, 128) // site: text-gray-500
  doc.text('Ad Soyad / İmza', sayfaGenisligi - kenar, y, { align: 'right' })

  return doc.output('blob')
}
