// Öğrencilere, bire bir derslerinden ~10 dakika önce GERÇEK push bildirimi
// gönderen endpoint. Vercel'in kendi cron özelliği (Hobby planda günde
// sadece 1 kez çalışabiliyor) buna yetmediği için, bu endpoint HARİCİ bir
// ücretsiz servis (ör. cron-job.org) tarafından her 1-2 dakikada bir
// "ziyaret edilerek" tetiklenir. Her çalıştığında: "şu andan itibaren
// yaklaşık 10 dakika içinde başlayacak" bire bir dersleri bulur, daha önce
// hatırlatması gönderilmemişse (push_hatirlatma_log) ilgili öğrencinin
// abone olduğu cihaz(lar)a bildirim gönderir.
//
// GÜVENLİK: odev-arsivle.js ile AYNI desen — ya harici cron servisinin
// gönderdiği "Authorization: Bearer <CRON_SECRET>" başlığıyla, ya da elle
// tarayıcıdan test etmek için "?secret=<CRON_SECRET>" ile çalışır.
//
// NOT: web-push gibi bir npm paketi KASITLI OLARAK kullanılmıyor — projenin
// package.json/package-lock.json dosyalarına yeni bir bağımlılık eklemek,
// onları elden düzenlemesi gereken (npm'i olmayan) kullanıcı için riskli.
// Bunun yerine Web Push standardı (VAPID + aes128gcm şifreleme), Node'un
// kendi "crypto" modülüyle sıfırdan (bağımlılıksız) uygulanıyor.
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// ---- küçük yardımcılar: base64url <-> Buffer ----
function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromB64url(str) {
  str = String(str).replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  return Buffer.from(str, 'base64')
}
function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest()
}
function hkdfExpand(prk, info, len) {
  return hmac(prk, Buffer.concat([info, Buffer.from([0x01])])).slice(0, len)
}
function ecPubFromRaw(rawBuf) {
  const x = rawBuf.slice(1, 33)
  const y = rawBuf.slice(33, 65)
  return crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64url(x), y: b64url(y) }, format: 'jwk' })
}
function ecPrivFromRaw(rawPriv, rawPub) {
  const x = rawPub.slice(1, 33)
  const y = rawPub.slice(33, 65)
  return crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x: b64url(x), y: b64url(y), d: b64url(rawPriv) },
    format: 'jwk',
  })
}

// RFC 8291 (Web Push mesaj şifreleme) — tarayıcının abonelik anahtarlarıyla
// (p256dh + auth) payload'ı şifreler, RFC 8188 (aes128gcm) başlığını ekler.
function pushPayloadSifrele(plaintext, p256dhB64, authB64) {
  const uaPublicRaw = fromB64url(p256dhB64)
  const authSecret = fromB64url(authB64)

  const asKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const asPubJwk = asKeyPair.publicKey.export({ format: 'jwk' })
  const asPublicRaw = Buffer.concat([Buffer.from([0x04]), fromB64url(asPubJwk.x), fromB64url(asPubJwk.y)])

  const uaPublicKey = ecPubFromRaw(uaPublicRaw)
  const ecdhSecret = crypto.diffieHellman({ privateKey: asKeyPair.privateKey, publicKey: uaPublicKey })

  const salt = crypto.randomBytes(16)

  const PRK_key = hmac(authSecret, ecdhSecret)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaPublicRaw, asPublicRaw])
  const IKM = hkdfExpand(PRK_key, keyInfo, 32)

  const PRK = hmac(salt, IKM)
  const CEK = hkdfExpand(PRK, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16)
  const NONCE = hkdfExpand(PRK, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12)

  const plainBuf = Buffer.concat([Buffer.from(plaintext, 'utf8'), Buffer.from([0x02])])
  const cipher = crypto.createCipheriv('aes-128-gcm', CEK, NONCE)
  const enc = Buffer.concat([cipher.update(plainBuf), cipher.final()])
  const tag = cipher.getAuthTag()

  const rs = Buffer.alloc(4)
  rs.writeUInt32BE(4096, 0)
  const header = Buffer.concat([salt, rs, Buffer.from([asPublicRaw.length]), asPublicRaw])

  return Buffer.concat([header, enc, tag])
}

// RFC 8292 (VAPID) — sunucunun kendi kimliğini kanıtladığı imzalı jeton.
function vapidJwtOlustur(audience, subject, vapidPrivB64, vapidPubB64) {
  const header = { typ: 'JWT', alg: 'ES256' }
  const payload = { aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }
  const unsigned = `${b64url(Buffer.from(JSON.stringify(header)))}.${b64url(Buffer.from(JSON.stringify(payload)))}`
  const privateKey = ecPrivFromRaw(fromB64url(vapidPrivB64), fromB64url(vapidPubB64))
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key: privateKey, dsaEncoding: 'ieee-p1363' })
  return `${unsigned}.${b64url(sig)}`
}

async function pushGonder(subscription, payloadObj, vapid) {
  const body = pushPayloadSifrele(JSON.stringify(payloadObj), subscription.p256dh, subscription.auth)
  const endpointUrl = new URL(subscription.endpoint)
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`
  const jwt = vapidJwtOlustur(audience, vapid.subject, vapid.privateKey, vapid.publicKey)

  const yanit = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '120',
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    },
    body,
  })
  return yanit
}

// ---- Türkiye saatiyle (UTC+3, DST yok) "şu an" — Vercel fonksiyonları UTC
// çalışır, bu yüzden sunucu saat dilimine güvenmek yerine elle kaydırıyoruz.
function turkiyeSuAn() {
  return new Date(Date.now() + 3 * 60 * 60 * 1000)
}
function pad2(n) {
  return String(n).padStart(2, '0')
}
function saatDakika(d) {
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
}
function tarihStr(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}
// bire_bir_atamalari.gun: 1=Pazartesi ... 7=Pazar (bkz. BireBir.jsx gunNumaraTarihten)
function gunNumarasi(d) {
  const g = d.getUTCDay()
  return g === 0 ? 7 : g
}
// baslangic_saat sütunu Postgres 'time' tipinde olabilir ("HH:MM:SS" olarak
// dönebilir) — sadece ilk 5 karakteri ("HH:MM") karşılaştırıyoruz.
function ilk5(str) {
  return (str || '').slice(0, 5)
}

export default async function handler(req, res) {
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  const gelenYetki = req.headers.authorization || ''
  const gelenSorguSecret = String(req.query?.secret || '').trim()
  const yetkiliMi = cronSecret && (gelenYetki === `Bearer ${cronSecret}` || gelenSorguSecret === cronSecret)
  if (!yetkiliMi) {
    res.status(401).json({ error: 'Yetkisiz.' })
    return
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').trim()
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  // .trim() ÖNEMLİ: Vercel panosuna yapıştırırken sona görünmez bir boşluk/
  // satır sonu karakteri eklenmiş olabilir. Bu, base64url anahtarını bozup
  // push servisinin (FCM) "invalid JWT provided" hatası vermesine yol açar.
  const vapidPublicKey = (process.env.VAPID_PUBLIC_KEY || '').trim()
  const vapidPrivateKey = (process.env.VAPID_PRIVATE_KEY || '').trim()
  const vapidSubject = (process.env.VAPID_SUBJECT || 'mailto:admin@savasakcaportal.com').trim()

  if (!supabaseUrl || !serviceKey || !vapidPublicKey || !vapidPrivateKey) {
    res.status(500).json({ error: 'Sunucu yapılandırması eksik (Supabase veya VAPID ortam değişkenleri).' })
    return
  }

  const admin = createClient(supabaseUrl, serviceKey)
  const vapid = { publicKey: vapidPublicKey, privateKey: vapidPrivateKey, subject: vapidSubject }
  // GEÇİCİ TEŞHİS BİLGİSİ: anahtarın kendisini göstermeden sadece uzunluğunu
  // ve son 6 karakterini yanıta ekliyoruz — Vercel'e kaydedilenin, üretilen
  // anahtarla birebir aynı olup olmadığını buradan doğrulayabiliriz. Sorun
  // çözülünce bu bloğu kaldırabiliriz.
  const teshis = {
    vapidPublicKeyUzunluk: vapidPublicKey.length,
    vapidPublicKeySon6: vapidPublicKey.slice(-6),
    vapidPrivateKeyUzunluk: vapidPrivateKey.length,
    vapidPrivateKeySon6: vapidPrivateKey.slice(-6),
  }

  const suan = turkiyeSuAn()
  const bugun = tarihStr(suan)
  const gun = gunNumarasi(suan)
  // "10 dakika önce" hedefini, harici cron'un kesin dakikada tetiklenmeme
  // ihtimaline karşı 8-12 dakika aralığında (4 dakikalık bant) yakalıyoruz.
  const altSinir = saatDakika(new Date(suan.getTime() + 8 * 60 * 1000))
  const ustSinir = saatDakika(new Date(suan.getTime() + 12 * 60 * 1000))

  // 1) Haftalık tekrar eden atamalar (bire_bir_atamalari) — bugünün gününe denk gelenler.
  const { data: atamalar, error: atamaHata } = await admin
    .from('bire_bir_atamalari')
    .select('id, ogrenci_id, ogretmen_profile_id, baslangic_saat, profiles:ogretmen_profile_id(ad_soyad)')
    .eq('aktif', true)
    .eq('gun', gun)

  // 2) Tek seferlik dersler (bire_bir_yoklama, atama_id boş) — bugüne ait olanlar.
  const { data: tekseferlikler, error: tekHata } = await admin
    .from('bire_bir_yoklama')
    .select('id, ogrenci_id, ogretmen_profile_id, baslangic_saat, tur, profiles:ogretmen_profile_id(ad_soyad)')
    .is('atama_id', null)
    .eq('tarih', bugun)
    .eq('tur', 'ders')

  if (atamaHata || tekHata) {
    res.status(500).json({ error: 'Ders sorgusu hatası: ' + (atamaHata?.message || tekHata?.message) })
    return
  }

  const adaylar = [
    ...(atamalar || [])
      .filter((a) => a.baslangic_saat && ilk5(a.baslangic_saat) >= altSinir && ilk5(a.baslangic_saat) <= ustSinir)
      .map((a) => ({ kaynakTur: 'atama', kaynakId: a.id, ogrenciId: a.ogrenci_id, ogretmenAdi: a.profiles?.ad_soyad, saat: ilk5(a.baslangic_saat) })),
    ...(tekseferlikler || [])
      .filter((y) => y.baslangic_saat && ilk5(y.baslangic_saat) >= altSinir && ilk5(y.baslangic_saat) <= ustSinir)
      .map((y) => ({ kaynakTur: 'yoklama', kaynakId: y.id, ogrenciId: y.ogrenci_id, ogretmenAdi: y.profiles?.ad_soyad, saat: ilk5(y.baslangic_saat) })),
  ]

  if (adaylar.length === 0) {
    res.status(200).json({ ok: true, mesaj: 'Yaklaşan ders yok.', kontrolEdilenSaatAraligi: `${altSinir}-${ustSinir}`, teshis })
    return
  }

  const sonuclar = []
  for (const aday of adaylar) {
    // Aynı dersin hatırlatması bugün DAHA ÖNCE gönderilmiş mi? push_hatirlatma_log'a
    // yazmayı DENEYEREK anlıyoruz — benzersizlik (unique) kısıtı zaten varsa hata
    // verir, biz de "zaten gönderilmiş" deyip atlarız. Bu, aynı dersin farklı cron
    // tetiklemelerinde birden fazla kez bildirim göndermesini engelliyor.
    const { error: logHata } = await admin
      .from('push_hatirlatma_log')
      .insert({ kaynak_tur: aday.kaynakTur, kaynak_id: aday.kaynakId, tarih: bugun })
    if (logHata) {
      sonuclar.push({ ...aday, durum: 'zaten_gonderilmis' })
      continue
    }

    // Öğrencinin kendi girişi (ogrenci_profile_id) var mı? (Şimdilik SADECE
    // öğrencilere gönderiliyor — veliye değil, kullanıcının istediği kapsam.)
    const { data: ogrenci } = await admin
      .from('ogrenciler')
      .select('ad_soyad, ogrenci_profile_id')
      .eq('id', aday.ogrenciId)
      .maybeSingle()

    if (!ogrenci?.ogrenci_profile_id) {
      sonuclar.push({ ...aday, durum: 'ogrenci_girisi_yok' })
      continue
    }

    const { data: abonelikler } = await admin
      .from('push_abonelikleri')
      .select('id, endpoint, p256dh, auth')
      .eq('profile_id', ogrenci.ogrenci_profile_id)

    if (!abonelikler || abonelikler.length === 0) {
      sonuclar.push({ ...aday, ogrenciAdi: ogrenci.ad_soyad, durum: 'abonelik_yok' })
      continue
    }

    const payload = {
      baslik: 'Dersiniz Yaklaşıyor',
      govde: `${aday.ogretmenAdi ? aday.ogretmenAdi + ' ile ' : ''}bire bir dersiniz ${aday.saat}'te başlıyor.`,
      url: '/program',
    }

    let gonderilen = 0
    const hatalar = []
    for (const abn of abonelikler) {
      try {
        const yanit = await pushGonder(abn, payload, vapid)
        if (yanit.ok) {
          gonderilen++
        } else if (yanit.status === 404 || yanit.status === 410) {
          // Abonelik artık geçersiz (kullanıcı bildirimleri kapattı/tarayıcı
          // verisini sildi) — kaydı temizliyoruz ki her seferinde tekrar denenmesin.
          await admin.from('push_abonelikleri').delete().eq('id', abn.id)
          hatalar.push({ endpoint: abn.endpoint.slice(-24), status: yanit.status, mesaj: 'abonelik silindi (geçersiz)' })
        } else {
          // Önceden burası SESSİZCE atlanıyordu — artık gerçek durum kodunu
          // ve push servisinin döndürdüğü hata metnini kaydediyoruz ki
          // (ör. 401 = VAPID anahtarı uyuşmuyor) sebebi görebilelim.
          let metin = ''
          try {
            metin = await yanit.text()
          } catch {
            metin = ''
          }
          hatalar.push({ endpoint: abn.endpoint.slice(-24), status: yanit.status, mesaj: metin.slice(0, 300) })
        }
      } catch (err) {
        hatalar.push({ endpoint: abn.endpoint?.slice(-24), status: 'exception', mesaj: err.message })
      }
    }
    sonuclar.push({
      ...aday,
      ogrenciAdi: ogrenci.ad_soyad,
      durum: gonderilen > 0 ? 'gonderildi' : 'gonderilemedi',
      abonelikSayisi: gonderilen,
      toplamAbonelik: abonelikler.length,
      hatalar: hatalar.length ? hatalar : undefined,
    })
  }

  res.status(200).json({ ok: true, kontrolEdilenSaatAraligi: `${altSinir}-${ustSinir}`, sonuclar, teshis })
}
