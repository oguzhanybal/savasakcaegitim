import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useTaslakModu } from '../lib/taslakModu'
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

// Şu anki saati "HH:MM" olarak, YEREL saate göre üretir — bir tek seferlik ders
// BUGÜN için, henüz gelmemiş bir saate (ör. şu an 12:38 iken 12:50'ye) eklendiğinde
// bunun da "ileri tarihli/saatli" sayılıp otomatik "Geldi" yapılmaması için kullanılır.
function yerelSuankiSaatDakika() {
  const n = new Date()
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
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

// Bir öğrencinin KENDİ sınıfının, seçilen gün/saatte bir dersi olup olmadığını
// kontrol eder — cakismaBul/tekSeferlikCakismaBul'daki (öğretmen çakışması,
// öğrencinin BAŞKA bir bire bir dersi) kontroller SERT birer engeldir, ama bu
// kontrol öyle değil: bazı öğrenciler bilerek sınıf dersini kaçırıp bire bir
// derse geliyor, o yüzden burada sadece bir UYARI döndürülür — admin
// "Evet, yine de ekle" diyerek devam edebilir. sinifOgrencileri: öğrencinin
// hangi sınıf(lar)a kayıtlı olduğunu tutan ara tablo ([{ ogrenci_id, sinif_id }]).
function ogrenciSinifDersiUyarisiBul(ogrenciId, gun, baslangic, bitis, dersProgrami, sinifOgrencileri) {
  if (!ogrenciId || !gun || !baslangic || !bitis) return null
  const sinifIdleri = new Set(
    (sinifOgrencileri || []).filter((so) => so.ogrenci_id === ogrenciId).map((so) => so.sinif_id)
  )
  if (sinifIdleri.size === 0) return null
  for (const d of dersProgrami) {
    if (!sinifIdleri.has(d.sinif_id)) continue
    if (d.gun !== gun) continue
    if (!araliklarCakisiyorMu(baslangic, bitis, d.baslangic_saat, d.bitis_saat)) continue
    return {
      aciklama: `bu öğrencinin ${GUNLER[d.gun]} günü ${saatKisalt(d.baslangic_saat)}–${saatKisalt(d.bitis_saat)} arası "${d.ders_adi || d.sinif_adi || 'sınıf'}" dersi var`,
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
function BireBirDersEkleForm({
  ogrenciler,
  ogretmenler,
  atamalar,
  dersProgrami,
  yoklamalar,
  sinifOgrencileri,
  taslaklar = [],
  onEklendi,
  doldurBilgisi,
  // Taslak Modu — sayfa üstündeki anahtar açık VE bir plan adı girilmişse,
  // aşağıdaki "Ekle" butonu artık canlı kayda değil, taslaklar tablosuna, bu
  // isimle etiketlenerek kaydeder (bkz. BireBir() bileşenindeki
  // taslakModuAcik/aktifPlanAdi state'i).
  taslakModuAcik = false,
  aktifPlanAdi = '',
}) {
  const { profile } = useAuth()
  const [ogrenciId, setOgrenciId] = useState('')
  const [ogretmenId, setOgretmenId] = useState('')
  const [dersUcreti, setDersUcreti] = useState('')
  // Çoğu öğrencinin sabit haftalık programı olmadığı için varsayılan (öncelikli)
  // seçenek "Hayır, sadece bu sefer" — sabit programı olanlar için elle "Evet"e geçilir.
  const [tekrarlansin, setTekrarlansin] = useState(false)

  // Haftalık tekrar (Evet) alanları — birden fazla gün seçilebilir ("bütün
  // haftanın bire birlerini tek seferde ekleyebileyim" isteğiyle eklendi).
  const [seciliGunler, setSeciliGunler] = useState([])
  const [baslangic, setBaslangic] = useState('')
  const [bitis, setBitis] = useState('')

  function gunSecToggle(g) {
    setSeciliGunler((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))
  }

  // Tek seferlik (Hayır) alanları — saat opsiyonel: girilirse kayda saat de damgalanır,
  // girilmezse boş bırakılabilir.
  const [tarih, setTarih] = useState(() => yerelBugunTarihi())
  const [tekBaslangic, setTekBaslangic] = useState('')
  const [tekBitis, setTekBitis] = useState('')

  const [hata, setHata] = useState('')
  const [basari, setBasari] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)
  // Öğrencinin kendi sınıf dersiyle çakıştığı tespit edilirse (bkz.
  // ogrenciSinifDersiUyarisiBul) buraya uyarı metni yazılır — bu SERT bir engel
  // değil, "Evet, yine de ekle" ile devam edilebilir. Diğer çakışmalar (hata)
  // gibi engellemez, sadece bilgilendirir.
  const [sinifUyarisi, setSinifUyarisi] = useState('')
  const ogrenciSelectRef = useRef(null)
  const tekBaslangicRef = useRef(null)
  // "Grup Dersi" — bazen bir öğretmen aynı saatte tek bir öğrenciye değil,
  // birden fazla öğrenciye BİRLİKTE ders veriyor (küçük grup). Ana "Öğrenci"
  // alanı ilk öğrenciyi tutar, buradaki liste ek öğrencileri tutar — hepsi aynı
  // öğretmen/gün-saat(ya da tarih-saat)/ücretle, ortak bir "grup_id" ile
  // kaydedilir (bkz. haftalikKaydet/tekSeferlikKaydet).
  const [ekOgrenciler, setEkOgrenciler] = useState([])

  function ekOgrenciEkle() {
    setEkOgrenciler((prev) => [...prev, ''])
  }
  function ekOgrenciDegistir(index, deger) {
    setEkOgrenciler((prev) => prev.map((v, i) => (i === index ? deger : v)))
  }
  function ekOgrenciKaldir(index) {
    setEkOgrenciler((prev) => prev.filter((_, i) => i !== index))
  }

  // Müsaitlik tablosunda boş bir hücreye tıklanınca, üstten gelen bilgiyle formu
  // otomatik doldurur ve öğrenci seçimine odaklanır — elle öğretmen/tarih/saat
  // yazmaya gerek kalmasın diye. doldurBilgisi her tıklamada YENİ bir nesne
  // olarak geldiği için (bkz. BireBir() bileşenindeki hucreTiklandi), bu effect
  // aynı hücreye art arda tıklansa bile her seferinde tekrar çalışır.
  useEffect(() => {
    if (!doldurBilgisi) return
    setOgretmenId(doldurBilgisi.ogretmenId)
    setTekrarlansin(false)
    setTarih(doldurBilgisi.tarih)
    setTekBaslangic(doldurBilgisi.baslangic)
    // Müsaitlik tablosundaki hücreler 30dk'lık dilimler olsa da, buradaki
    // dersler genelde 45dk sürdüğü için tıklanan dilimin kendi bitişini değil,
    // her zaman başlangıç + 45dk'yı öneriyoruz.
    setTekBitis(saateDakikaEkle(doldurBilgisi.baslangic, 45))
    setEkOgrenciler([])
    setHata('')
    setBasari('')
    ogrenciSelectRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doldurBilgisi])

  // Seçilen öğretmenin, seçili günlerden İLKİNDEKİ tüm dolu saatlerini (hem
  // sınıf dersleri hem diğer bire bir dersleri) tek listede gösterir — sadece
  // "Evet, tekrarlansın" seçiliyken anlamlı, çünkü tek seferlik derste gün
  // bazlı çakışma aranmıyor. Birden fazla gün seçilmişse sadece ilk günün
  // durumu bilgi amaçlı gösterilir (aşağıdaki JSX'te bunu belirtiyoruz).
  const buGunMesgulSaatler = useMemo(() => {
    if (!ogretmenId || !tekrarlansin || seciliGunler.length === 0) return []
    const gunNum = Number(seciliGunler[0])
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
  }, [ogretmenId, seciliGunler, dersProgrami, atamalar, tekrarlansin])

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

  // Haftalık tekrarlanan atamanın gerçek kaydını yazar — hem normal "Ekle"
  // akışından (hard/soft kontroller geçtikten sonra), hem de sınıf dersi
  // uyarısı gösterildiğinde "Evet, yine de ekle" butonundan çağrılır.
  async function haftalikKaydet() {
    setGonderiliyor(true)
    // Ek öğrenciler seçiliyse (grup dersi), SEÇİLEN HER GÜN için önce her ek
    // öğrenci AYRI AYRI çakışma kontrolünden geçirilir (mevcut veriye göre) —
    // biri çakışıyorsa hiçbiri eklenmeden durdurulur, "bir kısmı eklendi bir
    // kısmı eklenemedi" gibi yarım kalmış bir durum oluşmasın diye.
    const gecerliEkOgrenciler = ekOgrenciler.filter(Boolean)
    for (const g of seciliGunler) {
      for (const ekId of gecerliEkOgrenciler) {
        const ekCakisma = cakismaBul({ ogrenciId: ekId, ogretmenId, gun: Number(g), baslangic, bitis }, dersProgrami, atamalar)
        if (ekCakisma) {
          setGonderiliyor(false)
          setHata(`Çakışma var (${ogrenciler.find((o) => o.id === ekId)?.ad_soyad || 'ek öğrenci'}, ${GUNLER[g]}): ${ekCakisma.aciklama}.`)
          return
        }
      }
    }
    // Grup dersiyse, tüm satırlar aynı "grup_id" ile etiketlenir — böylece bu
    // öğretmenin bu öğrencilerin hepsiyle AYNI ANDA görünmesi artık çakışma
    // sayılmaz, sistem bunu TEK bir grup dersi olarak bilir. Birden fazla gün
    // seçildiyse de aynı mantıkla hepsi TEK istekte (öğrenci × gün) eklenir.
    const grupId = gecerliEkOgrenciler.length > 0 ? crypto.randomUUID() : null
    const tumOgrenciler = [ogrenciId, ...gecerliEkOgrenciler]
    const gunSayisi = seciliGunler.length
    const kayitlar = seciliGunler.flatMap((g) =>
      tumOgrenciler.map((oid) => ({
        ogrenci_id: oid,
        ogretmen_profile_id: ogretmenId,
        ders_ucreti: Number(dersUcreti),
        gun: Number(g),
        baslangic_saat: baslangic,
        bitis_saat: bitis,
        grup_id: grupId,
      }))
    )
    const { error } = await supabase.from('bire_bir_atamalari').insert(kayitlar)
    setGonderiliyor(false)
    if (error) {
      setHata('Hata: ' + error.message)
      return
    }
    setBaslangic('')
    setBitis('')
    setSeciliGunler([])
    setEkOgrenciler([])
    setBasari(
      gecerliEkOgrenciler.length > 0
        ? `✓ Grup dersi olarak (${gecerliEkOgrenciler.length + 1} öğrenci birlikte), ${gunSayisi} gün için her hafta tekrarlanacak şekilde eklendi.`
        : gunSayisi > 1
        ? `✓ ${gunSayisi} gün için her hafta tekrarlanacak şekilde eklendi.`
        : '✓ Her hafta tekrarlanacak şekilde eklendi — devam edebilirsiniz.'
    )
    setSinifUyarisi('')
    onEklendi()
  }

  // Tek seferlik dersin gerçek kaydını yazar — bkz. haftalikKaydet üstündeki not.
  async function tekSeferlikKaydet() {
    // Tarih BUGÜNDEN SONRAsıysa (ileri tarihli, önceden planlanan bir ders),
    // henüz gerçekleşmediği için doğrudan "Geldi" sayıp borç eklemiyoruz —
    // "Bekliyor" olarak kaydediliyor, ders yapıldıktan sonra "Son Tek Seferlik
    // Dersler" listesinden Geldi/Gelmedi işaretlenir. Bugün ya da geçmiş bir
    // tarihse (unutulmuş/geçmiş bir dersi girme senaryosu) direkt "Geldi" olur.
    // AMA: tarih BUGÜN olsa bile, girilen Başlangıç saati şu andan HENÜZ
    // GELMEDİYSE (ör. şu an 12:38 iken derse 12:50 girildiyse), bu ders de
    // henüz yaşanmamış demektir — eskiden sadece TARİH karşılaştırıldığı için
    // böyle durumlarda da yanlışlıkla direkt "Geldi" yazılıp hemen borç
    // ekleniyordu. Artık aynı gün için SAAT de kontrol ediliyor.
    const ileriTarihli =
      tarih > yerelBugunTarihi() ||
      (tarih === yerelBugunTarihi() && tekBaslangic && tekBaslangic > yerelSuankiSaatDakika())
    const durum = ileriTarihli ? 'bekliyor' : 'geldi'
    const gecerliEkOgrenciler = ekOgrenciler.filter(Boolean)

    setGonderiliyor(true)

    // Ek öğrenciler seçiliyse (grup dersi), önce her biri için AYRI AYRI
    // çakışma kontrolü — saat girilmemişse zaten kontrol edilecek bir şey yok.
    if (tekBaslangic && tekBitis) {
      for (const ekId of gecerliEkOgrenciler) {
        const ekCakisma = tekSeferlikCakismaBul(
          { ogrenciId: ekId, ogretmenId, tarih, baslangic: tekBaslangic, bitis: tekBitis },
          dersProgrami,
          atamalar,
          yoklamalar,
          ogrenciler,
          ogretmenler
        )
        if (ekCakisma) {
          setGonderiliyor(false)
          setHata(`Çakışma var (${ogrenciler.find((o) => o.id === ekId)?.ad_soyad || 'ek öğrenci'}): ${ekCakisma.aciklama}.`)
          return
        }
      }
    }

    const grupId = gecerliEkOgrenciler.length > 0 ? crypto.randomUUID() : null
    const { error } = await supabase.from('bire_bir_yoklama').insert({
      ogrenci_id: ogrenciId,
      ogretmen_profile_id: ogretmenId,
      tutar: Number(dersUcreti),
      tarih,
      durum,
      baslangic_saat: tekBaslangic || null,
      bitis_saat: tekBitis || null,
      grup_id: grupId,
    })
    if (error) {
      setGonderiliyor(false)
      setHata('Hata: ' + error.message)
      return
    }

    if (gecerliEkOgrenciler.length > 0) {
      const ekKayitlar = gecerliEkOgrenciler.map((ekId) => ({
        ogrenci_id: ekId,
        ogretmen_profile_id: ogretmenId,
        tutar: Number(dersUcreti),
        tarih,
        durum,
        baslangic_saat: tekBaslangic || null,
        bitis_saat: tekBitis || null,
        grup_id: grupId,
      }))
      const { error: ekHata } = await supabase.from('bire_bir_yoklama').insert(ekKayitlar)
      if (ekHata) {
        setGonderiliyor(false)
        setHata('Ana öğrenci eklendi ama ek öğrenciler eklenirken hata oldu: ' + ekHata.message)
        onEklendi()
        return
      }
    }

    setGonderiliyor(false)
    // Aynı öğrenci/öğretmene üst üste (aynı gün, arka arkaya) ders eklerken
    // öğrenci/öğretmen/ücret/tarih AYNEN korunuyor — tekrar seçmeye gerek yok.
    // Saat girilmişse, bir sonraki dersin başlangıcı otomatik olarak "bu dersin
    // bitişi + 10 dakika ara" olarak öneriliyor (bitiş de +45dk ile hesaplanıyor).
    // Bu sadece formu ÖNCEDEN dolduruyor — kaydetmek için yine "Ekle"ye basmak gerekiyor.
    const bekliyorNotu = ileriTarihli
      ? ' İleri tarihli olduğu için "Bekliyor" olarak eklendi, henüz borç eklenmedi — ders yapıldıktan sonra "Tüm Bire Bir Dersler" listesinden Geldi/Gelmedi işaretleyin.'
      : ''
    const grupNotu = gecerliEkOgrenciler.length > 0 ? ` Grup dersi olarak ${gecerliEkOgrenciler.length + 1} öğrenciye birden eklendi.` : ''
    setEkOgrenciler([])
    if (tekBitis) {
      const yeniBaslangic = saateDakikaEkle(tekBitis, 10)
      const yeniBitis = saateDakikaEkle(yeniBaslangic, 45)
      setTekBaslangic(yeniBaslangic)
      setTekBitis(yeniBitis)
      setBasari(
        `✓ Eklendi.${bekliyorNotu}${grupNotu} Sıradaki ders için ${new Date(tarih + 'T12:00:00').toLocaleDateString('tr-TR')} tarihinde ${yeniBaslangic}–${yeniBitis} önerildi (10dk ara) — kontrol edip tekrar "Ekle"ye basabilirsiniz.`
      )
    } else {
      setBasari(`✓ Tek seferlik ders eklendi.${bekliyorNotu}${grupNotu}`)
    }
    setSinifUyarisi('')
    tekBaslangicRef.current?.focus()
    onEklendi()
  }

  async function ekle(e) {
    e.preventDefault()
    setHata('')
    setBasari('')
    setSinifUyarisi('')

    if (!ogrenciId || !ogretmenId || !dersUcreti) {
      setHata('Lütfen öğrenci, öğretmen ve ders ücretini girin.')
      return
    }

    // Taslak Modu açıkken (sayfa üstündeki anahtar), "Ekle" butonu ASLA canlı
    // kayda yazmaz — plan adı doluysa taslagaKaydet()'e devreder (o fonksiyon
    // hem canlıya hem bekleyen taslaklara karşı çakışma kontrolü yapar ve
    // aktifPlanAdi'yı satıra damgalar); plan adı BOŞSA da (anahtar açık
    // göründüğü halde plan adı unutulmuşsa) sessizce canlıya düşmek yerine net
    // bir hatayla durdurulur.
    if (taslakModuAcik) {
      if (!aktifPlanAdi.trim()) {
        setHata('Taslak Modu açık — devam etmeden önce üstteki kutuya bir plan adı yazın (yoksa hiçbir yere eklenmez).')
        return
      }
      await taslagaKaydet()
      return
    }

    if (tekrarlansin) {
      if (seciliGunler.length === 0 || !baslangic || !bitis) {
        setHata('Lütfen en az bir gün ve saat aralığını girin.')
        return
      }
      if (baslangic >= bitis) {
        setHata('Başlangıç saati bitiş saatinden önce olmalı.')
        return
      }
      // Seçilen HER gün için ana öğrencinin çakışması ayrı ayrı kontrol edilir
      // — bütün haftayı tek seferde eklerken bir gün çakışsa bile diğerlerini
      // gizlice atlamamak için.
      for (const g of seciliGunler) {
        const cakisma = cakismaBul({ ogrenciId, ogretmenId, gun: Number(g), baslangic, bitis }, dersProgrami, atamalar)
        if (cakisma) {
          setHata(`Çakışma var (${GUNLER[g]}): ${cakisma.aciklama}.`)
          return
        }
      }
      // Sınıf dersiyle çakışma SERT bir engel değil, sadece uyarı — admin
      // "Evet, yine de ekle" ile devam edebilir (bkz. ogrenciSinifDersiUyarisiBul).
      for (const g of seciliGunler) {
        const sinifUyari = ogrenciSinifDersiUyarisiBul(ogrenciId, Number(g), baslangic, bitis, dersProgrami, sinifOgrencileri)
        if (sinifUyari) {
          setSinifUyarisi(sinifUyari.aciklama)
          return
        }
      }

      await haftalikKaydet()
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
        const gunNum = gunNumaraTarihten(tarih)
        const sinifUyari = ogrenciSinifDersiUyarisiBul(ogrenciId, gunNum, tekBaslangic, tekBitis, dersProgrami, sinifOgrencileri)
        if (sinifUyari) {
          setSinifUyarisi(sinifUyari.aciklama)
          return
        }
      }

      await tekSeferlikKaydet()
    }
  }

  // "Sınıf dersi var" uyarısı gösterilirken admin'in bastığı "Evet, yine de
  // ekle" — hard/çakışma kontrolleri az önce ekle() içinde zaten geçtiği için
  // burada tekrar kontrol etmeden, doğrudan ilgili kaydet fonksiyonunu çağırır.
  async function sinifUyarisinaRagmenEkle() {
    setSinifUyarisi('')
    if (tekrarlansin) await haftalikKaydet()
    else await tekSeferlikKaydet()
  }

  // Formu doldurup henüz kesinleşmemiş bir ders için "Taslağa Kaydet" — gerçek
  // programa hemen eklemez, sadece taslaklar tablosuna kaydeder. Yayınlanırken
  // (Taslaklarım listesinden) çakışma TEKRAR kontrol edilir (program o zamana
  // kadar değişmiş olabilir) — AMA taslağı kaydederken de (haftalık tekrar eden
  // için), hem GERÇEK programla/atamalarla hem BEKLEYEN diğer taslaklarla
  // çakışıp çakışmadığı burada da kontrol edilir, "haftalık programı taslakta
  // kurup sonunda topluca yayınlayacağım, arada birbiriyle çakışan taslaklar
  // oluşmasın" isteği için.
  async function taslagaKaydet() {
    setHata('')
    setBasari('')
    if (!ogrenciId || !ogretmenId || !dersUcreti) {
      setHata('Lütfen öğrenci, öğretmen ve ders ücretini girin.')
      return
    }
    // Grup dersi (ek öğrenciler) taslak akışında henüz desteklenmiyor —
    // yanlışlıkla sadece ana öğrencinin taslağa kaydedilip ek öğrencilerin
    // sessizce kaybolmasını önlemek için burada durduruluyor.
    if (ekOgrenciler.filter(Boolean).length > 0) {
      setHata('Grup dersi (ek öğrenciler) taslağa kaydedilemez — lütfen doğrudan "Ekle" butonunu kullanın.')
      return
    }
    // Bu taslak hangi plana kaydedilecekse, çakışma kontrolü SADECE o plana
    // ait diğer taslaklara karşı yapılır — farklı isimli planlar birbirinden
    // bağımsızdır, "fafa" planı "deneme" planındaki bir taslakla asla çakışma
    // sayılmaz.
    const hedefPlanAdi = taslakModuAcik && aktifPlanAdi.trim() ? aktifPlanAdi.trim() : null
    let kayitlar
    if (tekrarlansin) {
      if (seciliGunler.length === 0 || !baslangic || !bitis) {
        setHata('Lütfen en az bir gün ve saat aralığını girin.')
        return
      }
      // Bekleyen "bire_bir_haftalik" taslaklarını (sadece AYNI plana ait
      // olanları), cakismaBul'un anladığı atama-satırı şekline çeviriyoruz —
      // böylece aynı fonksiyonu hem gerçek atamalara hem taslaklara karşı
      // çalıştırabiliyoruz.
      const taslakAtamaSatirlari = taslaklar
        .filter((t) => t.tur === 'bire_bir_haftalik' && (t.plan_adi || null) === hedefPlanAdi)
        .map((t) => ({
          aktif: true,
          gun: t.veri.gun,
          baslangic_saat: t.veri.baslangic_saat,
          bitis_saat: t.veri.bitis_saat,
          ogretmen_profile_id: t.veri.ogretmen_profile_id,
          ogrenci_id: t.veri.ogrenci_id,
          ogrenci_adi: ogrenciler.find((o) => o.id === t.veri.ogrenci_id)?.ad_soyad,
          ogretmen_adi: ogretmenler.find((o) => o.id === t.veri.ogretmen_profile_id)?.ad_soyad,
        }))
      for (const g of seciliGunler) {
        const canliCakisma = cakismaBul({ ogrenciId, ogretmenId, gun: Number(g), baslangic, bitis }, dersProgrami, atamalar)
        if (canliCakisma) {
          setHata(`Çakışma var (${GUNLER[g]}): ${canliCakisma.aciklama}.`)
          return
        }
        const taslakCakisma = cakismaBul({ ogrenciId, ogretmenId, gun: Number(g), baslangic, bitis }, [], taslakAtamaSatirlari)
        if (taslakCakisma) {
          setHata(`Bu, taslaklarınızdan biriyle çakışıyor (${GUNLER[g]}): ${taslakCakisma.aciklama}.`)
          return
        }
      }
      // Birden fazla gün seçilmişse (ör. bütün hafta), her gün için AYRI bir
      // taslak satırı TEK seferde ekleniyor — yayınlama (yayinla) hâlâ her
      // taslağı tek tek (bir gün = bir satır) işliyor, burada değişen sadece
      // kaç taslak satırı birden oluşturulduğu.
      kayitlar = seciliGunler.map((g) => ({
        tur: 'bire_bir_haftalik',
        veri: {
          ogrenci_id: ogrenciId,
          ogretmen_profile_id: ogretmenId,
          ders_ucreti: Number(dersUcreti),
          gun: Number(g),
          baslangic_saat: baslangic,
          bitis_saat: bitis,
        },
        olusturan_profile_id: profile?.id,
        plan_adi: hedefPlanAdi,
      }))
    } else {
      if (!tarih) {
        setHata('Lütfen tarihi girin.')
        return
      }
      kayitlar = [
        {
          tur: 'bire_bir_tekil',
          veri: {
            ogrenci_id: ogrenciId,
            ogretmen_profile_id: ogretmenId,
            tutar: Number(dersUcreti),
            tarih,
            baslangic_saat: tekBaslangic || null,
            bitis_saat: tekBitis || null,
          },
          olusturan_profile_id: profile?.id,
          plan_adi: hedefPlanAdi,
        },
      ]
    }
    setGonderiliyor(true)
    const { error } = await supabase.from('taslaklar').insert(kayitlar)
    setGonderiliyor(false)
    if (error) setHata('Hata: ' + error.message)
    else {
      const planNotu = taslakModuAcik && aktifPlanAdi.trim() ? ` "${aktifPlanAdi.trim()}" planına eklendi.` : ''
      setBasari(
        kayitlar.length > 1
          ? `✓ ${kayitlar.length} gün için taslağa kaydedildi.${planNotu} Aşağıdaki "Taslaklarım" listesinden yayınlayabilirsiniz.`
          : `✓ Taslağa kaydedildi.${planNotu} Aşağıdaki "Taslaklarım" listesinden yayınlayabilirsiniz.`
      )
      onEklendi()
    }
  }

  return (
    <form id="bire-bir-ekle-formu" onSubmit={ekle} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
      <p className="font-semibold text-gray-700 mb-1">Bire Bir Ders Ekle</p>
      {taslakModuAcik && aktifPlanAdi.trim() && (
        <p className="text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-lg px-2.5 py-1.5 mb-3">
          📋 Taslak Modu açık — eklenen ders "{aktifPlanAdi.trim()}" planına kaydedilecek (canlıya değil).
        </p>
      )}
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

      <div className="mt-3">
        {ekOgrenciler.map((ekId, idx) => (
          <div key={idx} className="flex items-end gap-2 mb-2">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {idx === 0 ? 'Ek Öğrenci (grup dersi)' : 'Ek Öğrenci'}
              </label>
              <select
                value={ekId}
                onChange={(e) => ekOgrenciDegistir(idx, e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
              >
                <option value="">Seçiniz...</option>
                {ogrenciler.map((o) => (
                  <option key={o.id} value={o.id}>{o.ad_soyad}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => ekOgrenciKaldir(idx)} className="text-red-500 text-sm hover:underline pb-2">
              Kaldır
            </button>
          </div>
        ))}
        <button type="button" onClick={ekOgrenciEkle} className="text-sm text-blue hover:underline">
          + Bu derse başka öğrenci ekle (grup dersi)
        </button>
        {ekOgrenciler.filter(Boolean).length > 0 && (
          <p className="text-xs text-gray-400 mt-1">
            Aynı öğretmen, aynı gün/saat, aynı ücretle {ekOgrenciler.filter(Boolean).length + 1} öğrenciye birden ders eklenecek. Yoklama her öğrenci için ayrı ayrı alınabilir.
          </p>
        )}
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
            <div className="min-w-[220px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Günler (birden fazla seçilebilir)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {GUNLER.slice(1).map((g, i) => {
                  const gunNo = i + 1
                  const secili = seciliGunler.includes(gunNo)
                  return (
                    <button
                      key={gunNo}
                      type="button"
                      onClick={() => gunSecToggle(gunNo)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        secili ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-200 hover:border-navy'
                      }`}
                    >
                      {GUNLER_KISA[gunNo]}
                    </button>
                  )
                })}
              </div>
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

        {tekrarlansin && ogretmenId && seciliGunler.length > 0 && (
          <div className="mt-3 bg-white border border-gray-100 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-600 mb-1.5">
              {ogretmenler.find((o) => o.id === ogretmenId)?.ad_soyad} — {GUNLER[Number(seciliGunler[0])]} günü dolu saatler
              {seciliGunler.length > 1 ? ' (seçilen ilk gün için gösteriliyor)' : ''}:
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

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <button
          type="submit"
          disabled={gonderiliyor}
          className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {gonderiliyor
            ? 'Ekleniyor...'
            : taslakModuAcik && aktifPlanAdi.trim()
            ? tekrarlansin && seciliGunler.length > 1
              ? `${seciliGunler.length} Güne Plana Ekle`
              : 'Plana Ekle'
            : tekrarlansin && seciliGunler.length > 1
            ? `${seciliGunler.length} Güne Ekle`
            : 'Ekle'}
        </button>
        {/* Taslak Modu açıkken bu buton gereksiz — ana "Ekle" butonu zaten aynı
            işi (plana kaydetme) yapıyor, iki ayrı buton kafa karıştırır. */}
        {!(taslakModuAcik && aktifPlanAdi.trim()) && (
          <button
            type="button"
            onClick={taslagaKaydet}
            disabled={gonderiliyor}
            className="bg-white border border-gray-200 text-gray-600 font-semibold px-5 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Taslağa Kaydet
          </button>
        )}
      </div>

      {sinifUyarisi && (
        <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm text-yellow-800">⚠ Uyarı: {sinifUyarisi}. Bire bir dersi yine de eklemek ister misiniz?</p>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={sinifUyarisinaRagmenEkle}
              disabled={gonderiliyor}
              className="bg-orange text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {gonderiliyor ? 'Ekleniyor...' : 'Evet, yine de ekle'}
            </button>
            <button
              type="button"
              onClick={() => setSinifUyarisi('')}
              className="bg-white border border-gray-200 text-gray-600 text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-gray-50"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {hata && <p className="text-red-600 text-sm mt-3">{hata}</p>}
      {!hata && basari && <p className="text-green-600 text-sm mt-3">{basari}</p>}
    </form>
  )
}

// ============================================================================
// TASLAKLARIM (Bire Bir) — "Bire Bir Ders Ekle" formundan "Taslağa Kaydet" ile
// biriktirilen, henüz gerçek programa eklenmemiş kayıtlar. Yönetici tek tek ya
// da hepsini birden "Yayınla" diyerek gerçek tabloya (bire_bir_atamalari /
// bire_bir_yoklama) aktarabilir. Yayınlarken AYNI çakışma kontrolleri (öğretmenin
// / öğrencinin o saatte başka dersi var mı) tekrar çalıştırılır — taslak
// kaydedildikten sonra program değişmiş olabilir.
function TaslaklarimBireBir({ taslaklar, ogrenciler, ogretmenler, dersProgrami, atamalar, yoklamalar, onDegisti }) {
  const [gonderiliyorId, setGonderiliyorId] = useState(null)
  const [tumuGonderiliyor, setTumuGonderiliyor] = useState(false)
  const [hataMap, setHataMap] = useState({})

  const ogrenciAd = (id) => ogrenciler.find((o) => o.id === id)?.ad_soyad || 'Bilinmeyen öğrenci'
  const ogretmenAd = (id) => ogretmenler.find((o) => o.id === id)?.ad_soyad || 'Bilinmeyen öğretmen'

  // Bir taslağı gerçek tabloya aktarır. Başarılıysa true, çakışma/hata varsa
  // false döner (hataMap'e o taslağın id'siyle hata mesajı yazılır).
  async function yayinla(t) {
    const v = t.veri
    if (t.tur === 'bire_bir_haftalik') {
      const cakisma = cakismaBul(
        { ogrenciId: v.ogrenci_id, ogretmenId: v.ogretmen_profile_id, gun: v.gun, baslangic: v.baslangic_saat, bitis: v.bitis_saat },
        dersProgrami,
        atamalar
      )
      if (cakisma) {
        setHataMap((h) => ({ ...h, [t.id]: `Çakışma var: ${cakisma.aciklama}.` }))
        return false
      }
      const { error } = await supabase.from('bire_bir_atamalari').insert({
        ogrenci_id: v.ogrenci_id,
        ogretmen_profile_id: v.ogretmen_profile_id,
        ders_ucreti: v.ders_ucreti,
        gun: v.gun,
        baslangic_saat: v.baslangic_saat,
        bitis_saat: v.bitis_saat,
      })
      if (error) {
        setHataMap((h) => ({ ...h, [t.id]: 'Hata: ' + error.message }))
        return false
      }
    } else if (t.tur === 'soru_cozumu') {
      // Soru Çözümü taslağı (Ders Programı sayfasındaki Hızlı Ekle'den, Taslak
      // Modu açıkken oluşturulmuş olabilir) — öğrenciye bağlı değil, borç
      // oluşturmaz, sadece öğretmen + tarih + saat kaydedilir. Bkz.
      // MusaitlikTablosu.jsx'teki canlı (taslak modu kapalı) karşılığı.
      const { error } = await supabase.from('bire_bir_yoklama').insert({
        ogretmen_profile_id: v.ogretmen_profile_id,
        tur: 'soru_cozumu',
        tutar: 0,
        tarih: v.tarih,
        durum: 'geldi',
        baslangic_saat: v.baslangic_saat,
        bitis_saat: v.bitis_saat,
      })
      if (error) {
        setHataMap((h) => ({ ...h, [t.id]: 'Hata: ' + error.message }))
        return false
      }
    } else {
      if (v.baslangic_saat && v.bitis_saat) {
        const cakisma = tekSeferlikCakismaBul(
          { ogrenciId: v.ogrenci_id, ogretmenId: v.ogretmen_profile_id, tarih: v.tarih, baslangic: v.baslangic_saat, bitis: v.bitis_saat },
          dersProgrami,
          atamalar,
          yoklamalar,
          ogrenciler,
          ogretmenler
        )
        if (cakisma) {
          setHataMap((h) => ({ ...h, [t.id]: `Çakışma var: ${cakisma.aciklama}.` }))
          return false
        }
      }
      const ileriTarihli = v.tarih > yerelBugunTarihi()
      const { error } = await supabase.from('bire_bir_yoklama').insert({
        ogrenci_id: v.ogrenci_id,
        ogretmen_profile_id: v.ogretmen_profile_id,
        tutar: v.tutar,
        tarih: v.tarih,
        durum: ileriTarihli ? 'bekliyor' : 'geldi',
        baslangic_saat: v.baslangic_saat,
        bitis_saat: v.bitis_saat,
      })
      if (error) {
        setHataMap((h) => ({ ...h, [t.id]: 'Hata: ' + error.message }))
        return false
      }
    }
    await supabase.from('taslaklar').delete().eq('id', t.id)
    setHataMap((h) => {
      const yeni = { ...h }
      delete yeni[t.id]
      return yeni
    })
    return true
  }

  async function tekYayinla(t) {
    setGonderiliyorId(t.id)
    await yayinla(t)
    setGonderiliyorId(null)
    onDegisti()
  }

  async function sil(id) {
    if (!confirm('Bu taslağı silmek istediğinize emin misiniz?')) return
    await supabase.from('taslaklar').delete().eq('id', id)
    onDegisti()
  }

  async function tumunuYayinla(liste = taslaklar) {
    setTumuGonderiliyor(true)
    let basarili = 0
    let basarisiz = 0
    for (const t of liste) {
      const sonuc = await yayinla(t)
      if (sonuc) basarili++
      else basarisiz++
    }
    setTumuGonderiliyor(false)
    onDegisti()
    if (basarisiz > 0) {
      alert(`${basarili} taslak yayınlandı, ${basarisiz} tanesi çakışma/hata nedeniyle yayınlanamadı (listede kırmızı olarak görünüyor).`)
    }
  }

  if (taslaklar.length === 0) return null

  // Haftalık tablo görünümü — "bütün haftanın bire birlerini tek bir taslakta
  // görmek istiyorum" isteğiyle, HAFTALIK (tekrar eden) taslaklar artık alt
  // alta düz bir liste değil, Pzt-Paz sütunlu bir tabloda, her taslak kendi
  // gününün sütununda (saate göre sıralı) gösteriliyor. TEKİL (belirli bir
  // tarihe ait, tekrarsız — hem 'bire_bir_tekil' HEM 'soru_cozumu', ikisi de
  // bir tarihe bağlı) taslaklar bir "gün" kavramına oturmadığı için ayrı,
  // alttaki düz listede kalıyor.
  //
  // Taslak Modu ile isim verilen planlar (plan_adi dolu olanlar — Ders
  // Programı sayfasındaki Hızlı Ekle'den bire bir/soru çözümü eklenmişse de
  // buraya düşer, bkz. plan_adi eşleşmesi) artık AYRI gruplar halinde
  // gösteriliyor — her plan kendi başlığı + "Planı Yayınla" butonuyla.
  // İsimsiz (eski usul tek tek "Taslağa Kaydet" ile oluşturulmuş) taslaklar
  // en altta, tek bir ortak "İsimsiz Taslaklar" grubunda kalıyor.
  function gunSutunlariOlustur(haftalikListe) {
    return GUNLER.slice(1).map((gunAdi, i) => {
      const gunNo = i + 1
      const gunTaslaklari = haftalikListe
        .filter((t) => t.veri.gun === gunNo)
        .sort((a, b) => (saatKisalt(a.veri.baslangic_saat) < saatKisalt(b.veri.baslangic_saat) ? -1 : 1))
      return { gunNo, gunAdi, gunTaslaklari }
    })
  }

  const planAdlari = [...new Set(taslaklar.filter((t) => t.plan_adi).map((t) => t.plan_adi))]
  const isimsizTaslaklar = taslaklar.filter((t) => !t.plan_adi)
  const gruplar = [
    ...planAdlari.map((ad) => ({ ad, liste: taslaklar.filter((t) => t.plan_adi === ad) })),
    ...(isimsizTaslaklar.length > 0 ? [{ ad: null, liste: isimsizTaslaklar }] : []),
  ]

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-gray-700">Taslaklarım ({taslaklar.length})</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Henüz gerçek programa eklenmemiş bire bir dersler — haftalık olanlar gün gün, tekil olanlar altta. Hazır olduğunda yayınlayın.
          </p>
        </div>
        <button
          type="button"
          onClick={() => tumunuYayinla()}
          disabled={tumuGonderiliyor}
          className="bg-navy text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {tumuGonderiliyor ? 'Yayınlanıyor...' : 'Tümünü Yayınla'}
        </button>
      </div>

      {gruplar.map(({ ad, liste }) => {
        const haftalikListe = liste.filter((t) => t.tur === 'bire_bir_haftalik')
        const tekilListe = liste.filter((t) => t.tur !== 'bire_bir_haftalik')
        return (
          <div key={ad || '__isimsiz__'} className="border-b border-gray-100 last:border-b-0">
            <div className="px-4 py-2 bg-gray-50/60 flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm font-semibold text-gray-600">
                {ad ? `📋 ${ad}` : 'İsimsiz Taslaklar'} <span className="text-gray-400 font-normal">({liste.length})</span>
              </p>
              <button
                type="button"
                onClick={() => tumunuYayinla(liste)}
                disabled={tumuGonderiliyor}
                className="text-navy text-xs font-semibold hover:underline disabled:opacity-50"
              >
                Planı Yayınla
              </button>
            </div>

            {haftalikListe.length > 0 && (
              <div className="overflow-x-auto border-b border-gray-100">
                <div className="flex min-w-[980px] divide-x divide-gray-100">
                  {gunSutunlariOlustur(haftalikListe).map(({ gunNo, gunAdi, gunTaslaklari }) => (
                    <div key={gunNo} className="flex-1 min-w-[140px]">
                      <div className="bg-navy text-white px-2 py-2 text-xs font-semibold text-center">{gunAdi}</div>
                      <div className="p-1.5 space-y-1.5 min-h-[70px]">
                        {gunTaslaklari.length === 0 ? (
                          <p className="text-[11px] text-gray-300 text-center py-3">—</p>
                        ) : (
                          gunTaslaklari.map((t) => (
                            <div key={t.id} className="bg-blue-50 border border-blue-100 rounded-lg px-2 py-1.5">
                              <p className="text-xs font-semibold text-navy leading-tight">{ogrenciAd(t.veri.ogrenci_id)}</p>
                              <p className="text-[11px] text-gray-500 leading-tight">{ogretmenAd(t.veri.ogretmen_profile_id)}</p>
                              <p className="text-[11px] text-gray-400 leading-tight">
                                {saatKisalt(t.veri.baslangic_saat)}–{saatKisalt(t.veri.bitis_saat)} · {paraFormat(t.veri.ders_ucreti)}
                              </p>
                              {hataMap[t.id] && <p className="text-[11px] text-red-600 mt-1">{hataMap[t.id]}</p>}
                              <div className="flex items-center gap-2 mt-1">
                                <button
                                  type="button"
                                  onClick={() => tekYayinla(t)}
                                  disabled={gonderiliyorId === t.id || tumuGonderiliyor}
                                  className="text-[11px] text-navy font-semibold hover:underline disabled:opacity-50"
                                >
                                  {gonderiliyorId === t.id ? '...' : 'Yayınla'}
                                </button>
                                <button type="button" onClick={() => sil(t.id)} className="text-[11px] text-gray-400 hover:underline">
                                  Sil
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tekilListe.length > 0 && (
              <div className="divide-y divide-gray-50">
                {tekilListe.map((t) => {
                  const soruCozumuMu = t.tur === 'soru_cozumu'
                  return (
                    <div key={t.id} className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {soruCozumuMu ? '🧠 Soru Çözümü' : ogrenciAd(t.veri.ogrenci_id)}{' '}
                          <span className="text-gray-400 font-normal">— {ogretmenAd(t.veri.ogretmen_profile_id)}</span>
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(t.veri.tarih + 'T12:00:00').toLocaleDateString('tr-TR')}
                          {t.veri.baslangic_saat ? ` · ${saatKisalt(t.veri.baslangic_saat)}–${saatKisalt(t.veri.bitis_saat)}` : ''}
                          {!soruCozumuMu ? ` · ${paraFormat(t.veri.tutar)}` : ''}
                        </p>
                        {hataMap[t.id] && <p className="text-xs text-red-600 mt-1">{hataMap[t.id]}</p>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          onClick={() => tekYayinla(t)}
                          disabled={gonderiliyorId === t.id || tumuGonderiliyor}
                          className="text-navy text-sm font-semibold hover:underline disabled:opacity-50"
                        >
                          {gonderiliyorId === t.id ? 'Yayınlanıyor...' : 'Yayınla'}
                        </button>
                        <button onClick={() => sil(t.id)} className="text-gray-400 text-sm hover:underline">Sil</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
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
                <td className="px-4 py-2 text-right whitespace-nowrap space-x-2">
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

// Bir tekil ders (bire_bir_yoklama) satırının "Düzenle"ye basılınca açılan
// satır-içi (inline) düzenleme formu — tarih, saat aralığı ve (görünürse) tutar
// güncellenebilir. Durum (Bekliyor/Geldi/Gelmedi) FARK ETMEKSİZİN çalışır —
// yanlış girilmiş bir saati/tarihi silip yeniden eklemeye gerek kalmasın diye.
function TekSeferlikDuzenleSatiri({ y, ucretGorunur, toplamSutun, onKaydedildi, onVazgec }) {
  const [tarih, setTarih] = useState(y.tarih)
  const [baslangic, setBaslangic] = useState(saatKisalt(y._baslangic) || '')
  const [bitis, setBitis] = useState(saatKisalt(y._bitis) || '')
  const [tutar, setTutar] = useState(String(y._tutar ?? ''))
  const [hata, setHata] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)

  async function kaydet() {
    setHata('')
    if (!tarih) {
      setHata('Lütfen tarihi girin.')
      return
    }
    if (baslangic && bitis && baslangic >= bitis) {
      setHata('Başlangıç saati bitiş saatinden önce olmalı.')
      return
    }
    const guncelleme = {
      tarih,
      baslangic_saat: baslangic || null,
      bitis_saat: bitis || null,
    }
    if (ucretGorunur) guncelleme.tutar = Number(tutar) || 0

    setGonderiliyor(true)
    const { error } = await supabase.from('bire_bir_yoklama').update(guncelleme).eq('id', y.id)
    setGonderiliyor(false)
    if (error) setHata('Hata: ' + error.message)
    else onKaydedildi()
  }

  return (
    <tr className="border-t border-gray-50 bg-blue-50">
      <td className="px-2 py-1.5 align-top" colSpan={Math.max(toplamSutun - 1, 1)}>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">Tarih</label>
            <input
              type="date"
              value={tarih}
              onChange={(e) => setTarih(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">Başlangıç</label>
            <input
              type="time"
              value={baslangic}
              onChange={(e) => {
                const yeniBaslangic = e.target.value
                setBaslangic(yeniBaslangic)
                if (yeniBaslangic && !bitis) setBitis(saateDakikaEkle(yeniBaslangic, 45))
              }}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">Bitiş</label>
            <input
              type="time"
              value={bitis}
              onChange={(e) => setBitis(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          {ucretGorunur && (
            <div>
              <label className="block text-[11px] text-gray-500 mb-0.5">Tutar (₺)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={tutar}
                onChange={(e) => setTutar(e.target.value)}
                className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          )}
        </div>
        {hata && <p className="text-red-600 text-xs mt-2">{hata}</p>}
      </td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap align-top space-x-2">
        <button onClick={kaydet} disabled={gonderiliyor} className="text-green-600 text-sm font-semibold hover:underline disabled:opacity-50">
          {gonderiliyor ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
        <button onClick={onVazgec} className="text-gray-500 text-sm hover:underline">Vazgeç</button>
      </td>
    </tr>
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
  const [duzenlenenYoklamaId, setDuzenlenenYoklamaId] = useState(null)
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
          _kaynak: y.atama_id ? 'Haftalık' : 'Tekil',
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

  // Tablo başlıklarındaki toplam sütun sayısı — Düzenle satırındaki tek büyük
  // hücrenin (colSpan) doğru genişlikte açılması için kullanılır. Sabit sütunlar:
  // Tarih, Saat, Öğrenci, Tür, Durum, İşlemler = 6; öğretmen görünürse +1,
  // tutar görünürse +1.
  const toplamSutun = 6 + (!sadeceOgretmenId ? 1 : 0) + (ucretGorunur ? 1 : 0)

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
              ? 'Hem haftalık tekrarlanan atamalardan işaretlenen dersler hem tekil dersler burada bir arada. "Bekliyor" ileri tarihli, henüz kesinleşmemiş tekil dersler içindir.'
              : 'Hem haftalık tekrarlanan atamalardan işaretlenen dersler hem tekil dersler burada bir arada. "Bekliyor" ileri tarihli, henüz borç eklenmemiş tekil dersler içindir.'}
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
                {dersListesi.map((y) =>
                  duzenlenenYoklamaId === y.id ? (
                    <TekSeferlikDuzenleSatiri
                      key={y.id}
                      y={y}
                      ucretGorunur={ucretGorunur}
                      toplamSutun={toplamSutun}
                      onKaydedildi={() => { setDuzenlenenYoklamaId(null); onDegisti() }}
                      onVazgec={() => setDuzenlenenYoklamaId(null)}
                    />
                  ) : (
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
                        {ucretGorunur && (
                          <button onClick={() => setDuzenlenenYoklamaId(y.id)} className="text-navy text-sm hover:underline">
                            Düzenle
                          </button>
                        )}
                        {ucretGorunur && (
                          <button onClick={() => sil(y.id)} className="text-gray-400 text-sm hover:underline">Sil</button>
                        )}
                      </td>
                    </tr>
                  )
                )}
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
                          buGunMu ? 'bg-orange' : 'bg-navy'
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
          her hafta tekrar edenler hem de tekil olanlar. Geçmiş günler dahil edilmez.
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
  const [taslaklar, setTaslaklar] = useState([])
  const [loading, setLoading] = useState(true)
  const [sadeceAktif, setSadeceAktif] = useState(true)
  const [sadeceBugun, setSadeceBugun] = useState(true)
  const [yoklamaArama, setYoklamaArama] = useState('')
  // Öğrencinin hangi sınıf(lar)a kayıtlı olduğunu tutan ara tablo — bire bir ders
  // eklerken, öğrencinin KENDİ sınıf dersiyle çakışıp çakışmadığını (uyarı olarak,
  // engellemeden) göstermek için kullanılıyor, bkz. ogrenciSinifDersiUyarisiBul.
  const [sinifOgrencileri, setSinifOgrencileri] = useState([])
  // Müsaitlik tablosunda boş bir hücreye tıklanınca buraya { ogretmenId, tarih,
  // baslangic, bitis } yazılır; BireBirDersEkleForm bunu izleyip kendini otomatik
  // doldurur (bkz. hucreTiklandi).
  const [doldurBilgisi, setDoldurBilgisi] = useState(null)
  // Tıklanan hücreyi tablo üzerinde koyu işaretlemek için — ders eklenene/
  // taslağa kaydedilene kadar kullanıcı "hangi saate ekliyordum" diye
  // unutmasın diye. dersEklendi() içinde temizlenir.
  const [seciliHucre, setSeciliHucre] = useState(null)
  // Taslak Modu — açıkken (VE bir plan adı girilmişse), hem Müsaitlik
  // Tablosu'ndaki "Hızlı Ekle" popup'ı hem aşağıdaki "Bire Bir Ders Ekle"
  // formu, dersi CANLI kayda değil, isimlendirilmiş bu plana (taslaklar
  // tablosunda plan_adi ile) ekler. Bu anahtar Ders Programı sayfasıyla
  // PAYLAŞILIYOR (bkz. lib/taslakModu.js) — o sayfada açıp plan adı yazınca,
  // buraya geçtiğinizde de aynı anahtar/plan adı açık gelir.
  const { taslakModuAcik, setTaslakModuAcik, aktifPlanAdi, setAktifPlanAdi } = useTaslakModu()
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
      // NOT: sinif_adi, ders_programi tablosunda gerçek bir sütun DEĞİL — sınıfın
      // adı siniflar tablosunda duruyor, buradan JOIN edip aşağıda map() ile
      // d.sinif_adi olarak ekliyoruz (bkz. DersProgrami.jsx'teki aynı desen).
      // Bu join eksik olduğu için Müsaitlik Tablosu'nda (bu sayfadaki) sınıf
      // dersleri, ders_adi boşsa hep "Sınıf dersi" yazıyordu.
      isYonetici ? supabase.from('ders_programi').select('*, siniflar(ad)') : Promise.resolve({ data: [] }),
      // Öğrencinin hangi sınıf(lar)a kayıtlı olduğu — bire bir ders eklerken
      // "bu öğrencinin sınıf dersi var" uyarısını gösterebilmek için.
      isYonetici ? supabase.from('sinif_ogrenciler').select('ogrenci_id, sinif_id') : Promise.resolve({ data: [] }),
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
      // ÖNCEDEN sadece bire bir/soru çözümü türleri çekiliyordu — ama 'sinif'
      // taslakları da (Ders Programı sayfasından, Taslak Modu açıkken
      // eklenmiş olabilir) Günlük Müsaitlik tablosunda "dolu (taslak)" olarak
      // görünebilsin diye artık TÜM türler burada tutulur. "Taslaklarım"
      // listesi (TaslaklarimBireBir) yine de 'sinif' olanları HARİÇ tutarak
      // gösterilir — aşağıda ayrıca filtrelenir (o liste sadece bire bir/soru
      // çözümü yayınlama mantığını biliyor).
      isYonetici ? supabase.from('taslaklar').select('*').order('created_at') : Promise.resolve({ data: [] }),
    ]).then(([o, og, dp, so, a, y, t]) => {
      setOgrenciler(o.data || [])
      setOgretmenler(og.data || [])
      setDersProgrami((dp.data || []).map((d) => ({ ...d, sinif_adi: d.siniflar?.ad })))
      setSinifOgrencileri(so.data || [])
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
      setTaslaklar(t.data || [])
      ilkYuklemeTamamRef.current = true
      setLoading(false)
    })
  }

  useEffect(() => {
    veriyiYenile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Müsaitlik tablosunda boş bir hücreye tıklanınca çağrılır: hücrenin
  // öğretmen/tarih/saat bilgisini forma iletir ve forma doğru yumuşak kaydırır.
  function hucreTiklandi(bilgi) {
    // Aynı öğretmen/tarih için, az önce seçilen hücrenin HEMEN YANINDAKİ
    // (bir sonraki 30dk'lık) sütuna tıklanırsa, bunu "arka arkaya bir ders daha"
    // isteği olarak yorumluyoruz: yeni dersin başlangıcını, önceki dersin
    // bitişinden (başlangıç+45dk) 10 dakika sonrasına otomatik ayarlıyoruz —
    // okulun her zaman kullandığı "45 dakika ders + 10 dakika ara" düzenine
    // uysun diye. Art arda (3., 4. kutu...) tıklanırsa da aynı mantık zincirlenir.
    const ardisikMi =
      seciliHucre &&
      seciliHucre.ogretmenId === bilgi.ogretmenId &&
      seciliHucre.tarih === bilgi.tarih &&
      bilgi.baslangic === saateDakikaEkle(seciliHucre.baslangic, 30)
    const formBaslangic = ardisikMi ? saateDakikaEkle(seciliHucre.hesaplananBaslangic, 45 + 10) : bilgi.baslangic

    setDoldurBilgisi({ ...bilgi, baslangic: formBaslangic })
    // "baslangic" burada tıklanan GERÇEK kutu (vurgu/işaretleme için),
    // "hesaplananBaslangic" ise forma yazılan (bir sonraki zincirleme hesap için).
    setSeciliHucre({ ogretmenId: bilgi.ogretmenId, tarih: bilgi.tarih, baslangic: bilgi.baslangic, hesaplananBaslangic: formBaslangic })
    requestAnimationFrame(() => {
      document.getElementById('bire-bir-ekle-formu')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  // Ders eklendiğinde ya da taslağa kaydedildiğinde hem veriyi yeniler hem de
  // müsaitlik tablosundaki koyu işareti kaldırır.
  function dersEklendiVeyaTaslaklandi() {
    setSeciliHucre(null)
    veriyiYenile()
  }

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

      {isYonetici && (
        <>
          {/* Sayfadaki sıralama: Müsaitlik Tablosu → Ders Ekle (ders seç) →
              Ders Hatırlatması Gönder. Müsaitlik tablosu en üstte — sayfayı
              normal kullanırken (öğrenci kaydederken) müsaitliğe bakmak için
              aşağı inmeye gerek kalmasın diye. Boş bir hücreye tıklanınca da
              altındaki forma o öğretmen/tarih/saat otomatik doldurulup kaydırılıyor. */}
          {/* Taslak Modu — bu anahtar HEM Müsaitlik Tablosu'ndaki Hızlı Ekle
              popup'ını HEM aşağıdaki formu etkiler (bkz. yukarıdaki
              taslakModuAcik state notu). */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-sm font-semibold text-gray-700">Taslak Modu</span>
              <button
                type="button"
                onClick={() => setTaslakModuAcik((v) => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors ${taslakModuAcik ? 'bg-orange' : 'bg-gray-200'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    taslakModuAcik ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </label>
            {taslakModuAcik && (
              <>
                <input
                  type="text"
                  value={aktifPlanAdi}
                  onChange={(e) => setAktifPlanAdi(e.target.value)}
                  placeholder='Plan adı (ör. "Ekim 2. Hafta Programı")'
                  list="taslak-plan-onerileri"
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm flex-1 min-w-[220px]"
                />
                {/* Daha önce kullanılmış plan isimleri öneri olarak çıksın —
                    aynı ismi harfi harfine tekrar yazmak zor/hataya açık. */}
                <datalist id="taslak-plan-onerileri">
                  {[...new Set(taslaklar.filter((t) => t.plan_adi).map((t) => t.plan_adi))].map((ad) => (
                    <option key={ad} value={ad} />
                  ))}
                </datalist>
                <span className="text-xs text-gray-500">
                  {aktifPlanAdi.trim()
                    ? `Açık — Hızlı Ekle ve formdan eklenen dersler "${aktifPlanAdi.trim()}" planına kaydediliyor (canlıya değil). Ders Programı sayfasına geçtiğinizde de aynı plan açık gelir.`
                    : 'Devam etmeden önce bir plan adı yazın.'}
                </span>
              </>
            )}
          </div>
          <MusaitlikTablosu
            ogretmenler={ogretmenler}
            dersProgrami={dersProgrami}
            atamalar={atamalar}
            yoklamalar={yoklamalar}
            ogrenciAdMap={ogrenciAdMap}
            onHucreTikla={hucreTiklandi}
            secili={seciliHucre}
            ogrenciler={ogrenciler}
            siniflar={[]}
            hizliEkleEtkin
            onHizliEklendi={dersEklendiVeyaTaslaklandi}
            taslakModuAcik={taslakModuAcik}
            aktifPlanAdi={aktifPlanAdi.trim()}
            taslaklar={taslaklar}
          />
          <BireBirDersEkleForm
            ogrenciler={ogrenciler}
            ogretmenler={ogretmenler}
            atamalar={atamalar}
            dersProgrami={dersProgrami}
            yoklamalar={yoklamalar}
            sinifOgrencileri={sinifOgrencileri}
            taslaklar={taslaklar}
            onEklendi={dersEklendiVeyaTaslaklandi}
            doldurBilgisi={doldurBilgisi}
            taslakModuAcik={taslakModuAcik}
            aktifPlanAdi={aktifPlanAdi}
          />
          {/* Ders hatırlatma (WhatsApp gönder) paneli sadece yöneticiye gösterilir —
              öğretmen rolünde veli/öğrenciye mesaj gönderme yetkisi olmamalı. */}
          <DersHatirlatmaPaneli
            atamalar={atamalar}
            yoklamalar={yoklamalar}
            sadeceOgretmenId={null}
          />
          <TaslaklarimBireBir
            taslaklar={taslaklar.filter((t) => t.tur !== 'sinif')}
            ogrenciler={ogrenciler}
            ogretmenler={ogretmenler}
            dersProgrami={dersProgrami}
            atamalar={atamalar}
            yoklamalar={yoklamalar}
            onDegisti={veriyiYenile}
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
