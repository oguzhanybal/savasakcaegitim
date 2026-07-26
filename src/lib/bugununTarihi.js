import { useEffect, useState } from 'react'

// "YYYY-MM-DD" formatında, YEREL saate göre bugünün tarihini üretir
// (toISOString KULLANMIYORUZ — Türkiye UTC+3 olduğu için gece yarısına yakın
// saatlerde bir gün geriye kayabiliyor).
function yerelTarih() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// Bir sayfa açık bırakılıp gece yarısı (00:00) geçildiğinde, "bugün" olarak
// gösterilen tarihin KENDİLİĞİNDEN yeni güne geçmesi için kullanılan hook.
// Normal `useState(() => new Date()...)` deseni SADECE component ilk
// yüklendiğinde bir kere hesaplanır — sayfa açık kaldığı sürece (F5
// atılmadıkça, route değişmedikçe) her zaman AYNI günü gösterir, gerçek
// tarih değişse bile (kullanıcı isteğiyle düzeltildi: müsaitlik tablosu ve
// ders hatırlatma paneli gece yarısını geçince hâlâ önceki günü gösteriyordu).
//
// Bu hook her dakika gerçek tarihi kontrol eder, değiştiyse state'i günceller
// (bu da o bileşenin yeniden render olmasını tetikler). Kullanan bileşen,
// kendi "tarih" state'ini bu değere göre senkron tutmaktan sorumludur — bkz.
// MusaitlikTablosu.jsx ve BireBir.jsx'teki DersHatirlatmaPaneli'ndeki
// "kullanıcı elle başka bir tarihe geçmediyse otomatik ilerlet" deseni.
export function useBugununTarihi() {
  const [tarih, setTarih] = useState(yerelTarih)
  useEffect(() => {
    const interval = setInterval(() => {
      setTarih((onceki) => {
        const guncel = yerelTarih()
        return onceki !== guncel ? guncel : onceki
      })
    }, 60000) // her dakika kontrol yeterli — saniye hassasiyeti gerekmiyor
    return () => clearInterval(interval)
  }, [])
  return tarih
}
