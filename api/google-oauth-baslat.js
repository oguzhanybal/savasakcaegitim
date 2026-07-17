// Vercel sunucu tarafı fonksiyonu (serverless). Google Drive bağlantısını
// başlatan uç nokta — SADECE yönetici rolündeki, giriş yapmış bir kullanıcı
// tarafından (Supabase oturum jetonu ile) çağrılabilir. Çağrıldığında,
// kullanıcının Google hesabına gidip "bu uygulamaya Drive'a dosya yükleme
// izni ver" diyeceği sayfanın adresini (URL) JSON olarak döner — asıl
// yönlendirmeyi (window.location.href = url) tarayıcıda Odev.jsx yapar.
//
// GÜVENLİK: bu uç nokta herkese açık olsaydı, kötü niyetli biri KENDİ Google
// hesabıyla bu izin akışını tamamlayıp, arşivleme sisteminin dosyaları kendi
// Drive'ına yüklemesini sağlayabilirdi (google_baglanti tablosundaki tek
// satırı ele geçirerek). Bu yüzden isteğin, "yonetici" rolündeki gerçek bir
// kullanıcıdan geldiğini Supabase oturum jetonuyla doğruluyoruz.
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!supabaseUrl || !serviceKey || !clientId) {
    res.status(500).json({ error: 'Sunucu yapılandırması eksik (Vercel ortam değişkenleri).' })
    return
  }

  const yetkiBasligi = req.headers.authorization || ''
  const token = yetkiBasligi.startsWith('Bearer ') ? yetkiBasligi.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'Oturum jetonu bulunamadı.' })
    return
  }

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: kullaniciSonuc, error: kullaniciHatasi } = await admin.auth.getUser(token)
  if (kullaniciHatasi || !kullaniciSonuc?.user) {
    res.status(401).json({ error: 'Oturum geçersiz.' })
    return
  }

  const { data: profil } = await admin.from('profiles').select('rol').eq('id', kullaniciSonuc.user.id).single()
  if (profil?.rol !== 'yonetici') {
    res.status(403).json({ error: 'Bu işlem sadece yöneticiler tarafından yapılabilir.' })
    return
  }

  // "state" içine hangi yöneticinin bağlantıyı başlattığını ve bir zaman
  // damgasını koyuyoruz — callback tarafında 10 dakikadan eski bir state
  // reddedilir (basit bir CSRF / bayatlık koruması).
  const state = Buffer.from(JSON.stringify({ adminId: kullaniciSonuc.user.id, ts: Date.now() })).toString(
    'base64url'
  )

  const redirectUri = 'https://savasakcaportal.com/api/google-oauth-callback'
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/drive.file',
    state,
  })

  res.status(200).json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` })
}
