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
