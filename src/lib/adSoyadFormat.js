// Türkçede cümle/isim ortasında küçük yazılması gereken bağlaçlar (örn.
// "Türk Dili ve Edebiyatı", "Din Kültürü ve Ahlak Bilgisi"). İlk kelime hariç
// (bir metin bağlaçla başlamaz zaten) her yerde küçük bırakılır.
const BAGLAC_KUCUK_YAZILANLAR = new Set(['ve', 'ile', 'da', 'de', 'veya', 'ya', 'ki'])

// Sınav türü / kurum kısaltmaları gibi "İlk Harf Büyük, Diğerleri Küçük"
// kuralına tabi OLMAYIP her zaman TAMAMEN BÜYÜK yazılması gereken istisna
// kelimeler (ör. "tyt sınavı" yazılınca "Tyt Sınavı" değil "TYT Sınavı"
// olmalı). Anahtar küçük harfli hâli (karşılaştırma için), değer ekranda
// gösterilecek asıl (büyük) hâli.
const ISTISNA_BUYUK_YAZILANLAR = new Map(
  ['TYT', 'YKS', 'AYT', 'MSÜ', 'TÖDER', 'ÖZDEBİR'].map((k) => [k.toLocaleLowerCase('tr-TR'), k])
)

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
      const kelimeKucuk = kelime.toLocaleLowerCase('tr-TR')
      if (ISTISNA_BUYUK_YAZILANLAR.has(kelimeKucuk)) {
        return ISTISNA_BUYUK_YAZILANLAR.get(kelimeKucuk)
      }
      if (index > 0 && BAGLAC_KUCUK_YAZILANLAR.has(kelimeKucuk)) {
        return kelimeKucuk
      }
      // Kelimenin içinde tire ("11-sayısal", "Ali-Rıza") ya da eğik çizgi
      // ("Türkçe/edebiyat" gibi ders adlarında) varsa, sadece kelimenin ilk
      // harfini değil, ayraçtan SONRAKİ harfi de büyütmemiz gerekiyor —
      // yoksa "11-Eşit Ağırlık" "11-eşit Ağırlık" olarak, ya da
      // "Türkçe/Edebiyat" "Türkçe/edebiyat" olarak (ayraca bitişik harf
      // küçük kalarak) yanlış görünüyordu. split ile ayraçları (- ve /)
      // yakalayıp (capturing group) aralarındaki her parçayı ayrı ayrı
      // büyütüyoruz, ayraçların kendisini olduğu gibi koruyoruz.
      return kelime
        .split(/([-/])/)
        .map((parca) => {
          if (parca === '-' || parca === '/' || !parca) return parca
          const ilkHarf = parca.charAt(0).toLocaleUpperCase('tr-TR')
          const geriKalan = parca.slice(1).toLocaleLowerCase('tr-TR')
          return ilkHarf + geriKalan
        })
        .join('')
    })
    .join(' ')
}

// adSoyadDuzelt ile birebir aynı mantık (her kelimenin ilk harfi büyük, gerisi
// küçük) — isim dışı metinlerde (ör. Kantin ürün adı) kullanılırken daha uygun
// bir isimle çağrılabilsin diye aynı fonksiyona ikinci bir isim veriyoruz.
export const ilkHarfleriBuyukYap = adSoyadDuzelt

// Türkçe harf -> ASCII karşılığı (kullanıcı adı/giriş adı öneri fonksiyonu için).
const TURKCE_ASCII_HARITASI = {
  ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', I: 'i', İ: 'i',
  ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
}

// Bir ad-soyad'dan otomatik giriş (kullanıcı) adı önerir — örn. "Yiğit Atik"
// -> "yigitatik". Boşluk/Türkçe karakter/noktalama olmadan, küçük harfle,
// sadece harf ve rakam bırakır. "Öğrenci Hesabı Bağla" akışını hızlandırmak
// için kullanılıyor (bkz. Ogrenciler.jsx "Otomatik Hesap Oluştur").
export function kullaniciAdiOner(adSoyad) {
  if (!adSoyad) return ''
  const asciiye = adSoyad
    .split('')
    .map((h) => TURKCE_ASCII_HARITASI[h] || h)
    .join('')
  return asciiye
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}
