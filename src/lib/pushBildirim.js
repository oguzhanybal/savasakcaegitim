import { supabase } from './supabase'

// Vercel'e VITE_VAPID_PUBLIC_KEY olarak eklenen ortam değişkeni derleme
// (build) sırasında buraya gömülür — VITE_SUPABASE_URL ile AYNI yöntem
// (bkz. lib/supabase.js). Bu anahtar GİZLİ DEĞİL, tarayıcıya zaten gitmesi
// gerekiyor (Web Push standardının bir parçası).
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const dolgu = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + dolgu).replace(/-/g, '+').replace(/_/g, '/')
  const ham = window.atob(base64)
  const dizi = new Uint8Array(ham.length)
  for (let i = 0; i < ham.length; i++) dizi[i] = ham.charCodeAt(i)
  return dizi
}

// Bu tarayıcı/cihaz push bildirimlerini destekliyor mu? (iPhone'da Safari'nin
// normal sekmesinde DESTEKLENMİYOR — sadece ana ekrana eklenmiş [PWA olarak
// yüklenmiş] halinde çalışıyor, bu Apple'ın kendi kısıtlaması.)
export function pushDestekleniyorMu() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

// Kullanıcı zaten abone mi? ("Bildirimleri Aç" butonunun metnini
// belirlemek için kullanılır.)
export async function bildirimAcikMi() {
  if (!pushDestekleniyorMu()) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}

// Bildirim izni ister, tarayıcıyı push'a abone eder ve abonelik bilgisini
// Supabase'e kaydeder. Hata durumunda mesajıyla birlikte fırlatır (throw) —
// çağıran taraf (Layout.jsx) yakalayıp kullanıcıya gösterir.
export async function bildirimleriAc(profileId) {
  if (!pushDestekleniyorMu()) {
    throw new Error('Bu tarayıcı/cihaz bildirimleri desteklemiyor. (iPhone\'da önce uygulamayı ana ekrana eklemeniz gerekir.)')
  }
  if (!VAPID_PUBLIC_KEY) {
    throw new Error('Bildirim sistemi henüz kurulmadı (VAPID anahtarı eksik).')
  }

  const izin = await Notification.requestPermission()
  if (izin !== 'granted') {
    throw new Error('Bildirim izni verilmedi. Tarayıcı ayarlarından izin vermeniz gerekiyor.')
  }

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  const json = sub.toJSON()
  const { error } = await supabase.from('push_abonelikleri').upsert(
    {
      profile_id: profileId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: 'endpoint' }
  )
  if (error) throw new Error('Kaydedilemedi: ' + error.message)
}

// "Bildirimleri Kapat" — hem tarayıcı aboneliğini hem Supabase kaydını siler.
export async function bildirimleriKapat() {
  if (!pushDestekleniyorMu()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  await supabase.from('push_abonelikleri').delete().eq('endpoint', endpoint)
}
