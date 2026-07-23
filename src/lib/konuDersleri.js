// Konu Takip Planı'ndaki ders sekmeleri — konular tablosundaki ders_adi
// değerleriyle birebir aynı yazılmalı, yoksa eşleşme boş gelir.
// Bu liste SinifDetay.jsx (yönetici görünümü) ve Yoklama.jsx (öğretmen,
// yoklama alırken konu işaretleme) arasında PAYLAŞILIYOR — biri güncellenince
// diğeri de otomatik güncel kalsın diye tek yerde tutuluyor.
// 7 ders TYT/AYT olarak ikiye bölünmüş durumda, Türkçe/Felsefe/Din Kültürü
// bölünmedi, ayrıca "Edebiyat (AYT)" dersi var (bkz. migration_konu_takip_v2.sql).
export const KONU_DERSLERI = [
  'Türkçe',
  'Matematik (TYT)', 'Matematik (AYT)',
  'Geometri (TYT)', 'Geometri (AYT)',
  'Fizik (TYT)', 'Fizik (AYT)',
  'Kimya (TYT)', 'Kimya (AYT)',
  'Biyoloji (TYT)', 'Biyoloji (AYT)',
  'Tarih (TYT)', 'Tarih (AYT)',
  'Coğrafya (TYT)', 'Coğrafya (AYT)',
  'Edebiyat (AYT)',
  'Felsefe', 'Din Kültürü',
]

// Öğretmenin branşına (KullaniciOlustur.jsx / Ogretmenler.jsx'teki BRANSLAR
// listesindeki değerlerle BİREBİR aynı yazılmalı) göre HANGİ ders sekmelerini
// görmesi gerektiği — bir öğretmen kendi branşıyla ilgisi olmayan dersleri
// görüp kafası karışmasın diye (ör. Fizik öğretmeni Türkçe/Tarih görmesin).
// "Türkçe/Edebiyat" branşı özel durum: hem Türkçe HEM Edebiyat (AYT) gelir.
const BRANS_DERS_ESLEME = {
  'Matematik': ['Matematik (TYT)', 'Matematik (AYT)'],
  'Geometri': ['Geometri (TYT)', 'Geometri (AYT)'],
  'Türkçe': ['Türkçe'],
  'Türkçe/Edebiyat': ['Türkçe', 'Edebiyat (AYT)'],
  'Fizik': ['Fizik (TYT)', 'Fizik (AYT)'],
  'Kimya': ['Kimya (TYT)', 'Kimya (AYT)'],
  'Biyoloji': ['Biyoloji (TYT)', 'Biyoloji (AYT)'],
  'Tarih': ['Tarih (TYT)', 'Tarih (AYT)'],
  'Coğrafya': ['Coğrafya (TYT)', 'Coğrafya (AYT)'],
  'Din Kültürü': ['Din Kültürü'],
}

// Bir branş adı verilince gösterilecek ders sekmelerini döndürür. Eşleşme
// yoksa (ör. "Fen Bilimleri", "Sosyal Bilgiler", "Diğer", boş/tanımsız branş,
// ya da bu fonksiyon hiç çağrılmadan tüm liste isteniyorsa) TÜM ders listesi
// döndürülür — güvenli varsayılan budur, hiçbir öğretmen kendi branşıyla
// ilgili bir dersi GÖREMEME hatasına düşmesin diye eşleşmeyen durumlarda
// kısıtlama YAPILMAZ.
export function konuDersleriniFiltrele(brans) {
  return BRANS_DERS_ESLEME[brans] || KONU_DERSLERI
}
