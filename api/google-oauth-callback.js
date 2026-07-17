// Vercel sunucu tarafı fonksiyonu (serverless). Google'ın izin ekranından
// dönen kullanıcıyı karşılar (?code=...&state=...), bu "code"u Google'a
// göndererek kalıcı bir "refresh token" alır ve google_baglanti tablosuna
// (service role ile, RLS'i atlayarak) kaydeder. İşlem bitince kullanıcıyı
// Ödevler sayfasına geri yönlendirir.
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const { code, state, error: googleHatasi } = req.query

  if (googleHatasi) {
    res.redirect(302, '/odev?drive=hata')
    return
  }
  if (!code) {
    res.redirect(302, '/odev?drive=hata')
    return
  }

  let adminId = null
  try {
    const cozulen = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8'))
    // 10 dakikadan eski bir state'i kabul etme.
    if (!cozulen.ts || Date.now() - cozulen.ts > 10 * 60 * 1000) {
      res.redirect(302, '/odev?drive=hata')
      return
    }
    adminId = cozulen.adminId || null
  } catch {
    res.redirect(302, '/odev?drive=hata')
    return
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!clientId || !clientSecret || !supabaseUrl || !serviceKey) {
    res.redirect(302, '/odev?drive=hata')
    return
  }

  const redirectUri = 'https://savasakcaportal.com/api/google-oauth-callback'

  const tokenYaniti = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(code),
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const tokenVerisi = await tokenYaniti.json()

  if (!tokenYaniti.ok || !tokenVerisi.refresh_token) {
    // refresh_token gelmediyse (ör. Google beklenmedik bir yanıt döndü) —
    // kullanıcıyı hata durumuna yönlendiriyoruz; Odev.jsx'teki "Yeniden Bağlan"
    // butonu prompt=consent ile her denemede yeni bir refresh_token zorlar.
    res.redirect(302, '/odev?drive=hata')
    return
  }

  const admin = createClient(supabaseUrl, serviceKey)
  const { error: kayitHatasi } = await admin.from('google_baglanti').upsert({
    id: true,
    refresh_token: tokenVerisi.refresh_token,
    baglayan_profile_id: adminId,
    baglanti_tarihi: new Date().toISOString(),
  })

  if (kayitHatasi) {
    res.redirect(302, '/odev?drive=hata')
    return
  }

  res.redirect(302, '/odev?drive=baglandi')
}
