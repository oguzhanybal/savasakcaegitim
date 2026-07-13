// Vercel sunucu tarafı fonksiyonu (serverless). Tüm rollerden (yönetici,
// öğretmen, veli, öğrenci, kantin) kullanıcıları TEK listede döner — sadece
// tarayıcıdan supabase.from('profiles') ile çekilirse kullanıcı adı (e-posta)
// görünmez, çünkü o bilgi profiles tablosunda değil auth.users içinde saklanır
// ve tarayıcı bu tabloya hiçbir zaman doğrudan erişemez. Bu yüzden admin
// yetkisiyle (service role key) admin.auth.admin.listUsers() çağrılıp
// profiles ile id üzerinden eşleştiriliyor.
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Sadece GET/POST istekleri kabul edilir.' })
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

  const { data: profiller, error: profilHatasi } = await admin
    .from('profiles')
    .select('*')
    .order('rol')
    .order('ad_soyad')
  if (profilHatasi) {
    res.status(400).json({ error: profilHatasi.message })
    return
  }

  // Not: listUsers varsayılan olarak sayfa başına 50 kullanıcı döner — okulun
  // kullanıcı sayısı bunu aşabileceği için perPage'i yüksek tutuyoruz. 1000'i
  // de aşan bir kullanıcı sayısına ulaşılırsa burada sayfalama eklenmesi gerekir.
  const { data: authData, error: authHatasi } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (authHatasi) {
    res.status(400).json({ error: authHatasi.message })
    return
  }
  const emailMap = new Map((authData?.users || []).map((u) => [u.id, u.email]))

  const kullanicilar = (profiller || []).map((p) => ({
    id: p.id,
    ad_soyad: p.ad_soyad,
    rol: p.rol,
    telefon: p.telefon || null,
    brans: p.brans || null,
    aktif: p.aktif !== false,
    kullanici_adi: emailMap.get(p.id) || null,
  }))

  res.status(200).json({ kullanicilar })
}
