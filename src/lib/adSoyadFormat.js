// Ad-soyad alanlarını, kullanıcı ne şekilde yazarsa yazsın otomatik olarak
// "İlk Harfler Büyük, Diğerleri Küçük" biçimine çevirir. Türkçe İ/ı harflerinin
// doğru davranması için toLocaleUpperCase/toLocaleLowerCase 'tr-TR' ile kullanılır
// (normal toUpperCase/toLowerCase "i" harfini yanlış çevirir).
export function adSoyadDuzelt(metin) {
  if (!metin) return metin
  return metin
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((kelime) => {
      if (!kelime) return kelime
      const ilkHarf = kelime.charAt(0).toLocaleUpperCase('tr-TR')
      const geriKalan = kelime.slice(1).toLocaleLowerCase('tr-TR')
      return ilkHarf + geriKalan
    })
    .join(' ')
}
