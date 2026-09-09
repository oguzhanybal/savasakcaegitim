// KitapYukle.jsx'teki kitap PDF'lerini artık Supabase Storage yerine Google
// Drive'a yükleyip oradan okuyabilmek için — kullanıcı isteğiyle eklendi:
// "ücretsiz Supabase planında alan sıkıntısı oluyor, drive üzerinden
// çözelim". Site zaten Ödev arşivleme için (bkz. api/odev-arsivle.js) bir
// Google Drive OAuth bağlantısına sahip (google_baglanti tablosu,
// api/google-drive.js) — burada AYNI bağlantı, ayrı bir Drive klasörüyle
// ("Savaş Akça Eğitim - Kitaplar") kitap PDF'leri için yeniden kullanılıyor.
//
// ÖNEMLİ (neden dosya bu sunucudan HİÇ GEÇMİYOR): kitap PDF'leri onlarca-
// yüzlerce MB olabiliyor, Vercel sunucu fonksiyonlarının istek/yanıt gövdesi
// ~4.5MB ile sınırlı. Bu yüzden api/google-drive.js sadece KISA ÖMÜRLÜ bir
// erişim jetonu + kitap klasörünün id'sini veriyor (küçük bir JSON yanıtı);
// asıl PDF baytları TARAYICIDAN DOĞRUDAN Google'ın API'lerine gidip geliyor
// (Google, Bearer jetonlu isteklere tarayıcıdan CORS izni veriyor). Jeton
// hiçbir yerde saklanmıyor — her yükleme/indirme/silme öncesi taze bir tane
// isteniyor.
//
// SADECE YENİ kitaplar bu yolu kullanıyor — var olan, Supabase Storage'da
// duran kitaplara (pdf_yolu dolu, drive_dosya_id boş) HİÇ dokunulmuyor,
// onlar eskisi gibi supabase.storage üzerinden okunmaya devam ediyor (bkz.
// kitapPdf.js / KitapYukle.jsx'teki "kitap.drive_dosya_id var mı" dallanması).
import { supabase } from './supabase'

// "Drive henüz bağlı değil" durumunu (api/google-drive.js'in 409 yanıtı)
// çağıran taraf ("Ödev sayfasından bağlanın" gibi özel bir mesaj göstermek
// isteyebilir) ayırt edebilsin diye ayrı bir hata sınıfı.
export class DriveBagliDegilHatasi extends Error {
  constructor() {
    super('Google Drive henüz bağlı değil. Lütfen önce Ödev sayfasından "Drive\'a Bağlan" ile bağlantı kurun.')
    this.name = 'DriveBagliDegilHatasi'
  }
}

async function driveErisimBilgisiAl() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Oturum bulunamadı, lütfen tekrar giriş yapın.')

  const yanit = await fetch('/api/google-drive?action=erisimJetonu', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (yanit.status === 409) throw new DriveBagliDegilHatasi()
  const veri = await yanit.json()
  if (!yanit.ok || !veri.accessToken) {
    throw new Error('Drive erişim jetonu alınamadı: ' + (veri.error || yanit.statusText))
  }
  return veri // { accessToken, klasorId }
}

// Bir kitap PDF'ini (Blob/File) doğrudan tarayıcıdan Drive'daki kitap
// klasörüne yükler, oluşan Drive dosya id'sini döner.
//
// ÖNEMLİ DÜZELTME (kullanıcı bildirimi: "çok yavaş yüklüyor neden"): ÖNCEDEN
// "multipart" yöntemi kullanılıyordu — tüm dosya, metadata ile birlikte TEK
// bir Blob'a paketlenip TEK bir istekte gönderiliyordu. Google'ın kendi
// belgelerine göre bu yöntem SADECE küçük dosyalar için önerilir; 5MB'ın
// üzerindeki dosyalarda (kitap PDF'leri onlarca-yüzlerce MB) "resumable
// upload" (devam ettirilebilir yükleme) öneriliyor — hem daha verimli
// aktarılıyor hem de bağlantı kesilirse baştan başlamak zorunda kalmıyor.
// Ayrıca multipart yöntemi, göndermeden ÖNCE koca dosyayı yeni bir Blob'a
// kopyalıyordu (tarayıcıda görünmeyen, ekrana "yüzde" yansımayan bir bekleme
// süresi) — resumable yöntemde dosya OLDUĞU GİBİ gönderiliyor, bu adım da
// ortadan kalkıyor.
//
// NOT: yine de en büyük etken kullanıcının kendi İNTERNETİNİN YÜKLEME hızı
// (indirme hızından genelde çok daha düşük olur) — bu, dosya tarayıcıdan
// doğrudan Google'a gittiği için değişmeyen bir fizik sınırı, hiçbir kod
// değişikliği bunu ortadan kaldıramaz.
//
// ilerlemeCallback(oran) — 0..1 arası bir yükleme oranı verir. Bunun için
// bilerek fetch() DEĞİL, XMLHttpRequest kullanılıyor — fetch'in GÖNDERİLEN
// veri (istek gövdesi) için bir ilerleme olayı YOK, sadece
// XMLHttpRequest'in upload.onprogress'i bunu destekliyor.
export async function driveyeKitapYukle(dosya, dosyaAdi, ilerlemeCallback) {
  const { accessToken, klasorId } = await driveErisimBilgisiAl()

  // 1) Resumable yükleme OTURUMU başlatıyoruz — küçük bir JSON isteği,
  // dosyanın kendisi henüz gitmiyor. Google, oturumun adresini "Location"
  // yanıt başlığında döner.
  const baslatYaniti = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'application/pdf',
        'X-Upload-Content-Length': String(dosya.size),
      },
      body: JSON.stringify({ name: dosyaAdi, parents: klasorId ? [klasorId] : undefined }),
    }
  )
  if (!baslatYaniti.ok) {
    throw new Error(`Drive yükleme oturumu başlatılamadı (HTTP ${baslatYaniti.status}).`)
  }
  const oturumUrl = baslatYaniti.headers.get('Location')
  if (!oturumUrl) throw new Error('Drive yükleme oturumu başlatılamadı (oturum adresi alınamadı).')

  // 2) Asıl dosyayı bu oturuma gönderiyoruz — dosya OLDUĞU GİBİ (ekstra bir
  // Blob'a kopyalanmadan) yollanıyor, ilerleme XHR ile canlı takip ediliyor.
  return new Promise((resolve, reject) => {
    const istek = new XMLHttpRequest()
    istek.open('PUT', oturumUrl)
    istek.setRequestHeader('Content-Type', 'application/pdf')
    istek.upload.onprogress = (e) => {
      if (ilerlemeCallback && e.lengthComputable) ilerlemeCallback(e.loaded / e.total)
    }
    istek.onload = () => {
      let veri = {}
      try {
        veri = JSON.parse(istek.responseText)
      } catch {
        // yanıt JSON değilse (beklenmeyen bir hata sayfası vb.) veri boş kalır,
        // aşağıdaki "!veri.id" kontrolü zaten hatayı yakalayacak.
      }
      if (istek.status >= 200 && istek.status < 300 && veri.id) {
        resolve(veri.id)
      } else {
        reject(new Error(`Drive'a yükleme hatası (HTTP ${istek.status}): ` + JSON.stringify(veri)))
      }
    }
    istek.onerror = () => reject(new Error('Drive\'a yükleme hatası: bağlantı sorunu.'))
    istek.send(dosya)
  })
}

// Drive'daki bir kitap PDF'ini indirip Blob olarak döner (pdf.js ile açmak
// için supabase.storage.download() ile AYNI şekle sahip: bir Blob).
export async function driveDenKitapIndir(driveDosyaId) {
  const { accessToken } = await driveErisimBilgisiAl()
  const yanit = await fetch(`https://www.googleapis.com/drive/v3/files/${driveDosyaId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!yanit.ok) throw new Error('Kitap Drive\'dan indirilemedi (HTTP ' + yanit.status + ').')
  return await yanit.blob()
}

// Bir kitap silinirken Drive'daki dosyasını da çöp kutusuna taşır — kalıcı
// silmiyoruz (trash), yanlışlıkla silinen bir kitap gerekirse Drive'ın kendi
// çöp kutusundan geri alınabilsin diye.
export async function driveDenKitapSil(driveDosyaId) {
  const { accessToken } = await driveErisimBilgisiAl()
  await fetch(`https://www.googleapis.com/drive/v3/files/${driveDosyaId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  })
  // Silme hatası (ör. dosya zaten yoksa) sessizce yutuluyor — asıl kayıt
  // (kitaplar tablosundaki satır) zaten siliniyor, Drive'da yetim bir dosya
  // kalması (en kötü ihtimalle) veri kaybından çok daha az önemli.
}

// Bir kitabın PDF'ini, nerede durduğuna bakmaksızın (Drive ya da Supabase
// Storage) tek bir yerden indirir — kitapPdf.js ve KitapYukle.jsx'teki
// önizleme/test-oluşturma kodlarının İKİSİ DE bunu kullanıyor, aynı
// dallanma mantığı iki yerde ayrı ayrı yazılmasın diye.
export async function kitapPdfBlobuGetir(kitap) {
  if (kitap.drive_dosya_id) return driveDenKitapIndir(kitap.drive_dosya_id)
  const { data, error } = await supabase.storage.from('kitaplar').download(kitap.pdf_yolu)
  if (error) throw error
  return data
}
