import { useState } from 'react'
import { supabase } from '../lib/supabase'

// ============================================================================
// TÜM VERİLERİ YEDEKLE — sitenin veritabanındaki bütün tabloların o anki
// verisini, doğrudan Supabase SQL Editor'e yapıştırılıp çalıştırılabilecek bir
// ".sql" dosyası olarak indirir. Amaç: bir felaket durumunda (Supabase projesi
// kaybolursa), önce "sifirdan_kurulum.sql" ile boş yapı kurulup, sonra BU
// dosyadaki veriler geri yüklenerek site eski haline getirilebilsin.
//
// NOT (ÖNEMLİ SINIRLAMA): Bu yedek, kullanıcıların GİRİŞ bilgilerini (e-posta/
// şifre) İÇERMEZ — o bilgiler Supabase'in ayrı "auth.users" sistemindedir ve
// buradan güvenlik nedeniyle okunamaz. Bir felaket durumunda önce "Kullanıcı
// Oluştur" sayfasından herkesin girişleri yeniden oluşturulur, sonra bu
// yedekteki "profiles" verisiyle eşleştirme yapılır. Adım adım anlatım
// "felaket_kurtarma_rehberi" dosyasındadır.
// ============================================================================

// Tablolar, birbirine bağımlılık sırasına göre listelendi (FK bozulmasın diye)
// — ama dosyanın başında "session_replication_role = replica" kullanıldığı
// için bu sıra aslında ZORUNLU değil, sadece okunabilirlik için düzenli.
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

// Bir felaket sonrası kullanıcılar "Kullanıcı Oluştur" sayfasından YENİDEN
// oluşturulduğunda, her biri YENİ bir profil id'si (uuid) alır — eski
// yedekteki id'lerle eşleşmez. Bu yüzden aşağıdaki tablolardaki "kim bu
// dersin/kaydın öğretmeni/velisi" gibi profil referansı sütunlarını, ham eski
// id yerine, ad-soyad + rol eşleşmesine göre YENİ id'yi bulan bir alt sorguyla
// yazıyoruz (bkz. _id_eslestirme geçici tablosu). Böylece geri yükleme
// sırasında elle bir şey eşleştirmen gerekmez — tek şart, kullanıcıları AYNI
// ad-soyad ve rolle yeniden oluşturmuş olman.
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
  // Metin / tarih / uuid / jsonb -- hepsi tek tırnakla yazılır, içindeki
  // tek tırnaklar ikiye katlanarak (SQL standart kaçış yöntemi) korunur.
  return `'${String(v).replace(/'/g, "''")}'`
}

// "profiles" tablosunun kendisi ayrıca (aşağıda özel olarak) işleniyor, bu
// fonksiyon SADECE diğer 18 tablo için kullanılıyor.
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

// "profiles" verisini gerçek profiles tablosuna YAZMAZ (o satırlar zaten
// "Kullanıcı Oluştur" sayfasından yeniden oluşturuldu) — bunun yerine eski
// bilgileri geçici bir tabloya koyup, şimdiki (yeni) profiles tablosuyla
// ad-soyad + rol üzerinden eşleştiren bir yardımcı tablo kurar.
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
    '-- Eski id -> şimdiki (yeni) id eşleştirmesi. Kullanıcıları "Kullanıcı\n' +
    '-- Oluştur" sayfasından AYNI ad-soyad + rol ile yeniden oluşturduysan bu\n' +
    '-- otomatik doğru eşleşir. Sonunda kaç kişi eşleşmedi diye kontrol için\n' +
    '-- "select * from _eski_profiller where ad_soyad not in (select ad_soyad from _id_eslestirme);"\n' +
    '-- çalıştırabilirsin.\n' +
    'create temporary table _id_eslestirme as\n' +
    'select e.eski_id, p.id as yeni_id\n' +
    'from _eski_profiller e\n' +
    'join public.profiles p on p.ad_soyad = e.ad_soyad and p.rol = e.rol;\n'
  )
}

export default function YedekAl() {
  const [durum, setDurum] = useState('bekliyor') // bekliyor | calisiyor | tamam | hata
  const [hataMesaji, setHataMesaji] = useState('')
  const [ozet, setOzet] = useState([])

  async function yedekOlustur() {
    setDurum('calisiyor')
    setHataMesaji('')
    setOzet([])

    try {
      const sonuclar = await Promise.all(
        TABLOLAR.map((tablo) => supabase.from(tablo).select('*'))
      )

      const hataliTablo = sonuclar.findIndex((s) => s.error)
      if (hataliTablo !== -1) {
        throw new Error(
          `"${TABLOLAR[hataliTablo]}" tablosu okunurken hata: ${sonuclar[hataliTablo].error.message}`
        )
      }

      const simdi = new Date()
      const tarihEtiketi = `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, '0')}-${String(simdi.getDate()).padStart(2, '0')}_${String(simdi.getHours()).padStart(2, '0')}${String(simdi.getMinutes()).padStart(2, '0')}`

      // "profiles" tabloların ilki (TABLOLAR dizisinin 0. elemanı) — bunu ayrı
      // işliyoruz, normal INSERT olarak değil, eşleştirme bloğu olarak.
      const profilSatirlari = sonuclar[0].data || []
      const digerTablolar = TABLOLAR.slice(1)
      const digerSonuclar = sonuclar.slice(1)

      const bolumler = digerTablolar.map((tablo, i) => {
        const satirlar = digerSonuclar[i].data || []
        return `-- ---- ${tablo} (${satirlar.length} kayıt) ----\n` + tabloIcinInsertOlustur(tablo, satirlar)
      })

      const dosyaIcerigi =
        `-- ============================================================================\n` +
        `-- SAVAŞ AKÇA EĞİTİM — VERİ YEDEĞİ (${tarihEtiketi})\n` +
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
        `-- Veri geri yüklenirken tetikleyiciler (trigger) geçici olarak devre dışı\n` +
        `-- bırakılır -- böylece tablolar hangi sırada eklenirse eklensin sorun çıkmaz.\n` +
        `set session_replication_role = replica;\n\n` +
        `-- ---- kullanıcı id eşleştirmesi (profiles) ----\n` +
        profilEslestirmeBlogu(profilSatirlari) +
        '\n' +
        bolumler.join('\n') +
        `\nset session_replication_role = default;\n`

      const blob = new Blob([dosyaIcerigi], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `savasakcaegitim_veri_yedegi_${tarihEtiketi}.sql`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      setOzet(TABLOLAR.map((tablo, i) => ({ tablo, adet: (sonuclar[i].data || []).length })))
      setDurum('tamam')
    } catch (e) {
      setHataMesaji(e.message || 'Bilinmeyen hata')
      setDurum('hata')
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-navy mb-1">Tüm Verileri Yedekle</h1>
      <p className="text-gray-500 mb-6">
        Bir felaket durumunda (Supabase projesi kaybolursa) siteyi yeniden kurabilmen için,
        veritabanındaki TÜM verileri tek bir dosya olarak indirir. Bilgisayarında güvenli bir
        yerde (ör. Google Drive, e-posta kendine) sakla. Düzenli aralıklarla (ör. ayda bir)
        tekrar indirmen önerilir.
      </p>

      <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-6 text-sm text-green-800">
        <p className="font-semibold mb-1">Artık otomatik günlük yedek de alınıyor</p>
        <p>
          Google Drive bağlıysa (bkz. Ödev sayfası "Drive'a Bağlan"), sistem HER GECE kendiliğinden
          bu sayfadakiyle aynı yedeği alıp Drive'da "Savaş Akça Eğitim - Günlük Yedekler" klasörüne
          kaydeder — hiçbir şey yapmanıza gerek yok. 90 günden eski otomatik yedekler klasör
          şişmesin diye kendiliğinden silinir. Aşağıdaki "Yedek Oluştur ve İndir" butonu, anında
          kendi bilgisayarınıza da bir kopya indirmek istediğinizde hâlâ kullanılabilir.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <button
          type="button"
          onClick={yedekOlustur}
          disabled={durum === 'calisiyor'}
          className="bg-navy text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-blue transition-colors disabled:opacity-50"
        >
          {durum === 'calisiyor' ? 'Yedek Hazırlanıyor...' : 'Yedek Oluştur ve İndir'}
        </button>

        {durum === 'hata' && (
          <p className="text-red-600 text-sm mt-4">Hata: {hataMesaji}</p>
        )}

        {durum === 'tamam' && (
          <div className="mt-4">
            <p className="text-green-700 text-sm font-medium mb-2">
              Yedek indirildi. İndirilenler klasörünü kontrol et.
            </p>
            <div className="text-xs text-gray-500 space-y-0.5">
              {ozet.map((o) => (
                <div key={o.tablo} className="flex justify-between max-w-xs">
                  <span>{o.tablo}</span>
                  <span className="font-medium text-gray-700">{o.adet} kayıt</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mt-6 text-sm text-amber-800">
        <p className="font-semibold mb-1">Bu yedekte OLMAYAN şey:</p>
        <p>
          Kullanıcıların giriş bilgileri (kullanıcı adı/şifre) bu dosyada YOKTUR — onlar
          Supabase'in ayrı bir güvenlik sisteminde tutulur ve buradan okunamaz. Bir felaket
          anında önce TÜM kullanıcılar "Kullanıcı Oluştur" sayfasından, bu yedekteki AYNI
          ad-soyad ve rolle yeniden oluşturulmalı, sonra bu yedek dosyası çalıştırılmalıdır —
          dosyanın içindeki mantık, ad-soyad + rol eşleşmesine bakarak "kim kimin öğretmeni/
          velisiydi" bilgisini otomatik olarak yeni kullanıcılara bağlar. Tam adımlar için
          "felaket_kurtarma_rehberi" dosyasına bak.
        </p>
      </div>
    </div>
  )
}
