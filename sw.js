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
//
// GEÇİCİ TEŞHİS SÜRÜMÜ: mesaj ağdan geliyor ve şifresi başarıyla çözülüyor
// ama hiçbir cihazda bildirim görünmüyor — bu, showNotification() çağrısının
// kendisinde sessiz bir hata/reddedilme olabileceğini düşündürüyor. Bu sürüm:
// 1) icon/badge OLMADAN minimal bir bildirimle dener (resim yüklenemsmesi
//    ihtimalini eler),
// 2) o da başarısız olursa hatayı bildirim BAŞLIĞINA yazarak gösterir ki
//    gerçek sebebi ekranda görebilelim,
// 3) her adımı konsola da loglar.
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      console.log('[push] event alındı')
      let veri = {}
      try {
        veri = event.data ? event.data.json() : {}
        console.log('[push] veri parse edildi:', veri)
      } catch (e) {
        console.log('[push] veri parse HATASI:', e && e.message)
        veri = {}
      }
      const baslik = veri.baslik || 'Savaş Akça Eğitim'
      const govde = veri.govde || ''
      const url = veri.url || '/'

      try {
        // Önce ikon/badge OLMADAN minimal bir deneme — resim kaynaklı bir
        // sorunu elemek için.
        await self.registration.showNotification(baslik, {
          body: govde,
          data: { url },
        })
        console.log('[push] showNotification BAŞARILI (minimal)')
      } catch (err) {
        console.log('[push] showNotification HATASI:', err && err.message)
        try {
          await self.registration.showNotification('HATA: ' + (err && err.message ? err.message : String(err)), {
            body: 'showNotification başarısız oldu — bu bildirimi görüyorsan sorun ikon/veri ile ilgiliydi.',
          })
        } catch (err2) {
          console.log('[push] YEDEK showNotification DA HATA VERDİ:', err2 && err2.message)
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
