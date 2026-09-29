import { useEffect, useRef, useState } from 'react'

// KULLANICI İSTEĞİ (Eylül 2026): mobilde sayfanın en üstündeyken parmakla
// EN UFAK bir aşağı hareket bile telefonun kendi "pull-to-refresh" (aşağı
// çekince yenile) hareketini tetikleyip sayfayı hemen yeniliyordu — kullanıcı
// bunun ÇOK HASSAS olmasından rahatsızdı ama özelliği TAMAMEN kapatmak da
// istemedi ("ama yenileme de yapsın istiyorum"). Tarayıcının kendi pull-to-
// refresh'i ince ayarlanamıyor (ya tam açık ya tam kapalı) — o yüzden
// index.css'te "overscroll-behavior-y: contain" ile KAPATILDI, yerine burada
// KENDİ pull-to-refresh'imiz kuruldu: parmak belirli bir mesafeden (ESIK)
// FAZLA aşağı çekilmeden yenileme tetiklenmiyor, küçük/yanlışlıkla yapılan
// hareketlerde hiçbir şey olmuyor. App.jsx'te TÜM uygulamayı sarmalıyor,
// böylece her sayfada aynı şekilde çalışıyor.
const ESIK = 70 // px — göstergenin bu mesafeye ulaşması gerekiyor (parmağın kendisi bundan ~2 kat fazla hareket etmiş oluyor, bkz. aşağıdaki 0.5 çarpanı)
const MAKS_GOSTERGE = 90 // görsel gösterge en fazla bu kadar aşağı iner

export default function PullToRefresh({ children }) {
  const [cekmeMesafesi, setCekmeMesafesi] = useState(0)
  const [tetiklendi, setTetiklendi] = useState(false)
  const baslangicYRef = useRef(null)
  const cekmeMesafesiRef = useRef(0)

  useEffect(() => {
    function ayarla(deger) {
      cekmeMesafesiRef.current = deger
      setCekmeMesafesi(deger)
    }

    function dokunmaBasladi(e) {
      if (tetiklendi) return
      // Sadece sayfanın EN ÜSTÜNDEYKEN başlayan bir dokunuşu izliyoruz —
      // sayfanın ortasındaki normal kaydırmaya hiç karışmıyoruz.
      if (window.scrollY <= 0 && e.touches.length === 1) {
        baslangicYRef.current = e.touches[0].clientY
      } else {
        baslangicYRef.current = null
      }
    }

    function dokunmaHareketEtti(e) {
      if (baslangicYRef.current === null || tetiklendi) return
      const fark = e.touches[0].clientY - baslangicYRef.current
      if (fark <= 0 || window.scrollY > 0) {
        // Yukarı doğru hareket ya da sayfa artık en üstte değil — bu normal
        // bir kaydırma, göstergeyi sıfırla ve karışma.
        if (cekmeMesafesiRef.current !== 0) ayarla(0)
        return
      }
      // Parmağın ham hareketinin yarısı göstergeye yansıyor (elastik/yavaş
      // bir his versin diye) — bu yüzden ESIK'e ulaşmak için parmağın
      // gerçekte ESIK*2 kadar hareket etmesi gerekiyor, yani kazara ufak bir
      // dokunuş asla tetiklemiyor.
      const yumusatilmis = Math.min(fark * 0.5, MAKS_GOSTERGE)
      ayarla(yumusatilmis)
      // Gösterge belirgin şekilde hareket etmeye başladıysa, tarayıcının
      // kendi esneme/bounce efektini engelle (görsel göstergemiz zaten onun
      // yerine geçiyor).
      if (yumusatilmis > 10 && e.cancelable) e.preventDefault()
    }

    function dokunmaBitti() {
      if (baslangicYRef.current !== null && cekmeMesafesiRef.current >= ESIK && !tetiklendi) {
        setTetiklendi(true)
        // Kullanıcı "yenileniyor" göstergesini bir an görsün diye çok kısa
        // bir gecikmeyle gerçek yenilemeyi tetikliyoruz.
        setTimeout(() => window.location.reload(), 150)
      } else {
        ayarla(0)
      }
      baslangicYRef.current = null
    }

    window.addEventListener('touchstart', dokunmaBasladi, { passive: true })
    window.addEventListener('touchmove', dokunmaHareketEtti, { passive: false })
    window.addEventListener('touchend', dokunmaBitti, { passive: true })
    window.addEventListener('touchcancel', dokunmaBitti, { passive: true })
    return () => {
      window.removeEventListener('touchstart', dokunmaBasladi)
      window.removeEventListener('touchmove', dokunmaHareketEtti)
      window.removeEventListener('touchend', dokunmaBitti)
      window.removeEventListener('touchcancel', dokunmaBitti)
    }
  }, [tetiklendi])

  const oran = Math.min(cekmeMesafesi / ESIK, 1)
  const gosterMi = cekmeMesafesi > 4 || tetiklendi

  return (
    <>
      <div
        className="fixed left-0 right-0 top-0 z-[60] flex justify-center pointer-events-none"
        style={{
          opacity: gosterMi ? 1 : 0,
          transform: `translateY(${(tetiklendi ? 44 : cekmeMesafesi) - 40}px)`,
          transition: tetiklendi ? 'transform 0.15s ease-out' : 'none',
        }}
      >
        <div className="mt-2 bg-white shadow-md rounded-full w-9 h-9 flex items-center justify-center border border-gray-100">
          <svg
            className={tetiklendi ? 'animate-spin' : ''}
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1e3a5f"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={tetiklendi ? undefined : { transform: `rotate(${oran * 180}deg)` }}
          >
            {tetiklendi ? <path d="M21 12a9 9 0 1 1-9-9" /> : <path d="M12 5v14M5 12l7 7 7-7" />}
          </svg>
        </div>
      </div>
      {children}
    </>
  )
}
