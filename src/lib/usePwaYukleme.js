import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

// ============================================================================
// Tarayıcının "bu site ana ekrana eklenebilir" event'ini (beforeinstallprompt)
// ve gerçek kurulum tamamlanma sinyalini (appinstalled) TEK bir yerden
// dinleyip, hem alttaki UygulamaYukleBanner (otomatik teklif çubuğu) hem de
// Layout'un sol menüsündeki "Uygulamayı Yükle" butonu tarafından
// paylaşılmasını sağlayan ortak hook. ÖNEMLİ: bu hook sadece Layout.jsx'te
// TEK BİR YERDE çağrılmalı — iki ayrı yerde çağrılırsa (biri banner'da biri
// menüde) her ikisi de kendi "appinstalled" dinleyicisini kaydeder ve kurulum
// tamamlanınca pwa_yuklemeleri tablosuna İKİ KEZ satır eklenebilir. Sonuç
// (ertelemeOlayi, yukle) Layout'tan aşağı prop olarak geçiriliyor.
//
// ÖNEMLİ SINIRLAMA: "beforeinstallprompt" olayı sadece Chromium tabanlı
// tarayıcılarda (Chrome, Edge — Android ve masaüstü) çalışır. iPhone'da
// Safari bu olayı HİÇ desteklemiyor (Apple'ın kendi kısıtı) — o yüzden
// iPhone'da onun yerine basit "Paylaş > Ana Ekrana Ekle" talimatı
// gösteriyoruz (bkz. iosMu). Safari'de gerçek bir "yüklendi" sinyali
// JavaScript'e HİÇ bildirilmediği için, o kurulumlar "Uygulama İndirmeleri"
// listesine YANSIMAZ — bu teknik bir platform kısıtı.
// ============================================================================

export function iosMu() {
  const ua = window.navigator.userAgent || ''
  if (/iphone|ipad|ipod/i.test(ua) && !window.MSStream) return true
  // iPadOS 13+ VARSAYILAN olarak kendini masaüstü Mac Safari gibi tanıtıyor
  // (Apple'ın kasıtlı kararı — "iPad" ibaresi user agent'ta hiç geçmiyor),
  // bu yüzden yukarıdaki basit metin kontrolü iPad'leri KAÇIRIYORDU. Dokunmatik
  // ekranlı bir "MacIntel" cihaz aslında iPad'dir, gerçek Mac'lerde
  // maxTouchPoints 0'dır — bu şekilde ayırt ediyoruz.
  return window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1
}

export function zatenYukluMu() {
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    window.navigator.standalone === true
  )
}

export function usePwaYukleme(profileId) {
  const [ertelemeOlayi, setErtelemeOlayi] = useState(null)
  const kayitGonderildiRef = useRef(false)

  // Chrome (Android/masaüstü), "beforeinstallprompt" olayını SADECE sayfanın
  // aktif bir Service Worker'ı varsa tetikliyor — bu, PWA "yüklenebilir"
  // sayılmasının önkoşullarından biri. public/sw.js hiçbir şeyi önbelleğe
  // almıyor, sadece bu kriteri karşılamak için var.
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  useEffect(() => {
    function yakala(e) {
      e.preventDefault()
      setErtelemeOlayi(e)
    }
    window.addEventListener('beforeinstallprompt', yakala)
    return () => window.removeEventListener('beforeinstallprompt', yakala)
  }, [])

  // Kurulum GERÇEKTEN tamamlanınca (kullanıcı "Yükle" deyip tarayıcının
  // kendi onayını da geçtiğinde) tetiklenir — "Kimler İndirdi" listesi için
  // güvenilir tek kaynak burası; "Yükle" butonuna tıklamak tek başına
  // kurulumun tamamlandığını GARANTİ etmez, o yüzden kaydı burada, sadece BİR
  // KEZ (kayitGonderildiRef) gönderiyoruz.
  useEffect(() => {
    function yuklendi() {
      setErtelemeOlayi(null)
      if (!kayitGonderildiRef.current && profileId) {
        kayitGonderildiRef.current = true
        supabase
          .from('pwa_yuklemeleri')
          .insert({
            profile_id: profileId,
            cihaz_bilgisi: window.navigator.userAgent?.slice(0, 300) || null,
          })
          .then(() => {})
      }
    }
    window.addEventListener('appinstalled', yuklendi)
    return () => window.removeEventListener('appinstalled', yuklendi)
  }, [profileId])

  async function yukle() {
    if (!ertelemeOlayi) return
    ertelemeOlayi.prompt()
    try {
      await ertelemeOlayi.userChoice
    } catch {}
    // Tarayıcının kendi "prompt" nesnesi SADECE BİR KEZ kullanılabilir —
    // sonucu ne olursa olsun temizliyoruz, gerçek kurulum takibini
    // "appinstalled" olayına bırakıyoruz.
    setErtelemeOlayi(null)
  }

  return { ertelemeOlayi, yukle }
}
