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

// Android Chrome — burada da tıpkı masaüstü gibi, uygulama TELEFONDA zaten
// kuruluysa beforeinstallprompt bir daha hiç gelmiyor. Ama masaüstündeki
// "adres çubuğunun sağı / chrome://apps" talimatı Android'de anlamsız —
// orada öyle bir simge yok ve chrome://apps sayfası da farklı çalışıyor.
// Bu yüzden Android'e özel, telefonun kendi "Uygulamalar" listesinden
// kaldırma talimatını gösteriyoruz.
export function androidMu() {
  const ua = window.navigator.userAgent || ''
  return /android/i.test(ua)
}

// Chrome 140+ / Edge 140+ (masaüstü) ve Chrome 84+ (Android), uygulamanın bu
// CİHAZA GERÇEKTEN kurulu olup olmadığını sorabildiğimiz resmi bir API
// sunuyor: navigator.getInstalledRelatedApps(). Bunun çalışması için
// manifest.json'da uygulamanın kendisini "related_applications" listesinde
// platform: "webapp" ile göstermesi gerekiyor (bkz. manifest.json — bu satır
// olmadan API her zaman boş dizi döner). Bu, UA sniffing gibi TAHMİN değil,
// tarayıcının kendi kurulu-uygulamalar kaydına bakan gerçek bir kontrol —
// canlı testte (Chrome 151, masaüstü) çalıştığı doğrulandı. Desteklemeyen
// tarayıcılarda (Safari, Firefox, eski Chrome) fonksiyon hiç yoktur — o
// durumda null dönüp "bilinmiyor" diyoruz, false DEMİYORUZ (yanlışlıkla
// "kurulu değil" sanıp butonu gereksiz yere göstermeye devam edelim, en
// azından kullanıcıyı yanlış bilgiyle yanıltmayalım diye).
export async function gercektenYukluMu() {
  try {
    if (!navigator.getInstalledRelatedApps) return null
    const sonuc = await navigator.getInstalledRelatedApps()
    return Array.isArray(sonuc) && sonuc.length > 0
  } catch {
    return null
  }
}

export function zatenYukluMu() {
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    window.navigator.standalone === true
  )
}

// macOS'ta masaüstü Safari (iPhone/iPad Safari'si DEĞİL — bkz. iosMu, o ayrı
// ele alınıyor). Safari 17+ (macOS Sonoma) "beforeinstallprompt" olayını HİÇ
// desteklemiyor — ama kendi "Dosya > Dock'a Ekle" özelliğiyle siteyi Dock'a
// ekleyebiliyor, hatta bizim manifest linkimiz eksikken bile bu çalışıyordu
// (Safari'nin kriterleri Chrome'unkinden daha gevşek). Bu yüzden "tarayıcınız
// hazırlamadı, tekrar deneyin" mesajı Safari'de YANLIŞ — orada olay hiçbir
// zaman gelmeyecek, sonsuza kadar aynı mesajı görür. Ayrıca ZATEN Dock'a
// eklenmiş olabilir (normal sekmede display-mode hâlâ "browser" görünür, bu
// o tabın kendisi Dock'tan AÇILMADIĞI için normal — kurulu olmadığı anlamına
// gelmez).
export function safariMasaustuMu() {
  const ua = window.navigator.userAgent || ''
  const safariMi = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua)
  return safariMi && !iosMu()
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
