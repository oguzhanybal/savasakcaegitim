import { useCallback, useEffect, useState } from 'react'

// Taslak Modu — Ders Programı VE Bire Bir sayfaları arasında PAYLAŞILAN TEK
// anahtar + plan adı. Hangi sayfada açılırsa açılsın (ya da isim yazılırsa
// yazılsın), diğer sayfaya geçildiğinde de aynı durum karşılar — plan adını
// iki kere yazmaya, anahtarı iki kere açmaya gerek kalmaz. localStorage'da
// tutulur: aynı tarayıcıda sayfalar arası geçişte olduğu gibi, "storage"
// event'i sayesinde aynı anda açık birden fazla sekme arasında da senkron
// kalır (biri değiştirince diğeri de anında güncellenir).
const ACIK_ANAHTARI = 'taslakModuAcik'
const PLAN_ANAHTARI = 'taslakModuPlanAdi'

function localdenOku(anahtar, varsayilan) {
  try {
    const deger = window.localStorage.getItem(anahtar)
    return deger === null ? varsayilan : JSON.parse(deger)
  } catch {
    return varsayilan
  }
}

function localeYaz(anahtar, deger) {
  try {
    window.localStorage.setItem(anahtar, JSON.stringify(deger))
  } catch {
    // localStorage kullanılamıyorsa (ör. gizli sekme kısıtı) sessizce yoksay —
    // Taslak Modu yine de o sekme içinde normal React state olarak çalışır,
    // sadece sayfalar/sekmeler arası hatırlama devre dışı kalır.
  }
}

export function useTaslakModu() {
  const [taslakModuAcik, setTaslakModuAcikState] = useState(() => localdenOku(ACIK_ANAHTARI, false))
  const [aktifPlanAdi, setAktifPlanAdiState] = useState(() => localdenOku(PLAN_ANAHTARI, ''))

  // Aynı tarayıcıda başka bir sekmede (ör. Ders Programı bir sekmede, Bire Bir
  // başka bir sekmede açıkken) anahtar/plan adı değiştirilirse, buradaki state
  // de anında güncellensin diye.
  useEffect(() => {
    function guncelle(e) {
      if (!e.key || e.key === ACIK_ANAHTARI) setTaslakModuAcikState(localdenOku(ACIK_ANAHTARI, false))
      if (!e.key || e.key === PLAN_ANAHTARI) setAktifPlanAdiState(localdenOku(PLAN_ANAHTARI, ''))
    }
    window.addEventListener('storage', guncelle)
    return () => window.removeEventListener('storage', guncelle)
  }, [])

  const setTaslakModuAcik = useCallback((deger) => {
    setTaslakModuAcikState((onceki) => {
      const yeni = typeof deger === 'function' ? deger(onceki) : deger
      localeYaz(ACIK_ANAHTARI, yeni)
      return yeni
    })
  }, [])

  const setAktifPlanAdi = useCallback((deger) => {
    setAktifPlanAdiState((onceki) => {
      const yeni = typeof deger === 'function' ? deger(onceki) : deger
      localeYaz(PLAN_ANAHTARI, yeni)
      return yeni
    })
  }, [])

  return { taslakModuAcik, setTaslakModuAcik, aktifPlanAdi, setAktifPlanAdi }
}
