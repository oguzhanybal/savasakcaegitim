// Vercel sunucu tarafı fonksiyonu (serverless). WhatsApp'a giden ekstre PDF
// linkinin okunmaz derecede uzun olmaması için — Toplu Ekstre kısa bir kod
// (ör. ?k=aB3xK9) üretip "kisa_linkler" tablosuna gerçek dosya yolunu kaydediyor,
// veli mesajdaki KISA linke tıklayınca buraya düşüyor: kodu tabloda buluyoruz,
// gerçek dosya için TAZE bir imzalı (signed) URL üretip veliyi oraya yönlendiriyoruz
// (302 redirect) — veli hiçbir zaman uzun linki görmüyor/kopyalamıyor.
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const kod = req.query.k
  if (!kod || typeof kod !== 'string') {
    res.status(400).send('Geçersiz link.')
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    res.status(500).send('Sunucu yapılandırması eksik: SUPABASE_SERVICE_ROLE_KEY tanımlı değil.')
    return
  }

  const admin = createClient(supabaseUrl, serviceKey)

  try {
    const { data: kayit, error: kayitHatasi } = await admin
      .from('kisa_linkler')
      .select('bucket, dosya_yolu')
      .eq('kod', kod)
      .single()

    if (kayitHatasi || !kayit) {
      res.status(404).send('Bu link bulunamadı veya artık geçerli değil. Lütfen okulla iletişime geçin.')
      return
    }

    const { data: linkVerisi, error: linkHatasi } = await admin.storage
      .from(kayit.bucket)
      .createSignedUrl(kayit.dosya_yolu, 60 * 10) // 10 dakika yeterli — indirmek için açılıp kapanacak

    if (linkHatasi || !linkVerisi) {
      res.status(500).send('Dosya linki oluşturulamadı: ' + (linkHatasi?.message || 'bilinmeyen hata'))
      return
    }

    res.writeHead(302, { Location: linkVerisi.signedUrl })
    res.end()
  } catch (err) {
    res.status(500).send('Sunucu hatası: ' + err.message)
  }
}
