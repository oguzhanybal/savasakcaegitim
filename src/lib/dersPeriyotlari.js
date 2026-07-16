// Okulun GERÇEK ders saatleri — "45 dakika ders + 10 dakika teneffüs" kuralına
// göre sabit, günlük olarak tekrar eden periyotlar. Sabah 09:00'da başlar,
// 13:25'te biter (öğle arası 13:25–14:15); öğleden sonra 14:15'te devam edip
// 22:20'de son bulur.
//
// Bu liste, Müsaitlik Tablosu ve Günlük Program Listesi gibi görünümlerdeki
// saat SÜTUNLARINI belirler — yani sadece GÖRÜNTÜLEME amaçlı sabit bir
// referanstır. Veritabanındaki ders_programi / bire_bir_atamalari /
// bire_bir_yoklama kayıtlarına HİÇBİR ŞEKİLDE dokunmaz; geçmişte veya bu hafta
// bu periyotlara tam oturmayan bir şekilde eklenmiş dersler olsa bile, o
// dersler hangi periyot(lar)la zaman olarak çakışıyorsa o sütun(lar)da
// (gerçek saatiyle birlikte) görünmeye devam eder — hiçbir kayıt silinmez,
// taşınmaz ya da saati değiştirilmez.
export const DERS_PERIYOTLARI = [
  { baslangic: '09:00', bitis: '09:45' },
  { baslangic: '09:55', bitis: '10:40' },
  { baslangic: '10:50', bitis: '11:35' },
  { baslangic: '11:45', bitis: '12:30' },
  { baslangic: '12:40', bitis: '13:25' },
  { baslangic: '14:15', bitis: '15:00' },
  { baslangic: '15:10', bitis: '15:55' },
  { baslangic: '16:05', bitis: '16:50' },
  { baslangic: '17:00', bitis: '17:45' },
  { baslangic: '17:55', bitis: '18:40' },
  { baslangic: '18:50', bitis: '19:35' },
  { baslangic: '19:45', bitis: '20:30' },
  { baslangic: '20:40', bitis: '21:25' },
  { baslangic: '21:35', bitis: '22:20' },
]
