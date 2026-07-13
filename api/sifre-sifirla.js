// Vercel sunucu tarafı fonksiyonu (serverless). kullanici-olustur.js /
// kullanici-sil.js ile aynı desen: gizli "service role key" sadece burada
// kullanılır. Rol fark etmeksizin (yönetici, öğretmen, veli, öğrenci, kantin)
// HERHANGİ bir kullanıcının şifresini yönetici adına değiştirir — kullanıcı
// kendi şifresini sonradan değiştirse bile, yönetici istediği an buradan
// yeni bir şifre belirleyip hesaba tekrar erişim sağlayabilir. Not: bu,
// mevcut şifreyi GÖSTERMEZ (Supabase şifreleri tek yönlü sakladığı için bu
// zaten mümkün değil) — sadece yepyeni bir şifre atar.
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Sadece POST istekleri kabul edilir.' })
    return
  }

  const { id, yeniSifre } = req.body || {}
  if (!id || !yeniSifre) {
    res.status(400).json({ error: 'Kullanıcı id ve yeni şifre zorunludur.' })
    return
  }
  if (yeniSifre.length < 6) {
    res.status(400).json({ error: 'Şifre en az 6 karakter olmalı.' })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({
      error: 'Sunucu yapılandırması eksik: Vercel ayarlarına SUPABASE_SERVICE_ROLE_KEY eklenmemiş.',
    })
    return
  }

  const admin = createClient(supabaseUrl, serviceKey)

  const { error } = await admin.auth.admin.updateUser(id, { password: yeniSifre })
  if (error) {
    res.status(400).json({ error: 'Şifre değiştirilemedi: ' + error.message })
    return
  }

  res.status(200).json({ ok: true })
}
