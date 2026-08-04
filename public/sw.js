// Minimal Service Worker — herhangi bir önbellekleme (offline) YAPMIYOR,
// sadece Chrome'un "bu site yüklenebilir bir uygulama" (installable PWA)
// saymasının önkoşullarından biri olan "aktif bir Service Worker + fetch
// dinleyicisi" kriterini karşılamak için var. Bu dosya olmadan Chrome'da
// "beforeinstallprompt" olayı HİÇ tetiklenmiyor — Uygulama Yükle banner'ının
// (bkz. src/components/UygulamaYukleBanner.jsx) Android/Chrome'da hiç
// görünmemesinin sebebi buydu.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Kasıtlı olarak boş bırakıldı — istekler normal şekilde ağa gidiyor, hiçbir
// şey önbelleğe alınmıyor. Sadece "fetch" dinleyicisinin VAR OLMASI yeterli.
self.addEventListener('fetch', () => {})
