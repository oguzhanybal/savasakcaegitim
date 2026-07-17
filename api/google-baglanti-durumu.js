// Vercel sunucu tarafı fonksiyonu (serverless). Odev.jsx'teki "Google Drive
// Arşivleme" bölümünün, sayfa açıldığında bağlantı durumunu (bağlı mı, ne
// zaman bağlanmış) öğrenmesi için. google_baglanti tablosu RLS ile
// tarayıcıdan tamamen kapalı olduğundan, bu bilgiyi (refresh_token'ın
// KENDİSİNİ DEĞİL, sadece var olup olmadığını) service role ile burada okuyup
// döndürüyoruz.
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: 'Sunucu yapılandırması eksik.' })
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
    res.status(403).json({ error: 'Yetkisiz.' })
    return
  }

  const { data } = await admin
    .from('google_baglanti')
    .select('refresh_token, baglanti_tarihi')
    .eq('id', true)
    .maybeSingle()

  res.status(200).json({
    bagli: Boolean(data?.refresh_token),
    baglantiTarihi: data?.baglanti_tarihi || null,
  })
}
