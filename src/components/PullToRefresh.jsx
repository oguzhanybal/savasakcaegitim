import { useEffect, useRef, useState } from 'react'

// Bu kadar aşağı çekilip bırakılınca sayfa yenilenir.
const ESIK = 70

// "Ana Ekrana Ekle" ile kurulan iOS (ve genel olarak PWA) sürümünde,
// tarayıcının kendi "sayfayı aşağı çek → yenile" jesti YOK — bu jest sadece
// normal Safari/Chrome sekmesinde var. Standalone modda kullanıcı sayfayı
// yenilemek için uygulamayı komple kapatıp yeniden açmak zorunda kalıyordu
// (kullanıcı şikayeti). Bu bileşen o jesti standalone modda elle taklit
// ediyor; normal tarayıcı sekmesinde (tarayıcının kendi jesti zaten
// çalıştığı için) devreye hiç girmiyor.
function standaloneMi() {
  if (typeof window === 'undefined') return false
  if (window.navigator.standalone) return true // iOS Safari PWA
  return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
}

export default function PullToRefresh() {
  const aktifRef = useRef(standaloneMi())
  const [cekmeMesafesi, setCekmeMesafesi] = useState(0)
  const [yenileniyor, setYenileniyor] = useState(false)
  const baslangicY = useRef(null)
  const cekiliyorMu = useRef(false)
  const sonMesafe = useRef(0)
  const yenileniyorRef = useRef(false)

  useEffect(() => {
    if (!aktifRef.current) return

    function dokunmaBasladi(e) {
      if (yenileniyorRef.current || window.scrollY > 0) return
      baslangicY.current = e.touches[0].clientY
      cekiliyorMu.current = true
    }

    function dokunmaHareket(e) {
      if (!cekiliyorMu.current || baslangicY.current == null) return
      const fark = e.touches[0].clientY - baslangicY.current
      if (fark <= 0 || window.scrollY > 0) {
        if (sonMesafe.current !== 0) {
          sonMesafe.current = 0
          setCekmeMesafesi(0)
        }
        return
      }
      // Sayfa zaten en üstteyken aşağı çekiliyor — tarayıcının kendi lastik
      // gibi geri sekme (rubber-band) davranışını burada biz yönetiyoruz.
      e.preventDefault()
      const deger = Math.min(fark * 0.5, 100)
      sonMesafe.current = deger
      setCekmeMesafesi(deger)
    }

    function dokunmaBitti() {
      if (!cekiliyorMu.current) return
      cekiliyorMu.current = false
      baslangicY.current = null
      if (sonMesafe.current >= ESIK) {
        yenileniyorRef.current = true
        setYenileniyor(true)
        setTimeout(() => window.location.reload(), 200)
      } else {
        sonMesafe.current = 0
        setCekmeMesafesi(0)
      }
    }

    window.addEventListener('touchstart', dokunmaBasladi, { passive: true })
    window.addEventListener('touchmove', dokunmaHareket, { passive: false })
    window.addEventListener('touchend', dokunmaBitti, { passive: true })
    return () => {
      window.removeEventListener('touchstart', dokunmaBasladi)
      window.removeEventListener('touchmove', dokunmaHareket)
      window.removeEventListener('touchend', dokunmaBitti)
    }
  }, [])

  if (!aktifRef.current || (cekmeMesafesi === 0 && !yenileniyor)) return null

  const yukseklik = yenileniyor ? 56 : cekmeMesafesi

  return (
    <div
      className="fixed top-0 left-0 right-0 flex justify-center z-50 pointer-events-none"
      style={{
        height: yukseklik,
        paddingTop: 'env(safe-area-inset-top)',
        transition: cekiliyorMu.current ? 'none' : 'height 0.2s ease-out',
      }}
    >
      <div className="mt-2 bg-white rounded-full shadow-md w-9 h-9 flex items-center justify-center">
        <svg
          className={yenileniyor ? 'animate-spin text-navy' : 'text-navy'}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={!yenileniyor ? { transform: `rotate(${Math.min(cekmeMesafesi / ESIK, 1) * 180}deg)` } : undefined}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>
  )
}
