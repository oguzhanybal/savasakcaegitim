// Türkçe yazımda saat ile dakika arasına iki nokta (:) değil nokta (.) konur —
// ör. "12.50", "12:50" değil. Bu dosyadaki fonksiyonlar SADECE EKRANDA/MESAJDA
// GÖSTERİLEN metin içindir.
//
// ÖNEMLİ — neyin DEĞİŞMEDİĞİ:
// - Veritabanındaki saat sütunları (baslangic_saat, bitis_saat vb.) hâlâ
//   Postgres'in "HH:MM:SS" formatında saklanır, hiç dokunulmadı.
// - <input type="time"> alanlarının value/defaultValue'su hâlâ "HH:MM" — tarayıcı
//   bu alanı SADECE iki nokta formatında kabul eder, nokta yazılırsa çalışmaz.
// - Saat karşılaştırma/sıralama mantığı (örn. çakışma kontrolü, "araliklarCakisiyorMu"
//   gibi fonksiyonlar) hâlâ ham "HH:MM" string'i üzerinden çalışıyor — bu fonksiyonlara
//   HİÇ dokunulmadı, sadece kullanıcının GÖRDÜĞÜ son metin bu dosyadan geçiyor.
//
// Yani: veri her zaman "12:50" olarak akar, sadece ekrana/mesaja yazılacağı
// son anda "12.50"ye çevrilir.

export function saatGoster(saat) {
  if (!saat) return saat
  return saat.slice(0, 5).replace(':', '.')
}

export function saatAraligiGoster(baslangic, bitis) {
  if (!baslangic) return ''
  if (!bitis) return saatGoster(baslangic)
  return `${saatGoster(baslangic)}–${saatGoster(bitis)}`
}
