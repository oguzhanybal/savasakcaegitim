// Vercel sunucu tarafı fonksiyonu (serverless), HER GÜN Vercel Cron
// tarafından otomatik çalıştırılır (bkz. vercel.json > crons). Amaç: 2
// haftadan (14 gün) eski, hâlâ Supabase Storage'da duran ödev dosyalarını
// Google Drive'a taşımak (yükleyip oradaki linki kaydetmek) ve Supabase
// Storage'dan silmek — Supabase'in ücretsiz depolama kotası dolmasın diye.
//
// GÜVENLİK: bu uç nokta, sadece Vercel'in kendisinin (cron tetiklediğinde)
// gönderdiği "Authorization: Bearer <CRON_SECRET>" başlığıyla çalışır —
// başka biri bu adresi ziyaret ederse hiçbir şey yapmadan 401 döner.
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'odev-ekleri'
const KLASOR_ADI = 'Savaş Akça Eğitim - Ödev Arşivi'
const BIR_CALISMADA_MAKSIMUM_DOSYA = 10 // Vercel'in zaman sınırını aşmamak için

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET
  const gelenYetki = req.headers.authorization || ''
  if (!cronSecret || gelenYetki !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Yetkisiz.' })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!supabaseUrl || !serviceKey || !clientId || !clientSecret) {
    res.status(500).json({ error: 'Sunucu yapılandırması eksik.' })
    return
  }

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: baglanti } = await admin
    .from('google_baglanti')
    .select('refresh_token, drive_klasor_id')
    .eq('id', true)
    .maybeSingle()

  if (!baglanti?.refresh_token) {
    res.status(200).json({ ok: true, mesaj: 'Google Drive bağlı değil, arşivleme atlandı.' })
    return
  }

  // 1) refresh_token'ı taze bir erişim jetonuna (access_token) çeviriyoruz.
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

  // 2) Arşiv klasörünü buluyoruz (daha önce bulunup kaydedildiyse tekrar
  // aramıyoruz), yoksa oluşturup id'sini google_baglanti'ye kaydediyoruz.
  let klasorId = baglanti.drive_klasor_id
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
      await admin.from('google_baglanti').update({ drive_klasor_id: klasorId }).eq('id', true)
    }
  }

  // 3) 14 günden eski, hâlâ dosyası olan (arşivlenmemiş) ödevleri buluyoruz.
  const kesimTarihi = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data: odevler, error: odevlerHatasi } = await admin
    .from('odevler')
    .select('id, baslik, dosya_yolu, olusturma_tarihi')
    .not('dosya_yolu', 'is', null)
    .is('arsiv_link', null)
    .lt('olusturma_tarihi', kesimTarihi)
    .limit(BIR_CALISMADA_MAKSIMUM_DOSYA)

  if (odevlerHatasi) {
    res.status(500).json({ error: 'Ödevler okunamadı: ' + odevlerHatasi.message })
    return
  }

  const sonuclar = []
  for (const odev of odevler || []) {
    try {
      // Dosyayı Supabase Storage'dan indiriyoruz.
      const { data: dosyaBlob, error: indirmeHatasi } = await admin.storage.from(BUCKET).download(odev.dosya_yolu)
      if (indirmeHatasi) throw new Error('İndirilemedi: ' + indirmeHatasi.message)

      const arrayBuffer = await dosyaBlob.arrayBuffer()
      const dosyaAdi = odev.dosya_yolu.split('/').pop()

      // Google Drive'a "multipart" yükleme: bir kısım metadata (JSON), bir
      // kısım da dosyanın kendisi (ham bayt) — tek bir HTTP isteğinde.
      const sinir = 'odev_arsiv_sinir_' + odev.id
      const metadata = JSON.stringify({ name: dosyaAdi, parents: klasorId ? [klasorId] : undefined })
      const govdeBaslangic =
        `--${sinir}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${sinir}\r\nContent-Type: ${dosyaBlob.type || 'application/octet-stream'}\r\n\r\n`
      const govdeBitis = `\r\n--${sinir}--`
      const govde = Buffer.concat([
        Buffer.from(govdeBaslangic, 'utf8'),
        Buffer.from(arrayBuffer),
        Buffer.from(govdeBitis, 'utf8'),
      ])

      const yuklemeYaniti = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${sinir}`,
          },
          body: govde,
        }
      )
      const yuklemeVerisi = await yuklemeYaniti.json()
      if (!yuklemeYaniti.ok || !yuklemeVerisi.id) {
        throw new Error('Drive yükleme hatası: ' + JSON.stringify(yuklemeVerisi))
      }

      const arsivLink = yuklemeVerisi.webViewLink || `https://drive.google.com/file/d/${yuklemeVerisi.id}/view`

      // odevler satırını güncelliyoruz: arsiv_link'i yazıyoruz, dosya_yolu'nu
      // NULL'a çekiyoruz (dosya artık Supabase Storage'da değil).
      const { error: guncelleHatasi } = await admin
        .from('odevler')
        .update({ arsiv_link: arsivLink, dosya_yolu: null })
        .eq('id', odev.id)
      if (guncelleHatasi) throw new Error('Veritabanı güncellenemedi: ' + guncelleHatasi.message)

      // Son adım olarak Supabase Storage'dan siliyoruz (yükleme ve kayıt
      // başarılı olduktan SONRA — dosya kaybolmasın diye sıralama önemli).
      await admin.storage.from(BUCKET).remove([odev.dosya_yolu])

      sonuclar.push({ id: odev.id, baslik: odev.baslik, durum: 'arsivlendi' })
    } catch (err) {
      sonuclar.push({ id: odev.id, baslik: odev.baslik, durum: 'hata', hata: err.message })
    }
  }

  res.status(200).json({ ok: true, islenenSayisi: sonuclar.length, sonuclar })
}
