// Vercel sunucu tarafı fonksiyonu (serverless). kullanici-olustur.js ile aynı
// desen: gizli "service role key" sadece burada, sunucuda kullanılır.
// Bir kullanıcıyı (öğretmen, öğrenci-hesabı vb.) hem profiles tablosundan hem
// de giriş (auth) sisteminden siler.
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Sadece POST istekleri kabul edilir.' })
    return
  }

  const { id } = req.body || {}
  if (!id) {
    res.status(400).json({ error: 'Kullanıcı id zorunludur.' })
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

  // Önce profiles satırını siliyoruz. Bu öğretmene ait geçmiş ders / yoklama /
  // ödeme kaydı varsa veritabanı bunu bir "foreign key" hatasıyla (23503)
  // engeller — yani geçmiş veriler yanlışlıkla asla sessizce silinmez.
  const { error: profilHatasi } = await admin.from('profiles').delete().eq('id', id)
  if (profilHatasi) {
    if (profilHatasi.code === '23503') {
      res.status(400).json({
        error:
          'Bu öğretmenin sistemde geçmiş ders, yoklama ya da ödeme kayıtları var — bu yüzden silinemiyor (geçmiş kayıtlar kaybolmasın diye). Bu öğretmeni artık kullanmıyorsanız bana söyleyin, "pasif" hale getirme özelliği ekleyebilirim.',
      })
    } else {
      res.status(400).json({ error: 'Profil silinemedi: ' + profilHatasi.message })
    }
    return
  }

  const { error: authHatasi } = await admin.auth.admin.deleteUser(id)
  if (authHatasi) {
    res.status(400).json({ error: 'Giriş hesabı silinemedi: ' + authHatasi.message })
    return
  }

  res.status(200).json({ ok: true })
}
