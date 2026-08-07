// Bu dosyanın yolu ÖNEMLİ: public/sw.js olarak GitHub'a yüklenmeli.
// (Vite build sırasında public/ klasörünün içeriği olduğu gibi dist/
// köküne kopyalanır, yani yayınlanan gerçek /sw.js budur.)
//
// Hem PWA "Uygulama Yükle" banner'ının çalışması için gereken
// install/activate/fetch dinleyicilerini, hem de push bildirimlerini
// gösteren push dinleyicisini içerir.
self.addEventListener('install', () => {
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
self.addEventListener('fetch', () => {})

// ---- GEÇİCİ TEŞHİS ALTYAPISI ----
// push event'i tetiklendiğinde ne olduğunu iki şekilde kaydediyoruz:
// 1) Cache Storage'a bir JSON kaydı yazıyoruz (kalıcı — SW yeniden
//    başlasa/kapansa bile kalır, sayfa açıldığında okunabilir).
// 2) O anda açık olan sekmelere postMessage ile bildiriyoruz.
async function kaydet(asama, detay) {
  try {
    const cache = await caches.open('push-teshis')
    const onceki = await cache.match('/__push-log')
    let liste = []
    if (onceki) {
      try {
        liste = await onceki.json()
      } catch {
        liste = []
      }
    }
    liste.push({ zaman: new Date().toISOString(), asama, detay: String(detay ?? '') })
    if (liste.length > 20) liste = liste.slice(-20)
    await cache.put('/__push-log', new Response(JSON.stringify(liste), { headers: { 'Content-Type': 'application/json' } }))
  } catch (e) {
    // yazamazsak sessizce geç, ana akışı bozmasın
  }
  try {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of clientList) c.postMessage({ tur: 'push-teshis', asama, detay: String(detay ?? '') })
  } catch (e) {}
}

// Gerçek push bildirimi: sunucudan (api/bire-bir-hatirlatma.js) bir bildirim
// geldiğinde, cihaz kapalıyken/uygulama açık olmasa bile bu tetiklenir ve
// ekranda bildirim gösterir. Veri JSON olarak geliyor: { baslik, govde, url }.
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      await kaydet('event-alindi', '')
      let veri = {}
      try {
        veri = event.data ? event.data.json() : {}
        await kaydet('veri-parse-edildi', JSON.stringify(veri))
      } catch (e) {
        await kaydet('veri-parse-hatasi', e && e.message)
        veri = {}
      }
      const baslik = veri.baslik || 'Savaş Akça Eğitim'
      const govde = veri.govde || ''
      const url = veri.url || '/'

      try {
        await self.registration.showNotification(baslik, {
          body: govde,
          icon: '/logo.png',
          badge: '/logo.png',
          data: { url },
        })
        await kaydet('showNotification-basarili', baslik)
      } catch (err) {
        await kaydet('showNotification-hatasi', err && err.message)
        try {
          await self.registration.showNotification('HATA: ' + (err && err.message ? err.message : String(err)), {
            body: 'showNotification başarısız oldu.',
          })
        } catch (err2) {
          await kaydet('yedek-showNotification-de-hata', err2 && err2.message)
        }
      }
    })()
  )
})

// Bildirime tıklanınca: uygulama zaten açık bir sekmede ise ona odaklan,
// değilse yeni bir sekmede aç.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
