self.addEventListener('install', () => {
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
self.addEventListener('fetch', () => {})

// Gerçek push bildirimi: sunucudan (api/bire-bir-hatirlatma.js) bir bildirim
// geldiğinde, cihaz kapalıyken/uygulama açık olmasa bile bu tetiklenir ve
// ekranda bildirim gösterir. Veri JSON olarak geliyor: { baslik, govde, url }.
self.addEventListener('push', (event) => {
  let veri = {}
  try {
    veri = event.data ? event.data.json() : {}
  } catch {
    veri = {}
  }
  const baslik = veri.baslik || 'Savaş Akça Eğitim'
  const secenekler = {
    body: veri.govde || '',
    icon: '/logo.png',
    badge: '/logo.png',
    data: { url: veri.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(baslik, secenekler))
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
