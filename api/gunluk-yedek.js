// Vercel sunucu tarafı fonksiyonu (serverless), HER GÜN Vercel Cron tarafından
// otomatik çalıştırılır (bkz. vercel.json > crons). Amaç: YedekAl.jsx'teki
// "Tüm Verileri Yedekle" ile AYNI .sql yedek dosyasını, hiçbir kullanıcı
// müdahalesi olmadan her gün otomatik üretip Google Drive'a yüklemek —
// düzenli yedek almayı unutma riski tamamen ortadan kalkar.
//
// Google Drive bağlantısı zaten Ödev Arşivleme özelliği için kurulmuşsa
// (bkz. Odev.jsx "Drive'a Bağlan" butonu), AYNI bağlantı burada da otomatik
// kullanılır — ayrıca bir kurulum GEREKMEZ. Hiç bağlanmamışsa, bu fonksiyon
// hata vermez, sadece "atlandı" diyip sessizce çıkar (aşağıda 2. adım).
//
// NOT (ÖNEMLİ): Buradaki .sql üretme mantığı (TABLOLAR, sqlDeger,
// tabloIcinInsertOlustur, profilEslestirmeBlogu) BİLEREK YedekAl.jsx'teki ile
// birebir aynı tutuluyor. Bu dosya, projedeki diğer tüm "api/*.js" dosyaları
// gibi kendi içinde bağımsız (src/ altından hiçbir şey import etmiyor), bu
// yüzden mantık kopyalandı. YedekAl.jsx'teki TABLOLAR listesi değişirse (yeni
// bir tablo eklenirse), BURAYA da elle eklenmesi gerekir — yoksa otomatik
// yedekte o tablo eksik kalır.
//
// GÜVENLİK: odev-arsivle.js ile AYNI desen — ya Vercel Cron'un kendisinin
// gönderdiği "Authorization: Bearer <CRON_SECRET>" başlığıyla, ya da elle
// test etmek için tarayıcı adres çubuğuna yazılan "?secret=<CRON_SECRET>" ile
// çalışır — ikisi de eşleşmezse hiçbir şey yapmadan 401 döner.
import { createClient } from '@supabase/supabase-js'

const KLASOR_ADI = 'Savaş Akça Eğitim - Günlük Yedekler'
// Bundan eski otomatik yedekler Drive'dan otomatik silinir (klasör şişmesin
// diye) — elle indirdiğin (YedekAl.jsx'ten) yedekler bu silmeden ETKİLENMEZ,
// onlar kendi bilgisayarındadır.
const SAKLAMA_GUNU = 90

// ---- YedekAl.jsx'teki ile BİREBİR AYNI (bkz. yukarıdaki NOT) ----
const TABLOLAR = [
  'profiles',
  'ogrenciler',
  'siniflar',
  'sinif_ogrenciler',
  'ders_programi',
  'sozlesmeler',
  'odemeler',
  'aylik_borclar',
  'bire_bir_atamalari',
  'bire_bir_yoklama',
  'kantin_urunler',
  'kantin_alislar',
  'odevler',
  'sinavlar',
  'sinav_kitapciklari',
  'sinav_kitapcik_sorulari',
  'ogrenci_sinav_sonuclari',
  'sinav_ders_sonuclari',
  'sinav_soru_sonuclari',
  'zil_dersleri',
]

const PROFIL_REFERANS_SUTUNLARI = {
  ogrenciler: ['veli_profile_id', 'ogrenci_profile_id'],
  siniflar: ['ogretmen_profile_id'],
  ders_programi: ['ogretmen_profile_id'],
  bire_bir_atamalari: ['ogretmen_profile_id'],
  bire_bir_yoklama: ['ogretmen_profile_id'],
  odevler: ['ogretmen_profile_id'],
}

function sqlDeger(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return `'${String(v).replace(/'/g, "''")}'`
}

function tabloIcinInsertOlustur(tablo, satirlar) {
  if (!satirlar || satirlar.length === 0) {
    return `-- ${tablo}: hiç kayıt yok, atlandı.\n`
  }
  const sutunlar = Object.keys(satirlar[0])
  const profilSutunlari = PROFIL_REFERANS_SUTUNLARI[tablo] || []
  const degerSatirlari = satirlar.map((s) => {
    const degerler = sutunlar.map((sutun) => {
      const deger = s[sutun]
      if (profilSutunlari.includes(sutun) && deger != null) {
        return `(select yeni_id from _id_eslestirme where eski_id = ${sqlDeger(deger)})`
      }
      return sqlDeger(deger)
    })
    return `  (${degerler.join(', ')})`
  })
  return (
    `insert into public.${tablo} (${sutunlar.join(', ')}) values\n` +
    degerSatirlari.join(',\n') +
    '\non conflict do nothing;\n'
  )
}

function profilEslestirmeBlogu(satirlar) {
  if (!satirlar || satirlar.length === 0) {
    return (
      '-- profiles: hiç kayıt yok. Yine de boş bir eşleştirme tablosu oluşturuluyor\n' +
      '-- ki aşağıdaki diğer tablolar hata vermeden çalışsın.\n' +
      'create temporary table _eski_profiller (eski_id uuid, ad_soyad text, rol text);\n' +
      'create temporary table _id_eslestirme (eski_id uuid, yeni_id uuid);\n'
    )
  }
  const degerSatirlari = satirlar.map(
    (s) => `  (${sqlDeger(s.id)}, ${sqlDeger(s.ad_soyad)}, ${sqlDeger(s.rol)})`
  )
  return (
    '-- Eski kullanıcı bilgileri (id + ad-soyad + rol) -- SADECE eşleştirme\n' +
    '-- için, gerçek profiles tablosuna hiçbir şey yazmaz.\n' +
    'create temporary table _eski_profiller (eski_id uuid, ad_soyad text, rol text);\n' +
    'insert into _eski_profiller (eski_id, ad_soyad, rol) values\n' +
    degerSatirlari.join(',\n') +
    ';\n\n' +
    '-- Eski id -> şimdiki (yeni) id eşleştirmesi.\n' +
    'create temporary table _id_eslestirme as\n' +
    'select e.eski_id, p.id as yeni_id\n' +
    'from _eski_profiller e\n' +
    'join public.profiles p on p.ad_soyad = e.ad_soyad and p.rol = e.rol;\n'
  )
}

export default async function handler(req, res) {
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  const gelenYetki = req.headers.authorization || ''
  const gelenSorguSecret = String(req.query?.secret || '').trim()
  const yetkiliMi = cronSecret && (gelenYetki === `Bearer ${cronSecret}` || gelenSorguSecret === cronSecret)
  if (!yetkiliMi) {
    res.status(401).json({
      error: 'Yetkisiz.',
      tani: {
        vercelde_kayitli_uzunluk: cronSecret.length,
        tarayicidan_gelen_uzunluk: gelenSorguSecret.length,
      },
    })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: 'Sunucu yapılandırması eksik.' })
    return
  }

  const admin = createClient(supabaseUrl, serviceKey)

  // 1) Google Drive bağlı mı? Değilse sessizce (hata vermeden) çık — admin
  // önce Ödev sayfasından "Drive'a Bağlan" yapmalı.
  if (!clientId || !clientSecret) {
    res.status(200).json({ ok: true, mesaj: 'Google entegrasyonu yapılandırılmamış, otomatik yedekleme atlandı.' })
    return
  }
  const { data: baglanti } = await admin
    .from('google_baglanti')
    .select('refresh_token, yedek_klasor_id')
    .eq('id', true)
    .maybeSingle()

  if (!baglanti?.refresh_token) {
    res.status(200).json({
      ok: true,
      mesaj: 'Google Drive bağlı değil, otomatik yedekleme atlandı. Ödev sayfasından "Drive\'a Bağlan" ile bağlayabilirsiniz.',
    })
    return
  }

  // 2) Tüm tabloları oku.
  const sonuclar = await Promise.all(TABLOLAR.map((tablo) => admin.from(tablo).select('*')))
  const hataliTablo = sonuclar.findIndex((s) => s.error)
  if (hataliTablo !== -1) {
    res.status(500).json({ error: `"${TABLOLAR[hataliTablo]}" tablosu okunurken hata: ${sonuclar[hataliTablo].error.message}` })
    return
  }

  const simdi = new Date()
  const tarihEtiketi = `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, '0')}-${String(simdi.getDate()).padStart(2, '0')}_${String(simdi.getHours()).padStart(2, '0')}${String(simdi.getMinutes()).padStart(2, '0')}`

  const profilSatirlari = sonuclar[0].data || []
  const digerTablolar = TABLOLAR.slice(1)
  const digerSonuclar = sonuclar.slice(1)

  const bolumler = digerTablolar.map((tablo, i) => {
    const satirlar = digerSonuclar[i].data || []
    return `-- ---- ${tablo} (${satirlar.length} kayıt) ----\n` + tabloIcinInsertOlustur(tablo, satirlar)
  })

  const dosyaIcerigi =
    `-- ============================================================================\n` +
    `-- SAVAŞ AKÇA EĞİTİM — OTOMATİK GÜNLÜK VERİ YEDEĞİ (${tarihEtiketi})\n` +
    `-- ============================================================================\n` +
    `-- Bu dosyayı çalıştırmadan ÖNCE:\n` +
    `--   1) "sifirdan_kurulum.sql" ile boş yapı zaten kurulmuş olmalı,\n` +
    `--   2) TÜM kullanıcılar (öğretmenler, veliler, öğrenciler, kantin) "Kullanıcı\n` +
    `--      Oluştur" sayfasından, aşağıdaki listedeki AYNI ad-soyad ve rolle\n` +
    `--      yeniden oluşturulmuş olmalı (şifreler farklı olabilir, sorun değil).\n` +
    `-- Tam adımlar "felaket_kurtarma_rehberi" dosyasındadır.\n` +
    `--\n` +
    `-- Yedek alındığındaki kullanıcı listesi (referans için):\n` +
    profilSatirlari.map((p) => `--   - ${p.ad_soyad} (${p.rol})`).join('\n') +
    `\n-- ============================================================================\n\n` +
    `set session_replication_role = replica;\n\n` +
    `-- ---- kullanıcı id eşleştirmesi (profiles) ----\n` +
    profilEslestirmeBlogu(profilSatirlari) +
    '\n' +
    bolumler.join('\n') +
    `\nset session_replication_role = default;\n`

  // 3) refresh_token'ı taze bir erişim jetonuna (access_token) çeviriyoruz.
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

  // 4) Yedek klasörünü buluyoruz (daha önce bulunup kaydedildiyse tekrar
  // aramıyoruz), yoksa oluşturup id'sini google_baglanti'ye kaydediyoruz.
  let klasorId = baglanti.yedek_klasor_id
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
      await admin.from('google_baglanti').update({ yedek_klasor_id: klasorId }).eq('id', true)
    }
  }

  // 5) .sql dosyasını Drive'a yüklüyoruz (multipart: metadata + düz metin gövde).
  const dosyaAdi = `savasakcaegitim_veri_yedegi_${tarihEtiketi}.sql`
  const sinir = 'gunluk_yedek_sinir_' + Date.now()
  const metadata = JSON.stringify({ name: dosyaAdi, parents: klasorId ? [klasorId] : undefined })
  const govde =
    `--${sinir}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${sinir}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${dosyaIcerigi}` +
    `\r\n--${sinir}--`

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
    res.status(500).json({ error: 'Drive yükleme hatası: ' + JSON.stringify(yuklemeVerisi) })
    return
  }

  // 6) SAKLAMA_GUNU'ndan eski otomatik yedekleri Drive'dan siliyoruz — klasör
  // sonsuza kadar şişmesin diye. Bu adım hata verse bile yedek zaten
  // yüklendiği için işlemi başarısız SAYMIYORUZ, sadece bilgi olarak dönüyoruz.
  let silinenSayisi = 0
  let temizlikHatasi = null
  try {
    const kesimTarihi = new Date(Date.now() - SAKLAMA_GUNU * 24 * 60 * 60 * 1000).toISOString()
    const listeYaniti = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `'${klasorId}' in parents and trashed=false`
      )}&fields=files(id,name,createdTime)&pageSize=1000`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const listeVerisi = await listeYaniti.json()
    const eskiler = (listeVerisi.files || []).filter((f) => f.createdTime < kesimTarihi)
    for (const f of eskiler) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    }
    silinenSayisi = eskiler.length
  } catch (err) {
    temizlikHatasi = err.message
  }

  res.status(200).json({
    ok: true,
    dosyaAdi,
    link: yuklemeVerisi.webViewLink || `https://drive.google.com/file/d/${yuklemeVerisi.id}/view`,
    kayitSayilari: TABLOLAR.map((tablo, i) => ({ tablo, adet: (sonuclar[i].data || []).length })),
    silinenEskiYedekSayisi: silinenSayisi,
    temizlikHatasi,
  })
}
