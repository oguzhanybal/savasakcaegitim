import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  paraFormat,
  bireBirGunlukOzetMesajiOlustur,
  bireBirHaftalikOzetMesajiOlustur,
  bireBirOzetLinkOlustur,
} from '../lib/ekstreHesap'
import MusaitlikTablosu from '../components/MusaitlikTablosu'

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const GUNLER_KISA = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

function saatKisalt(s) {
  return s ? s.slice(0, 5) : s
}

function araliklarCakisiyorMu(b1, s1, b2, s2) {
  return saatKisalt(b1) < saatKisalt(s2) && saatKisalt(b2) < saatKisalt(s1)
}

// "HH:MM" formatındaki bir saate dakika ekler (gece yarısını taşırsa 00:00'a sarar) —
// başlangıç saati girilince bitiş saatini otomatik +45 dakika önermek için kullanılır.
function saateDakikaEkle(saat, dakika) {
  if (!saat) return ''
  const [h, m] = saat.split(':').map(Number)
  const toplamDakika = (((h * 60 + m + dakika) % (24 * 60)) + 24 * 60) % (24 * 60)
  const yeniSaat = Math.floor(toplamDakika / 60)
  const yeniDakika = toplamDakika % 60
  return `${String(yeniSaat).padStart(2, '0')}:${String(yeniDakika).padStart(2, '0')}`
}

// Verilen haftanın gününe (1=Pzt...7=Paz) denk gelen, İÇİNDE BULUNULAN HAFTAdaki
// tarihi hesaplar — yoklama alırken tarih kutusunun varsayılan değeri bu olsun diye.
function buHaftaGunTarihi(hedefGun) {
  const bugun = new Date()
  const bugunGun = bugun.getDay() === 0 ? 7 : bugun.getDay()
  const fark = hedefGun - bugunGun
  const tarih = new Date(bugun)
  tarih.setDate(bugun.getDate() + fark)
  // NOT: toISOString() KULLANMIYORUZ — gece yarısına yakın saatlerde (ör. 00:30)
  // UTC'ye çevirince bir önceki güne kayabiliyor. Yerel tarih parçalarını
  // (yıl/ay/gün) doğrudan okuyup string'e çeviriyoruz.
  return `${tarih.getFullYear()}-${String(tarih.getMonth() + 1).padStart(2, '0')}-${String(tarih.getDate()).padStart(2, '0')}`
}

// "YYYY-MM-DD" formatındaki bir tarihe gün ekler/çıkarır — tarih kutusunun
// yanındaki "Önceki hafta / Sonraki hafta" butonları için kullanılır.
function gunEkle(tarihStr, gunSayisi) {
  const t = new Date(tarihStr + 'T12:00:00')
  t.setDate(t.getDate() + gunSayisi)
  return t.toISOString().slice(0, 10)
}

// "YYYY-MM-DD" formatındaki bir tarihin haftanın hangi gününe (1=Pzt...7=Paz)
// denk geldiğini bulur — tek seferlik derslerde çakışma kontrolü yapabilmek için.
function gunNumaraTarihten(tarihStr) {
  if (!tarihStr) return null
  const g = new Date(tarihStr + 'T12:00:00').getDay()
  return g === 0 ? 7 : g
}

// Bugünün tarihini "YYYY-MM-DD" olarak, YEREL saate göre üretir (toISOString
// KULLANMIYORUZ — Türkiye UTC+3 olduğu için gece yarısına yakın saatlerde bir
// gün geriye kayabiliyor, bkz. Haziran/Temmuz dönem hatası).
function yerelBugunTarihi() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// Bir tarihin (YYYY-MM-DD) içinde bulunduğu haftanın PAZARTESİ gününü bulur —
// "Tüm Bire Bir Dersler" listesini haftalık gruplamak için kullanılır.
function haftaBaslangici(tarihStr) {
  const d = new Date(tarihStr + 'T12:00:00')
  const gun = d.getDay() === 0 ? 7 : d.getDay() // 1=Pzt...7=Paz
  d.setDate(d.getDate() - (gun - 1))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function haftaEtiketi(baslangicStr) {
  const b = new Date(baslangicStr + 'T12:00:00')
  const s = new Date(b)
  s.setDate(s.getDate() + 6)
  const fmt = (t) => t.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
  return `${fmt(b)} – ${fmt(s)} ${s.getFullYear()}`
}

// Bir tarihin ait olduğu ayın 1'ini "YYYY-MM-01" olarak döner — "Aylık" görünüm
// için gruplama anahtarı.
function ayBaslangici(tarihStr) {
  return tarihStr.slice(0, 7) + '-01'
}

function ayEtiketi(baslangicStr) {
  return new Date(baslangicStr + 'T12:00:00').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
}

// Yeni bir bire bir atamasının (öğretmen + gün + saat), o öğretmenin sınıf ders
// programıyla, başka bir bire bir dersiyle YA DA aynı ÖĞRENCİNİN (varsa) başka
// bir öğretmenle olan dersiyle çakışıp çakışmadığını kontrol eder. Öğrenci
// tarafı kontrolü önemli — aksi halde aynı öğrenci aynı saatte iki farklı
// öğretmenle derse yazılabiliyor (bkz. Yiğit'in Cuma 12:30 ve 11:55 çakışması).
function cakismaBul({ ogrenciId, ogretmenId, gun, baslangic, bitis, haricAtamaId }, dersProgrami, atamalar) {
  if (!ogretmenId || !baslangic || !bitis) return null

  for (const d of dersProgrami) {
    if (d.gun !== gun || d.ogretmen_profile_id !== ogretmenId) continue
    if (!araliklarCakisiyorMu(baslangic, bitis, d.baslangic_saat, d.bitis_saat)) continue
    return {
      aciklama: `bu öğretmenin ${GUNLER[d.gun]} günü ${saatKisalt(d.baslangic_saat)}–${saatKisalt(d.bitis_saat)} arası "${d.ders_adi || d.sinif_adi}" sınıf dersi var`,
    }
  }

  for (const a of atamalar) {
    if (a.id === haricAtamaId) continue
    if (!a.aktif || a.gun !== gun) continue
    if (!araliklarCakisiyorMu(baslangic, bitis, a.baslangic_saat, a.bitis_saat)) continue
    if (a.ogretmen_profile_id === ogretmenId) {
      return {
        aciklama: `bu öğretmenin ${GUNLER[a.gun]} günü ${saatKisalt(a.baslangic_saat)}–${saatKisalt(a.bitis_saat)} arası "${a.ogrenci_adi}" ile bire bir dersi var`,
      }
    }
    if (ogrenciId && a.ogrenci_id === ogrenciId) {
      return {
        aciklama: `bu öğrencinin her hafta ${GUNLER[a.gun]} günü ${saatKisalt(a.baslangic_saat)}–${saatKisalt(a.bitis_saat)} arası "${a.ogretmen_adi}" ile başka bir bire bir dersi var`,
      }
    }
  }

  return null
}

// Tek seferlik (atama_id boş) bir dersin, aynı öğretmenin sınıf programıyla,
// haftalık bire bir atamalarıyla (o tarihin haftanın günü üzerinden) ya da AYNI
// TARİHTE girilmiş başka bir tek seferlik dersiyle çakışıp çakışmadığını kontrol
// eder — hem öğretmen tarafı hem ÖĞRENCİ tarafı için (öğrenci aynı anda iki
// farklı öğretmenle derse yazılamaz). Saat girilmemişse (tekBaslangic/tekBitis
// boşsa) kontrol edilmez, çünkü karşılaştırılacak saat yoktur.
function tekSeferlikCakismaBul(
  { ogrenciId, ogretmenId, tarih, baslangic, bitis },
  dersProgrami,
  atamalar,
  yoklamalar,
  ogrenciler,
  ogretmenler
) {
  if (!ogretmenId || !tarih || !baslangic || !bitis) return null
  const gun = gunNumaraTarihten(tarih)

  for (const d of dersProgrami) {
    if (d.gun !== gun || d.ogretmen_profile_id !== ogretmenId) continue
    if (!araliklarCakisiyorMu(baslangic, bitis, d.baslangic_saat, d.bitis_saat)) continue
    return {
      aciklama: `bu öğretmenin ${GUNLER[d.gun]} günü ${saatKisalt(d.baslangic_saat)}–${saatKisalt(d.bitis_saat)} arası "${d.ders_adi || d.sinif_adi}" sınıf dersi var`,
    }
  }

  for (const a of atamalar) {
    if (!a.aktif || a.gun !== gun) continue
    if (!araliklarCakisiyorMu(baslangic, bitis, a.baslangic_saat, a.bitis_saat)) continue
    if (a.ogretmen_profile_id === ogretmenId) {
      return {
        aciklama: `bu öğretmenin ${GUNLER[a.gun]} günü ${saatKisalt(a.baslangic_saat)}–${saatKisalt(a.bitis_saat)} arası "${a.ogrenci_adi}" ile haftalık bire bir dersi var`,
      }
    }
    if (ogrenciId && a.ogrenci_id === ogrenciId) {
      return {
        aciklama: `bu öğrencinin her hafta ${GUNLER[a.gun]} günü ${saatKisalt(a.baslangic_saat)}–${saatKisalt(a.bitis_saat)} arası "${a.ogretmen_adi}" ile haftalık bire bir dersi var`,
      }
    }
  }

  for (const y of yoklamalar) {
    if (y.atama_id) continue // sadece diğer TEK SEFERLİK derslerle karşılaştırılır
    if (y.durum === 'gelmedi') continue // öğrenci gelmediyse o saat artık boş sayılır
    if (y.tarih !== tarih) continue
    if (!y.baslangic_saat || !y.bitis_saat) continue
    if (!araliklarCakisiyorMu(baslangic, bitis, y.baslangic_saat, y.bitis_saat)) continue
    if (y.ogretmen_profile_id === ogretmenId) {
      const ogrenciAdi = ogrenciler.find((o) => o.id === y.ogrenci_id)?.ad_soyad || 'başka bir öğrenci'
      return {
        aciklama: `bu öğretmenin ${tarih} tarihinde ${saatKisalt(y.baslangic_saat)}–${saatKisalt(y.bitis_saat)} arası "${ogrenciAdi}" ile başka bir tek seferlik dersi var`,
      }
    }
    if (ogrenciId && y.ogrenci_id === ogrenciId) {
      const ogretmenAdi = (ogretmenler || []).find((o) => o.id === y.ogretmen_profile_id)?.ad_soyad || 'başka bir öğretmen'
      return {
        aciklama: `bu öğrencinin ${tarih} tarihinde ${saatKisalt(y.baslangic_saat)}–${saatKisalt(y.bitis_saat)} arası "${ogretmenAdi}" ile başka bir tek seferlik dersi var`,
      }
    }
  }

  return null
}

// ============================================================================
// BİRE BİR DERS EKLE — Tek form: öğrenci, öğretmen, ücret girilir, sonra
// "her hafta tekrarlansın mı?" sorusuna Evet/Hayır cevabı verilir.
//  - Evet  -> haftalık tekrar eden bir "atama" kurulur (gün + saat aralığı ister,
//             çakışma kontrolü yapılır, sonsuza kadar her hafta geçerli olur).
//  - Hayır -> sadece o tarihe özel, tek seferlik bir ders kaydı (bire_bir_yoklama,
//             atama_id boş) oluşturulur, hemen "Geldi" olarak borç eklenir.
// ============================================================================
function BireBirDersEkleForm({ ogrenciler, ogretmenler, atamalar, dersProgrami, yoklamalar, onEklendi }) {
  const [ogrenciId, setOgrenciId] = useState('')
  const [ogretmenId, setOgretmenId] = useState('')
  const [dersUcreti, setDersUcreti] = useState('')
  // Çoğu öğrencinin sabit haftalık programı olmadığı için varsayılan (öncelikli)
  // seçenek "Hayır, sadece bu sefer" — sabit programı olanlar için elle "Evet"e geçilir.
  const [tekrarlansin, setTekrarlansin] = useState(false)

  // Haftalık tekrar (Evet) alanları
  const [gun, setGun] = useState(1)
  const [baslangic, setBaslangic] = useState('')
  const [bitis, setBitis] = useState('')

  // Tek seferlik (Hayır) alanları — saat opsiyonel: girilirse kayda saat de damgalanır,
  // girilmezse boş bırakılabilir.
  const [tarih, setTarih] = useState(() => yerelBugunTarihi())
  const [tekBaslangic, setTekBaslangic] = useState('')
  const [tekBitis, setTekBitis] = useState('')

  const [hata, setHata] = useState('')
  const [basari, setBasari] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const ogrenciSelectRef = useRef(null)
  const tekBaslangicRef = useRef(null)

  // Seçilen öğretmenin, seçilen gündeki tüm dolu saatlerini (hem sınıf dersleri hem
  // diğer bire bir dersleri) tek listede gösterir — sadece "Evet, tekrarlansın"
  // seçiliyken anlamlı, çünkü tek seferlik derste gün bazlı çakışma aranmıyor.
  const buGunMesgulSaatler = useMemo(() => {
    if (!ogretmenId || !tekrarlansin) return []
    const gunNum = Number(gun)
    const sinifDersleri = dersProgrami
      .filter((d) => d.ogretmen_profile_id === ogretmenId && d.gun === gunNum)
      .map((d) => ({
        baslangic: d.baslangic_saat,
        bitis: d.bitis_saat,
        etiket: `Sınıf: ${d.ders_adi || d.sinif_adi || 'Ders'}`,
      }))
    const bireBirDersleri = atamalar
      .filter((a) => a.ogretmen_profile_id === ogretmenId && a.gun === gunNum && a.aktif)
      .map((a) => ({
        baslangic: a.baslangic_saat,
        bitis: a.bitis_saat,
        etiket: `Bire Bir: ${a.ogrenci_adi || 'Öğrenci'}`,
      }))
    return [...sinifDersleri, ...bireBirDersleri].sort((x, y) =>
      saatKisalt(x.baslangic) < saatKisalt(y.baslangic) ? -1 : 1
    )
  }, [ogretmenId, gun, dersProgrami, atamalar, tekrarlansin])

  // Bu öğrenci-öğretmen ikilisi için daha önce girilmiş bir ücret varsa otomatik
  // dolduruyoruz — elle tekrar yazmaya gerek kalmasın diye. Kullanıcı isterse
  // üzerine yazıp değiştirebilir. Önce haftalık atamalara bakılır (varsa en
  // güncel/otoriter fiyat odur); yoksa bu ikili için daha önce girilmiş EN SON
  // tek seferlik dersin tutarına bakılır — çoğu ders artık tek seferlik girildiği
  // için bu ikinci kontrol olmazsa fiyat hiç önerilmiyordu.
  function fiyatiOner(ogrenciIdParam, ogretmenIdParam) {
    if (!ogrenciIdParam || !ogretmenIdParam) return
    const atamaEslesen = atamalar.find(
      (a) => a.ogrenci_id === ogrenciIdParam && a.ogretmen_profile_id === ogretmenIdParam
    )
    if (atamaEslesen) {
      setDersUcreti(String(atamaEslesen.ders_ucreti))
      return
    }
    const gecmisTekSeferlikler = yoklamalar
      .filter(
        (y) =>
          !y.atama_id &&
          y.ogrenci_id === ogrenciIdParam &&
          y.ogretmen_profile_id === ogretmenIdParam &&
          y.tutar != null
      )
      .sort((a, b) => (a.tarih === b.tarih ? 0 : a.tarih < b.tarih ? 1 : -1))
    if (gecmisTekSeferlikler.length > 0) {
      setDersUcreti(String(gecmisTekSeferlikler[0].tutar))
    }
  }

  async function ekle(e) {
    e.preventDefault()
    setHata('')
    setBasari('')

    if (!ogrenciId || !ogretmenId || !dersUcreti) {
      setHata('Lütfen öğrenci, öğretmen ve ders ücretini girin.')
      return
    }

    if (tekrarlansin) {
      if (!baslangic || !bitis) {
        setHata('Lütfen başlangıç ve bitiş saatini girin.')
        return
      }
      if (baslangic >= bitis) {
        setHata('Başlangıç saati bitiş saatinden önce olmalı.')
        return
      }
      const cakisma = cakismaBul({ ogrenciId, ogretmenId, gun: Number(gun), baslangic, bitis }, dersProgrami, atamalar)
      if (cakisma) {
        setHata(`Çakışma var: ${cakisma.aciklama}.`)
        return
      }

      setGonderiliyor(true)
      const { error } = await supabase.from('bire_bir_atamalari').insert({
        ogrenci_id: ogrenciId,
        ogretmen_profile_id: ogretmenId,
        ders_ucreti: Number(dersUcreti),
        gun: Number(gun),
        baslangic_saat: baslangic,
        bitis_saat: bitis,
      })
      setGonderiliyor(false)
      if (error) {
        setHata('Hata: ' + error.message)
      } else {
        // Aynı öğrenci/öğretmene haftanın birden çok gününe art arda ders eklerken
        // öğrenci, öğretmen ve ücret korunuyor, sadece saatleri temizliyoruz ve gün
        // otomatik bir sonraki güne geçiyor.
        setBaslangic('')
        setBitis('')
        setGun((g) => (Number(g) < 7 ? Number(g) + 1 : 1))
        setBasari('✓ Her hafta tekrarlanacak şekilde eklendi — devam edebilirsiniz.')
        onEklendi()
      }
    } else {
      if (!tarih) {
        setHata('Lütfen tarihi girin.')
        return
      }
      if (tekBaslangic && tekBitis && tekBaslangic >= tekBitis) {
        setHata('Başlangıç saati bitiş saatinden önce olmalı.')
        return
      }
      if (tekBaslangic && tekBitis) {
        const cakisma = tekSeferlikCakismaBul(
          { ogrenciId, ogretmenId, tarih, baslangic: tekBaslangic, bitis: tekBitis },
          dersProgrami,
          atamalar,
          yoklamalar,
          ogrenciler,
          ogretmenler
        )
        if (cakisma) {
          setHata(`Çakışma var: ${cakisma.aciklama}.`)
          return
        }
      }

      // Tarih BUGÜNDEN SONRAsıysa (ileri tarihli, önceden planlanan bir ders),
      // henüz gerçekleşmediği için doğrudan "Geldi" sayıp borç eklemiyoruz —
      // "Bekliyor" olarak kaydediliyor, ders yapıldıktan sonra "Son Tek Seferlik
      // Dersler" listesinden Geldi/Gelmedi işaretlenir. Bugün ya da geçmiş bir
      // tarihse (unutulmuş/geçmiş bir dersi girme senaryosu) direkt "Geldi" olur.
      const ileriTarihli = tarih > yerelBugunTarihi()
      const durum = ileriTarihli ? 'bekliyor' : 'geldi'

      setGonderiliyor(true)
      const { error } = await supabase.from('bire_bir_yoklama').insert({
        ogrenci_id: ogrenciId,
        ogretmen_profile_id: ogretmenId,
        tutar: Number(dersUcreti),
        tarih,
        durum,
        baslangic_saat: tekBaslangic || null,
        bitis_saat: tekBitis || null,
      })
      setGonderiliyor(false)
      if (error) {
        setHata('Hata: ' + error.message)
      } else {
        // Aynı öğrenci/öğretmene üst üste (aynı gün, arka arkaya) ders eklerken
        // öğrenci/öğretmen/ücret/tarih AYNEN korunuyor — tekrar seçmeye gerek yok.
        // Saat girilmişse, bir sonraki dersin başlangıcı otomatik olarak "bu dersin
        // bitişi + 10 dakika ara" olarak öneriliyor (bitiş de +45dk ile hesaplanıyor).
        // Bu sadece formu ÖNCEDEN dolduruyor — kaydetmek için yine "Ekle"ye basmak gerekiyor.
        const bekliyorNotu = ileriTarihli
          ? ' İleri tarihli olduğu için "Bekliyor" olarak eklendi, henüz borç eklenmedi — ders yapıldıktan sonra "Son Tek Seferlik Dersler" listesinden Geldi/Gelmedi işaretleyin.'
          : ''
        if (tekBitis) {
          const yeniBaslangic = saateDakikaEkle(tekBitis, 10)
          const yeniBitis = saateDakikaEkle(yeniBaslangic, 45)
          setTekBaslangic(yeniBaslangic)
          setTekBitis(yeniBitis)
          setBasari(
            `✓ Eklendi.${bekliyorNotu} Sıradaki ders için ${new Date(tarih + 'T12:00:00').toLocaleDateString('tr-TR')} tarihinde ${yeniBaslangic}–${yeniBitis} önerildi (10dk ara) — kontrol edip tekrar "Ekle"ye basabilirsiniz.`
          )
        } else {
          setBasari(`✓ Tek seferlik ders eklendi.${bekliyorNotu}`)
        }
        tekBaslangicRef.current?.focus()
        onEklendi()
      }
    }
  }

  return (
    <form onSubmit={ekle} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
      <p className="font-semibold text-gray-700 mb-3">Bire Bir Ders Ekle</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Öğrenci</label>
          <select
            ref={ogrenciSelectRef}
            value={ogrenciId}
            onChange={(e) => {
              const v = e.target.value
              setOgrenciId(v)
              fiyatiOner(v, ogretmenId)
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            <option value="">Seçiniz...</option>
            {ogrenciler.map((o) => (
              <option key={o.id} value={o.id}>{o.ad_soyad}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Öğretmen</label>
          <select
            value={ogretmenId}
            onChange={(e) => {
              const v = e.target.value
              setOgretmenId(v)
              fiyatiOner(ogrenciId, v)
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            <option value="">Seçiniz...</option>
            {ogretmenler.map((o) => (
              <option key={o.id} value={o.id}>{o.brans ? `${o.ad_soyad} — ${o.brans}` : o.ad_soyad}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[130px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Ders Ücreti (₺)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={dersUcreti}
            onChange={(e) => setDersUcreti(e.target.value)}
            placeholder="1500"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
      </div>

      <div className="mt-4 bg-gray-50 border border-gray-100 rounded-lg p-3">
        <p className="text-sm font-medium text-gray-700 mb-2">Bu ders her hafta aynı gün tekrarlansın mı?</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTekrarlansin(true)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              tekrarlansin ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            Evet, her hafta tekrarlansın
          </button>
          <button
            type="button"
            onClick={() => setTekrarlansin(false)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              !tekrarlansin ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            Hayır, sadece bu sefer
          </button>
        </div>

        {tekrarlansin ? (
          <div className="flex flex-wrap gap-3 items-end mt-3">
            <div className="min-w-[130px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Gün</label>
              <select
                value={gun}
                onChange={(e) => setGun(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
              >
                {GUNLER.slice(1).map((g, i) => (
                  <option key={i + 1} value={i + 1}>{g}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[110px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Başlangıç</label>
              <input
                type="time"
                value={baslangic}
                onChange={(e) => {
                  const yeniBaslangic = e.target.value
                  setBaslangic(yeniBaslangic)
                  setBitis(saateDakikaEkle(yeniBaslangic, 45))
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>
            <div className="min-w-[110px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Bitiş</label>
              <input
                type="time"
                value={bitis}
                onChange={(e) => setBitis(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              />
              <p className="text-[11px] text-gray-400 mt-0.5">Otomatik +45dk önerilir, değiştirilebilir.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 items-end mt-3">
            <div className="min-w-[150px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tarih</label>
              <input
                type="date"
                value={tarih}
                onChange={(e) => setTarih(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>
            <div className="min-w-[110px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Başlangıç (opsiyonel)</label>
              <input
                ref={tekBaslangicRef}
                type="time"
                value={tekBaslangic}
                onChange={(e) => {
                  const yeniBaslangic = e.target.value
                  setTekBaslangic(yeniBaslangic)
                  setTekBitis(yeniBaslangic ? saateDakikaEkle(yeniBaslangic, 45) : '')
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>
            <div className="min-w-[110px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Bitiş</label>
              <input
                type="time"
                value={tekBitis}
                onChange={(e) => setTekBitis(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              />
              <p className="text-[11px] text-gray-400 mt-0.5">Girerseniz otomatik +45dk önerilir, değiştirilebilir.</p>
            </div>
            <p className="text-xs text-gray-400 pb-2 basis-full">
              Bu ders sadece seçtiğiniz tarihte geçerli olur, tekrar etmez. Öğrencinin hesabına hemen borç eklenir.
              Saat girerseniz, bu öğretmenin aynı vakitte başka bir dersi var mı diye kontrol edilir.
            </p>
          </div>
        )}

        {tekrarlansin && ogretmenId && (
          <div className="mt-3 bg-white border border-gray-100 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-600 mb-1.5">
              {ogretmenler.find((o) => o.id === ogretmenId)?.ad_soyad} — {GUNLER[Number(gun)]} günü dolu saatler:
            </p>
            {buGunMesgulSaatler.length === 0 ? (
              <p className="text-xs text-green-600">Bu gün için kayıtlı ders yok, tüm saatler boş.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {buGunMesgulSaatler.map((s, i) => (
                  <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-700">
                    {saatKisalt(s.baslangic)}–{saatKisalt(s.bitis)} · {s.etiket}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={gonderiliyor}
        className="mt-4 bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {gonderiliyor ? 'Ekleniyor...' : 'Ekle'}
      </button>

      {hata && <p className="text-red-600 text-sm mt-3">{hata}</p>}
      {!hata && basari && <p className="text-green-600 text-sm mt-3">{basari}</p>}
    </form>
  )
}

// Yöneticinin belirli bir öğrenciyi ya da öğretmeni seçip, o kişiye özel
// haftalık/aylık, yazdırılabilir/PDF alınabilir bire bir ders dökümünü yeni
// sekmede açmasını sağlar — mevcut "Tüm Bire Bir Dersler" (herkes bir arada)
// listesine EK olarak, onu değiştirmeden.
function OgrenciOgretmenEkstreSecici({ ogrenciler, ogretmenler }) {
  const [seciliOgrenci, setSeciliOgrenci] = useState('')
  const [seciliOgretmen, setSeciliOgretmen] = useState('')

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <p className="font-semibold text-gray-700">Öğrenci / Öğretmen Bazında Ekstre</p>
        <Link
          to="/bire-bir-genel-ekstre"
          target="_blank"
          className="text-navy text-sm font-semibold hover:underline whitespace-nowrap"
        >
          Genel Ekstre (Herkes Bir Arada) →
        </Link>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Belirli bir öğrenci ya da öğretmen seçip, sadece ona ait haftalık/aylık dökümü yeni sekmede
        görüntüleyin — buradan yazdırabilir ya da PDF olarak kaydedebilirsiniz. Öğrenci/öğretmene göre
        AYIRMADAN, seçtiğiniz hafta/ayda okulda verilen TÜM bire bir dersleri tek listede görmek
        isterseniz sağ üstteki "Genel Ekstre" linkini kullanın.
      </p>
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Öğrenci</label>
          <div className="flex gap-2">
            <select
              value={seciliOgrenci}
              onChange={(e) => setSeciliOgrenci(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
            >
              <option value="">Öğrenci seçiniz...</option>
              {ogrenciler.map((o) => (
                <option key={o.id} value={o.id}>{o.ad_soyad}</option>
              ))}
            </select>
            {seciliOgrenci ? (
              <Link
                to={`/ekstre/${seciliOgrenci}`}
                target="_blank"
                className="bg-navy text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                Ekstre Görüntüle
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="bg-gray-200 text-gray-400 text-sm font-semibold px-4 py-2 rounded-lg whitespace-nowrap cursor-not-allowed"
              >
                Ekstre Görüntüle
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Öğretmen</label>
          <div className="flex gap-2">
            <select
              value={seciliOgretmen}
              onChange={(e) => setSeciliOgretmen(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
            >
              <option value="">Öğretmen seçiniz...</option>
              {ogretmenler.map((o) => (
                <option key={o.id} value={o.id}>{o.brans ? `${o.ad_soyad} — ${o.brans}` : o.ad_soyad}</option>
              ))}
            </select>
            {seciliOgretmen ? (
              <Link
                to={`/ogretmen-ekstre/${seciliOgretmen}`}
                target="_blank"
                className="bg-navy text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                Ekstre Görüntüle
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="bg-gray-200 text-gray-400 text-sm font-semibold px-4 py-2 rounded-lg whitespace-nowrap cursor-not-allowed"
              >
                Ekstre Görüntüle
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AtamaDuzenleSatiri({ a, ogretmenler, atamalar, dersProgrami, onKaydedildi, onVazgec }) {
  const [ogretmenId, setOgretmenId] = useState(a.ogretmen_profile_id)
  const [dersUcreti, setDersUcreti] = useState(String(a.ders_ucreti))
  const [gun, setGun] = useState(a.gun)
  const [baslangic, setBaslangic] = useState(saatKisalt(a.baslangic_saat))
  const [bitis, setBitis] = useState(saatKisalt(a.bitis_saat))
  const [hata, setHata] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)

  async function kaydet() {
    setHata('')
    if (!ogretmenId || !dersUcreti || !baslangic || !bitis) {
      setHata('Lütfen tüm alanları doldurun.')
      return
    }
    if (baslangic >= bitis) {
      setHata('Başlangıç saati bitiş saatinden önce olmalı.')
      return
    }

    const cakisma = cakismaBul(
      { ogrenciId: a.ogrenci_id, ogretmenId, gun: Number(gun), baslangic, bitis, haricAtamaId: a.id },
      dersProgrami,
      atamalar
    )
    if (cakisma) {
      setHata(`Çakışma var: ${cakisma.aciklama}.`)
      return
    }

    setGonderiliyor(true)
    const { error } = await supabase
      .from('bire_bir_atamalari')
      .update({
        ogretmen_profile_id: ogretmenId,
        ders_ucreti: Number(dersUcreti),
        gun: Number(gun),
        baslangic_saat: baslangic,
        bitis_saat: bitis,
      })
      .eq('id', a.id)
    setGonderiliyor(false)
    if (error) setHata('Hata: ' + error.message)
    else onKaydedildi()
  }

  return (
    <tr className="border-t border-gray-50 bg-blue-50">
      <td className="px-4 py-2 font-medium text-gray-800 align-top">{a.ogrenci_adi}</td>
      <td className="px-4 py-2 align-top" colSpan={4}>
        <div className="flex flex-wrap gap-2 items-end">
          <select
            value={ogretmenId}
            onChange={(e) => setOgretmenId(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            {ogretmenler.map((o) => (
              <option key={o.id} value={o.id}>{o.brans ? `${o.ad_soyad} — ${o.brans}` : o.ad_soyad}</option>
            ))}
          </select>
          <select
            value={gun}
            onChange={(e) => setGun(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            {GUNLER.slice(1).map((g, i) => (
              <option key={i + 1} value={i + 1}>{g}</option>
            ))}
          </select>
          <input
            type="time"
            value={baslangic}
            onChange={(e) => {
              const yeniBaslangic = e.target.value
              setBaslangic(yeniBaslangic)
              setBitis(saateDakikaEkle(yeniBaslangic, 45))
            }}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
          <input
            type="time"
            value={bitis}
            onChange={(e) => setBitis(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={dersUcreti}
            onChange={(e) => setDersUcreti(e.target.value)}
            placeholder="Ders Ücreti"
            className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        {hata && <p className="text-red-600 text-xs mt-2">{hata}</p>}
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap align-top space-x-3">
        <button onClick={kaydet} disabled={gonderiliyor} className="text-green-600 text-sm font-semibold hover:underline disabled:opacity-50">
          {gonderiliyor ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
        <button onClick={onVazgec} className="text-gray-500 text-sm hover:underline">Vazgeç</button>
      </td>
    </tr>
  )
}

function AtamaListesi({ atamalar, ogretmenler, dersProgrami, onDegisti }) {
  const [duzenlenenId, setDuzenlenenId] = useState(null)

  async function aktiflikDegistir(a) {
    const { error } = await supabase.from('bire_bir_atamalari').update({ aktif: !a.aktif }).eq('id', a.id)
    if (error) alert('Hata: ' + error.message)
    else onDegisti()
  }

  async function sil(id) {
    if (!confirm('Bu atamayı ve tüm yoklama geçmişini silmek istediğinize emin misiniz?')) return
    const { error } = await supabase.from('bire_bir_atamalari').delete().eq('id', id)
    if (error) alert('Hata: ' + error.message)
    else onDegisti()
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto mb-6">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="font-semibold text-gray-700">Haftalık Tekrar Eden Dersler (Atamalar)</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Bunlar "Evet, her hafta tekrarlansın" ile eklenen, sabit programı olan öğrenciler. Öğretmen yanlış
          girildiyse "Düzenle" ile gün/saat/öğretmen/ücreti düzeltebilirsiniz.
        </p>
      </div>
      <table className="w-full text-sm min-w-[760px]">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="px-4 py-2 font-medium">Öğrenci</th>
            <th className="px-4 py-2 font-medium">Öğretmen</th>
            <th className="px-4 py-2 font-medium">Gün / Saat</th>
            <th className="px-4 py-2 font-medium">Ders Ücreti</th>
            <th className="px-4 py-2 font-medium">Durum</th>
            <th className="px-4 py-2 font-medium text-right">İşlemler</th>
          </tr>
        </thead>
        <tbody>
          {atamalar.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-4 text-center text-gray-400">Henüz haftalık tekrar eden bir atama yok.</td></tr>
          )}
          {atamalar.map((a) =>
            duzenlenenId === a.id ? (
              <AtamaDuzenleSatiri
                key={a.id}
                a={a}
                ogretmenler={ogretmenler}
                atamalar={atamalar}
                dersProgrami={dersProgrami}
                onKaydedildi={() => { setDuzenlenenId(null); onDegisti() }}
                onVazgec={() => setDuzenlenenId(null)}
              />
            ) : (
              <tr key={a.id} className="border-t border-gray-50">
                <td className="px-4 py-2 font-medium text-gray-800">{a.ogrenci_adi}</td>
                <td className="px-4 py-2">
                  {a.ogretmen_adi}
                  {a.ogretmen_bransi && <span className="text-xs text-gray-400"> ({a.ogretmen_bransi})</span>}
                </td>
                <td className="px-4 py-2">{GUNLER_KISA[a.gun]} {saatKisalt(a.baslangic_saat)}–{saatKisalt(a.bitis_saat)}</td>
                <td className="px-4 py-2">{paraFormat(a.ders_ucreti)}</td>
                <td className="px-4 py-2">
                  {a.aktif ? (
                    <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-full">Aktif</span>
                  ) : (
                    <span className="text-xs font-semibold bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Pasif</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap space-x-3">
                  <button onClick={() => setDuzenlenenId(a.id)} className="text-navy text-sm hover:underline">
                    Düzenle
                  </button>
                  <button onClick={() => aktiflikDegistir(a)} className="text-blue text-sm hover:underline">
                    {a.aktif ? 'Pasif Yap' : 'Aktif Yap'}
                  </button>
                  <button onClick={() => sil(a.id)} className="text-red-500 text-sm hover:underline">
                    Sil
                  </button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  )
}

function YoklamaSatiri({ atama, yoklamalar, onDegisti, ucretGorunur }) {
  const [tarih, setTarih] = useState(() => buHaftaGunTarihi(atama.gun))
  const [gonderiliyor, setGonderiliyor] = useState(false)

  const mevcutKayit = yoklamalar.find((y) => y.atama_id === atama.id && y.tarih === tarih)
  const gecmis = yoklamalar
    .filter((y) => y.atama_id === atama.id)
    .sort((a, b) => (a.tarih === b.tarih ? 0 : a.tarih < b.tarih ? 1 : -1))
    .slice(0, 5)

  async function isaretle(durum) {
    // Mevcut kayıt varsa ve durum gerçekten değişiyorsa (ör. yanlışlıkla "Geldi"
    // işaretlenmiş kaydı "Gelmedi"ye çevirmek gibi) onay iste — bu, öğrencinin
    // borcunu da etkileyen bir değişiklik olduğu için yanlışlıkla tıklamaya karşı.
    if (mevcutKayit && mevcutKayit.durum !== durum) {
      const mesaj =
        mevcutKayit.durum === 'geldi'
          ? 'Bu kayıt "Geldi" olarak işaretliydi ve öğrenciye ders ücreti borç olarak eklenmişti. "Gelmedi" yapmak istediğinize emin misiniz? (borç kaydı kaldırılacak)'
          : 'Bu kaydın durumunu değiştirmek istediğinize emin misiniz?'
      if (!confirm(mesaj)) return
    }
    // GÜVENLİK KONTROLÜ: Seçili tarih bugünden ileriyse (ör. "Sonraki hafta ▶"
    // butonuna fazladan basılıp yanlışlıkla ileri bir haftaya/aya geçilmişse),
    // "Geldi" işaretlemek HENÜZ YAPILMAMIŞ bir derse hemen borç ekler. Bunu
    // önlemek için ekstra onay istiyoruz. (Tek seferlik ders ekleme formunda
    // aynı durum otomatik "Bekliyor" yapılıyor; burada "Geldi/Gelmedi" sadece
    // iki seçenek olduğu için otomatik çeviremiyoruz, bu yüzden açık onay şart.)
    if (durum === 'geldi' && tarih > yerelBugunTarihi()) {
      const okundu = confirm(
        `DİKKAT: ${tarih} tarihi henüz gelmedi (ileri tarihli). Bu tarih için "Geldi" işaretlerseniz, ders henüz yapılmamış olsa bile öğrenciye HEMEN borç eklenecek. Doğru tarihi seçtiğinizden emin misiniz? Devam etmek için "Tamam"a basın.`
      )
      if (!okundu) return
    }
    setGonderiliyor(true)
    // O anki ders ücretini de kayda "damgalıyoruz" (tutar alanı) — ileride ücret
    // zam görürse, geçmişte zaten "Geldi" işaretlenmiş kayıtların borcu değişmesin,
    // sadece o günkü fiyatla sabit kalsın diye.
    const { error } = await supabase
      .from('bire_bir_yoklama')
      .upsert(
        { atama_id: atama.id, tarih, durum, tutar: atama.ders_ucreti },
        { onConflict: 'atama_id,tarih' }
      )
    setGonderiliyor(false)
    if (error) alert('Hata: ' + error.message)
    else onDegisti()
  }

  async function kaydiSil() {
    if (!mevcutKayit) return
    const mesaj =
      mevcutKayit.durum === 'geldi'
        ? 'Bu "Geldi" kaydını tamamen silmek istediğinize emin misiniz? Öğrenciye eklenen ders ücreti borcu da kaldırılacak.'
        : 'Bu yoklama kaydını silmek istediğinize emin misiniz?'
    if (!confirm(mesaj)) return
    setGonderiliyor(true)
    const { error } = await supabase.from('bire_bir_yoklama').delete().eq('id', mevcutKayit.id)
    setGonderiliyor(false)
    if (error) alert('Hata: ' + error.message)
    else onDegisti()
  }

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-800">{atama.ogrenci_adi}</p>
          <p className="text-xs text-gray-400">
            {atama.ogretmen_adi ? `${atama.ogretmen_adi} · ` : ''}
            {GUNLER[atama.gun]} {saatKisalt(atama.baslangic_saat)}–{saatKisalt(atama.bitis_saat)}
            {ucretGorunur ? ` · ${paraFormat(atama.ders_ucreti)} / ders` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTarih((t) => gunEkle(t, -7))}
            title="Önceki hafta"
            className="px-2 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100"
          >
            ◀
          </button>
          <input
            type="date"
            value={tarih}
            onChange={(e) => setTarih(e.target.value)}
            className={`px-2 py-1.5 border rounded-lg text-sm ${
              tarih > yerelBugunTarihi() ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-200'
            }`}
            title={tarih > yerelBugunTarihi() ? 'Dikkat: bu tarih henüz gelmedi (ileri tarihli)' : undefined}
          />
          {tarih > yerelBugunTarihi() && (
            <span className="text-[11px] text-orange-600 font-medium whitespace-nowrap" title="Bu tarih henüz gelmedi">
              ⚠️ ileri tarih
            </span>
          )}
          <button
            type="button"
            onClick={() => setTarih((t) => gunEkle(t, 7))}
            title="Sonraki hafta"
            className="px-2 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100"
          >
            ▶
          </button>
          <button
            onClick={() => isaretle('geldi')}
            disabled={gonderiliyor}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
              mevcutKayit?.durum === 'geldi' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            Geldi
          </button>
          <button
            onClick={() => isaretle('gelmedi')}
            disabled={gonderiliyor}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
              mevcutKayit?.durum === 'gelmedi' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'
            }`}
          >
            Gelmedi
          </button>
          {mevcutKayit && (
            <button
              onClick={kaydiSil}
              disabled={gonderiliyor}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              title="Bu tarihteki yoklama kaydını tamamen sil"
            >
              Kaydı Sil
            </button>
          )}
        </div>
      </div>
      {gecmis.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {gecmis.map((y) => (
            <button
              key={y.id}
              type="button"
              onClick={() => setTarih(y.tarih)}
              title="Bu kaydı düzenlemek veya silmek için tıklayın"
              className={`text-[11px] px-1.5 py-0.5 rounded hover:ring-1 hover:ring-offset-1 transition-shadow ${
                y.durum === 'geldi'
                  ? 'bg-green-50 text-green-700 hover:ring-green-300'
                  : 'bg-red-50 text-red-600 hover:ring-red-300'
              } ${y.tarih === tarih ? 'ring-1 ring-offset-1 ring-navy' : ''}`}
            >
              {new Date(y.tarih + 'T12:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}: {y.durum === 'geldi' ? 'Geldi' : 'Gelmedi'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// TÜM bire bir dersleri (hem haftalık tekrarlanan atamalardan Geldi/Gelmedi
// işaretlenenler, hem "Hayır, sadece bu sefer" ile eklenen tek seferlikler)
// TEK bir listede, haftalara bölünmüş olarak gösterir — "hangi öğrenci hangi
// öğretmenden, hangi hafta kaç ders almış" sorusuna tek bakışta cevap versin diye.
// sadeceOgretmenId verilirse (öğretmen rolünde) sadece o öğretmenin kendi
// dersleri gösterilir, ücret (tutar) sütunu gizlenir.
function TekSeferlikDerslerListesi({ yoklamalar, atamalar, onDegisti, sadeceOgretmenId = null, ucretGorunur = true }) {
  const [periyot, setPeriyot] = useState('hafta') // 'hafta' | 'ay'
  const [gosterilenSayisi, setGosterilenSayisi] = useState(8)
  const atamaMap = useMemo(() => new Map(atamalar.map((a) => [a.id, a])), [atamalar])

  const dersler = useMemo(() => {
    return yoklamalar
      .map((y) => {
        // Haftalık atamaya bağlıysa öğrenci/öğretmen/saat bilgisi atamadan gelir
        // (yoklama satırının kendisinde bu alanlar boş kalıyor); tek seferlikte
        // doğrudan yoklama satırının kendi (join edilmiş) alanlarından gelir.
        const atama = y.atama_id ? atamaMap.get(y.atama_id) : null
        // Eski haftalık kayıtların bir kısmında (bu alanın damgalanmaya
        // başlamasından ÖNCE eklenenler) yoklama satırının kendi "tutar" alanı
        // boş kalmış olabilir — o yüzden boşsa atamanın GÜNCEL ücretine
        // düşüyoruz, yoksa ₺0,00 görünüyordu.
        const tutar = y.tutar != null ? Number(y.tutar) : Number(atama?.ders_ucreti) || 0
        return {
          ...y,
          _ogrenciAdi: atama ? atama.ogrenci_adi : y.ogrenci_adi,
          _ogretmenAdi: atama ? atama.ogretmen_adi : y.ogretmen_adi,
          _ogretmenBransi: atama ? atama.ogretmen_bransi : y.ogretmen_bransi,
          _ogretmenId: atama ? atama.ogretmen_profile_id : y.ogretmen_profile_id,
          _baslangic: y.baslangic_saat || atama?.baslangic_saat || null,
          _bitis: y.bitis_saat || atama?.bitis_saat || null,
          _kaynak: y.atama_id ? 'Haftalık' : 'Tek Seferlik',
          _tutar: tutar,
        }
      })
      .filter((y) => !sadeceOgretmenId || y._ogretmenId === sadeceOgretmenId)
      // Tarihe göre YENİDEN ESKİYE sıralanır; AYNI GÜNDEKİ dersler ise saat
      // bilgisiyle BAŞTAN SONA (erken saat önce) sıralanır — önceki halde eşit
      // tarihli satırlarda karşılaştırıcı her zaman -1 döndürdüğü için (0 hiç
      // dönmediği için) aynı güne ait dersler rastgele/ters görünebiliyordu.
      .sort((a, b) => {
        if (a.tarih !== b.tarih) return a.tarih < b.tarih ? 1 : -1
        const saatA = a._baslangic || ''
        const saatB = b._baslangic || ''
        if (saatA === saatB) return 0
        return saatA < saatB ? -1 : 1
      })
  }, [yoklamalar, atamaMap, sadeceOgretmenId])

  // İçinde bulunduğumuz haftanın/ayın anahtarını döner — AMA sadece o dönemde
  // gerçekten ders varsa (yoksa boş döner, o zaman en yeni dönemlerden itibaren
  // sayfalanmış listeye düşülür). Dönem seçici ilk açılışta ve Haftalık/Aylık
  // arası geçişte bu dönemi otomatik seçili getirsin diye.
  function icindeBulunulanDonem(periyotDegeri) {
    const anahtarUret = periyotDegeri === 'ay' ? ayBaslangici : haftaBaslangici
    const hedef = anahtarUret(yerelBugunTarihi())
    return dersler.some((y) => anahtarUret(y.tarih) === hedef) ? hedef : ''
  }

  // Boşsa en yeni dönemlerden itibaren sayfalanmış liste gösterilir ("Daha eski
  // göster" ile); doluysa (içinde bulunulan dönem ya da dönem seçiciden elle
  // seçilen) SADECE o tek dönem gösterilir. Sayfa ilk açıldığında otomatik
  // olarak İÇİNDE BULUNULAN haftaya geliyor — öğretmen isterse dropdown'dan
  // başka bir haftaya/aya geçebilir.
  const [seciliDonem, setSeciliDonem] = useState(() => icindeBulunulanDonem('hafta'))

  // periyot='hafta' -> her Pazartesi başlangıçlı 7 günlük gruplar,
  // periyot='ay' -> takvim ayına göre gruplar (Temmuz 2026 gibi).
  const tumGruplar = useMemo(() => {
    const anahtarUret = periyot === 'ay' ? ayBaslangici : haftaBaslangici
    const gruplar = dersler.reduce((acc, y) => {
      const anahtar = anahtarUret(y.tarih)
      if (!acc[anahtar]) acc[anahtar] = []
      acc[anahtar].push(y)
      return acc
    }, {})
    return Object.entries(gruplar).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [dersler, periyot])

  const gosterilenGruplar = seciliDonem
    ? tumGruplar.filter(([anahtar]) => anahtar === seciliDonem)
    : tumGruplar.slice(0, gosterilenSayisi)
  const etiketUret = periyot === 'ay' ? ayEtiketi : haftaEtiketi

  async function sil(id) {
    if (!confirm('Bu ders kaydını silmek istediğinize emin misiniz?')) return
    const { error } = await supabase.from('bire_bir_yoklama').delete().eq('id', id)
    if (error) alert('Hata: ' + error.message)
    else onDegisti()
  }

  // "Bekliyor" (henüz gerçekleşmemiş, ileri tarihli) bir dersi Geldi/Gelmedi yapmak,
  // ya da zaten "Geldi" olan bir kaydı yanlışlıkla "Gelmedi"ye çevirmek borcu
  // etkiliyor — o durumda onay isteniyor. Bekliyor'dan Geldi/Gelmedi'ye geçişte
  // (henüz borç yokken) onay istemiyoruz.
  async function durumDegistir(y, yeniDurum) {
    if (y.durum === yeniDurum) return
    if (y.durum === 'geldi' && yeniDurum === 'gelmedi') {
      if (!confirm('Bu ders "Geldi" olarak işaretliydi ve öğrenciye borç eklenmişti. "Gelmedi" yapmak istediğinize emin misiniz? (borç kaldırılacak)')) return
    }
    const { error } = await supabase.from('bire_bir_yoklama').update({ durum: yeniDurum }).eq('id', y.id)
    if (error) alert('Hata: ' + error.message)
    else onDegisti()
  }

  if (dersler.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-gray-700">
            {sadeceOgretmenId ? 'Tüm Derslerim' : 'Tüm Bire Bir Dersler'} — Arşiv
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {sadeceOgretmenId
              ? 'Hem haftalık tekrarlanan atamalardan işaretlenen dersler hem tek seferlik dersler burada bir arada. "Bekliyor" ileri tarihli, henüz kesinleşmemiş tek seferlik dersler içindir.'
              : 'Hem haftalık tekrarlanan atamalardan işaretlenen dersler hem tek seferlik dersler burada bir arada. "Bekliyor" ileri tarihli, henüz borç eklenmemiş tek seferlik dersler içindir.'}
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0 items-center flex-wrap">
          <button
            type="button"
            onClick={() => { setPeriyot('hafta'); setGosterilenSayisi(8); setSeciliDonem(icindeBulunulanDonem('hafta')) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              periyot === 'hafta' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            Haftalık
          </button>
          <button
            type="button"
            onClick={() => { setPeriyot('ay'); setGosterilenSayisi(8); setSeciliDonem(icindeBulunulanDonem('ay')) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              periyot === 'ay' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            Aylık
          </button>
          <select
            value={seciliDonem}
            onChange={(e) => setSeciliDonem(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue"
          >
            <option value="">{periyot === 'ay' ? 'Bir ay seç...' : 'Bir hafta seç...'}</option>
            {tumGruplar.map(([anahtar]) => (
              <option key={anahtar} value={anahtar}>{etiketUret(anahtar)}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {gosterilenGruplar.map(([anahtar, grupDersleri]) => {
          const grupToplami = grupDersleri.filter((y) => y.durum === 'geldi').reduce((t, y) => t + y._tutar, 0)
          // Belirli bir HAFTA seçiliyse (dropdown'dan), o haftayı tek tabloda değil
          // gün gün (Pazartesi, Salı...) ayrı ayrı gösteriyoruz.
          const gunGunMu = periyot === 'hafta' && seciliDonem === anahtar
          const gunGruplari = gunGunMu
            ? Object.entries(
                grupDersleri.reduce((acc, y) => {
                  if (!acc[y.tarih]) acc[y.tarih] = []
                  acc[y.tarih].push(y)
                  return acc
                }, {})
              ).sort((a, b) => (a[0] < b[0] ? -1 : 1))
            : null

          const tabloYaz = (dersListesi) => (
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-2 py-1.5 font-medium">Tarih</th>
                  <th className="px-2 py-1.5 font-medium">Saat</th>
                  <th className="px-2 py-1.5 font-medium">Öğrenci</th>
                  {!sadeceOgretmenId && <th className="px-2 py-1.5 font-medium">Öğretmen</th>}
                  <th className="px-2 py-1.5 font-medium">Tür</th>
                  {ucretGorunur && <th className="px-2 py-1.5 font-medium">Tutar</th>}
                  <th className="px-2 py-1.5 font-medium">Durum</th>
                  <th className="px-2 py-1.5 font-medium text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {dersListesi.map((y) => (
                  <tr key={y.id} className="border-t border-gray-50">
                    <td className="px-2 py-1.5">{new Date(y.tarih + 'T12:00:00').toLocaleDateString('tr-TR')}</td>
                    <td className="px-2 py-1.5 text-gray-500">
                      {y._baslangic ? `${saatKisalt(y._baslangic)}${y._bitis ? '–' + saatKisalt(y._bitis) : ''}` : '—'}
                    </td>
                    <td className="px-2 py-1.5 font-medium text-gray-800">{y._ogrenciAdi || '—'}</td>
                    {!sadeceOgretmenId && (
                      <td className="px-2 py-1.5">
                        {y._ogretmenAdi || '—'}
                        {y._ogretmenBransi && <span className="text-xs text-gray-400"> ({y._ogretmenBransi})</span>}
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-gray-500">{y._kaynak}</td>
                    {ucretGorunur && <td className="px-2 py-1.5">{paraFormat(y._tutar)}</td>}
                    <td className="px-2 py-1.5">
                      {y.durum === 'geldi' && (
                        <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-full">Geldi</span>
                      )}
                      {y.durum === 'gelmedi' && (
                        <span className="text-xs font-semibold bg-red-100 text-red-600 px-2 py-1 rounded-full">Gelmedi</span>
                      )}
                      {y.durum === 'bekliyor' && (
                        <span className="text-xs font-semibold bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">Bekliyor</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap space-x-2">
                      {y.durum !== 'geldi' && (
                        <button onClick={() => durumDegistir(y, 'geldi')} className="text-green-600 text-sm hover:underline">
                          Geldi
                        </button>
                      )}
                      {y.durum !== 'gelmedi' && (
                        <button onClick={() => durumDegistir(y, 'gelmedi')} className="text-red-500 text-sm hover:underline">
                          Gelmedi
                        </button>
                      )}
                      <button onClick={() => sil(y.id)} className="text-gray-400 text-sm hover:underline">Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )

          return (
            <div key={anahtar} className="p-4 overflow-x-auto">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                <p className="font-semibold text-gray-700 text-sm capitalize">{etiketUret(anahtar)}</p>
                <p className="text-xs text-gray-400">
                  {grupDersleri.length} ders
                  {ucretGorunur && <> · <span className="font-semibold text-navy">{paraFormat(grupToplami)}</span> (faturalanan)</>}
                </p>
              </div>
              {gunGunMu ? (
                gunGruplari.map(([tarih, gunDersleri]) => {
                  const buGunMu = tarih === yerelBugunTarihi()
                  return (
                    <div key={tarih} className="mb-4 last:mb-0">
                      <p
                        className={`text-sm font-bold text-white rounded-lg px-3 py-1.5 mb-2 tracking-wide flex items-center gap-2 ${
                          buGunMu ? 'bg-orange-500' : 'bg-navy'
                        }`}
                      >
                        <span>
                          {GUNLER[gunNumaraTarihten(tarih)]} — {new Date(tarih + 'T12:00:00').toLocaleDateString('tr-TR')}
                        </span>
                        {buGunMu && (
                          <span className="text-[10px] font-semibold bg-white/25 px-2 py-0.5 rounded-full tracking-normal">
                            Bugün
                          </span>
                        )}
                      </p>
                      {tabloYaz(gunDersleri)}
                    </div>
                  )
                })
              ) : (
                tabloYaz(grupDersleri)
              )}
            </div>
          )
        })}
        {seciliDonem && (
          <div className="p-4 text-center">
            <button
              type="button"
              onClick={() => setSeciliDonem('')}
              className="text-navy text-sm font-semibold underline hover:no-underline"
            >
              ← Tüm {periyot === 'ay' ? 'ayları' : 'haftaları'} listele
            </button>
          </div>
        )}
        {!seciliDonem && gosterilenGruplar.length < tumGruplar.length && (
          <div className="p-4 text-center">
            <button
              type="button"
              onClick={() => setGosterilenSayisi((n) => n + 8)}
              className="text-navy text-sm font-semibold underline hover:no-underline"
            >
              Daha eski {periyot === 'ay' ? 'ayları' : 'haftaları'} göster ({tumGruplar.length - gosterilenGruplar.length} tane daha)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// DERS HATIRLATMASI GÖNDER — iki mod:
//  - Günlük: seçili bir günün (varsayılan bugün) TÜM bire bir derslerini
//    (haftalık atamalar + tek seferlik dersler) ÖĞRENCİ BAŞINA TEK mesajda
//    toplar (aynı öğrencinin aynı gün birden fazla dersi olabiliyor — bkz.
//    örnek: bir öğrenci günde 4-5 farklı öğretmenle ders alabiliyor, bunları
//    tek tek değil TEK mesajla göndermek için).
//  - Haftalık: öğrencinin her hafta tekrar eden (aktif) bire bir ders
//    programının TAMAMINI (gün + saat) tek mesajda özetler.
// Her iki modda da öğrenciye, anneye ya da babaya WhatsApp ile gönderilebilir.
// Öğretmen sadece kendi derslerini görür (sadeceOgretmenId ile filtrelenir).
// ============================================================================
function DersHatirlatmaPaneli({ atamalar, yoklamalar, sadeceOgretmenId }) {
  const [mod, setMod] = useState('gun') // 'gun' | 'hafta'
  const [tarih, setTarih] = useState(() => yerelBugunTarihi())

  const bugun = yerelBugunTarihi()
  const yarin = gunEkle(bugun, 1)
  const gun = gunNumaraTarihten(tarih)

  // GÜNLÜK MOD — seçili tarih için öğrenci bazında gruplanmış ders listesi.
  const gunlukOgrenciler = useMemo(() => {
    const map = new Map() // ogrenci_id -> { ogrenciAdi, ogrenciTelefon, anneTelefon, babaTelefon, dersler: [] }

    const ekle = (kayit) => {
      const id = kayit.ogrenci_id
      if (!id) return
      if (!map.has(id)) {
        map.set(id, {
          ogrenciAdi: kayit.ogrenci_adi || '—',
          ogrenciTelefon: kayit.ogrenci_telefon,
          anneTelefon: kayit.ogrenci_anne_telefon,
          babaTelefon: kayit.ogrenci_baba_telefon,
          dersler: [],
        })
      }
      map.get(id).dersler.push({
        baslangicSaat: saatKisalt(kayit.baslangic_saat),
        bitisSaat: saatKisalt(kayit.bitis_saat),
        // Mesajda kişi adı (öğretmen) yerine DERS adı (öğretmenin branşı,
        // ör. "Matematik") gösterilsin diye — bire bir derslerin ayrı bir
        // "ders adı" alanı olmadığı için en yakın karşılığı branş.
        dersAdi: kayit.ogretmen_bransi || null,
      })
    }

    atamalar
      .filter((a) => a.aktif && a.gun === gun)
      .filter((a) => !sadeceOgretmenId || a.ogretmen_profile_id === sadeceOgretmenId)
      .forEach(ekle)

    // Tek seferlik dersler zaten belirli bir tarihe kayıtlı olduğu için haftanın
    // gününe değil, doğrudan seçili tarihe göre süzülür. "Gelmedi" işaretlenmiş
    // (iptal olmuş) dersler hatırlatma listesinde gösterilmez.
    yoklamalar
      .filter((y) => !y.atama_id && y.tarih === tarih && y.durum !== 'gelmedi')
      .filter((y) => !sadeceOgretmenId || y.ogretmen_profile_id === sadeceOgretmenId)
      .forEach(ekle)

    return [...map.values()]
      .map((o) => ({
        ...o,
        dersler: [...o.dersler].sort((a, b) => (a.baslangicSaat || '').localeCompare(b.baslangicSaat || '')),
      }))
      .sort((a, b) => a.ogrenciAdi.localeCompare(b.ogrenciAdi, 'tr'))
  }, [atamalar, yoklamalar, gun, tarih, sadeceOgretmenId])

  // HAFTALIK MOD — seçili tarihten (bu haftanın kalan günleri) Pazar'a kadar
  // olan TÜM bire bir dersler: hem her hafta tekrar eden atamalar hem de o
  // haftaya özel tek seferlik dersler. Ör. Çarşamba günü gönderiliyorsa,
  // Pazartesi-Salı hariç, Çarşamba-Pazar arası dahil edilir — geçmiş/o an
  // için anlamsız günler mesaja karışmasın diye.
  const haftaSonuTarih = useMemo(() => gunEkle(tarih, 7 - gun), [tarih, gun])

  const haftalikOgrenciler = useMemo(() => {
    const map = new Map()

    const ekle = (kayit, gunNo) => {
      const id = kayit.ogrenci_id
      if (!id) return
      if (!map.has(id)) {
        map.set(id, {
          ogrenciAdi: kayit.ogrenci_adi || '—',
          ogrenciTelefon: kayit.ogrenci_telefon,
          anneTelefon: kayit.ogrenci_anne_telefon,
          babaTelefon: kayit.ogrenci_baba_telefon,
          dersler: [],
        })
      }
      map.get(id).dersler.push({
        gun: gunNo,
        gunAdi: GUNLER[gunNo],
        baslangicSaat: saatKisalt(kayit.baslangic_saat),
        bitisSaat: saatKisalt(kayit.bitis_saat),
        dersAdi: kayit.ogretmen_bransi || null,
      })
    }

    // Her hafta tekrar eden atamalar — sadece bugünden (seçili tarihten)
    // Pazar'a kadar kalan günler.
    atamalar
      .filter((a) => a.aktif && a.gun >= gun)
      .filter((a) => !sadeceOgretmenId || a.ogretmen_profile_id === sadeceOgretmenId)
      .forEach((a) => ekle(a, a.gun))

    // Tek seferlik dersler — gerçek tarihi seçili tarih ile o haftanın Pazar
    // günü arasına denk gelenler.
    yoklamalar
      .filter((y) => !y.atama_id && y.tarih >= tarih && y.tarih <= haftaSonuTarih && y.durum !== 'gelmedi')
      .filter((y) => !sadeceOgretmenId || y.ogretmen_profile_id === sadeceOgretmenId)
      .forEach((y) => ekle(y, gunNumaraTarihten(y.tarih)))

    return [...map.values()]
      .map((o) => ({
        ...o,
        dersler: [...o.dersler].sort(
          (x, y) => x.gun - y.gun || (x.baslangicSaat || '').localeCompare(y.baslangicSaat || '')
        ),
      }))
      .sort((a, b) => a.ogrenciAdi.localeCompare(b.ogrenciAdi, 'tr'))
  }, [atamalar, yoklamalar, gun, tarih, haftaSonuTarih, sadeceOgretmenId])

  const ogrenciler = mod === 'gun' ? gunlukOgrenciler : haftalikOgrenciler

  const tarihMetni = new Date(tarih + 'T12:00:00').toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-gray-700">Ders Hatırlatması Gönder</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Bir öğrencinin o günkü ya da haftalık TÜM derslerini TEK bir WhatsApp mesajında öğrenciye, anneye ya
            da babaya gönderebilirsiniz.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden text-sm shrink-0">
            <button
              type="button"
              onClick={() => setMod('gun')}
              className={`px-3 py-1.5 font-medium transition-colors ${
                mod === 'gun' ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Günlük
            </button>
            <button
              type="button"
              onClick={() => setMod('hafta')}
              className={`px-3 py-1.5 font-medium transition-colors ${
                mod === 'hafta' ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Haftalık
            </button>
          </div>
          <button
            type="button"
            onClick={() => setTarih(bugun)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tarih === bugun ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            Bugün
          </button>
          <button
            type="button"
            onClick={() => setTarih(yarin)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tarih === yarin ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            Yarın
          </button>
          <input
            type="date"
            value={tarih}
            onChange={(e) => setTarih(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
      </div>
      {mod === 'gun' ? (
        <p className="px-4 pt-3 text-xs text-gray-400 capitalize">{tarihMetni}</p>
      ) : (
        <p className="px-4 pt-3 text-xs text-gray-400">
          Seçili tarihten ({new Date(tarih + 'T12:00:00').toLocaleDateString('tr-TR')}) bu haftanın Pazar gününe (
          {new Date(haftaSonuTarih + 'T12:00:00').toLocaleDateString('tr-TR')}) kadar olan TÜM bire bir dersler — hem
          her hafta tekrar edenler hem de tek seferlik olanlar. Geçmiş günler dahil edilmez.
        </p>
      )}
      <div className="divide-y divide-gray-50">
        {ogrenciler.length === 0 && (
          <p className="px-4 py-6 text-center text-gray-400 text-sm">
            {mod === 'gun' ? 'Bu gün için bire bir dersi bulunamadı.' : 'Bu hafta için bire bir dersi bulunamadı.'}
          </p>
        )}
        {ogrenciler.map((o) => {
          // Öğrenciye ve veliye (anne/baba) giden mesajların selamlama satırı
          // farklı olduğu için ("Değerli Öğrencimiz," / "Değerli Velimiz,")
          // iki ayrı mesaj üretiliyor — anne ve baba aynı "veli" mesajını kullanır.
          const mesajOgrenci =
            mod === 'gun'
              ? bireBirGunlukOzetMesajiOlustur({ kimeGonderiliyor: 'ogrenci', ogrenciAdi: o.ogrenciAdi, tarihStr: tarih, dersler: o.dersler })
              : bireBirHaftalikOzetMesajiOlustur({ kimeGonderiliyor: 'ogrenci', ogrenciAdi: o.ogrenciAdi, dersler: o.dersler })
          const mesajVeli =
            mod === 'gun'
              ? bireBirGunlukOzetMesajiOlustur({ kimeGonderiliyor: 'veli', ogrenciAdi: o.ogrenciAdi, tarihStr: tarih, dersler: o.dersler })
              : bireBirHaftalikOzetMesajiOlustur({ kimeGonderiliyor: 'veli', ogrenciAdi: o.ogrenciAdi, dersler: o.dersler })
          const ogrenciLink = bireBirOzetLinkOlustur(o.ogrenciTelefon, mesajOgrenci)
          const anneLink = bireBirOzetLinkOlustur(o.anneTelefon, mesajVeli)
          const babaLink = bireBirOzetLinkOlustur(o.babaTelefon, mesajVeli)
          return (
            <div key={o.ogrenciAdi + (o.ogrenciTelefon || '')} className="px-4 py-3 flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="font-medium text-gray-800">{o.ogrenciAdi}</p>
                <p className="text-xs text-gray-400">
                  {o.dersler.map((d, i) => (
                    <span key={i}>
                      {mod === 'hafta' ? `${d.gunAdi} ` : ''}
                      {d.baslangicSaat}
                      {d.bitisSaat ? `–${d.bitisSaat}` : ''}
                      {i < o.dersler.length - 1 ? ' · ' : ''}
                    </span>
                  ))}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap text-sm">
                {ogrenciLink ? (
                  <a href={ogrenciLink} target="_blank" rel="noreferrer" className="text-green-600 font-medium hover:underline">
                    Öğrenciye Gönder
                  </a>
                ) : (
                  <span className="text-xs text-gray-400">Öğrenci Telefonu Yok</span>
                )}
                {anneLink ? (
                  <a href={anneLink} target="_blank" rel="noreferrer" className="text-green-600 font-medium hover:underline">
                    Anneye Gönder
                  </a>
                ) : (
                  <span className="text-xs text-gray-400">Anne Telefonu Yok</span>
                )}
                {babaLink ? (
                  <a href={babaLink} target="_blank" rel="noreferrer" className="text-green-600 font-medium hover:underline">
                    Babaya Gönder
                  </a>
                ) : (
                  <span className="text-xs text-gray-400">Baba Telefonu Yok</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function BireBir() {
  const { profile } = useAuth()
  const isYonetici = profile?.rol === 'yonetici'

  const [ogrenciler, setOgrenciler] = useState([])
  const [ogretmenler, setOgretmenler] = useState([])
  const [dersProgrami, setDersProgrami] = useState([])
  const [atamalar, setAtamalar] = useState([])
  const [yoklamalar, setYoklamalar] = useState([])
  const [loading, setLoading] = useState(true)
  const [sadeceAktif, setSadeceAktif] = useState(true)
  const [sadeceBugun, setSadeceBugun] = useState(true)
  const [yoklamaArama, setYoklamaArama] = useState('')
  // İlk açılıştan sonra "Yükleniyor..." ekranını bir daha göstermiyoruz — bir ders
  // ekleyip onEklendi() ile veriyi yenilediğimizde tüm sayfa "Yükleniyor..." ekranına
  // dönüp formu (bileşeni) komple yeniden kuruyordu, bu da az önce doldurulmuş
  // öğrenci/saat gibi form alanlarını sıfırlıyordu. Artık sadece ilk yüklemede
  // gösteriliyor, sonraki yenilemeler arka planda sessizce oluyor.
  const ilkYuklemeTamamRef = useRef(false)

  function veriyiYenile() {
    if (!ilkYuklemeTamamRef.current) setLoading(true)
    Promise.all([
      isYonetici ? supabase.from('ogrenciler').select('*').order('ad_soyad') : Promise.resolve({ data: [] }),
      isYonetici ? supabase.from('profiles').select('*').eq('rol', 'ogretmen').order('ad_soyad') : Promise.resolve({ data: [] }),
      isYonetici ? supabase.from('ders_programi').select('*') : Promise.resolve({ data: [] }),
      supabase
        .from('bire_bir_atamalari')
        // "Ders Hatırlatması Gönder" paneli için öğrencinin kendi telefonu ile
        // anne/baba telefonu da bu join üzerinden çekiliyor (aşağıda ogrenci_telefon
        // vb. alanlara açılıyor) — ayrı bir sorguya gerek kalmasın diye.
        .select('*, ogrenciler(ad_soyad, telefon, anne_telefon, baba_telefon), profiles:ogretmen_profile_id(ad_soyad, brans)')
        .order('gun')
        .order('baslangic_saat'),
      // Tek seferlik dersler için de öğrenci/öğretmen adını doğrudan sorguyla
      // birlikte çekiyoruz (atamalardaki gibi) — çünkü öğretmen rolünde tam
      // öğrenci/öğretmen listesi hiç çekilmiyor (yukarıdaki iki satır sadece
      // yönetici için), o zaman isim haritaları boş kalıp "—" görünürdü.
      supabase
        .from('bire_bir_yoklama')
        .select('*, ogrenciler(ad_soyad, telefon, anne_telefon, baba_telefon), profiles:ogretmen_profile_id(ad_soyad, brans)'),
    ]).then(([o, og, dp, a, y]) => {
      setOgrenciler(o.data || [])
      setOgretmenler(og.data || [])
      setDersProgrami(dp.data || [])
      setAtamalar(
        (a.data || []).map((d) => ({
          ...d,
          ogrenci_adi: d.ogrenciler?.ad_soyad,
          ogretmen_adi: d.profiles?.ad_soyad,
          // Öğretmenin branşı — veli/yönetici hocayı isimden değil, hangi DERS
          // için ders aldığından da tanısın diye listelerde adının yanında gösteriliyor.
          ogretmen_bransi: d.profiles?.brans,
          ogrenci_telefon: d.ogrenciler?.telefon,
          ogrenci_anne_telefon: d.ogrenciler?.anne_telefon,
          ogrenci_baba_telefon: d.ogrenciler?.baba_telefon,
        }))
      )
      setYoklamalar(
        (y.data || []).map((d) => ({
          ...d,
          ogrenci_adi: d.ogrenciler?.ad_soyad,
          ogretmen_adi: d.profiles?.ad_soyad,
          ogretmen_bransi: d.profiles?.brans,
          ogrenci_telefon: d.ogrenciler?.telefon,
          ogrenci_anne_telefon: d.ogrenciler?.anne_telefon,
          ogrenci_baba_telefon: d.ogrenciler?.baba_telefon,
        }))
      )
      ilkYuklemeTamamRef.current = true
      setLoading(false)
    })
  }

  useEffect(() => {
    veriyiYenile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const bugunGun = useMemo(() => {
    const g = new Date().getDay()
    return g === 0 ? 7 : g
  }, [])

  const gorunenAtamalar = useMemo(() => {
    const aranan = yoklamaArama.trim().toLowerCase()
    return atamalar
      .filter((a) => !sadeceAktif || a.aktif)
      .filter((a) => !sadeceBugun || a.gun === bugunGun)
      .filter((a) => {
        if (!aranan) return true
        return (
          (a.ogrenci_adi || '').toLowerCase().includes(aranan) ||
          (a.ogretmen_adi || '').toLowerCase().includes(aranan)
        )
      })
  }, [atamalar, sadeceAktif, sadeceBugun, yoklamaArama, bugunGun])

  const ogrenciAdMap = useMemo(() => new Map(ogrenciler.map((o) => [o.id, o.ad_soyad])), [ogrenciler])

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">{isYonetici ? 'Bire Bir Dersler' : 'Bire Bir Derslerim'}</h1>

      {/* Ders hatırlatma (WhatsApp gönder) paneli sadece yöneticiye gösterilir —
          öğretmen rolünde veli/öğrenciye mesaj gönderme yetkisi olmamalı. */}
      {isYonetici && (
        <DersHatirlatmaPaneli
          atamalar={atamalar}
          yoklamalar={yoklamalar}
          sadeceOgretmenId={null}
        />
      )}

      {isYonetici && (
        <>
          <BireBirDersEkleForm
            ogrenciler={ogrenciler}
            ogretmenler={ogretmenler}
            atamalar={atamalar}
            dersProgrami={dersProgrami}
            yoklamalar={yoklamalar}
            onEklendi={veriyiYenile}
          />
          <MusaitlikTablosu
            ogretmenler={ogretmenler}
            dersProgrami={dersProgrami}
            atamalar={atamalar}
            yoklamalar={yoklamalar}
            ogrenciAdMap={ogrenciAdMap}
          />
          <AtamaListesi
            atamalar={atamalar}
            ogretmenler={ogretmenler}
            dersProgrami={dersProgrami}
            onDegisti={veriyiYenile}
          />
          <OgrenciOgretmenEkstreSecici ogrenciler={ogrenciler} ogretmenler={ogretmenler} />
        </>
      )}

      {/* Hem haftalık tekrarlanan atamalardan Geldi/Gelmedi işaretlenen dersler hem
          tek seferlik dersler burada, haftalara bölünmüş TEK bir listede — "kim
          hangi haftada kaç ders almış" tek bakışta görülsün diye. Öğretmenler de
          KENDİ derslerini (ücret gizli) burada görüp Geldi/Gelmedi işaretleyebiliyor. */}
      <TekSeferlikDerslerListesi
        yoklamalar={yoklamalar}
        atamalar={atamalar}
        onDegisti={veriyiYenile}
        sadeceOgretmenId={isYonetici ? null : profile?.id}
        ucretGorunur={isYonetici}
      />

      {/* "Yoklama Al", bir haftalık atamanın YENİ bir hafta/tarih için henüz hiç
          yoklama kaydı oluşturulmamışsa o kaydı ilk defa oluşturan tek yerdir
          (yukarıdaki "Tüm Derslerim" listesi sadece ZATEN VAR OLAN kayıtları
          düzenler/siler, yeni haftalık kayıt oluşturmaz). O yüzden aktif hiç
          haftalık atama yoksa bu bölümün gösterecek hiçbir şeyi kalmıyor —
          sadece o durumda tamamen gizliyoruz, gerçek bir haftalık atama
          eklendiğinde otomatik geri gelir. */}
      {atamalar.some((a) => a.aktif) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-semibold text-gray-700">Yoklama Al</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {isYonetici
                  ? '"Geldi" işaretlenince ilgili öğrencinin hesabına o dersin ücreti otomatik borç olarak eklenir. Yanlış işaretlediyseniz tekrar tıklayarak değiştirebilir ya da "Kaydı Sil" ile kaldırabilirsiniz.'
                  : '"Geldi" işaretlenince o ders yapılmış, "Gelmedi" işaretlenince yapılmamış sayılır. Yanlış işaretlediyseniz tekrar tıklayarak değiştirebilirsiniz.'}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="text"
                value={yoklamaArama}
                onChange={(e) => setYoklamaArama(e.target.value)}
                placeholder="Öğrenci / öğretmen ara..."
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue min-w-[160px]"
              />
              <label className="flex items-center gap-2 text-sm text-gray-600 select-none">
                <input type="checkbox" checked={sadeceBugun} onChange={(e) => setSadeceBugun(e.target.checked)} />
                Sadece bugünün dersleri
              </label>
              {isYonetici && (
                <label className="flex items-center gap-2 text-sm text-gray-600 select-none">
                  <input type="checkbox" checked={sadeceAktif} onChange={(e) => setSadeceAktif(e.target.checked)} />
                  Sadece aktif atamalar
                </label>
              )}
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {gorunenAtamalar.length === 0 && (
              <p className="px-4 py-4 text-center text-gray-400 text-sm">
                Gösterilecek atama yok.{' '}
                {sadeceBugun && (
                  <button onClick={() => setSadeceBugun(false)} className="text-blue hover:underline">
                    Tüm haftayı göster
                  </button>
                )}
              </p>
            )}
            {gorunenAtamalar.map((a) => (
              <YoklamaSatiri
                key={a.id}
                atama={a}
                yoklamalar={yoklamalar}
                onDegisti={veriyiYenile}
                ucretGorunur={isYonetici}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
