// Telefon numaralarını her yerde AYNI şekilde işlemek için ortak yardımcılar.
// Veritabanında hep "90XXXXXXXXXX" (ülke kodu + 10 haneli yerel numara)
// formatında saklıyoruz — mevcut kayıtlar zaten bu formatta. Kullanıcının artık
// "90" yazmasına gerek kalmasın diye, giriş alanlarında SADECE 10 haneli yerel
// numara (5 ile başlayan) yazdırılır/istenir; "90" ülke kodu sabit bir etiket
// olarak gösterilir ve biz otomatik ekleriz.

// Kullanıcının bir telefon alanına yazdığı/yapıştırdığı HER ŞEYİ (boşluk, +90,
// 0 öneki, 90 öneki ile ya da önek olmadan girilmiş olabilir) sadece rakamlara
// indirger, olası "0" ya da "90" öneklerini atar, en fazla 10 haneyi (yerel
// numara) alır ve veritabanı formatına ("90" + 10 hane) döner. Boşsa ''.
export function telefonGirdiIsle(girilenDeger) {
  let rakamlar = (girilenDeger || '').replace(/\D/g, '')
  // "+905324221737" ya da "905324221737" gibi tam numara yapıştırılmışsa,
  // baştaki ülke kodunu temizle (yerel numaralar hiçbir zaman "90" ile
  // başlamaz — Türkiye'de cep telefonu önekleri hep "5" ile başlar).
  if (rakamlar.startsWith('90')) rakamlar = rakamlar.slice(2)
  // "0532..." gibi başında sıfır varsa (alışkanlıkla yazılmış), onu da at.
  if (rakamlar.startsWith('0')) rakamlar = rakamlar.slice(1)
  rakamlar = rakamlar.slice(0, 10)
  return rakamlar ? '90' + rakamlar : ''
}

// Veritabanı formatındaki ("90XXXXXXXXXX") bir numarayı, giriş kutusunda
// gösterilecek okunaklı yerel numaraya çevirir: "532 422 17 37" gibi
// 3-3-2-2 gruplu. Kullanıcı yazarken de bu haliyle görür.
export function telefonYerelGoster(dbDegeri) {
  if (!dbDegeri) return ''
  let yerel = String(dbDegeri).replace(/\D/g, '')
  // NOT: uzunluğa bakmaksızın, baştaki "90" her zaman atılır — bu alan hep
  // "90" + yerel numara formatında saklanıyor (kısa/yarım yazılmış değerler
  // için de geçerli, ör. kullanıcı henüz 1-2 hane yazmışken bile doğru
  // görünsün diye). Önceki sürümde sadece 10 haneden UZUN değerlerde
  // atılıyordu; bu da kullanıcı "90" ile başlayarak yazmaya devam ederken
  // (eski alışkanlık) kutunun yanlış/eksik göstermesine yol açıyordu.
  if (yerel.startsWith('90')) yerel = yerel.slice(2)
  yerel = yerel.slice(0, 10)
  const parcalar = []
  if (yerel.length > 0) parcalar.push(yerel.slice(0, 3))
  if (yerel.length > 3) parcalar.push(yerel.slice(3, 6))
  if (yerel.length > 6) parcalar.push(yerel.slice(6, 8))
  if (yerel.length > 8) parcalar.push(yerel.slice(8, 10))
  return parcalar.join(' ')
}

// Salt-okunur listelerde (tablo vb.) göstermek için — aynı gruplama, sadece
// isim daha açıklayıcı olsun diye ayrı bir fonksiyon olarak da dışa açık.
export const telefonTabloGoster = telefonYerelGoster

// Bir telefonun (veritabanı formatında) geçerli olup olmadığını kontrol eder:
// tam 10 haneli yerel numara olmalı ve "5" ile başlamalı (Türkiye'de cep
// telefonu numaraları hep 5 ile başlar). Boş bırakılabilir alan olduğu için
// boşsa geçerli sayılır — zorunluluk kontrolü ayrı yapılır.
export function telefonGecerliMi(dbDegeri) {
  if (!dbDegeri) return true
  let yerel = String(dbDegeri).replace(/\D/g, '')
  if (yerel.startsWith('90')) yerel = yerel.slice(2)
  return yerel.length === 10 && yerel.startsWith('5')
}

// Kutu henüz tam doldurulmamışken (kullanıcı hâlâ yazıyor) kırmızı hata
// göstermek yersiz — sadece ya TAM 10 hane girildiğinde YANLIŞSA (5 ile
// başlamıyorsa) ya da tamamen dolu ama eksik hanedeyse uyarı gösterilir.
// Boş ya da yazım hâlâ devam ediyor gibi duran (10 haneden az) durumlarda
// sessiz kalır.
export function telefonUyariGoster(dbDegeri) {
  if (!dbDegeri) return false
  let yerel = String(dbDegeri).replace(/\D/g, '')
  if (yerel.startsWith('90')) yerel = yerel.slice(2)
  if (yerel.length === 0) return false
  if (yerel.length < 10) return false
  return !(yerel.length === 10 && yerel.startsWith('5'))
}
