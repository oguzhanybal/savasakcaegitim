// Vercel sunucu tarafı fonksiyonu (serverless). kullanici-olustur.js /
// sifre-sifirla.js ile aynı desen: gizli "service role key" sadece burada
// kullanılır. Bir kullanıcının GİRİŞ ADINI (aslında auth.users'taki e-posta
// alanı — kullanici-olustur.js ile AYNI kural: "@" içeriyorsa gerçek e-posta
// olarak olduğu gibi, içermiyorsa sonuna sahte "@savasakcaegitim.giris"
// domain'i eklenerek kaydedilir) sonradan değiştirebilmek için. Ör: "Yiğit
// Atik" öğrencisine bağlı veli hesabının kullanıcı adı yanlış girilmiş/
// değiştirilmek istenmişse, buradan admin doğrudan düzeltebilir — şifreye
// dokunmaz, sadece giriş adını değiştirir.
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Sadece POST istekleri kabul edilir.' })
    return
  }

  const { id, yeniKullaniciAdi } = req.body || {}
  if (!id || !yeniKullaniciAdi?.trim()) {
    res.status(400).json({ error: 'Kullanıcı id ve yeni kullanıcı adı zorunludur.' })
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

  const temiz = yeniKullaniciAdi.trim()
  const ozelEposta = temiz.includes('@')
  const yeniKullaniciAdiKucuk = ozelEposta ? temiz : temiz.toLowerCase()
  const yeniEposta = ozelEposta ? temiz : `${yeniKullaniciAdiKucuk}@savasakcaegitim.giris`

  const { error } = await admin.auth.admin.updateUser(id, { email: yeniEposta, email_confirm: true })
  if (error) {
    const zatenKayitli = /already.*registered|already exists/i.test(error.message || '')
    res.status(400).json({
      error: zatenKayitli
        ? 'Bu kullanıcı adı başka bir hesap tarafından zaten kullanılıyor — lütfen farklı bir tane deneyin.'
        : 'Kullanıcı adı değiştirilemedi: ' + error.message,
    })
    return
  }

  res.status(200).json({ ok: true, kullaniciAdi: yeniKullaniciAdiKucuk, email: yeniEposta })
}
