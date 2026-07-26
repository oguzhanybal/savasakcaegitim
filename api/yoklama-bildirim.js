// Yoklama alınınca yöneticiye e-posta bildirimi gönderen endpoint.
// Resend (https://resend.com) ücretsiz e-posta API'sini kullanır — resmi
// belge/onay gerektiren WhatsApp Business API'nin aksine, birkaç dakikada
// kurulabiliyor: ücretsiz hesap aç, API anahtarını al, Vercel'de ortam
// değişkeni (environment variable) olarak ekle.
//
// Gerekli Vercel ortam değişkenleri:
//   RESEND_API_KEY   — Resend hesabından alınan API anahtarı (zorunlu)
//   YONETICI_EMAIL   — bildirimin gideceği e-posta adresi (zorunlu)
//
// Not: Resend'in kendi doğrulanmış alan adı (domain) olmadan gönderdiğiniz
// "onboarding@resend.dev" adresi, YALNIZCA Resend hesabını açarken
// doğruladığınız kendi e-posta adresinize gönderim yapabilir — bu da zaten
// tam istediğimiz şey (yöneticiye bildirim), o yüzden ayrıca bir alan adı
// doğrulamaya GEREK YOK.
//
// Bu endpoint'in başarısız olması (ör. henüz API anahtarı eklenmediyse)
// yoklama kaydını ASLA engellemez — Yoklama.jsx bu isteği "ateşle ve unut"
// (fire-and-forget) şeklinde çağırır, hata olursa sessizce yutulur.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Sadece POST kabul edilir.' })
    return
  }

  const apiKey = process.env.RESEND_API_KEY
  const yoneticiEmail = process.env.YONETICI_EMAIL

  // Ortam değişkenleri henüz eklenmediyse (ör. yeni kurulum), sessizce
  // "yapılmadı" döneriz — yoklama kaydı zaten tamamlanmış oluyor, bu sadece
  // ek bir bildirim katmanı.
  if (!apiKey || !yoneticiEmail) {
    res.status(200).json({ gonderildi: false, sebep: 'RESEND_API_KEY ya da YONETICI_EMAIL ortam değişkeni eksik.' })
    return
  }

  const {
    sinifAdi,
    saatMetni,
    tarih,
    ogretmenAdi,
    gelenSayisi,
    gelmeyenSayisi,
    gelmeyenIsimler,
  } = req.body || {}

  const tarihMetni = tarih
    ? new Date(tarih + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  const gelmeyenSatiri =
    gelmeyenSayisi > 0 && Array.isArray(gelmeyenIsimler) && gelmeyenIsimler.length > 0
      ? `<p style="margin:12px 0 0;color:#b91c1c;"><strong>Gelmeyenler:</strong> ${gelmeyenIsimler.join(', ')}</p>`
      : ''

  const html = `
    <div style="font-family:sans-serif;font-size:15px;color:#1f2937;">
      <p style="margin:0 0 12px;"><strong>${sinifAdi || 'Sınıf'}</strong> — ${saatMetni || 'Genel yoklama'}</p>
      <p style="margin:0;">${tarihMetni}${ogretmenAdi ? ` — ${ogretmenAdi} tarafından alındı` : ''}</p>
      <p style="margin:12px 0 0;">Gelen: <strong style="color:#16a34a;">${gelenSayisi ?? '-'}</strong> · Gelmeyen: <strong style="color:#dc2626;">${gelmeyenSayisi ?? '-'}</strong></p>
      ${gelmeyenSatiri}
    </div>
  `

  try {
    const yanit = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Savaş Akça Eğitim <onboarding@resend.dev>',
        to: [yoneticiEmail],
        subject: `Yoklama alındı — ${sinifAdi || 'Sınıf'} (${tarihMetni})`,
        html,
      }),
    })
    if (!yanit.ok) {
      const hataMetni = await yanit.text()
      res.status(200).json({ gonderildi: false, sebep: hataMetni })
      return
    }
    res.status(200).json({ gonderildi: true })
  } catch (err) {
    res.status(200).json({ gonderildi: false, sebep: err.message })
  }
}
