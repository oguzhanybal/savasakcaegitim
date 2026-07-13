// Türkçede cümle/isim ortasında küçük yazılması gereken bağlaçlar (örn.
// "Türk Dili ve Edebiyatı", "Din Kültürü ve Ahlak Bilgisi"). İlk kelime hariç
// (bir metin bağlaçla başlamaz zaten) her yerde küçük bırakılır.
const BAGLAC_KUCUK_YAZILANLAR = new Set(['ve', 'ile', 'da', 'de', 'veya', 'ya', 'ki'])

// Ad-soyad alanlarını, kullanıcı ne şekilde yazarsa yazsın otomatik olarak
// "İlk Harfler Büyük, Diğerleri Küçük" biçimine çevirir (bağlaçlar hariç,
// onlar küçük kalır). Türkçe İ/ı harflerinin doğru davranması için
// toLocaleUpperCase/toLocaleLowerCase 'tr-TR' ile kullanılır (normal
// toUpperCase/toLowerCase "i" harfini yanlış çevirir).
export function adSoyadDuzelt(metin) {
  if (!metin) return metin
  return metin
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((kelime, index) => {
      if (!kelime) return kelime
      if (index > 0 && BAGLAC_KUCUK_YAZILANLAR.has(kelime.toLocaleLowerCase('tr-TR'))) {
        return kelime.toLocaleLowerCase('tr-TR')
      }
      const ilkHarf = kelime.charAt(0).toLocaleUpperCase('tr-TR')
      const geriKalan = kelime.slice(1).toLocaleLowerCase('tr-TR')
      return ilkHarf + geriKalan
    })
    .join(' ')
}

// adSoyadDuzelt ile birebir aynı mantık (her kelimenin ilk harfi büyük, gerisi
// küçük) — isim dışı metinlerde (ör. Kantin ürün adı) kullanılırken daha uygun
// bir isimle çağrılabilsin diye aynı fonksiyona ikinci bir isim veriyoruz.
export const ilkHarfleriBuyukYap = adSoyadDuzelt
