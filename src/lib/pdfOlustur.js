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

const NAVY = [17, 34, 64]

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

  // Üst başlık şeridi
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, sayfaGenisligi, 60, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('SAVAŞ AKÇA EĞİTİM', kenar, 30)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('AYLIK ÖĞRENCİ EKSTRESİ', kenar, 46)

  let y = 82
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(11)
  const ayMetni = new Date(veri.seciliAy + '-01').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
  doc.setFont('helvetica', 'bold')
  doc.text('Öğrenci Adı:', kenar, y)
  doc.setFont('helvetica', 'normal')
  doc.text(veri.ogrenciAdi, kenar + 90, y)
  y += 16
  doc.setFont('helvetica', 'bold')
  doc.text('Bilgilendirme Dönemi:', kenar, y)
  doc.setFont('helvetica', 'normal')
  doc.text(ayMetni, kenar + 130, y)
  y += 20

  if (veri.faturaDigerleri.length > 0) {
    doc.setFontSize(9)
    doc.setTextColor(126, 34, 206)
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
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    didParseCell: (data) => {
      if (data.section !== 'body' || !veri.satirlar[data.row.index]) return
      const satir = veri.satirlar[data.row.index]
      if (satir.gecmisBorc > 0) data.cell.styles.fillColor = [254, 242, 242]
      else if (satir.fazlaOdeme > 0.01 && satir.toplamOdenecek <= 0.01) data.cell.styles.fillColor = [240, 253, 244]
    },
  })
  y = doc.lastAutoTable.finalY + 14

  // Özet kutuları
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
    styles: { fontSize: 10, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
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
    doc.setFont('helvetica', 'bold')
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
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8.5 },
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
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8.5 },
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
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    foot:
      veri.odemeler.length > 0
        ? [[{ content: 'TOPLAM ÖDENEN', colSpan: odemeSutunSayisi - 1, styles: { halign: 'right', fontStyle: 'bold' } }, paraStr(toplamOdenen)]]
        : undefined,
    footStyles: { fillColor: [243, 244, 246], textColor: 30, fontStyle: 'bold' },
  })

  return doc.output('blob')
}
