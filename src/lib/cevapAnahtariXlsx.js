// "Cevap Anahtarı" (.xlsx) dosyasını — A ve B kitapçıklarının soru numarası
// eşleştirmesini (hangi sorunun A'da kaçıncı, B'de kaçıncı soru olduğunu) ve
// doğru cevap harflerini içeren Excel dosyasını — tarayıcıda okuyup
// yapılandırılmış veriye çevirir.
//
// NEDEN BU DOSYA VAR: SinavKitapciklari.jsx'te admin normalde HER kitapçığı
// (A ve B) ayrı ayrı tarayıp (OCR ya da elle işaretleyip) soru haritasını
// çıkarması gerekiyordu. Kullanıcı isteğiyle eklendi: admin SADECE bir
// kitapçığı (ör. B) tarayıp, elindeki yayınevi cevap anahtarını da
// yüklediğinde, diğer kitapçığın (A) soru haritası OCR'sız, bu dosyadaki
// eşleştirmeden OTOMATİK türetilsin — bkz. SinavKitapciklari.jsx'teki
// digerKitapcigiVarsaUret/digerKitapcigiSorulariniTuret.
//
// NOT: A ve B kitapçıklarında şıkların (A-E) dizilişi AYNI — sadece
// SORULARIN YERİ (hangi soru kaçıncı sırada basıldığı) karışıyor. Bu yüzden
// türetilen kitapçığın görseli doğrudan KAYNAK kitapçığın PDF'inden
// kesiliyor, ek bir uyarıya/şık dönüşümüne gerek yok.
//
// BEKLENEN FORMAT: en az 1 sayfa (sayfa adı önemli değil — "K1"/"K2" gibi
// farklı sayfalarda ya da tek sayfada art arda da olabilir), başlık
// satırında (ilk dolu satır) şu sütun adları bulunmalı (sütun SIRASI önemli
// değil, isimle aranıyor, büyük/küçük harf ve boşluk duyarsız):
//   - "Kitapcık türü" / "Kitapçık türü"  → o satırın A mı B mi olduğu
//   - "Soru no"                          → kitapçıktaki GERÇEK/kümülatif soru no
//   - "Ders"                             → ders adı
//   - "Ders soru numarasi" (opsiyonel)   → dersin kendi içindeki soru no
//   - "B karşılığı"                      → DİĞER kitapçıktaki karşılık gelen soru no
//   - "Cevap" (opsiyonel)                → doğru cevap harfi
// Gerçek bir Özdebir/benzeri yayınevi cevap anahtarı xlsx'inde bu sütunlar
// birebir bu adlarla geliyor (sandbox'ta örnek dosyayla doğrulandı).

let xlsxYuklemePromise = null
function xlsxYukle() {
  if (window.XLSX) return Promise.resolve(window.XLSX)
  if (xlsxYuklemePromise) return xlsxYuklemePromise
  xlsxYuklemePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
    script.onload = () => resolve(window.XLSX)
    script.onerror = () => reject(new Error('Excel okuma kütüphanesi yüklenemedi (internet bağlantınızı kontrol edin).'))
    document.head.appendChild(script)
  })
  return xlsxYuklemePromise
}

function normalizeBaslik(s) {
  return String(s ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim()
}

function sutunBul(baslikSatiri, adaylar) {
  const hedefler = adaylar.map(normalizeBaslik)
  for (let i = 0; i < baslikSatiri.length; i++) {
    if (hedefler.includes(normalizeBaslik(baslikSatiri[i]))) return i
  }
  return -1
}

// Dosyayı okuyup { A: [...satir], B: [...satir] } döner. Her satır:
// { soru_no, ders_adi, ders_soru_no, karsilik_soru_no, cevap }
export async function cevapAnahtariXlsxOku(dosya) {
  const XLSX = await xlsxYukle()
  const arrayBuffer = await dosya.arrayBuffer()
  const wb = XLSX.read(arrayBuffer, { type: 'array' })

  const sonuc = { A: [], B: [] }
  for (const sayfaAdi of wb.SheetNames) {
    const sayfa = wb.Sheets[sayfaAdi]
    const satirlar = XLSX.utils.sheet_to_json(sayfa, { header: 1, raw: true, defval: null })
    if (satirlar.length < 2) continue
    const baslik = satirlar[0] || []
    const iKitapcik = sutunBul(baslik, ['Kitapcık türü', 'Kitapçık türü', 'Kitapcik turu'])
    const iSoruNo = sutunBul(baslik, ['Soru no'])
    const iDers = sutunBul(baslik, ['Ders'])
    const iDersSoruNo = sutunBul(baslik, ['Ders soru numarasi', 'Ders soru numarası'])
    const iKarsilik = sutunBul(baslik, ['B karşılığı', 'B karsiligi'])
    const iCevap = sutunBul(baslik, ['Cevap'])
    if (iKitapcik === -1 || iSoruNo === -1 || iDers === -1) continue // bu sayfa beklenen formatta değil, atla

    for (let r = 1; r < satirlar.length; r++) {
      const satir = satirlar[r]
      if (!satir || satir[iKitapcik] == null || satir[iSoruNo] == null) continue
      const harf = String(satir[iKitapcik]).trim().toUpperCase()
      if (harf !== 'A' && harf !== 'B') continue
      const dersAdiHam = satir[iDers] != null ? String(satir[iDers]).trim() : ''
      if (!dersAdiHam) continue
      sonuc[harf].push({
        soru_no: Number(satir[iSoruNo]),
        ders_adi: dersAdiHam,
        ders_soru_no: iDersSoruNo !== -1 && satir[iDersSoruNo] != null ? Number(satir[iDersSoruNo]) : null,
        karsilik_soru_no: iKarsilik !== -1 && satir[iKarsilik] != null ? Number(satir[iKarsilik]) : null,
        cevap: iCevap !== -1 && satir[iCevap] != null ? String(satir[iCevap]).trim().toUpperCase() : null,
      })
    }
  }

  if (sonuc.A.length === 0 && sonuc.B.length === 0) {
    throw new Error(
      'Bu dosyada beklenen sütunlar bulunamadı. "Kitapcık türü", "Soru no", "Ders" ve "B karşılığı" sütunlarını içeren bir cevap anahtarı Excel dosyası olmalı.'
    )
  }
  return sonuc
}

// taranmisSorular: GERÇEKTEN taranmış/işaretlenmiş kitapçığın (ör. B)
// sinav_kitapcik_sorulari satırları — her biri { ders_adi, soru_no, sayfa_no,
// x, y, genislik, yukseklik, parca_sayfa_no, parca_x, parca_y,
// parca_genislik, parca_yukseklik }.
// digerKitapcikSatirlari: cevap anahtarının DİĞER (taranmayan) harfe ait
// satırları — her biri { soru_no, ders_adi, karsilik_soru_no } (yukarıdaki
// cevapAnahtariXlsxOku'nun döndürdüğü biçimle aynı, cevap alanı gerekmiyor).
//
// Döner: { turetilenler, eslesmeyenler }
//   turetilenler: digerHarf için oluşturulacak sinav_kitapcik_sorulari
//     satırları (kitapcik_id HENÜZ yok, çağıran ekliyor) — ders_adi ve
//     koordinatlar KAYNAK (taranmış) kitapçıktan birebir kopyalanıyor, sadece
//     soru_no diğer kitapçığın KENDİ numarasına ayarlanıyor.
//   eslesmeyenler: cevap anahtarında karşılığı bulunamayan (ör. kaynak
//     kitapçıkta iptal edilmiş/taranmamış) sorular.
// NOT (bug düzeltmesi): soru_no TEK BAŞINA kitapçık genelinde BENZERSİZ
// DEĞİL -- her ders kendi içinde ayrı numaralanıyor (ör. Türkçe 1-40 VE
// Matematik 1-30 VE Fizik 1-7 aynı anda var, hepsi "1"den başlıyor). Eşleşme
// anahtarı SADECE soru_no olursa, aynı numaraya sahip farklı derslerin
// kutuları `taranmisMap`'te birbirinin ÜZERİNE yazılır (son eklenen kazanır)
// -- böylece bazı ders+no kombinasyonları için YANLIŞ dersin kutusu
// türetilir, DOĞRU ders+no kombinasyonu için ise hiç satır oluşmaz (sonradan
// Hata Kitapçığı sayfasında o öğrencinin o sorusu "kitapçıkta bulunamadı"
// hatası verir). Bunu önlemek için anahtar, ders adı + soru_no BİRLİKTE
// (normalize edilmiş) olmalı.
function normalizeDers(s) {
  return String(s ?? '')
    .toLocaleLowerCase('tr-TR')
    .trim()
}

export function digerKitapcigiSorulariniTuret(taranmisSorular, digerKitapcikSatirlari) {
  const taranmisMap = new Map(
    (taranmisSorular || []).map((s) => [`${normalizeDers(s.ders_adi)}|${Number(s.soru_no)}`, s])
  )

  const turetilenler = []
  const eslesmeyenler = []
  for (const satir of digerKitapcikSatirlari || []) {
    const anahtar =
      satir.karsilik_soru_no != null ? `${normalizeDers(satir.ders_adi)}|${Number(satir.karsilik_soru_no)}` : null
    const kaynak = anahtar != null ? taranmisMap.get(anahtar) : null
    if (!kaynak) {
      eslesmeyenler.push(satir)
      continue
    }
    turetilenler.push({
      ders_adi: kaynak.ders_adi, // taranan/onaylı kitapçıktaki GEÇERLİ ders adı kullanılıyor
      soru_no: satir.soru_no, // diğer kitapçığın KENDİ soru numarası
      sayfa_no: kaynak.sayfa_no,
      x: kaynak.x,
      y: kaynak.y,
      genislik: kaynak.genislik,
      yukseklik: kaynak.yukseklik,
      parca_sayfa_no: kaynak.parca_sayfa_no ?? null,
      parca_x: kaynak.parca_x ?? null,
      parca_y: kaynak.parca_y ?? null,
      parca_genislik: kaynak.parca_genislik ?? null,
      parca_yukseklik: kaynak.parca_yukseklik ?? null,
    })
  }
  return { turetilenler, eslesmeyenler }
}
