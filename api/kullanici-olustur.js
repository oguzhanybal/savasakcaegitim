// Vercel sunucu tarafı fonksiyonu (serverless). Bu dosya tarayıcıda ÇALIŞMAZ,
// Vercel'in sunucusunda çalışır — bu yüzden gizli "service role key" burada
// güvenle kullanılabilir (tarayıcıya asla gönderilmez).
import { createClient } from '@supabase/supabase-js'

const GECERLI_ROLLER = ['yonetici', 'ogretmen', 'veli', 'ogrenci', 'kantin', 'zil']

// Ad-soyad'ı, nasıl girilirse girilsin "İlk Harfler Büyük, Diğerleri Küçük"
// biçimine çevirir (bağlaçlar hariç, bkz. aşağı). Bu dosya src/lib'i import
// etmiyor (ayrı bir sunucu ortamı olduğu için), bu yüzden src/lib/adSoyadFormat.js
// ile birebir aynı küçük fonksiyon burada da tutuluyor.
const BAGLAC_KUCUK_YAZILANLAR = new Set(['ve', 'ile', 'da', 'de', 'veya', 'ya', 'ki'])

function adSoyadDuzelt(metin) {
  if (!metin) return metin
  return metin
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((kelime, index) => {
      if (!kelime) return kelime
      if (index > 0 && BAGLAC_KUCUK_YAZILANLAR.has(kelime.toLocaleLowerCase('tr-TR'))) {
        return kelime.toLocaleLowerCase('tr-TR')
      }
      // Kelimenin içinde tire varsa (ör. "11-sayısal", "Ali-Rıza"), tireden
      // sonraki harf de büyük başlasın diye kelimeyi tire etrafında ayrıca bölüyoruz.
      return kelime
        .split('-')
        .map((parca) => {
          if (!parca) return parca
          const ilkHarf = parca.charAt(0).toLocaleUpperCase('tr-TR')
          const geriKalan = parca.slice(1).toLocaleLowerCase('tr-TR')
          return ilkHarf + geriKalan
        })
        .join('-')
    })
    .join(' ')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Sadece POST istekleri kabul edilir.' })
    return
  }

  const { adSoyad, kullaniciAdi, sifre, rol, telefon, brans } = req.body || {}

  if (!adSoyad?.trim() || !kullaniciAdi?.trim() || !sifre || !rol) {
    res.status(400).json({ error: 'Ad soyad, kullanıcı adı, şifre ve rol zorunludur.' })
    return
  }
  if (!GECERLI_ROLLER.includes(rol)) {
    res.status(400).json({ error: 'Geçersiz rol.' })
    return
  }
  if (sifre.length < 6) {
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

  const temizKullaniciAdi = kullaniciAdi.trim()
  const ozelEposta = temizKullaniciAdi.includes('@')

  // Örn. "Öğrenciler" sayfasından "Otomatik Hesap Oluştur" ile isimden
  // otomatik türetilen kullanıcı adları (ör. "yigitatik") çakışabilir — aynı
  // isimde iki öğrenci varsa. Bu durumda kullanıcıyı hatayla geri çevirmek
  // yerine, sonuna 2, 3, 4... ekleyerek boş bir kullanıcı adı bulana kadar
  // otomatik deniyoruz. Yönetici gerçek bir e-posta girdiyse (ozelEposta)
  // bu şekilde numara EKLEMİYORUZ — bir e-postanın sonuna rastgele rakam
  // eklemek anlamsız/yanlış olurdu, o durumda normal şekilde hata dönüyoruz.
  let deneme = 0
  let olusturulan = null
  let sonHata = null
  let kullanilanKullaniciAdi = temizKullaniciAdi
  let kullanilanEposta = ozelEposta ? temizKullaniciAdi : `${temizKullaniciAdi.toLowerCase()}@savasakcaegitim.giris`
  const MAX_DENEME = ozelEposta ? 1 : 30

  while (deneme < MAX_DENEME) {
    const adayKullaniciAdi = deneme === 0 ? temizKullaniciAdi.toLowerCase() : `${temizKullaniciAdi.toLowerCase()}${deneme + 1}`
    const adayEposta = ozelEposta ? temizKullaniciAdi : `${adayKullaniciAdi}@savasakcaegitim.giris`

    const sonuc = await admin.auth.admin.createUser({
      email: adayEposta,
      password: sifre,
      email_confirm: true,
    })

    if (!sonuc.error) {
      olusturulan = sonuc.data
      kullanilanKullaniciAdi = adayKullaniciAdi
      kullanilanEposta = adayEposta
      break
    }

    sonHata = sonuc.error
    const zatenKayitli = /already.*registered|already exists/i.test(sonuc.error.message || '')
    if (!zatenKayitli) break // Başka türden bir hataysa (ör. şifre kuralı) numarayla tekrar denemenin anlamı yok.
    deneme++
  }

  if (!olusturulan) {
    res.status(400).json({ error: 'Hesap oluşturulamadı: ' + (sonHata?.message || 'Bilinmeyen hata.') })
    return
  }

  const { error: profilHatasi } = await admin.from('profiles').insert({
    id: olusturulan.user.id,
    ad_soyad: adSoyadDuzelt(adSoyad),
    rol,
    telefon: telefon?.trim() || null,
    brans: rol === 'ogretmen' ? brans?.trim() || null : null,
  })

  if (profilHatasi) {
    // Profil eklenemediyse yarım kalan auth kullanıcısını geri al.
    await admin.auth.admin.deleteUser(olusturulan.user.id)
    res.status(400).json({ error: 'Profil kaydı oluşturulamadı: ' + profilHatasi.message })
    return
  }

  res.status(200).json({ ok: true, userId: olusturulan.user.id, email: kullanilanEposta, kullaniciAdi: kullanilanKullaniciAdi })
}
