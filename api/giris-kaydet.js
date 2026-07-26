// Vercel sunucu tarafı fonksiyonu (serverless). Layout.jsx, her başarılı
// girişte (bir kez, sekme/tarayıcı oturumu başına — sayfa yenilemede TEKRAR
// çağırmaz) bu uç noktayı çağırır. Amaç: "kim ne zaman nereden girdi"
// bilgisini "giris_kayitlari" tablosuna kaydetmek — GirisKayitlari.jsx sayfası
// bunu yöneticiye gösterir.
//
// GÜVENLİK: İstemci sadece kendi Supabase erişim jetonunu ("Authorization:
// Bearer <access_token>") gönderir — HANGİ kullanıcı olduğunu istemci
// SÖYLEMEZ, biz jetonu Supabase'e doğrulatıp GERÇEK kullanıcıyı buluyoruz. Bu
// sayede biri başkasının adına sahte giriş kaydı ekleyemez.
//
// IP ADRESİ: Vercel, gerçek istemci IP'sini "x-forwarded-for" başlığında
// gönderir (tarayıcı JS'i kendi genel IP'sini bilemez, bu yüzden bu bilgi
// SADECE sunucu tarafında, isteğin kendisinden okunabilir).
//
// KONUM (şehir/ülke): IP adresinden yaklaşık şehir/ülke bulmak için ücretsiz,
// anahtarsız bir servis (ip-api.com) kullanılır — bu İSTEĞE BAĞLI bir
// iyileştirme, başarısız olursa (zaman aşımı, servis kapalı vb.) giriş kaydı
// yine de konum bilgisi olmadan eklenir, hiçbir zaman girişi ENGELLEMEZ.
import { createClient } from '@supabase/supabase-js'

async function konumBul(ip) {
  if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return null // yerel/özel IP -- ip-api.com'a sormanın anlamı yok
  }
  try {
    const controller = new AbortController()
    const zamanAsimi = setTimeout(() => controller.abort(), 3000)
    const yanit = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`, {
      signal: controller.signal,
    })
    clearTimeout(zamanAsimi)
    const veri = await yanit.json()
    if (veri.status !== 'success') return null
    return [veri.city, veri.regionName, veri.country].filter(Boolean).join(', ') || null
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Sadece POST istekleri kabul edilir.' })
    return
  }

  const yetkiBasligi = req.headers.authorization || ''
  const token = yetkiBasligi.startsWith('Bearer ') ? yetkiBasligi.slice(7) : ''
  if (!token) {
    res.status(401).json({ error: 'Yetkisiz.' })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: 'Sunucu yapılandırması eksik.' })
    return
  }

  const admin = createClient(supabaseUrl, serviceKey)

  try {
    const { data: userVerisi, error: userHatasi } = await admin.auth.getUser(token)
    if (userHatasi || !userVerisi?.user) {
      res.status(401).json({ error: 'Geçersiz oturum.' })
      return
    }
    const uid = userVerisi.user.id

    const { data: profil } = await admin.from('profiles').select('ad_soyad, rol').eq('id', uid).maybeSingle()

    const xff = req.headers['x-forwarded-for'] || ''
    const ip = String(xff).split(',')[0].trim() || req.socket?.remoteAddress || null
    const tarayici = req.headers['user-agent'] || null
    const konum = await konumBul(ip)

    const { error: eklemeHatasi } = await admin.from('giris_kayitlari').insert({
      profile_id: uid,
      ad_soyad: profil?.ad_soyad || null,
      rol: profil?.rol || null,
      ip_adresi: ip,
      konum,
      tarayici_bilgisi: tarayici,
    })
    if (eklemeHatasi) {
      res.status(500).json({ error: eklemeHatasi.message })
      return
    }
    res.status(200).json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message })
  }
}
