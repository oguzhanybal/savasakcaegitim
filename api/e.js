// Vercel sunucu tarafı fonksiyonu (serverless). WhatsApp'a giden ekstre PDF
// linkinin okunmaz derecede uzun olmaması için — Toplu Ekstre kısa bir kod
// (ör. ?k=aB3xK9) üretip "kisa_linkler" tablosuna gerçek dosya yolunu kaydediyor,
// veli mesajdaki KISA linke tıklayınca buraya düşüyor.
//
// Önceden burada direkt 302 redirect yapılıyordu — ama WhatsApp linkin
// altında küçük bir önizleme kartı (başlık + simge) göstermek için, mesaj
// yazılırken linki kendi sunucusundan (JavaScript ÇALIŞTIRMADAN) çekip HTML
// içindeki Open Graph (og:title, og:image) etiketlerine bakıyor. Düz bir
// 302/PDF yanıtında bu etiketler olmadığı için önizleme çıkmıyordu. Şimdi
// bunun yerine küçük bir "ara sayfa" (HTML) döndürüyoruz: bu sayfada gerçek
// PDF'e giden bir buton VE insan kullanıcıyı otomatik oraya götüren bir
// JavaScript var — WhatsApp'ın önizleme botu JS çalıştırmadığı için sadece
// başlık+simgeyi görüp kartı oluşturuyor, gerçek kullanıcı ise anında PDF'e
// yönlendiriliyor (ya da buton görünürse tıklayabiliyor).
import { createClient } from '@supabase/supabase-js'

function kacisMetni(deger) {
  return String(deger || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function araSayfaHtml({ baslik, signedUrl }) {
  const guvenliBaslik = kacisMetni(baslik || 'Öğrenci Ekstresi')
  const guvenliUrl = kacisMetni(signedUrl)
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<title>${guvenliBaslik}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="${guvenliBaslik}">
<meta property="og:description" content="Savaş Akça Eğitim - Aylık Öğrenci Ekstresi (PDF)">
<meta property="og:type" content="website">
<meta property="og:image" content="https://savasakcaportal.com/logo.png">
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; background: #f4f5f7; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .kart { background: #fff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); padding: 32px 28px; max-width: 380px; text-align: center; }
  .kart img { width: 56px; height: 56px; object-fit: contain; margin-bottom: 12px; }
  .kart h1 { font-size: 18px; color: #11223d; margin: 0 0 8px; }
  .kart p { font-size: 13px; color: #667085; margin: 0 0 20px; }
  .buton { display: inline-block; background: #d26d3c; color: #fff; font-weight: 600; padding: 12px 22px; border-radius: 10px; text-decoration: none; }
</style>
</head>
<body>
  <div class="kart">
    <img src="https://savasakcaportal.com/logo.png" alt="Savaş Akça Eğitim">
    <h1>${guvenliBaslik}</h1>
    <p>PDF açılıyor, açılmazsa aşağıdaki butona dokun.</p>
    <a class="buton" href="${guvenliUrl}" target="_blank" rel="noopener">PDF'i Aç</a>
  </div>
  <script>window.location.replace(${JSON.stringify(signedUrl)});</script>
</body>
</html>`
}

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
      .select('bucket, dosya_yolu, baslik')
      .eq('kod', kod)
      .single()

    if (kayitHatasi || !kayit) {
      res.status(404).send('Bu link bulunamadı veya artık geçerli değil. Lütfen okulla iletişime geçin.')
      return
    }

    const { data: linkVerisi, error: linkHatasi } = await admin.storage
      .from(kayit.bucket)
      .createSignedUrl(kayit.dosya_yolu, 30 * 60) // 30 dakika — ara sayfa açık kalsa da yeterli süre

    if (linkHatasi || !linkVerisi) {
      res.status(500).send('Dosya linki oluşturulamadı: ' + (linkHatasi?.message || 'bilinmeyen hata'))
      return
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(200).send(araSayfaHtml({ baslik: kayit.baslik, signedUrl: linkVerisi.signedUrl }))
  } catch (err) {
    res.status(500).send('Sunucu hatası: ' + err.message)
  }
}
