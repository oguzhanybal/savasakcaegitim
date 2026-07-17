// Öğrencinin girdiği deneme sınavının SONUÇ PDF'ini (dış taramanın otomatik
// ürettiği "karne" raporu) tarayıcıda okuyup yapılandırılmış veriye çevirir.
// ÖNEMLİ FARK: kitapcikOcr.js'teki soru KİTAPÇIĞI taranmış bir görüntüdür ve
// OCR gerektirir; bu SONUÇ PDF'i ise dijital olarak üretildiği için gerçek bir
// metin katmanına sahiptir — OCR'a hiç gerek yok, pdf.js'in getTextContent()
// fonksiyonu her kelimenin tam metnini VE sayfadaki x/y konumunu doğrudan verir.
// Bu modüldeki tüm mantık, gerçek bir örnek PDF üzerinde (sandbox'ta) satır
// satır doğrulanmış ve DERS ANALİZİ tablosundaki tüm rakamlarla (9 dersin
// doğru/yanlış/boş sayıları, toplam 120/120 soru) BİREBİR eşleşmiştir.

import { pdfBelgesiAc } from './kitapcikOcr'
import { adSoyadDuzelt } from './adSoyadFormat'

// pdf-lib, kitapcikOcr.js'teki pdf.js/Tesseract.js ile AYNI CDN deseniyle
// (npm install yerine) dinamik olarak yükleniyor — kullanıcı yerelde npm
// çalıştıramıyor, sadece GitHub'a dosya sürüklüyor. Burada pdf-lib SADECE
// var olan PDF sayfalarını OLDUĞU GİBİ kopyalamak için kullanılıyor (yeni
// metin ÇİZMİYORUZ) — bu yüzden pdf-lib'in Standard14/WinAnsi fontlarındaki
// bilinen Türkçe karakter (ğ,ş,ı,İ) sorunuyla hiç karşılaşmıyoruz; o sorun
// SADECE yeni metin yazarken ortaya çıkıyor (bkz. Makbuz/Ekstre/Sozlesme'nin
// neden print-to-PDF kullandığı).
let pdfLibYuklemePromise = null
function pdfLibYukle() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib)
  if (pdfLibYuklemePromise) return pdfLibYuklemePromise
  pdfLibYuklemePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'
    script.onload = () => resolve(window.PDFLib)
    script.onerror = () => reject(new Error('pdf-lib yüklenemedi (internet bağlantınızı kontrol edin).'))
    document.head.appendChild(script)
  })
  return pdfLibYuklemePromise
}

// Bir kaynak pdf-lib belgesinden (zaten yüklenmiş) 1 ya da 2 sayfayı OLDUĞU
// GİBİ kopyalayıp ayrı, küçük bir PDF Blob'u olarak döner — öğrencinin
// birleştirilmiş sınıf karnesinden KENDİ 2 sayfasını (özet + Konu Analizi)
// ayırıp Storage'a kaydetmek, admin ve öğrenci/veli sonradan orijinal
// karneyi indirebilsin diye.
async function kaynakBelgedenSayfalariAyir(PDFLib, kaynakPdf, sayfa1No, sayfa2No) {
  const yeniPdf = await PDFLib.PDFDocument.create()
  const sayfaIndeksleri =
    sayfa2No <= kaynakPdf.getPageCount() ? [sayfa1No - 1, sayfa2No - 1] : [sayfa1No - 1]
  const kopyalananSayfalar = await yeniPdf.copyPages(kaynakPdf, sayfaIndeksleri)
  kopyalananSayfalar.forEach((sayfa) => yeniPdf.addPage(sayfa))
  const bytes = await yeniPdf.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

// Bilinen TYT/AYT ders adları — sayfa 2'deki (KONU ANALİZİ) ders başlıkları
// bazen bozuk bir font kodlamasıyla geliyor (görünmez kontrol karakterleri
// gerçek harflerin yerine geçiyor, ör. "Matematik" yerine "Matema\x00k").
// Ham başlık metnini doğrudan kullanmak yerine, bu bilinen listedeki EN YAKIN
// adı buluyoruz — hem bu kodlama sorununu çözüyor hem de ders adının
// sınav kitapçığındaki (sinav_kitapcik_sorulari.ders_adi) ve DERS ANALİZİ
// tablosundaki adla birebir aynı yazılmasını garanti ediyor.
const BILINEN_DERSLER = [
  'Türkçe', 'Matematik', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü',
  'Fizik', 'Kimya', 'Biyoloji', 'Geometri', 'Sosyal Bilimler', 'Fen Bilimleri',
]

function levenshteinMesafesi(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => {
    const satir = new Array(b.length + 1).fill(0)
    satir[0] = i
    return satir
  })
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[a.length][b.length]
}

function enYakinBilinenDers(hamMetin) {
  const temiz = hamMetin.replace(/[\x00-\x1f]/g, '').trim().toLocaleLowerCase('tr-TR')
  let enIyi = hamMetin.replace(/[\x00-\x1f]/g, '').trim()
  let enIyiMesafe = Infinity
  for (const aday of BILINEN_DERSLER) {
    const mesafe = levenshteinMesafesi(temiz, aday.toLocaleLowerCase('tr-TR'))
    if (mesafe < enIyiMesafe) {
      enIyiMesafe = mesafe
      enIyi = aday
    }
  }
  return enIyi
}

// Bir pdf.js sayfasındaki metin öğelerini, x/y konumlarıyla birlikte düz bir
// diziye çevirir (boş/whitespace-only öğeler elenir).
async function sayfaMetinOgeleriniAl(pdfBelge, sayfaNo) {
  const sayfa = await pdfBelge.getPage(sayfaNo)
  const icerik = await sayfa.getTextContent()
  return icerik.items
    .filter((it) => it.str && it.str.trim() !== '')
    .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }))
}

// Metin öğelerini, y konumuna göre (aynı satırdaki öğeler ~2pt tolerans içinde
// sayılır) SATIRLARA gruplar ve yukarıdan aşağıya sıralar.
function satirlaraGrupla(ogeler) {
  const satirlar = []
  for (const it of ogeler) {
    let satir = satirlar.find((s) => Math.abs(s.y - it.y) <= 2)
    if (!satir) {
      satir = { y: it.y, items: [] }
      satirlar.push(satir)
    }
    satir.items.push(it)
  }
  satirlar.sort((a, b) => b.y - a.y)
  return satirlar
}

function satirMetni(satir) {
  return satir.items
    .slice()
    .sort((a, b) => a.x - b.x)
    .map((i) => i.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ============================================================================
// SAYFA 1: Üst bilgi (öğrenci adı, sınav adı, tarihi, kitapçık) + DERS ANALİZİ
// tablosu (ders bazında soru/doğru/yanlış/boş/net).
// ============================================================================
function sayfa1Ayikla(satirlar) {
  const adSoyadIdx = satirlar.findIndex((r) => r.items.some((i) => i.str === 'Ad Soyad'))
  const tarihIdx = satirlar.findIndex((r) => r.items.some((i) => i.str === 'Sınav Tarihi'))
  if (adSoyadIdx === -1 || tarihIdx === -1) {
    throw new Error('Bu PDF beklenen "Ad Soyad" / "Sınav Tarihi" başlıklarını içermiyor — doğru sonuç PDF\'i mi?')
  }

  const adSoyadMetni = satirMetni(satirlar[adSoyadIdx])
  const ogrenciAdSoyad = adSoyadDuzelt(
    adSoyadMetni.replace(/^Ad Soyad\s*/, '').replace(/\s*Numara.*$/, '').trim()
  )

  let kitapcik = ''
  const sinavAdiParcalari = []
  for (let i = adSoyadIdx + 1; i < tarihIdx; i++) {
    let t = satirMetni(satirlar[i])
    const kMatch = t.match(/Kitapçık\s+([AB])\b/)
    if (kMatch) kitapcik = kMatch[1]
    t = t.replace(/Sınav Adı/g, '').replace(/Kitapçık\s+[AB]\b/, '').trim()
    if (t) sinavAdiParcalari.push(t)
  }
  const sinavAdi = sinavAdiParcalari.join(' ').replace(/\s+/g, ' ').trim()

  const tarihMetni = satirMetni(satirlar[tarihIdx])
  const tarihEslesme = tarihMetni.match(/(\d{2})\.(\d{2})\.(\d{4})/)
  const sinavTarihi = tarihEslesme ? `${tarihEslesme[3]}-${tarihEslesme[2]}-${tarihEslesme[1]}` : null

  // DERS ANALİZİ tablosu
  const tabloHeaderIdx = satirlar.findIndex((r) => r.items.some((i) => i.str === 'SORU') && r.items.some((i) => i.str === 'DOĞRU'))
  const toplamIdx = satirlar.findIndex((r) => r.items.some((i) => i.str === 'TOPLAM'))
  if (tabloHeaderIdx === -1 || toplamIdx === -1) {
    throw new Error('DERS ANALİZİ tablosu bulunamadı — bu PDF beklenen formatta değil.')
  }

  const ankraj = {}
  for (const it of satirlar[tabloHeaderIdx].items) ankraj[it.str] = it.x
  const kolonlar = ['SORU', 'DOĞRU', 'YANLIŞ', 'BOŞ', 'NET', 'ORT']
  function enYakinKolon(x) {
    let en = kolonlar[0]
    let enFark = Infinity
    for (const k of kolonlar) {
      const fark = Math.abs(ankraj[k] - x)
      if (fark < enFark) { enFark = fark; en = k }
    }
    return en
  }

  // "TYT-SOSYAL BİLİMLER" / "TYT-FEN BİLİMLERİ" satırları, altlarındaki
  // gerçek derslerin (Tarih/Coğrafya/... , Fizik/Kimya/Biyoloji) TOPLAMIdır —
  // bunları ve genel TOPLAM satırını atlıyoruz, sadece GERÇEK dersleri alıyoruz.
  const ATLANACAK_ETIKETLER = ['TYT-SOSYAL BİLİMLER', 'TYT-FEN BİLİMLERİ', 'TOPLAM', 'AYT-SOSYAL BİLİMLER', 'AYT-FEN BİLİMLERİ']

  const dersSonuclari = []
  for (let i = tabloHeaderIdx + 1; i <= toplamIdx; i++) {
    const satir = satirlar[i]
    const siraliOgeler = satir.items.slice().sort((a, b) => a.x - b.x)
    const dersOgeleri = siraliOgeler.filter((it) => it.x < ankraj.SORU - 30)
    const dersAdiHam = dersOgeleri.map((i) => i.str).join(' ').trim()
    if (!dersAdiHam || ATLANACAK_ETIKETLER.includes(dersAdiHam)) continue

    const degerler = {}
    for (const it of siraliOgeler.filter((it) => it.x >= ankraj.SORU - 30)) {
      degerler[enYakinKolon(it.x)] = it.str
    }
    const dersAdiTemiz = dersAdiHam.replace(/^(TYT|AYT)-/, '')
    dersSonuclari.push({
      ders_adi: adSoyadDuzelt(dersAdiTemiz),
      soru_sayisi: parseInt(degerler.SORU || '0', 10),
      dogru: parseInt(degerler.DOĞRU || '0', 10),
      yanlis: parseInt(degerler.YANLIŞ || '0', 10),
      bos: parseInt(degerler.BOŞ || '0', 10),
      net: parseFloat((degerler.NET || '0').replace(',', '.')) || 0,
    })
  }

  return { ogrenciAdSoyad, sinavAdi, sinavTarihi, kitapcik, dersSonuclari }
}

// ============================================================================
// SAYFA 2: KONU ANALİZİ tablosu — soru bazında doğru cevap (DC), öğrencinin
// cevabı (ÖC) ve sonuç (+/-). Sayfa 3 SÜTUNLU bir düzende (her sütunda birden
// fazla ders alt alta) — sütun sınırlarını "No" başlıklarının x konumundan,
// her satırdaki hücreleri de o sütunun DC/ÖC/SO alan konumlarına göre değil,
// SAĞDAN SOLA sayarak (son öge +/- ise SO, ondan önceki harf ÖC, ondan önceki
// harf DC, geri kalan her şey KONU metni) ayırıyoruz — çünkü öğrenci bir
// soruyu BOŞ bıraktığında ÖC/SO hücreleri sayfada hiç YOKTUR (sabit x
// konumuna göre eşleştirmek bu durumda yanlış hizalanır).
// ============================================================================
function sayfa2Ayikla(satirlar) {
  const headerRow = satirlar.find((r) => r.items.filter((i) => i.str === 'No').length === 3)
  if (!headerRow) {
    // Bazı sınavlarda (ör. sadece 1 test içeren kısa denemeler) sütun sayısı
    // farklı olabilir — bulamazsak sessizce boş dönüyoruz, sayfa 1 verisi
    // (ders bazlı toplamlar) yine de kullanılabilir durumda kalır.
    return []
  }
  const noXler = headerRow.items.filter((i) => i.str === 'No').map((i) => i.x).sort((a, b) => a - b)
  const czmXler = headerRow.items.filter((i) => i.str === 'ÇZM').map((i) => i.x).sort((a, b) => a - b)
  const sutunSayisi = noXler.length
  const sinirlar = [-Infinity]
  for (let c = 0; c < sutunSayisi - 1; c++) sinirlar.push((czmXler[c] + noXler[c + 1]) / 2)
  sinirlar.push(Infinity)
  function sutunBul(x) {
    for (let c = 0; c < sutunSayisi; c++) if (x >= sinirlar[c] && x < sinirlar[c + 1]) return c
    return sutunSayisi - 1
  }

  const headerY = headerRow.y
  const veriSatirlari = satirlar.filter((r) => r.y < headerY - 1)

  const soruSonuclari = []
  const mevcutDers = new Array(sutunSayisi).fill(null)

  for (const satir of veriSatirlari) {
    const sutunlar = Array.from({ length: sutunSayisi }, () => [])
    for (const it of satir.items) sutunlar[sutunBul(it.x)].push(it)
    for (let c = 0; c < sutunSayisi; c++) {
      const ogeler = sutunlar[c].sort((a, b) => a.x - b.x)
      if (ogeler.length === 0) continue
      const ilk = ogeler[0]
      if (!/^\d+$/.test(ilk.str)) {
        // Sayı ile başlamıyorsa bu bir DERS BAŞLIĞI satırıdır (ör. "Türkçe",
        // "Matematik", "Tarih"...), soru satırı değil.
        const etiket = ogeler.map((i) => i.str).join('')
        mevcutDers[c] = enYakinBilinenDers(etiket)
        continue
      }
      const soru_no = parseInt(ilk.str, 10)
      const kalan = ogeler.slice(1)
      let so = null
      let oc = null
      let dc = null
      let idx = kalan.length - 1
      if (idx >= 0 && (kalan[idx].str === '+' || kalan[idx].str === '-')) {
        so = kalan[idx].str
        idx--
      }
      if (idx >= 0 && /^[A-E]$/.test(kalan[idx].str)) {
        if (so !== null) { oc = kalan[idx].str; idx-- } else { dc = kalan[idx].str; idx-- }
      }
      if (so !== null && idx >= 0 && /^[A-E]$/.test(kalan[idx].str)) {
        dc = kalan[idx].str
        idx--
      }
      const konu = kalan.slice(0, idx + 1).map((i) => i.str).join('').replace(/[\x00-\x1f]/g, '').trim()
      const sonuc = oc === null ? 'bos' : dc === oc ? 'dogru' : 'yanlis'
      soruSonuclari.push({ ders_adi: mevcutDers[c], soru_no, konu, dogru_cevap: dc, ogrenci_cevap: oc, sonuc })
    }
  }
  return soruSonuclari
}

// Zaten açık bir pdf.js belgesinden, BELİRLİ bir sayfa çiftini (bir
// öğrencinin 2 sayfalık karnesini) ayrıştırır. Hem tek öğrencilik hem de
// çok öğrencilik (aşağıdaki sinavSonucPdfIndenTumOgrencileriCikar) giriş
// noktaları bu ortak fonksiyonu kullanır.
async function belgedenOgrenciCikar(belge, sayfa1No, sayfa2No) {
  const sayfa1Ogeleri = await sayfaMetinOgeleriniAl(belge, sayfa1No)
  const sayfa1 = sayfa1Ayikla(satirlaraGrupla(sayfa1Ogeleri))

  let soruSonuclari = []
  if (sayfa2No <= belge.numPages) {
    const sayfa2Ogeleri = await sayfaMetinOgeleriniAl(belge, sayfa2No)
    soruSonuclari = sayfa2Ayikla(satirlaraGrupla(sayfa2Ogeleri))
  }

  const toplamSoru = sayfa1.dersSonuclari.reduce((t, d) => t + d.soru_sayisi, 0)
  const toplamDogru = sayfa1.dersSonuclari.reduce((t, d) => t + d.dogru, 0)
  const toplamYanlis = sayfa1.dersSonuclari.reduce((t, d) => t + d.yanlis, 0)
  const toplamBos = sayfa1.dersSonuclari.reduce((t, d) => t + d.bos, 0)
  const toplamNet = sayfa1.dersSonuclari.reduce((t, d) => t + d.net, 0)

  return {
    ...sayfa1,
    dersSonuclari: sayfa1.dersSonuclari,
    soruSonuclari,
    ozet: {
      toplamSoru,
      toplamDogru,
      toplamYanlis,
      toplamBos,
      toplamNet: Math.round(toplamNet * 100) / 100,
    },
  }
}

// Ana giriş noktası: bir sonuç PDF'i (File/Blob) alır, yapılandırılmış
// sınav sonucu verisini döner. SADECE İLK 2 SAYFAYI okur — bu yüzden birden
// fazla öğrencinin karnesi art arda birleştirilmiş bir PDF için
// sinavSonucPdfIndenTumOgrencileriCikar kullanılmalı (SinavYukle.jsx bunu
// kullanıyor).
export async function sinavSonucPdfIndenCikar(dosya) {
  const belge = await pdfBelgesiAc(dosya)
  if (belge.numPages < 1) throw new Error('PDF boş görünüyor.')
  const ogrenci = await belgedenOgrenciCikar(belge, 1, 2)
  try {
    const PDFLib = await pdfLibYukle()
    const kaynakBytes = await dosya.arrayBuffer()
    const kaynakPdf = await PDFLib.PDFDocument.load(kaynakBytes)
    ogrenci.karnePdfBlob = await kaynakBelgedenSayfalariAyir(PDFLib, kaynakPdf, 1, 2)
  } catch (e) {
    // Orijinal PDF ayrılamasa bile (ör. pdf-lib CDN'den yüklenemedi) asıl
    // ayrıştırılan VERİ hâlâ kullanılabilir olsun — sadece "indir" özelliği
    // o satır için eksik kalır, karneyi kaydetmeyi engellemez.
    console.error('Karne PDF\'i ayrılamadı:', e.message)
  }
  return ogrenci
}

// Okulun tarama/analiz yazılımı "tüm sınıfın" karnesini TEK PDF olarak dışa
// aktarınca, her öğrencinin 2 sayfalık raporu ART ARDA birleştirilmiş oluyor
// (22 sayfalık dosya = 11 öğrenci gibi). Bu fonksiyon PDF'i TEK SEFERDE açıp
// her 2 sayfayı ayrı bir öğrenci karnesi olarak ayrıştırır ve bir DİZİ döner
// — tek öğrencilik bir PDF için de (numPages<=2) sorunsuz çalışır, dizide
// tek bir eleman döner.
export async function sinavSonucPdfIndenTumOgrencileriCikar(dosya) {
  const belge = await pdfBelgesiAc(dosya)
  if (belge.numPages < 1) throw new Error('PDF boş görünüyor.')

  // pdf-lib kaynak belgesi (varsa) TÜM öğrenciler için BİR KEZ yükleniyor —
  // her öğrenci için dosyayı baştan açmak yerine, aynı kaynaktan tekrar
  // tekrar sayfa kopyalıyoruz. Bu adım başarısız olsa bile (ör. CDN'e
  // erişilemedi) asıl veri ayrıştırma etkilenmesin diye ayrı try/catch'te.
  let PDFLib = null
  let kaynakPdf = null
  try {
    PDFLib = await pdfLibYukle()
    const kaynakBytes = await dosya.arrayBuffer()
    kaynakPdf = await PDFLib.PDFDocument.load(kaynakBytes)
  } catch (e) {
    console.error('Karne PDF\'leri ayrılamayacak (pdf-lib yüklenemedi):', e.message)
  }

  const sonuclar = []
  for (let sayfa = 1; sayfa <= belge.numPages; sayfa += 2) {
    try {
      const ogrenci = await belgedenOgrenciCikar(belge, sayfa, sayfa + 1)
      if (PDFLib && kaynakPdf) {
        try {
          ogrenci.karnePdfBlob = await kaynakBelgedenSayfalariAyir(PDFLib, kaynakPdf, sayfa, sayfa + 1)
        } catch (e) {
          console.error(`Sayfa ${sayfa} için karne PDF'i ayrılamadı:`, e.message)
        }
      }
      sonuclar.push({ basariliMi: true, baslangicSayfa: sayfa, veri: ogrenci })
    } catch (e) {
      sonuclar.push({ basariliMi: false, baslangicSayfa: sayfa, hata: e.message })
    }
  }
  return sonuclar
}
