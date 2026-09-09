// Vercel sunucu tarafı fonksiyonu (serverless). Google Drive bağlantısı ile
// ilgili ÜÇ ayrı uç nokta (google-oauth-baslat.js, google-oauth-callback.js,
// google-baglanti-durumu.js) burada TEK dosyada birleştirildi — Vercel'in
// Hobby (ücretsiz) planında "en fazla 12 sunucu fonksiyonu" sınırı var;
// proje bu sınıra dayandığı için (12 fonksiyon + yeni eklenen api/e.js = 13)
// deploy hata veriyordu. Bu 3 dosyayı 1'e indirmek 2 fonksiyon kazandırıyor.
//
// ?action=durumu       -> Odev.jsx sayfa açılışında bağlantı durumunu sorar
// ?action=baslat       -> "Drive'a Bağlan" butonuna basılınca izin ekranının linkini üretir
// ?action=callback     -> Google'ın izin ekranından dönüşünde çağırdığı adres
// ?action=erisimJetonu -> KitapYukle.jsx için — TARAYICIYA kısa ömürlü bir Drive
//                         erişim jetonu (access_token) + kitap klasörünün id'sini
//                         verir. NEDEN: kitap PDF'leri onlarca-yüzlerce MB
//                         olabiliyor, Vercel sunucu fonksiyonlarının istek
//                         gövdesi ~4.5MB ile sınırlı — bu yüzden dosyanın kendisi
//                         BU SUNUCUDAN HİÇ GEÇMİYOR, tarayıcı bu jetonla Drive'a
//                         DOĞRUDAN yüklüyor/indiriyor (Google'ın API'leri Bearer
//                         jetonlu isteklere CORS izni veriyor). Jeton yönetici
//                         oturumuyla korunuyor (aynı yoneticiDogrula), ~1 saat
//                         geçerli — her yükleme/indirmeden önce taze bir tane
//                         isteniyor, tarayıcıda saklanmıyor/önbelleklenmiyor.
//
// ÖNEMLİ (tek elle yapman gereken ayar): Google Cloud Console'da bu projenin
// OAuth istemcisinde kayıtlı "Authorized redirect URI" değerini
//   https://savasakcaportal.com/api/google-oauth-callback
// yerine
//   https://savasakcaportal.com/api/google-drive?action=callback
// olarak güncellemen gerekiyor — aksi halde Google "redirect_uri_mismatch"
// hatası verir. (Google Cloud Console → API'ler ve Hizmetler → Kimlik
// Bilgileri → ilgili OAuth 2.0 İstemci Kimliği → Yetkilendirilmiş yönlendirme
// URI'leri.)
import { createClient } from '@supabase/supabase-js'

const REDIRECT_URI = 'https://savasakcaportal.com/api/google-drive?action=callback'

export default async function handler(req, res) {
  const action = req.query.action

  if (action === 'durumu') return durumuGetir(req, res)
  if (action === 'baslat') return baslat(req, res)
  if (action === 'callback') return callback(req, res)
  if (action === 'erisimJetonu') return erisimJetonuVer(req, res)

  res.status(400).json({ error: 'Geçersiz veya eksik "action" parametresi.' })
}

function adminOlustur() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return null
  return createClient(supabaseUrl, serviceKey)
}

// Ortak: Authorization header'ındaki oturum jetonundan gerçek, giriş yapmış
// bir "yonetici" kullanıcı olduğunu doğrular. Değilse null döner.
async function yoneticiDogrula(req, admin) {
  const yetkiBasligi = req.headers.authorization || ''
  const token = yetkiBasligi.startsWith('Bearer ') ? yetkiBasligi.slice(7) : null
  if (!token) return null

  const { data: kullaniciSonuc, error: kullaniciHatasi } = await admin.auth.getUser(token)
  if (kullaniciHatasi || !kullaniciSonuc?.user) return null

  const { data: profil } = await admin.from('profiles').select('rol').eq('id', kullaniciSonuc.user.id).single()
  if (profil?.rol !== 'yonetici') return null

  return kullaniciSonuc.user
}

async function durumuGetir(req, res) {
  const admin = adminOlustur()
  if (!admin) {
    res.status(500).json({ error: 'Sunucu yapılandırması eksik.' })
    return
  }
  const kullanici = await yoneticiDogrula(req, admin)
  if (!kullanici) {
    res.status(401).json({ error: 'Oturum geçersiz veya yetkisiz.' })
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

async function baslat(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const admin = adminOlustur()
  if (!admin || !clientId) {
    res.status(500).json({ error: 'Sunucu yapılandırması eksik (Vercel ortam değişkenleri).' })
    return
  }
  const kullanici = await yoneticiDogrula(req, admin)
  if (!kullanici) {
    res.status(401).json({ error: 'Oturum geçersiz veya bu işlem sadece yöneticiler tarafından yapılabilir.' })
    return
  }

  // "state" içine hangi yöneticinin bağlantıyı başlattığını ve bir zaman
  // damgasını koyuyoruz — callback tarafında 10 dakikadan eski bir state
  // reddedilir (basit bir CSRF / bayatlık koruması).
  const state = Buffer.from(JSON.stringify({ adminId: kullanici.id, ts: Date.now() })).toString('base64url')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/drive.file',
    state,
  })

  res.status(200).json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` })
}

async function callback(req, res) {
  const { code, state, error: googleHatasi } = req.query

  if (googleHatasi || !code) {
    res.redirect(302, '/odev?drive=hata')
    return
  }

  let adminId = null
  try {
    const cozulen = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8'))
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
  const admin = adminOlustur()
  if (!admin || !clientId || !clientSecret) {
    res.redirect(302, '/odev?drive=hata')
    return
  }

  const tokenYaniti = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(code),
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
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

// odev-arsivle.js'teki token-yenileme + klasör bul/oluştur mantığıyla AYNI
// desen (kod tekrarı bilerek yapıldı — bu dosyalar birbirinden bağımsız,
// projedeki diğer sunucu fonksiyonlarıyla aynı gelenek). Farkı: o bir CRON
// işi, bu ise KitapYukle.jsx'in ihtiyaç duydukça (yönetici bir kitap
// yükleyecek/açacak/silecek her seferinde) çağırdığı, TEK BİR kitap klasörü
// için jeton üreten interaktif bir uç nokta.
async function erisimJetonuVer(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const admin = adminOlustur()
  if (!admin || !clientId || !clientSecret) {
    res.status(500).json({ error: 'Sunucu yapılandırması eksik (Vercel ortam değişkenleri).' })
    return
  }
  const kullanici = await yoneticiDogrula(req, admin)
  if (!kullanici) {
    res.status(401).json({ error: 'Oturum geçersiz veya bu işlem sadece yöneticiler tarafından yapılabilir.' })
    return
  }

  const { data: baglanti } = await admin
    .from('google_baglanti')
    .select('refresh_token, kitap_klasor_id')
    .eq('id', true)
    .maybeSingle()

  if (!baglanti?.refresh_token) {
    // 409: "durum çakışması" — istemci bunu "Drive henüz bağlı değil, önce
    // Ödev sayfasından bağlan" mesajı göstermek için özel olarak yakalıyor.
    res.status(409).json({ error: 'baglanti_yok', mesaj: 'Google Drive henüz bağlı değil.' })
    return
  }

  const jetonYaniti = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: baglanti.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const jetonVerisi = await jetonYaniti.json()
  if (!jetonYaniti.ok || !jetonVerisi.access_token) {
    res.status(500).json({ error: 'Google erişim jetonu alınamadı: ' + JSON.stringify(jetonVerisi) })
    return
  }
  const accessToken = jetonVerisi.access_token

  // Kitap klasörünü buluyoruz (daha önce bulunup kaydedildiyse tekrar
  // aramıyoruz), yoksa oluşturup id'sini google_baglanti'ye kaydediyoruz —
  // ödev arşivinin kullandığı klasörle KARIŞMASIN diye ayrı bir kolon
  // (kitap_klasor_id) ve ayrı bir isim kullanılıyor.
  const KLASOR_ADI = 'Savaş Akça Eğitim - Kitaplar'
  let klasorId = baglanti.kitap_klasor_id
  if (!klasorId) {
    const aramaYaniti = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `name='${KLASOR_ADI}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
      )}&fields=files(id)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const aramaVerisi = await aramaYaniti.json()
    if (aramaVerisi.files?.length > 0) {
      klasorId = aramaVerisi.files[0].id
    } else {
      const olusturYaniti = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: KLASOR_ADI, mimeType: 'application/vnd.google-apps.folder' }),
      })
      const olusturVerisi = await olusturYaniti.json()
      klasorId = olusturVerisi.id
    }
    if (klasorId) {
      await admin.from('google_baglanti').update({ kitap_klasor_id: klasorId }).eq('id', true)
    }
  }

  res.status(200).json({ accessToken, klasorId: klasorId || null })
}
