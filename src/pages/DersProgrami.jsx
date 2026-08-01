import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { ilkHarfleriBuyukYap } from '../lib/adSoyadFormat'
import { useTaslakModu } from '../lib/taslakModu'
import { saatGoster } from '../lib/saatFormat'
import MusaitlikTablosu from '../components/MusaitlikTablosu'
import YoklamaKonuModal from '../components/YoklamaKonuModal'
import GunlukProgramListesi from '../components/GunlukProgramListesi'

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const GUNLER_KISA = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const DERS_ONERILERI = [
  'Matematik', 'Geometri', 'Türkçe/Edebiyat', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya',
  'Felsefe', 'İngilizce', 'Din Kültürü ve Ahlak Bilgisi', 'Beden Eğitimi', 'Fen Bilimleri', 'Sosyal Bilgiler',
]

function saatKisalt(s) {
  return s ? s.slice(0, 5) : s
}

// Bugünün tarihini "YYYY-MM-DD" olarak YEREL saate göre üretir (toISOString
// KULLANMIYORUZ — Türkiye UTC+3 gece yarısına yakın saatlerde bir gün geriye
// kayabiliyor). Aynı desen BireBirDersDokumu.jsx'te de kullanılıyor.
function yerelBugunTarihi() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// Haftalık ders programı belirli bir TARİHE değil, haftanın GÜNÜNE (1-7) bağlı
// bir şablon — bir derse tıklanınca yoklama/konu popup'ının hangi TARİH için
// açılacağını bilmemiz gerekiyor. En doğal varsayım: o gün BUGÜNSE bugün,
// değilse geriye doğru en yakın (bugün dahil, en fazla 6 gün önceki) aynı gün
// — yani "bu dersin en son işlendiği gün" (öğretmen isterse popup içindeki
// tarih kutusundan değiştirebilir).
function enYakinGunTarihi(gun) {
  const n = new Date()
  const bugunGunNo = ((n.getDay() + 6) % 7) + 1
  let fark = bugunGunNo - gun
  if (fark < 0) fark += 7
  const hedef = new Date(n.getFullYear(), n.getMonth(), n.getDate() - fark)
  return `${hedef.getFullYear()}-${String(hedef.getMonth() + 1).padStart(2, '0')}-${String(hedef.getDate()).padStart(2, '0')}`
}

function araliklarCakisiyorMu(b1, s1, b2, s2) {
  return saatKisalt(b1) < saatKisalt(s2) && saatKisalt(b2) < saatKisalt(s1)
}

// "HH:MM" formatındaki bir saate dakika ekler — başlangıç saati girilince/
// doldurulunca bitiş saatini otomatik +45 dakika önermek için kullanılır.
function saateDakikaEkle(saat, dakika) {
  if (!saat) return ''
  const [h, m] = saat.split(':').map(Number)
  const toplamDakika = (((h * 60 + m + dakika) % (24 * 60)) + 24 * 60) % (24 * 60)
  const yeniSaat = Math.floor(toplamDakika / 60)
  const yeniDakika = toplamDakika % 60
  return `${String(yeniSaat).padStart(2, '0')}:${String(yeniDakika).padStart(2, '0')}`
}

// Yeni eklenmek istenen ders saatinin, mevcut programla (aynı sınıf ya da aynı
// öğretmen üzerinden — öğretmen artık ders_programi satırından okunuyor) çakışıp
// çakışmadığını kontrol eder.
// hedefSinifId: "Birleşik ders" özelliğinde, formun ana sınıfı DIŞINDA
// birleştirilen her bir sınıfı da AYRI AYRI kontrol edebilmek için — verilmezse
// varsayılan olarak formun kendi sinifId'sini kullanır, davranış değişmez.
function cakismaBul({ sinifId, gun, baslangic, bitis, ogretmenId, hedefSinifId = sinifId }, program, haricId = null) {
  if (!hedefSinifId || !baslangic || !bitis) return null

  for (const p of program) {
    if (p.id === haricId) continue
    if (p.gun !== gun) continue
    const ayniSinif = p.sinif_id === hedefSinifId
    const ayniOgretmen = !!ogretmenId && p.ogretmen_profile_id === ogretmenId
    if (!ayniSinif && !ayniOgretmen) continue
    if (!araliklarCakisiyorMu(baslangic, bitis, p.baslangic_saat, p.bitis_saat)) continue

    return {
      tur: ayniSinif ? 'sinif' : 'ogretmen',
      sinifAdi: p.sinif_adi,
      dersAdi: p.ders_adi,
      saat: `${saatGoster(p.baslangic_saat)}–${saatGoster(p.bitis_saat)}`,
      gun: GUNLER[p.gun],
    }
  }
  return null
}

function DersEkleForm({
  siniflar,
  ogretmenler,
  program,
  taslaklar,
  onEklendi,
  doldurBilgisi,
  duzenlenenDers,
  onDuzenlemeBitti,
  // Müsaitlik tablosundaki tarih ok/kutusu her değiştiğinde güncellenen değer
  // (bkz. DersProgrami() bileşenindeki musaitlikTarihi state'i) — bu formda
  // ayrı bir Tarih alanı yok (sınıf dersleri belirli bir tarihe değil, haftanın
  // GÜNÜNE göre tekrar eder), o yüzden en yakın karşılığı olarak, seçilen
  // tarihin haftanın hangi gününe denk geldiği "Günler" seçimine otomatik
  // yansıtılır (kullanıcı isteğiyle eklendi — Bire Bir sayfasındaki Tarih
  // senkronuyla aynı mantık).
  musaitlikTarihi,
  // Taslak Modu — sayfa üstündeki anahtar açık VE bir plan adı girilmişse,
  // aşağıdaki "Ekle" butonu artık canlı programa değil, taslaklar tablosuna,
  // bu isimle etiketlenerek kaydeder (bkz. DersProgrami() bileşenindeki
  // taslakModuAcik/aktifPlanAdi state'i).
  taslakModuAcik = false,
  aktifPlanAdi = '',
}) {
  const { profile } = useAuth()
  const [sinifId, setSinifId] = useState('')
  const [dersAdi, setDersAdi] = useState('')
  const [ogretmenId, setOgretmenId] = useState('')
  // Birden fazla gün seçilebilir ("bütün haftayı tek seferde ekle/taslağa
  // kaydet" isteğiyle eklendi) — düzenleme modunda ise tek bir kayıt
  // güncellendiği için tek gün seçilebilir hale getiriliyor (gunSecToggle).
  const [seciliGunler, setSeciliGunler] = useState([])
  const [baslangic, setBaslangic] = useState('')
  const [bitis, setBitis] = useState('')
  const [hata, setHata] = useState('')
  const [basari, setBasari] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)
  // "Birleşik Sınıf Dersi" — bu dersi seçilen sınıfla AYNI ANDA, aynı
  // öğretmenden alan başka sınıf(lar) da varsa buradan işaretlenir (ör. 9-A ve
  // 9-B'nin birleşip tek ders almasi). Sadece ekleme sırasında sunulur, mevcut
  // bir dersi düzenlerken (duzenleModu) gösterilmez.
  const [birlesikSiniflar, setBirlesikSiniflar] = useState([])
  const sinifSelectRef = useRef(null)
  const duzenleModu = !!duzenlenenDers

  function birlesikSinifToggle(id) {
    setBirlesikSiniflar((mevcut) =>
      mevcut.includes(id) ? mevcut.filter((x) => x !== id) : [...mevcut, id]
    )
  }

  // Düzenleme modunda tek bir kayıt güncelleniyor, o yüzden gün TEK
  // seçilebilir (tıklanan gün direkt seçili günün yerine geçer) — ekleme
  // modunda ise birden fazla gün birikmeli seçilebilir (bkz. SinifDetay.jsx'teki
  // aynı desen).
  function gunSecToggle(g) {
    if (duzenleModu) {
      setSeciliGunler([g])
      return
    }
    setSeciliGunler((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))
  }

  // Müsaitlik tablosunda boş bir hücreye tıklanınca, üstten gelen öğretmen/gün/
  // saat bilgisiyle formu otomatik doldurur ve sınıf seçimine odaklanır (sınıf
  // bilgisi müsaitlik tablosundan gelmediği için elle seçilmesi gerekiyor).
  useEffect(() => {
    if (!doldurBilgisi) return
    setOgretmenId(doldurBilgisi.ogretmenId)
    // Hücreden gelen öğretmenin branşı varsa ders adını da otomatik dolduruyoruz.
    const secilen = ogretmenler.find((o) => o.id === doldurBilgisi.ogretmenId)
    if (secilen?.brans) setDersAdi(secilen.brans)
    setSeciliGunler([doldurBilgisi.gun])
    setBaslangic(doldurBilgisi.baslangic)
    // Müsaitlik tablosundaki hücreler 30dk'lık dilimler olsa da, dersler genelde
    // 45dk sürdüğü için tıklanan dilimin kendi bitişini değil, her zaman
    // başlangıç + 45dk'yı öneriyoruz.
    setBitis(saateDakikaEkle(doldurBilgisi.baslangic, 45))
    setHata('')
    setBasari('')
    sinifSelectRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doldurBilgisi])

  // Müsaitlik tablosundaki ◀/▶ ok ya da tarih kutusuyla tarih değiştirildiğinde
  // (bir hücreye tıklamadan), "Günler" seçimini o tarihin haftanın hangi
  // gününe denk geldiğine otomatik ayarlar — elle iki yerde ayrı ayrı
  // değiştirmeye gerek kalmasın diye (kullanıcı isteğiyle eklendi). Mevcut bir
  // dersi düzenlerken (duzenleModu) dokunulmuyor — o zaten kendi gününü
  // yukarıdaki duzenlenenDers effect'inden alıyor.
  useEffect(() => {
    if (!musaitlikTarihi || duzenleModu) return
    const g = gunNumaraTarihten(musaitlikTarihi)
    if (g) setSeciliGunler([g])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musaitlikTarihi])

  // Tablodaki "Düzenle" ile mevcut bir ders saati seçildiğinde, formu o dersin
  // güncel bilgileriyle doldurur ve "ekleme" değil "güncelleme" moduna geçirir.
  useEffect(() => {
    if (!duzenlenenDers) return
    setSinifId(duzenlenenDers.sinif_id || '')
    setDersAdi(duzenlenenDers.ders_adi || '')
    setOgretmenId(duzenlenenDers.ogretmen_profile_id || '')
    setSeciliGunler([duzenlenenDers.gun])
    setBaslangic(saatKisalt(duzenlenenDers.baslangic_saat) || '')
    setBitis(saatKisalt(duzenlenenDers.bitis_saat) || '')
    setHata('')
    setBasari('')
    requestAnimationFrame(() => {
      document.getElementById('ders-ekle-formu')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duzenlenenDers])

  function iptalEt() {
    setSinifId('')
    setDersAdi('')
    setOgretmenId('')
    setBaslangic('')
    setBitis('')
    setBirlesikSiniflar([])
    setSeciliGunler([])
    setHata('')
    setBasari('')
    onDuzenlemeBitti()
  }

  async function ekle(e) {
    e.preventDefault()
    setHata('')
    if (!sinifId || seciliGunler.length === 0 || !baslangic || !bitis) {
      setHata('Lütfen sınıf, en az bir gün ve saat aralığını doldurun.')
      return
    }
    if (baslangic >= bitis) {
      setHata('Başlangıç saati bitiş saatinden önce olmalı.')
      return
    }

    // Taslak Modu açıkken (sayfa üstündeki anahtar), "Ekle" butonu ASLA canlı
    // programa yazmaz — plan adı doluysa taslagaKaydet()'e devreder (o
    // fonksiyon hem canlıya hem bekleyen taslaklara karşı çakışma kontrolü
    // yapar ve aktifPlanAdi'yı satıra damgalar); plan adı BOŞSA da (anahtar
    // açık göründüğü halde plan adı unutulmuşsa) sessizce canlıya düşmek
    // yerine net bir hatayla durdurulur — "anahtar açık ama hiçbir yere
    // eklenmedi" her zaman "anahtar açık ama yanlışlıkla canlıya eklendi"den
    // daha güvenlidir.
    if (!duzenleModu && taslakModuAcik) {
      if (!aktifPlanAdi.trim()) {
        setHata('Taslak Modu açık — devam etmeden önce üstteki kutuya bir plan adı yazın (yoksa hiçbir yere eklenmez).')
        return
      }
      await taslagaKaydet()
      return
    }

    // Düzenleme modunda birleştirme yok (mevcut bir dersi düzenlerken sadece
    // kendi sınıfı kontrol edilir) ve gün TEK olarak kalır (gunSecToggle bunu
    // zaten [g] ile sınırlıyor); yeni eklemede ise "Birleşik ders mi?" ile
    // işaretlenen her sınıf VE seçilen her gün AYRI AYRI çakışma kontrolünden
    // geçer — bütün haftayı tek seferde eklerken bir gün çakışsa bile
    // diğerlerini gizlice atlamamak için.
    const hedefSiniflar = duzenleModu ? [sinifId] : [sinifId, ...birlesikSiniflar]
    const gunler = seciliGunler
    for (const g of gunler) {
      for (const hedefSinifId of hedefSiniflar) {
        const cakisma = cakismaBul(
          { sinifId, gun: Number(g), baslangic, bitis, ogretmenId, hedefSinifId },
          program,
          duzenleModu ? duzenlenenDers.id : null
        )
        if (cakisma) {
          const hedefAdi = siniflar.find((s) => s.id === hedefSinifId)?.ad
          if (cakisma.tur === 'ogretmen') {
            setHata(
              `Çakışma var: bu öğretmen ${cakisma.gun} günü ${cakisma.saat} arasında zaten "${cakisma.dersAdi || cakisma.sinifAdi}" dersinde.`
            )
          } else {
            setHata(
              `Çakışma var: ${hedefAdi ? `"${hedefAdi}" sınıfının` : 'bu sınıfın'} ${cakisma.gun} günü ${cakisma.saat} arasında zaten "${cakisma.dersAdi || 'başka bir'}" dersi var.`
            )
          }
          return
        }
      }
    }

    setGonderiliyor(true)
    // Birleşik ders (birlesikSiniflar dolu) ise aynı grupId'yle TEK seferde
    // birden fazla satır ekleniyor — bu sayede henüz eklenmemiş kardeş
    // satırlar bu isteğin çakışma kontrolünde görünmüyor, yani birbirlerine
    // "çakışma" olarak sayılmıyorlar (bkz. SinifDetay.jsx'teki aynı desen).
    // Birden fazla gün seçildiyse de aynı mantıkla TEK istekte hepsi eklenir.
    const grupId = !duzenleModu && birlesikSiniflar.length > 0 ? crypto.randomUUID() : null
    const veriUret = (hedefSinifId, g) => ({
      sinif_id: hedefSinifId,
      gun: Number(g),
      baslangic_saat: baslangic,
      bitis_saat: bitis,
      ders_adi: dersAdi.trim() ? ilkHarfleriBuyukYap(dersAdi.trim()) : null,
      ogretmen_profile_id: ogretmenId || null,
      birlesik_grup_id: grupId,
    })
    const { error } = duzenleModu
      ? await supabase.from('ders_programi').update(veriUret(sinifId, gunler[0])).eq('id', duzenlenenDers.id)
      : await supabase.from('ders_programi').insert(gunler.flatMap((g) => hedefSiniflar.map((h) => veriUret(h, g))))
    setGonderiliyor(false)
    if (error) {
      setHata('Hata: ' + error.message)
    } else {
      if (duzenleModu) {
        setSinifId('')
        setDersAdi('')
        setOgretmenId('')
        setBaslangic('')
        setBitis('')
        setSeciliGunler([])
        onDuzenlemeBitti()
      } else {
        setBaslangic('')
        setBitis('')
        setDersAdi('')
        setBirlesikSiniflar([])
        setSeciliGunler([])
      }
      onEklendi()
    }
  }

  // Formu doldurup henüz kesinleşmemiş bir ders saati için "Taslağa Kaydet" —
  // gerçek programa hemen eklemez, taslaklar tablosuna kaydeder. Yayınlanırken
  // (Taslaklarım listesinden) çakışma TEKRAR kontrol edilir (program o zamana
  // kadar değişmiş olabilir) — AMA taslağı kaydederken de, hem GERÇEK programla
  // hem BEKLEYEN diğer taslaklarla çakışıp çakışmadığı burada da kontrol edilir,
  // "haftalık programı taslakta kurup sonunda topluca yayınlayacağım, arada
  // birbiriyle çakışan taslaklar oluşmasın" isteği için.
  async function taslagaKaydet() {
    setHata('')
    setBasari('')
    if (!sinifId || seciliGunler.length === 0 || !baslangic || !bitis) {
      setHata('Lütfen sınıf, en az bir gün ve saat aralığını doldurun.')
      return
    }
    // Birleşik ders taslak akışında henüz desteklenmiyor — taslak tablosu tek
    // bir sinif_id tutuyor, yayınlarken de tek satır oluşturuluyor. Yanlışlıkla
    // sadece ana sınıfın taslağa kaydedilip birleştirilen diğer sınıf(lar)ın
    // sessizce kaybolmasını önlemek için burada durduruluyor.
    if (birlesikSiniflar.length > 0) {
      setHata('Birleşik ders taslağa kaydedilemez — lütfen doğrudan "Ekle" butonunu kullanın.')
      return
    }
    // Bu taslak hangi plana kaydedilecekse (Taslak Modu açıksa isimli plana,
    // kapalıysa "Taslağa Kaydet" ile isimsiz/null plana), çakışma kontrolü
    // SADECE o plana ait diğer taslaklara karşı yapılır — farklı isimli
    // planlar birbirinden bağımsızdır, "fafa" planı "deneme" planındaki bir
    // taslakla asla çakışma sayılmaz.
    const hedefPlanAdi = taslakModuAcik && aktifPlanAdi.trim() ? aktifPlanAdi.trim() : null
    // Bekleyen "sinif" taslaklarını (sadece AYNI plana ait olanları),
    // cakismaBul'un anladığı program-satırı şekline çeviriyoruz — böylece aynı
    // fonksiyonu hem gerçek programa hem taslaklara karşı çalıştırabiliyoruz,
    // ayrı bir kontrol mantığı yazmaya gerek kalmadan.
    const taslakSatirlari = taslaklar
      .filter((t) => t.tur === 'sinif' && (t.plan_adi || null) === hedefPlanAdi)
      .map((t) => ({
        sinif_id: t.veri.sinif_id,
        sinif_adi: siniflar.find((s) => s.id === t.veri.sinif_id)?.ad,
        gun: t.veri.gun,
        baslangic_saat: t.veri.baslangic_saat,
        bitis_saat: t.veri.bitis_saat,
        ders_adi: t.veri.ders_adi,
        ogretmen_profile_id: t.veri.ogretmen_profile_id,
      }))
    for (const g of seciliGunler) {
      const canliCakisma = cakismaBul({ sinifId, gun: Number(g), baslangic, bitis, ogretmenId }, program)
      if (canliCakisma) {
        setHata(
          canliCakisma.tur === 'ogretmen'
            ? `Çakışma var: bu öğretmen ${canliCakisma.gun} günü ${canliCakisma.saat} arasında zaten "${canliCakisma.dersAdi || canliCakisma.sinifAdi}" dersinde.`
            : `Çakışma var: bu sınıfın ${canliCakisma.gun} günü ${canliCakisma.saat} arasında zaten "${canliCakisma.dersAdi || 'başka bir'}" dersi var.`
        )
        return
      }
      const taslakCakisma = cakismaBul({ sinifId, gun: Number(g), baslangic, bitis, ogretmenId }, taslakSatirlari)
      if (taslakCakisma) {
        setHata(
          taslakCakisma.tur === 'ogretmen'
            ? `Bu, taslaklarınızdan biriyle çakışıyor: bu öğretmenin ${taslakCakisma.gun} günü ${taslakCakisma.saat} arasında zaten "${taslakCakisma.dersAdi || taslakCakisma.sinifAdi}" adında bekleyen bir taslağı var.`
            : `Bu, taslaklarınızdan biriyle çakışıyor: bu sınıfın ${taslakCakisma.gun} günü ${taslakCakisma.saat} arasında zaten "${taslakCakisma.dersAdi || 'başka bir'}" adında bekleyen bir taslağı var.`
        )
        return
      }
    }
    setGonderiliyor(true)
    // Birden fazla gün seçilmişse (ör. bütün hafta), her gün için AYRI bir
    // taslak satırı TEK seferde ekleniyor — yayınlama (yayinla) hâlâ her
    // taslağı tek tek (bir gün = bir satır) işliyor, burada değişen sadece
    // kaç taslak satırı birden oluşturulduğu.
    const kayitlar = seciliGunler.map((g) => ({
      tur: 'sinif',
      veri: {
        sinif_id: sinifId,
        gun: Number(g),
        baslangic_saat: baslangic,
        bitis_saat: bitis,
        ders_adi: dersAdi.trim() ? ilkHarfleriBuyukYap(dersAdi.trim()) : null,
        ogretmen_profile_id: ogretmenId || null,
      },
      olusturan_profile_id: profile?.id,
      // Taslak Modu açıksa (bkz. yukarıdaki ekle() içindeki yönlendirme), her
      // satır aynı isimli plana damgalanır — kapalıysa (elle "Taslağa Kaydet"
      // ile) plansız/isimsiz kalır, eskisi gibi.
      plan_adi: hedefPlanAdi,
    }))
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
    <form id="ders-ekle-formu" onSubmit={ekle} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
      <p className="font-semibold text-gray-700 mb-1">{duzenleModu ? 'Dersi Düzenle' : 'Yeni Ders Saati Ekle'}</p>
      {!duzenleModu && taslakModuAcik && aktifPlanAdi.trim() && (
        <p className="text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-lg px-2.5 py-1.5 mb-3">
          📋 Taslak Modu açık — eklenen ders "{aktifPlanAdi.trim()}" planına kaydedilecek (canlı programa değil).
        </p>
      )}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Sınıf</label>
          <select
            ref={sinifSelectRef}
            value={sinifId}
            onChange={(e) => setSinifId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            <option value="">Seçiniz...</option>
            {siniflar.map((s) => (
              <option key={s.id} value={s.id}>{s.ad}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Ders Adı</label>
          <input
            list="ders-onerileri-global"
            value={dersAdi}
            onChange={(e) => setDersAdi(e.target.value)}
            placeholder="örn. Matematik"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
          <datalist id="ders-onerileri-global">
            {DERS_ONERILERI.map((d) => <option key={d} value={d} />)}
          </datalist>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Öğretmen</label>
          <select
            value={ogretmenId}
            onChange={(e) => {
              const yeniOgretmenId = e.target.value
              setOgretmenId(yeniOgretmenId)
              // Öğretmen seçilince ders adını onun branşıyla otomatik dolduruyoruz
              // (her öğretmene zaten bir branş atanmış) — yanlışsa elle değiştirilebilir.
              const secilen = ogretmenler.find((o) => o.id === yeniOgretmenId)
              if (secilen?.brans) setDersAdi(secilen.brans)
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            <option value="">Seçiniz...</option>
            {ogretmenler.map((o) => (
              <option key={o.id} value={o.id}>{o.brans ? `${o.ad_soyad} — ${o.brans}` : o.ad_soyad}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[220px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {duzenleModu ? 'Gün' : 'Günler (birden fazla seçilebilir)'}
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
            onChange={(e) => setBaslangic(e.target.value)}
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
        </div>
        <button
          type="submit"
          disabled={gonderiliyor}
          className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {gonderiliyor
            ? duzenleModu
              ? 'Güncelleniyor...'
              : 'Ekleniyor...'
            : duzenleModu
            ? 'Güncelle'
            : taslakModuAcik && aktifPlanAdi.trim()
            ? seciliGunler.length > 1
              ? `${seciliGunler.length} Güne Plana Ekle`
              : 'Plana Ekle'
            : seciliGunler.length > 1
            ? `${seciliGunler.length} Güne Ekle`
            : 'Ekle'}
        </button>
        {duzenleModu ? (
          <button
            type="button"
            onClick={iptalEt}
            disabled={gonderiliyor}
            className="bg-white border border-gray-200 text-gray-600 font-semibold px-5 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            İptal
          </button>
        ) : (
          // Taslak Modu açıkken bu buton gereksiz — ana "Ekle" butonu zaten
          // aynı işi (plana kaydetme) yapıyor, iki ayrı buton kafa karıştırır.
          !(taslakModuAcik && aktifPlanAdi.trim()) && (
            <button
              type="button"
              onClick={taslagaKaydet}
              disabled={gonderiliyor}
              className="bg-white border border-gray-200 text-gray-600 font-semibold px-5 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Taslağa Kaydet
            </button>
          )
        )}
      </div>
      {/* Birleşik Sınıf Dersi — bu ders, yukarıda seçilen sınıfla AYNI ANDA,
          aynı öğretmenden bu işaretlenen sınıf(lar) için de birlikte
          oluşturulur (ör. 9-A ve 9-B'nin birleşip tek ders alması). Nadir bir
          durum olduğu için sadece yeni ders eklerken gösterilir, düzenlemede
          gösterilmez. */}
      {!duzenleModu && sinifId && siniflar.length > 1 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="block text-sm font-medium text-gray-700 mb-1.5">
            Birleşik ders mi? <span className="text-gray-400 font-normal">(aynı anda başka sınıf(lar) ile birlikte alınıyorsa işaretleyin)</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {siniflar.filter((s) => s.id !== sinifId).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => birlesikSinifToggle(s.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  birlesikSiniflar.includes(s.id)
                    ? 'bg-navy text-white border-navy'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {s.ad}
              </button>
            ))}
          </div>
        </div>
      )}
      {hata && <p className="text-red-600 text-sm mt-3">{hata}</p>}
      {!hata && basari && <p className="text-green-600 text-sm mt-3">{basari}</p>}
    </form>
  )
}

// ============================================================================
// TASLAKLARIM (Ders Programı) — "Yeni Ders Saati Ekle" formundan "Taslağa
// Kaydet" ile biriktirilen, henüz gerçek programa eklenmemiş sınıf dersleri.
// Yönetici tek tek ya da hepsini birden "Yayınla" diyerek ders_programi
// tablosuna aktarabilir. Yayınlarken çakışma kontrolü TEKRAR çalıştırılır —
// taslak kaydedildikten sonra program değişmiş olabilir.
// ============================================================================
function TaslaklarimDersProgrami({ taslaklar, siniflar, ogretmenler, program, onDegisti }) {
  const [gonderiliyorId, setGonderiliyorId] = useState(null)
  const [tumuGonderiliyor, setTumuGonderiliyor] = useState(false)
  const [hataMap, setHataMap] = useState({})

  const sinifAdi = (id) => siniflar.find((s) => s.id === id)?.ad || 'Bilinmeyen sınıf'
  const ogretmenAdi = (id) => ogretmenler.find((o) => o.id === id)?.ad_soyad || null

  async function yayinla(t) {
    const v = t.veri
    const cakisma = cakismaBul(
      { sinifId: v.sinif_id, gun: v.gun, baslangic: v.baslangic_saat, bitis: v.bitis_saat, ogretmenId: v.ogretmen_profile_id },
      program
    )
    if (cakisma) {
      const mesaj =
        cakisma.tur === 'ogretmen'
          ? `Çakışma var: bu öğretmen ${cakisma.gun} günü ${cakisma.saat} arasında zaten "${cakisma.dersAdi || cakisma.sinifAdi}" dersinde.`
          : `Çakışma var: bu sınıfın ${cakisma.gun} günü ${cakisma.saat} arasında zaten "${cakisma.dersAdi || 'başka bir'}" dersi var.`
      setHataMap((h) => ({ ...h, [t.id]: mesaj }))
      return false
    }
    const { error } = await supabase.from('ders_programi').insert({
      sinif_id: v.sinif_id,
      gun: v.gun,
      baslangic_saat: v.baslangic_saat,
      bitis_saat: v.bitis_saat,
      ders_adi: v.ders_adi,
      ogretmen_profile_id: v.ogretmen_profile_id,
    })
    if (error) {
      setHataMap((h) => ({ ...h, [t.id]: 'Hata: ' + error.message }))
      return false
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

  // Bir plana ait TÜM taslakları tek seferde siler — "bu plandan vazgeçtim,
  // tek tek silmek yerine hepsini birden temizleyeyim" için.
  async function planiSil(liste, planAdi) {
    const adGoster = planAdi ? `"${planAdi}" planındaki` : 'isimsiz'
    if (!confirm(`${adGoster} ${liste.length} taslağın TAMAMINI silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return
    await supabase.from('taslaklar').delete().in('id', liste.map((t) => t.id))
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

  // Haftalık tablo görünümü — "bütün haftanın programını tek bir taslakta
  // görmek istiyorum" isteğiyle, taslaklar artık alt alta düz bir liste değil,
  // gerçek Ders Programı'ndaki gibi Pzt-Paz sütunlu bir haftalık tabloda,
  // her taslak kendi gününün sütununda (saate göre sıralı) gösteriliyor.
  //
  // Taslak Modu ile isim verilen planlar (plan_adi dolu olanlar) artık AYRI
  // gruplar halinde gösteriliyor — her plan kendi başlığı + "Planı Yayınla"
  // butonuyla, kendi haftalık tablosunda. İsimsiz (plan_adi boş, eski usul tek
  // tek "Taslağa Kaydet" ile oluşturulmuş) taslaklar en altta, tek bir ortak
  // "İsimsiz Taslaklar" grubunda kalmaya devam ediyor.
  function haftalikTabloOlustur(liste) {
    return GUNLER.slice(1).map((gunAdi, i) => {
      const gunNo = i + 1
      const gunTaslaklari = liste
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
          <p className="text-xs text-gray-400 mt-0.5">Henüz gerçek programa eklenmemiş ders saatleri — haftalık görünümde, hazır olduğunda yayınlayın.</p>
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
      {gruplar.map(({ ad, liste }) => (
        <div key={ad || '__isimsiz__'} className="border-b border-gray-100 last:border-b-0">
          <div className="px-4 py-2 bg-gray-50/60 flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-semibold text-gray-600">
              {ad ? `📋 ${ad}` : 'İsimsiz Taslaklar'} <span className="text-gray-400 font-normal">({liste.length})</span>
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => tumunuYayinla(liste)}
                disabled={tumuGonderiliyor}
                className="text-navy text-xs font-semibold hover:underline disabled:opacity-50"
              >
                Planı Yayınla
              </button>
              <button
                type="button"
                onClick={() => planiSil(liste, ad)}
                disabled={tumuGonderiliyor}
                className="text-red-500 text-xs font-semibold hover:underline disabled:opacity-50"
              >
                Planı Sil
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="flex min-w-[980px] divide-x divide-gray-100">
              {haftalikTabloOlustur(liste).map(({ gunNo, gunAdi, gunTaslaklari }) => (
                <div key={gunNo} className="flex-1 min-w-[140px]">
                  <div className="bg-navy text-white px-2 py-2 text-xs font-semibold text-center sticky top-0">
                    {gunAdi}
                  </div>
                  <div className="p-1.5 space-y-1.5 min-h-[70px]">
                    {gunTaslaklari.length === 0 ? (
                      <p className="text-[11px] text-gray-300 text-center py-3">—</p>
                    ) : (
                      gunTaslaklari.map((t) => (
                        <div key={t.id} className="bg-blue-50 border border-blue-100 rounded-lg px-2 py-1.5">
                          <p className="text-xs font-semibold text-navy leading-tight">
                            {t.veri.ders_adi || sinifAdi(t.veri.sinif_id)}
                          </p>
                          <p className="text-[11px] text-gray-500 leading-tight">{sinifAdi(t.veri.sinif_id)}</p>
                          <p className="text-[11px] text-gray-400 leading-tight">
                            {saatGoster(t.veri.baslangic_saat)}–{saatGoster(t.veri.bitis_saat)}
                          </p>
                          {ogretmenAdi(t.veri.ogretmen_profile_id) && (
                            <p className="text-[11px] text-gray-400 leading-tight">{ogretmenAdi(t.veri.ogretmen_profile_id)}</p>
                          )}
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
                            <button
                              type="button"
                              onClick={() => sil(t.id)}
                              className="text-[11px] text-gray-400 hover:underline"
                            >
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
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// GÜNLÜK PROGRAM LİSTESİ — artık burada TANIMLANMIYOR, kendi ayrı sayfası var
// (src/pages/GunlukProgram.jsx, /gunluk rotası) — paylaşılan bileşen olarak
// src/components/GunlukProgramListesi.jsx'e taşındı, aşağıdan import ediliyor.
// gunNumaraTarihten burada kalmaya devam ediyor çünkü Soru Çözümü seansları
// işlenirken (aşağıda, ~1500. satır civarı) bu sayfa içinde de kullanılıyor.
// ============================================================================
function gunNumaraTarihten(tarihStr) {
  if (!tarihStr) return null
  const g = new Date(tarihStr + 'T12:00:00').getDay()
  return g === 0 ? 7 : g
}

// Öğretmenin kendi programında aynı güne düşen sınıf dersi / bire bir tekil
// ders / soru çözümü satırları, ÖNCELİKLE saate göre sıralansın istendi —
// önceden tür bazında (önce tüm sınıf dersleri, sonra tüm soru çözümleri,
// en sonda tüm bire birler) art arda ekleniyordu, bu da saat 14.15'teki bir
// bire bir dersin saat 17.00'deki bir soru çözümünden SONRA görünmesi gibi
// kafa karıştırıcı bir sıraya yol açıyordu. Saatler eşitse (aynı saat
// diliminde birden fazla ders varsa) tür önceliğine göre sınıf dersi → bire
// bir → soru çözümü sırasıyla ikincil bir sıralama yapılır.
function dersTuruSirasi(d) {
  if (d.sinif_id) return 0 // sınıf dersi
  if (d._bireBir) return 1 // bire bir tekil ders
  return 2 // soru çözümü
}

// Soru Çözümü ve bire bir TEKİL dersler belirli bir TARİHE bağlıdır (sınıf
// dersleri gibi her hafta tekrar eden bir "gun" şablonu değildir). ÖNEMLİ
// HATA DÜZELTMESİ: bu iki sorgu önceden tarih filtresi olmadan öğretmenin
// TÜM GEÇMİŞ kayıtlarını çekiyordu — her kayıt sadece haftanın gününe göre
// (gunNumaraTarihten) bir sütuna yerleştirildiği için, ay/haftalar önce
// verilmiş (ve zaten "Geldi" işaretlenmiş) eski dersler bile o haftanın
// günü hangisiyse SONSUZA KADAR o sütunda "hayalet" satırlar olarak birikip
// gerçek/güncel derslerle karışıyordu (bir öğretmen, aslında hiç dersi
// olmayan bir öğrenciyi haftalarca sonra hâlâ programında görebiliyordu).
// Çözüm: sorguları SADECE İÇİNDE BULUNULAN HAFTAYA (Pazartesi–Pazar) göre
// sınırlıyoruz — Ders Programı zaten "bu haftaki programım" anlamına geliyor.
function haftaninPazartesiVePazari() {
  const bugun = new Date()
  const gunNo = bugun.getDay() === 0 ? 7 : bugun.getDay() // 1=Pzt...7=Paz
  const pazartesi = new Date(bugun)
  pazartesi.setDate(bugun.getDate() - (gunNo - 1))
  const pazar = new Date(pazartesi)
  pazar.setDate(pazartesi.getDate() + 6)
  const tarihStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { pazartesi: tarihStr(pazartesi), pazar: tarihStr(pazar) }
}


// Veli ("çocuğumun") ya da öğrenci ("benim") rolüyle giriş yapan kullanıcıya,
// sınıf ders programının YANINDA, çocuğun/kendisinin HAFTALIK BİRE BİR ders
// atamalarını (öğretmen + gün + saat) gösterir. ÖNCEDEN bu bilgi hiçbir yerde
// veliye/öğrenciye gösterilmiyordu — Bire Bir dersleri sadece Ekstre'de,
// ders GERÇEKLEŞİP faturalandıktan SONRA (geçmişe dönük, mali bir kayıt
// olarak) görünüyordu. Burası ise "bu hafta hangi gün/saat dersim var"
// sorusuna cevap veren, ileriye dönük bir program görünümü.
// ÖNEMLİ: bu okulda bire bir derslerin ÇOĞU "Hayır, sadece bu sefer" (tek
// seferlik) olarak giriliyor — yani sabit haftalık bir atama (bire_bir_atamalari)
// DEĞİL, belirli bir TARİHE bağlı tek kayıt (bire_bir_yoklama, atama_id boş)
// olarak kaydediliyor. İlk sürümde bu bölüm SADECE haftalık sabit atamalara
// bakıyordu — tek seferlik dersi olan (ki çoğunluk bu) öğrenciler/veliler
// hiçbir şey göremiyordu. Şimdi ikisini de ayrı ayrı gösteriyoruz.
// tekSeferlikDersler zaten tarihe (sonra saate) göre sıralı geldiği için, art
// arda gelen AYNI tarihli dersleri tek bir grupta topluyoruz — her ders
// satırında tarihi tekrar tekrar yazmak yerine, admin'in "Tüm Bire Bir Dersler
// — Arşiv" tablosundaki gibi tek bir gün başlığı altında gösterilsin diye.
function gunGrupla(dersler) {
  const gruplar = []
  let sonTarih = null
  for (const d of dersler) {
    if (d.tarih !== sonTarih) {
      gruplar.push({ tarih: d.tarih, dersler: [] })
      sonTarih = d.tarih
    }
    gruplar[gruplar.length - 1].dersler.push(d)
  }
  return gruplar
}

function BireBirDerslerimBolumu({ haftalikDersler, tekSeferlikDersler, birdenFazlaCocukMu }) {
  const hicBirSeyYok = (!haftalikDersler || haftalikDersler.length === 0) && (!tekSeferlikDersler || tekSeferlikDersler.length === 0)
  if (hicBirSeyYok) return null
  const gunlereGore = GUNLER.map((_, gun) => (haftalikDersler || []).filter((d) => d.gun === gun)).slice(1)
  const tekSeferlikGunlereGore = tekSeferlikDersler ? gunGrupla(tekSeferlikDersler) : []

  return (
    <div className="space-y-4 mb-6">
      {haftalikDersler && haftalikDersler.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-navy text-white font-semibold">
            {birdenFazlaCocukMu ? 'Bire Bir Dersleri (Her Hafta Tekrarlanan)' : 'Bire Bir Derslerim (Her Hafta Tekrarlanan)'}
          </div>
          <div className="divide-y divide-gray-50">
            {gunlereGore.map((gunDersleri, i) =>
              gunDersleri.length === 0 ? null : (
                <div key={i} className="px-4 py-3">
                  <p className="text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">{GUNLER[i + 1]}</p>
                  <div className="space-y-1.5">
                    {gunDersleri.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-start justify-between gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2"
                      >
                        <div>
                          <p className="font-medium text-navy text-sm">
                            {d.ogretmen_adi}
                            {d.ogretmen_brans && <span className="text-gray-400 font-normal"> — {d.ogretmen_brans}</span>}
                          </p>
                          {birdenFazlaCocukMu && <p className="text-xs text-gray-400">{d.ogrenci_adi}</p>}
                        </div>
                        <p className="text-sm font-bold text-navy whitespace-nowrap shrink-0">
                          {saatGoster(d.baslangic_saat)}–{saatGoster(d.bitis_saat)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {tekSeferlikDersler && tekSeferlikDersler.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-navy text-white font-semibold">
            {birdenFazlaCocukMu ? 'Yaklaşan Bire Bir Dersleri (Tekil)' : 'Yaklaşan Bire Bir Derslerim (Tekil)'}
          </div>
          {tekSeferlikGunlereGore.map((grup) => {
            const bugunMu = grup.tarih === yerelBugunTarihi()
            return (
              <div key={grup.tarih}>
                <div className="px-4 py-2.5 bg-slate-100 border-b-2 border-navy flex items-center gap-2">
                  <span className="text-base font-extrabold text-navy">
                    {new Date(grup.tarih + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                  {bugunMu && (
                    <span className="text-[10px] font-bold bg-orange text-white px-2 py-0.5 rounded-full">Bugün</span>
                  )}
                </div>
                <div className="divide-y divide-gray-50">
                  {grup.dersler.map((d) => (
                    // Ad/branş kesilmesin diye truncate KULLANMIYORUZ — gerekirse
                    // alt satıra sarabilir. Ama saat HER ZAMAN satırın sağ üstünde,
                    // ilk satırda sabit kalsın diye "items-start" + saat için
                    // "shrink-0 whitespace-nowrap" kullanılıyor — isim ister tek
                    // satıra sığsın ister sarsın, saatin yeri hiç değişmiyor.
                    <div key={d.id} className="px-4 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium text-gray-800 text-sm">
                          {d.ogretmen_adi}
                          {d.ogretmen_brans ? ` — ${d.ogretmen_brans}` : ''}
                        </p>
                        <p className="text-base font-bold text-navy whitespace-nowrap shrink-0">
                          {d.baslangic_saat ? `${saatGoster(d.baslangic_saat)}${d.bitis_saat ? '–' + saatGoster(d.bitis_saat) : ''}` : 'Saat belirtilmemiş'}
                        </p>
                      </div>
                      {birdenFazlaCocukMu && <p className="text-xs text-gray-400 mt-0.5">{d.ogrenci_adi}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function DersProgrami() {
  const { profile } = useAuth()
  const isYonetici = profile?.rol === 'yonetici'
  const isVeliYaDaOgrenci = profile?.rol === 'veli' || profile?.rol === 'ogrenci'

  const [program, setProgram] = useState([])
  const [siniflar, setSiniflar] = useState([])
  const [ogretmenler, setOgretmenler] = useState([])
  const [bireBirAtamalar, setBireBirAtamalar] = useState([])
  const [bireBirYoklamalar, setBireBirYoklamalar] = useState([])
  const [ogrenciler, setOgrenciler] = useState([])
  const [bireBirDerslerim, setBireBirDerslerim] = useState([])
  const [tekSeferlikDerslerim, setTekSeferlikDerslerim] = useState([])
  const [birdenFazlaCocukMu, setBirdenFazlaCocukMu] = useState(false)
  const [taslaklar, setTaslaklar] = useState([])
  const [loading, setLoading] = useState(true)
  const [gorunum, setGorunum] = useState('tablo')
  // Veli/öğrenci için: "Bire Bir" ve "Ders Programı" bölümleri alt alta uzun
  // uzun sıralanmak yerine, sekme (tab) ile geçilerek gösterilir — tıklayınca
  // Bire Bir'e, tıklayınca Ders Programı'na geçer. Sadece veli/öğrenci
  // rolünde anlamlı; yönetici/öğretmen için ikisi zaten ayrı gösteriliyor.
  const [veliSekme, setVeliSekme] = useState('program') // 'birebir' | 'program'
  // Müsaitlik tablosunda boş bir hücreye tıklanınca buraya { ogretmenId, gun,
  // baslangic, bitis } yazılır; DersEkleForm bunu izleyip kendini otomatik doldurur.
  const [doldurBilgisi, setDoldurBilgisi] = useState(null)
  // Müsaitlik tablosunun üstündeki ◀/▶ ok ya da tarih kutusuyla seçilen tarih
  // — aşağıdaki DersEkleForm'daki "Günler" seçimini bununla otomatik senkron
  // tutmak için (kullanıcı isteğiyle eklendi, bkz. MusaitlikTablosu.jsx'teki
  // onTarihDegisti).
  const [musaitlikTarihi, setMusaitlikTarihi] = useState(null)
  // Yönetici için: "Ders Ekleme Aracı" (Müsaitlik + Ekle formu + Taslaklar) ile
  // "Günlük Program Listesi" (salt-okunur, o gün dersi olanları gösteren)
  // görünümü arasında geçiş. NOT: bu özellik bir ara ayrı bir sayfaya
  // (savasakcaportal.com/gunluk) taşınmıştı, ama kullanıcı vazgeçip eski
  // sekme haline dönmeyi istedi — GunlukProgramListesi bileşeni (artık ayrı
  // dosyada, src/components/GunlukProgramListesi.jsx) burada AYNI ŞEKİLDE
  // sekme olarak render ediliyor.
  const [yonetimGorunum, setYonetimGorunum] = useState('ekle')
  // Tıklanan hücreyi tablo üzerinde koyu işaretlemek için — ders eklenene/
  // taslağa kaydedilene kadar kullanıcı "hangi saate ekliyordum" diye
  // unutmasın diye. dersEklendiVeyaTaslaklandi() içinde temizlenir.
  const [seciliHucre, setSeciliHucre] = useState(null)
  // Tablodaki "Düzenle" ile seçilen, formda güncellenmekte olan ders saati.
  const [duzenlenenDers, setDuzenlenenDers] = useState(null)
  // Taslak Modu — açıkken (VE bir plan adı girilmişse), hem Müsaitlik
  // Tablosu'ndaki "Hızlı Ekle" popup'ı hem aşağıdaki "Yeni Ders Saati Ekle"
  // formu, dersi CANLI programa değil, isimlendirilmiş bu plana (taslaklar
  // tablosunda plan_adi ile) ekler. Birden fazla isimli plan oluşturulabilir —
  // her biri "Taslaklarım"da kendi başlığı altında toplanır ve topluca
  // yayınlanabilir. Bu anahtar Bire Bir sayfasıyla PAYLAŞILIYOR (bkz.
  // lib/taslakModu.js) — burada açıp bir plan adı yazınca, Bire Bir sayfasına
  // geçtiğinizde de aynı anahtar/plan adı açık gelir, tekrar yazmanıza gerek
  // kalmaz. Not: Hızlı Ekle ile eklenen bire bir / soru çözümü taslakları bu
  // sayfada değil, Bire Bir sayfasının Taslaklarım'ında yönetilir.
  const { taslakModuAcik, setTaslakModuAcik, aktifPlanAdi, setAktifPlanAdi } = useTaslakModu()
  // Plan adı kutusunun önerileri — Muhasebe.jsx'teki "Öğrenci Seç" kutusuyla
  // AYNI mantık: tarayıcının native datalist/autofill'ine güvenmek yerine
  // (silinen planları da hatırlamaya devam ediyordu), tamamen kendi
  // yönettiğimiz bir açılır liste — kutu odaklanınca açılır, yazınca filtrelenir,
  // her zaman güncel taslaklar state'inden türer.
  const [planOneriAcik, setPlanOneriAcik] = useState(false)
  const ilkYuklemeTamamRef = useRef(false)
  // Öğretmen için: yöneticinin kendisine atadığı "Soru Çözümü" seansları —
  // öğrenciye/veliye HİÇ gösterilmez, sadece atanan öğretmen kendi Ders
  // Programı sayfasında görsün diye. bire_bir_yoklama'dan, ogrenci_id boş
  // olan tur='soru_cozumu' satırları çekilir.
  const [soruCozumuSeanslarim, setSoruCozumuSeanslarim] = useState([])
  // Öğretmenin kendi TEKİL bire bir dersleri (haftalık atamaya bağlı olmayan,
  // tur='ders' kayıtlar) — Soru Çözümü ile aynı şekilde Ders Programı'na
  // karışık gösteriliyor, ama bunlarda ayrıca Geldi/Gelmedi (yoklama) alınabiliyor.
  const [bireBirTekilSeanslarim, setBireBirTekilSeanslarim] = useState([])
  // Öğretmen kendi ders programındaki bir derse tıklayınca (Tablo/Liste
  // görünümünde "Yoklama / Konu" butonu) burada o dersin ders_programi
  // satırı tutulur, popup o satır doluyken açık kalır (bkz. YoklamaKonuModal).
  const [yoklamaModalDers, setYoklamaModalDers] = useState(null)

  function veriyiYenile() {
    if (!ilkYuklemeTamamRef.current) setLoading(true)
    Promise.all([
      supabase
        .from('ders_programi')
        .select('*, siniflar(ad), profiles:ogretmen_profile_id(ad_soyad, brans)')
        .order('gun')
        .order('baslangic_saat'),
      isYonetici ? supabase.from('siniflar').select('*').order('ad') : Promise.resolve({ data: [] }),
      isYonetici ? supabase.from('profiles').select('*').eq('rol', 'ogretmen').order('ad_soyad') : Promise.resolve({ data: [] }),
      // Günlük Müsaitlik tablosunda sınıf derslerinin yanında bire bir dersleri de
      // gösterebilmek için (öğretmen tam olarak boş mu, doluysa neyle dolu).
      isYonetici ? supabase.from('bire_bir_atamalari').select('*, ogrenciler(ad_soyad)') : Promise.resolve({ data: [] }),
      isYonetici ? supabase.from('bire_bir_yoklama').select('*') : Promise.resolve({ data: [] }),
      isYonetici ? supabase.from('ogrenciler').select('id, ad_soyad') : Promise.resolve({ data: [] }),
      // Veli/öğrenci için: kendi çocuğu/kendisi hangi öğrenci kaydına bağlı —
      // bire bir atamalarını bu öğrenci id'si üzerinden çekeceğiz. Muhasebe.jsx
      // ile AYNI, kanıtlanmış yöntem: filtreyi sunucu tarafında ".or()" ile
      // değil, tüm kaydı çekip İSTEMCİ TARAFINDA veli_profile_id/ogrenci_profile_id
      // eşleşmesine göre süzerek yapıyoruz (RLS zaten satırları kısıtlıyor).
      isVeliYaDaOgrenci
        ? supabase.from('ogrenciler').select('id, ad_soyad, veli_profile_id, ogrenci_profile_id')
        : Promise.resolve({ data: [] }),
      // ÖNCEDEN sadece tur='sinif' çekiliyordu — ama bu sayfadaki Hızlı Ekle
      // popup'ı (Taslak Modu açıkken) bire bir / soru çözümü taslakları da
      // oluşturabiliyor (bkz. MusaitlikTablosu.jsx), ve Günlük Müsaitlik
      // tablosunun bunları da "dolu (taslak)" olarak gösterebilmesi için TÜM
      // türler burada tutulmalı. "Taslaklarım" listesi (TaslaklarimDersProgrami)
      // yine de sadece 'sinif' olanları gösterir — aşağıda ayrıca filtrelenir.
      isYonetici ? supabase.from('taslaklar').select('*').order('created_at') : Promise.resolve({ data: [] }),
    ]).then(([p, s, og, ba, by, o, kendiCocuklarSonuc, t]) => {
      setTaslaklar(t.data || [])
      setProgram(
        (p.data || []).map((d) => ({
          ...d,
          sinif_adi: d.siniflar?.ad,
          ogretmen_adi: d.profiles?.ad_soyad,
          ogretmen_brans: d.profiles?.brans,
        }))
      )
      setSiniflar(s.data || [])
      setOgretmenler(og.data || [])
      setBireBirAtamalar(
        (ba.data || []).map((a) => ({ ...a, ogrenci_adi: a.ogrenciler?.ad_soyad }))
      )
      setBireBirYoklamalar(by.data || [])
      setOgrenciler(o.data || [])

      if (kendiCocuklarSonuc.error) console.error('Kendi çocuk sorgusu hatası:', kendiCocuklarSonuc.error.message)
      const cocukListesi = (kendiCocuklarSonuc.data || []).filter(
        (c) => c.veli_profile_id === profile.id || c.ogrenci_profile_id === profile.id
      )
      const cocukIdleri = cocukListesi.map((c) => c.id)
      if (isVeliYaDaOgrenci && cocukIdleri.length > 0) {
        setBirdenFazlaCocukMu(cocukIdleri.length > 1)
        const cocukAdMap = new Map(cocukListesi.map((c) => [c.id, c.ad_soyad]))
        Promise.all([
          supabase
            .from('bire_bir_atamalari')
            .select('*, profiles:ogretmen_profile_id(ad_soyad, brans)')
            .in('ogrenci_id', cocukIdleri)
            .eq('aktif', true),
          // ÖNEMLİ: bu okulda bire bir derslerin ÇOĞU "tek seferlik" olarak
          // (atama_id BOŞ, belirli bir tarihe bağlı) bire_bir_yoklama tablosuna
          // giriliyor — sadece yukarıdaki sabit haftalık atamalara bakmak
          // yetmiyordu. Bugünden itibaren (geçmiş dersler zaten Ekstre'de
          // görünüyor) yaklaşan tek seferlik dersleri de ayrıca çekiyoruz.
          supabase
            .from('bire_bir_yoklama')
            .select('*, profiles:ogretmen_profile_id(ad_soyad, brans)')
            .in('ogrenci_id', cocukIdleri)
            .is('atama_id', null)
            .gte('tarih', yerelBugunTarihi())
            // Sadece tarihe göre sıralamak yetmiyor — aynı gün içindeki dersler
            // saat sırasına göre değil, veritabanının döndürdüğü rastgele sırayla
            // geliyordu (ör. 14:55'lik ders 12:00'lik dersten önce görünüyordu).
            // Saati de ikinci sıralama ölçütü olarak eklemek gerekiyor.
            .order('tarih')
            .order('baslangic_saat'),
        ]).then(([atamaSonuc, yoklamaSonuc]) => {
          if (atamaSonuc.error) console.error('Bire bir atamaları sorgusu hatası:', atamaSonuc.error.message)
          if (yoklamaSonuc.error) console.error('Tek seferlik bire bir sorgusu hatası:', yoklamaSonuc.error.message)
          setBireBirDerslerim(
            (atamaSonuc.data || []).map((a) => ({
              ...a,
              ogretmen_adi: a.profiles?.ad_soyad,
              ogretmen_brans: a.profiles?.brans,
              ogrenci_adi: cocukAdMap.get(a.ogrenci_id),
            }))
          )
          setTekSeferlikDerslerim(
            (yoklamaSonuc.data || [])
              .map((a) => ({
                ...a,
                ogretmen_adi: a.profiles?.ad_soyad,
                ogretmen_brans: a.profiles?.brans,
                ogrenci_adi: cocukAdMap.get(a.ogrenci_id),
              }))
              // Sunucudan gelen sıralamaya güvenmek yerine burada da garanti
              // altına alıyoruz: önce tarih, sonra saat.
              .sort(
                (x, y) =>
                  (x.tarih || '').localeCompare(y.tarih || '') ||
                  (x.baslangic_saat || '').localeCompare(y.baslangic_saat || '')
              )
          )
          ilkYuklemeTamamRef.current = true
          setLoading(false)
        })
      } else if (profile?.rol === 'ogretmen') {
        // Öğretmen için: yöneticinin kendisine atadığı "Soru Çözümü" seansları —
        // veliye/öğrenciye asla gösterilmez (bkz. yukarıdaki not), sadece
        // atanan öğretmen kendi Ders Programı sayfasında görür. AYNI ZAMANDA
        // kendi TEKİL bire bir derslerini de (atama_id boş, tur='ders') çekiyoruz
        // — öğretmen artık bunları da Ders Programı'nda görüp buradan Geldi/Gelmedi
        // işaretleyebilsin diye (önceden sadece Bire Bir Derslerim sayfasında
        // yönetiliyordu). Haftalık atamalar (atama_id dolu) burada YOK — onların
        // "ilk yoklama kaydını oluşturma" akışı Bire Bir Derslerim sayfasındaki
        // "Yoklama Al" bölümünde kalmaya devam ediyor, o özel akışı burada
        // tekrarlamıyoruz.
        //
        // ÖNEMLİ HATA DÜZELTMESİ (bkz. haftaninPazartesiVePazari yorumu): bu iki
        // sorgu ÖNCEDEN tarih filtresi olmadan öğretmenin TÜM geçmiş soru çözümü/
        // tekil bire bir kayıtlarını çekiyordu — sonuçta haftalar/aylar önce
        // verilmiş dersler bile, sadece haftanın hangi gününe denk geldiklerine
        // göre (gunNumaraTarihten) o gün sütununda SONSUZA KADAR "hayalet"
        // satırlar olarak birikiyor, gerçek/güncel programla karışıyordu. Artık
        // SADECE İÇİNDE BULUNULAN HAFTAYA (Pazartesi–Pazar) ait kayıtlar çekiliyor.
        (() => {
          const { pazartesi, pazar } = haftaninPazartesiVePazari()
          return Promise.all([
            supabase
              .from('bire_bir_yoklama')
              .select('*')
              .eq('ogretmen_profile_id', profile.id)
              .eq('tur', 'soru_cozumu')
              .gte('tarih', pazartesi)
              .lte('tarih', pazar)
              .order('tarih')
              .order('baslangic_saat'),
            supabase
              .from('bire_bir_yoklama')
              .select('*, ogrenciler(ad_soyad)')
              .eq('ogretmen_profile_id', profile.id)
              .eq('tur', 'ders')
              .is('atama_id', null)
              .gte('tarih', pazartesi)
              .lte('tarih', pazar)
              .order('tarih')
              .order('baslangic_saat'),
          ])
        })().then(([soruRes, bbRes]) => {
          if (soruRes.error) console.error('Soru çözümü sorgusu hatası:', soruRes.error.message)
          if (bbRes.error) console.error('Bire bir (tekil) sorgusu hatası:', bbRes.error.message)
          setSoruCozumuSeanslarim(soruRes.data || [])
          setBireBirTekilSeanslarim(
            (bbRes.data || []).map((y) => ({ ...y, ogrenci_adi: y.ogrenciler?.ad_soyad }))
          )
          ilkYuklemeTamamRef.current = true
          setLoading(false)
        })
      } else {
        ilkYuklemeTamamRef.current = true
        setLoading(false)
      }
    })
  }

  useEffect(() => {
    veriyiYenile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Müsaitlik tablosunda boş bir hücreye tıklanınca çağrılır: hücrenin
  // öğretmen/gün/saat bilgisini forma iletir ve forma doğru yumuşak kaydırır.
  function hucreTiklandi(bilgi) {
    // Müsaitlik tablosundan boş bir hücreye tıklanması, "yeni ders ekleme"
    // akışıdır — o an bir dersi düzenliyorsak (Düzenle modu) önce onu iptal
    // edip forma karışmasını önlüyoruz.
    setDuzenlenenDers(null)
    // Aynı öğretmen/tarih için, az önce seçilen hücrenin HEMEN YANINDAKİ
    // (bir sonraki 30dk'lık) sütuna tıklanırsa, bunu "arka arkaya bir ders daha"
    // isteği olarak yorumluyoruz: yeni dersin başlangıcını, önceki dersin
    // bitişinden (başlangıç+45dk) 10 dakika sonrasına otomatik ayarlıyoruz —
    // Bire Bir sayfasındaki "45 dakika ders + 10 dakika ara" düzeniyle tutarlı
    // olsun diye. Art arda (3., 4. kutu...) tıklanırsa da aynı mantık zincirlenir.
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
    // NOT: burada bilerek forma otomatik kaydırma (scrollIntoView) YAPILMIYOR —
    // hızlı seçim zaten müsaitlik tablosundan yapılıyor, sayfanın kendiliğinden
    // aşağı kayması istenmiyor (kullanıcı isteğiyle kaldırıldı).
  }

  // Ders eklendiğinde ya da taslağa kaydedildiğinde hem veriyi yeniler hem de
  // müsaitlik tablosundaki koyu işareti kaldırır.
  function dersEklendiVeyaTaslaklandi() {
    setSeciliHucre(null)
    veriyiYenile()
  }

  // Tablodaki "Düzenle" butonuna basılınca çağrılır: formu düzenlenecek ders
  // bilgisiyle doldurur ve forma kaydırır (kaydırma DersEkleForm içindeki
  // useEffect'te yapılıyor).
  function duzenle(d) {
    setDoldurBilgisi(null)
    setSeciliHucre(null)
    setDuzenlenenDers(d)
  }

  // Günlük Müsaitlik tablosundaki ✏️ butonuna basılınca çağrılır — sadece bir
  // id geliyor (MusaitlikTablosu kendi başına tam kaydı tutmuyor), o yüzden
  // burada "program" state'i içinden tam kaydı bulup mevcut duzenle() akışına
  // (aşağıdaki forma kaydırma) yönlendiriyoruz.
  function musaitlikTablosundanDuzenle(id) {
    const d = program.find((p) => p.id === id)
    if (d) duzenle(d)
  }

  // Öğretmen, Ders Programı'na karışık gösterilen kendi tekil bire bir
  // dersinde Geldi/Gelmedi'ye tıklayınca — BireBir.jsx'teki aynı isimli
  // fonksiyonla (durumDegistir) birebir aynı davranış: "Geldi" zaten borç
  // eklenmiş bir kaydı "Gelmedi"ye çevirmek onay istiyor, diğer geçişler
  // istemiyor.
  async function bireBirDurumDegistir(yoklamaId, mevcutDurum, yeniDurum) {
    if (mevcutDurum === yeniDurum) return
    if (mevcutDurum === 'geldi' && yeniDurum === 'gelmedi') {
      if (!confirm('Bu ders "Geldi" olarak işaretliydi ve öğrenciye borç eklenmişti. "Gelmedi" yapmak istediğinize emin misiniz? (borç kaldırılacak)')) return
    }
    const { error } = await supabase.from('bire_bir_yoklama').update({ durum: yeniDurum }).eq('id', yoklamaId)
    if (error) alert('Hata: ' + error.message)
    else veriyiYenile()
  }

  const ogrenciAdMap = useMemo(() => new Map(ogrenciler.map((o) => [o.id, o.ad_soyad])), [ogrenciler])

  // Plan adı kutusundaki öneriler — şu an var olan (silinmemiş) tüm isimli
  // planlar, aktifPlanAdi'yla eşleşenlere göre filtrelenmiş. Muhasebe.jsx'teki
  // Öğrenci Seç kutusuyla aynı mantık, native datalist yerine.
  const mevcutPlanAdlari = useMemo(
    () => [...new Set(taslaklar.filter((t) => t.plan_adi).map((t) => t.plan_adi))],
    [taslaklar]
  )
  const gorunenPlanOnerileri = mevcutPlanAdlari.filter((ad) => {
    const aranan = aktifPlanAdi.trim().toLocaleLowerCase('tr-TR')
    return !aranan || ad.toLocaleLowerCase('tr-TR').includes(aranan)
  })

  async function sil(id) {
    if (!confirm('Bu ders saatini silmek istediğinize emin misiniz? Bugünden itibaren ileriye dönük yoklama kayıtları da (varsa) birlikte silinecek — geçmiş (bugünden önceki) yoklama kayıtları KORUNUR, silinmez.')) return
    // ÖNEMLİ HATA DÜZELTMESİ: bu fonksiyon önceden o ders_programi_id'ye ait
    // TÜM yoklama kayıtlarını (geçmiş dahil) siliyordu. Ama "ders_programi"
    // satırı belirli bir TARİHE değil, haftanın GÜNÜNE bağlı tekrarlayan bir
    // şablon (ör. "her Cumartesi 11:45") — yani geçen haftanın VE gelecek
    // haftanın Cumartesi dersi AYNI ders_programi_id'yi paylaşıyor. Böylece
    // Günlük Müsaitlik'te sadece BİR tarihin (ör. 8 Ağustos) hücresinden
    // "Sil" denildiğinde, önceki haftaların (ör. 1 Ağustos) çoktan alınmış
    // yoklama kayıtları da silinip gidiyordu.
    //
    // Artık sadece BUGÜNDEN İTİBAREN (>= bugün) olan yoklama kayıtları
    // siliniyor. Geçmiş kayıtları ise SADECE silmemekle yetinmiyoruz — az
    // sonra ders_programi satırının kendisini sileceğimiz için, geçmiş
    // yoklama satırlarının ders_programi_id bağlantısını da önden NULL'a
    // çekip "koparıyoruz". Bunu bilerek yapıyoruz: veritabanındaki foreign key
    // kuralı CASCADE ise (silinen ders_programi'ye bağlı satırları otomatik
    // silerdi) geçmiş kayıtlar yine de KORUNMUŞ olur — artık hiçbir satır o
    // id'yi referans almadığı için silinecek bir şey kalmıyor. Tek yan etkisi:
    // bu çok eski kayıtlar artık "hangi ders saatine ait olduğu" bilgisini
    // kaybediyor (öğretmenin KENDİ görünümünde bu çok eski kayıt bir daha
    // görünmeyebilir) — ama kaydın kendisi (tarih, öğrenci, geldi/gelmedi,
    // dolayısıyla borç geçmişi) hiç silinmiyor, yönetici ve veli/öğrenci
    // tarafında görünmeye devam ediyor.
    const { error: yoklamaHata } = await supabase
      .from('yoklama')
      .delete()
      .eq('ders_programi_id', id)
      .gte('tarih', yerelBugunTarihi())
    if (yoklamaHata) {
      alert('Hata (yoklama kayıtları silinirken): ' + yoklamaHata.message)
      return
    }
    const { error: koparHata } = await supabase
      .from('yoklama')
      .update({ ders_programi_id: null })
      .eq('ders_programi_id', id)
    if (koparHata) {
      alert('Hata (geçmiş yoklama kayıtları ayrılırken): ' + koparHata.message)
      return
    }
    const { error } = await supabase.from('ders_programi').delete().eq('id', id)
    if (error) alert('Hata: ' + error.message)
    else veriyiYenile()
  }

  // Öğretmen rolü "Ders Programı" sayfasını açtığında, aşağıdaki Tablo/Liste
  // görünümü eskiden HAM "program"ı (okulun TÜM sınıflarının, TÜM
  // öğretmenlerinin dersleri) gösteriyordu — öğretmen kendi programına
  // baktığını sanırken aslında herkesin programını görüyordu. Artık öğretmen
  // için sadece KENDİ atandığı ders saatleri süzülüyor. (Yönetici tarafındaki
  // Ders Ekleme Aracı / Günlük Program Listesi / Müsaitlik Tablosu hâlâ ham
  // "program"ı kullanıyor — orada müsaitlik kontrolü için okulun tamamını
  // görmesi gerekiyor, bkz. aşağıdaki MusaitlikTablosu/GunlukProgramListesi.)
  const isOgretmen = profile?.rol === 'ogretmen'
  // Öğretmen için varsayılan görünüm Tablo değil Liste olsun — asıl işi
  // ("Yoklama / Konu İşle" butonuna tıklamak) Liste görünümünde daha kolay
  // görülüyor. Sadece BİR KEZ, profil yüklenip öğretmen olduğu anlaşılınca
  // ayarlanıyor — öğretmen daha sonra elle Tablo'ya geçerse tekrar
  // Liste'ye zorla döndürülmez.
  useEffect(() => {
    if (isOgretmen) setGorunum('liste')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOgretmen])
  // Veli/öğrenci için de sayfa ilk açıldığında varsayılan görünüm Liste olsun
  // (Tablo değil) — liste daha okunaklı bulunuyor. Öğretmen tarafına
  // dokunulmuyor, o zaten yukarıdaki effect ile Liste'ye ayarlanıyor. Sadece
  // BİR KEZ ayarlanır, kullanıcı sonra elle Tablo'ya geçerse geri zorlanmaz.
  useEffect(() => {
    if (isVeliYaDaOgrenci) setGorunum('liste')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVeliYaDaOgrenci])
  // Öğretmenin Soru Çözümü seansları, sınıf dersleriyle AYNI tabloda/listede
  // görünsün diye (ayrı bir bölüm olarak değil) burada normal ders programı
  // satırlarıyla aynı şekle çevrilip kendiProgram'a ekleniyor. Belirli bir
  // TARİHE bağlı olsalar da (haftalık tekrar eden bir "gun" değil), o tarihin
  // hangi haftanın gününe denk geldiği hesaplanıp o güne yerleştiriliyor.
  const kendiProgram = isOgretmen
    ? [
        ...program.filter((p) => p.ogretmen_profile_id === profile.id),
        ...soruCozumuSeanslarim.map((s) => ({
          id: `sc-${s.id}`,
          gun: gunNumaraTarihten(s.tarih),
          baslangic_saat: s.baslangic_saat,
          bitis_saat: s.bitis_saat,
          ders_adi: 'Soru Çözümü',
          sinif_adi: null,
          ogretmen_adi: null,
          ogretmen_profile_id: profile.id,
        })),
        // Öğretmenin kendi TEKİL bire bir dersleri — Soru Çözümü ile aynı
        // şekilde sentetik satır olarak ekleniyor, ama _bireBir işareti
        // sayesinde Tablo/Liste render'ı bunlarda "Yoklama / Konu" yerine
        // basit Geldi/Gelmedi butonlarını gösteriyor (bkz. aşağıdaki JSX).
        ...bireBirTekilSeanslarim.map((y) => ({
          id: `bb-${y.id}`,
          gun: gunNumaraTarihten(y.tarih),
          baslangic_saat: y.baslangic_saat,
          bitis_saat: y.bitis_saat,
          ders_adi: `Bire Bir · ${y.ogrenci_adi || 'Öğrenci'}`,
          sinif_adi: null,
          ogretmen_adi: null,
          ogretmen_profile_id: profile.id,
          _bireBir: true,
          _yoklamaId: y.id,
          _durum: y.durum,
        })),
      ]
    : program

  const gunlereGore = GUNLER.map((_, gun) =>
    kendiProgram
      .filter((p) => p.gun === gun)
      .sort((a, b) => (a.baslangic_saat || '').localeCompare(b.baslangic_saat || '') || dersTuruSirasi(a) - dersTuruSirasi(b))
  ).slice(1)

  // Tablo görünümü için: programdaki tüm benzersiz başlangıç saatleri, sıralı satırlar olarak.
  const saatSatirlari = [...new Set(kendiProgram.map((p) => saatKisalt(p.baslangic_saat)))].sort()

  function hucreDersleri(gun, saat) {
    return kendiProgram
      .filter((p) => p.gun === gun && saatKisalt(p.baslangic_saat) === saat)
      .sort((a, b) => (a.baslangic_saat || '').localeCompare(b.baslangic_saat || '') || dersTuruSirasi(a) - dersTuruSirasi(b))
  }

  // Veli/öğrenci için sınıf ders programı (tablo/liste) sadece bu sekme
  // seçiliyken gösterilir; öğretmen için sekme hiç yok, her zaman gösterilir.
  // Yönetici için ise bu alttaki genel haftalık tablo artık GÖSTERİLMİYOR —
  // yöneticinin zaten "Ders Ekleme Aracı" (Müsaitlik Tablosu) ve "Günlük
  // Program Listesi" sekmeleri var, aynı bilgiyi tekrar aşağıda kalabalık
  // bir haftalık tabloyla göstermek gereksizdi.
  const sinifProgramiGoster = isYonetici ? false : !isVeliYaDaOgrenci || veliSekme === 'program'

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-navy">Ders Programı</h1>
        <div className="flex items-center gap-3 flex-wrap">
          {isVeliYaDaOgrenci && (
            <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden text-sm">
              <button
                onClick={() => setVeliSekme('birebir')}
                className={`px-3 py-1.5 font-medium transition-colors ${veliSekme === 'birebir' ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Bire Bir
              </button>
              <button
                onClick={() => setVeliSekme('program')}
                className={`px-3 py-1.5 font-medium transition-colors ${veliSekme === 'program' ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Ders Programı
              </button>
            </div>
          )}
          {sinifProgramiGoster && (
            <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden text-sm">
              <button
                onClick={() => setGorunum('liste')}
                className={`px-3 py-1.5 font-medium transition-colors ${gorunum === 'liste' ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Liste
              </button>
              <button
                onClick={() => setGorunum('tablo')}
                className={`px-3 py-1.5 font-medium transition-colors ${gorunum === 'tablo' ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Tablo
              </button>
            </div>
          )}
        </div>
      </div>

      {isOgretmen && (
        <div className="bg-blue-50 border border-blue-100 text-blue-800 text-xs rounded-lg px-3 py-2 mb-4">
          💡 Bir dersinizin yanındaki <strong>"Yoklama / Konu"</strong> butonuna tıklayarak o dersin yoklamasını alabilir, aynı ekrandan o gün işlediğiniz konuyu da işaretleyebilirsiniz.
        </div>
      )}

      {isYonetici && (
        <>
          <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden text-sm mb-4 w-fit">
            <button
              type="button"
              onClick={() => setYonetimGorunum('ekle')}
              className={`px-3 py-1.5 font-medium transition-colors ${yonetimGorunum === 'ekle' ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Ders Ekleme Aracı
            </button>
            <button
              type="button"
              onClick={() => setYonetimGorunum('gunluk')}
              className={`px-3 py-1.5 font-medium transition-colors ${yonetimGorunum === 'gunluk' ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Günlük Program Listesi
            </button>
          </div>

          {yonetimGorunum === 'ekle' && (
            <>
              {/* Taslak Modu — sayfa üstündeki anahtar, HEM Müsaitlik
                  Tablosu'ndaki Hızlı Ekle popup'ını HEM aşağıdaki formu
                  etkiler (bkz. yukarıdaki taslakModuAcik state notu). */}
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
                    <div className="relative flex-1 min-w-[220px]">
                      <input
                        type="text"
                        value={aktifPlanAdi}
                        onChange={(e) => setAktifPlanAdi(e.target.value)}
                        onFocus={() => setPlanOneriAcik(true)}
                        onBlur={() => setTimeout(() => setPlanOneriAcik(false), 150)}
                        placeholder='Plan adı (ör. "Ekim 2. Hafta Programı")'
                        // Tarayıcının KENDİ form-doldurma hafızası, aşağıdaki
                        // özel/React açılır listesinden BAĞIMSIZ olarak,
                        // silinmiş plan adlarını da hatırlamaya devam
                        // edebildiği için (native datalist ile yaşanan sorun)
                        // burada da kapatılıyor.
                        autoComplete="off"
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                      />
                      {/* Daha önce kullanılmış (hâlâ var olan) plan isimleri
                          öneri olarak çıksın — Muhasebe.jsx'teki "Öğrenci Seç"
                          kutusuyla aynı, tamamen kendi yönettiğimiz açılır
                          liste (native datalist/autofill hafızasına değil,
                          her zaman güncel taslaklar state'ine dayanır). */}
                      {planOneriAcik && gorunenPlanOnerileri.length > 0 && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {gorunenPlanOnerileri.map((ad) => (
                            <button
                              key={ad}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setAktifPlanAdi(ad)
                                setPlanOneriAcik(false)
                              }}
                              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-orange-50"
                            >
                              {ad}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {aktifPlanAdi.trim()
                        ? `Açık — Hızlı Ekle ve formdan eklenen dersler "${aktifPlanAdi.trim()}" planına kaydediliyor (canlıya değil). Bire Bir sayfasına geçtiğinizde de aynı plan açık gelir.`
                        : 'Devam etmeden önce bir plan adı yazın.'}
                    </span>
                  </>
                )}
              </div>
              <MusaitlikTablosu
                ogretmenler={ogretmenler}
                dersProgrami={program}
                atamalar={bireBirAtamalar}
                yoklamalar={bireBirYoklamalar}
                ogrenciAdMap={ogrenciAdMap}
                onHucreTikla={hucreTiklandi}
                secili={seciliHucre}
                ogrenciler={ogrenciler}
                siniflar={siniflar}
                hizliEkleEtkin
                onHizliEklendi={dersEklendiVeyaTaslaklandi}
                taslakModuAcik={taslakModuAcik}
                aktifPlanAdi={aktifPlanAdi.trim()}
                taslaklar={taslaklar}
                onTarihDegisti={setMusaitlikTarihi}
                onSinifDersiSil={sil}
                onSinifDersiGuncelle={musaitlikTablosundanDuzenle}
              />
              <DersEkleForm
                siniflar={siniflar}
                ogretmenler={ogretmenler}
                program={program}
                taslaklar={taslaklar}
                onEklendi={dersEklendiVeyaTaslaklandi}
                doldurBilgisi={doldurBilgisi}
                duzenlenenDers={duzenlenenDers}
                onDuzenlemeBitti={() => setDuzenlenenDers(null)}
                musaitlikTarihi={musaitlikTarihi}
                taslakModuAcik={taslakModuAcik}
                aktifPlanAdi={aktifPlanAdi}
              />
              <TaslaklarimDersProgrami
                taslaklar={taslaklar.filter((t) => t.tur === 'sinif')}
                siniflar={siniflar}
                ogretmenler={ogretmenler}
                program={program}
                onDegisti={veriyiYenile}
              />
            </>
          )}

          {yonetimGorunum === 'gunluk' && (
            <GunlukProgramListesi
              program={program}
              ogretmenler={ogretmenler}
              atamalar={bireBirAtamalar}
              yoklamalar={bireBirYoklamalar}
              ogrenciAdMap={ogrenciAdMap}
            />
          )}
        </>
      )}

      {isVeliYaDaOgrenci && veliSekme === 'birebir' && (
        <BireBirDerslerimBolumu
          haftalikDersler={bireBirDerslerim}
          tekSeferlikDersler={tekSeferlikDerslerim}
          birdenFazlaCocukMu={birdenFazlaCocukMu}
        />
      )}

      {loading && <p className="text-gray-400">Yükleniyor...</p>}

      {sinifProgramiGoster && !loading && kendiProgram.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-gray-400">Görüntülenecek ders programı bulunamadı.</p>
        </div>
      )}

      {sinifProgramiGoster && !loading && kendiProgram.length > 0 && gorunum === 'tablo' && (
        // overscroll-x-contain: mobil tarayıcılarda bu tablonun YATAY kaydırma
        // alanı olduğunu belirtip, kenara ulaşınca kaydırmanın sayfaya
        // sızmasını (chaining) engelliyoruz. NOT: burada bilerek touch-action'ı
        // "pan-x pan-y" (ikisi de) olarak ayarlıyoruz — sadece "pan-x" (yatay)
        // kullanmak, bu div üzerindeki DİKEY parmak kaydırmayı da devre dışı
        // bırakıyordu (tablo uzayınca kullanıcı üstünde parmağıyla artık
        // sayfayı aşağı kaydıramıyordu). "pan-x pan-y" her iki yönü de tarayıcıya
        // bırakıyor, yatay kayma sorunu da (task #124) hâlâ çözülü kalıyor.
        <div
          className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto overscroll-x-contain"
          style={{ touchAction: 'pan-x pan-y' }}
        >
          <table className="border-collapse text-sm min-w-[900px] w-full">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-navy text-white px-3 py-2.5 text-left font-semibold w-24">Saat</th>
                {GUNLER.slice(1).map((g, i) => (
                  <th key={i + 1} className="bg-navy text-white px-3 py-2.5 text-left font-semibold min-w-[150px] border-l border-white/10">
                    {GUNLER_KISA[i + 1]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {saatSatirlari.map((saat, ri) => (
                <tr key={saat} className={ri % 2 ? 'bg-gray-50/60' : ''}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 font-semibold text-gray-600 whitespace-nowrap border-t border-gray-100 text-xs">
                    {saatGoster(saat)}
                  </td>
                  {GUNLER.slice(1).map((_, i) => {
                    const gun = i + 1
                    const dersler = hucreDersleri(gun, saat)
                    return (
                      <td key={gun} className="px-1.5 py-1.5 align-top border-t border-l border-gray-100">
                        <div className="space-y-1">
                          {dersler.map((d) => {
                            // Aynı hücrede birden fazla ders üst üste dizildiğinde (ör. art
                            // arda birkaç Soru Çözümü seansı) hepsi aynı renkte olduğu için
                            // birbirinden ayırt etmek zorlaşıyordu. Artık türe göre AÇIK/KOYU
                            // ayrı bir renk teması var — sınıf dersi mavi, bire bir tekil ders
                            // amber (koyu), soru çözümü mor — hem daha estetik hem de bir
                            // bakışta hangi türden olduğu anlaşılıyor.
                            const kutuRengi = d.sinif_id
                              ? 'bg-blue-50 border-blue-100'
                              : d._bireBir
                                ? 'bg-amber-100 border-amber-200'
                                : 'bg-purple-50 border-purple-100'
                            const baslikRengi = d.sinif_id ? 'text-navy' : d._bireBir ? 'text-amber-900' : 'text-purple-800'
                            return (
                            <div key={d.id} className={`${kutuRengi} border rounded-lg px-2 py-1 relative group`}>
                              {isYonetici && (
                                <div className="flex items-center justify-end gap-1.5 h-3 mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => duzenle(d)}
                                    className="text-[10px] text-blue-500 hover:text-blue-700 leading-none"
                                  >
                                    Düzenle
                                  </button>
                                  <button
                                    onClick={() => sil(d.id)}
                                    className="text-[10px] text-red-400 hover:text-red-700 leading-none"
                                  >
                                    Sil
                                  </button>
                                </div>
                              )}
                              {/* Başlıkta önce ders adı, o da yoksa öğretmenin branşı gösterilir —
                                  sınıf adı artık başlık olarak öne çıkmıyor, sadece bilgi amaçlı
                                  silik bir alt satırda (ve başlıkla aynıysa hiç tekrar basılmadan). */}
                              <p className={`font-semibold ${baslikRengi} text-xs leading-tight`}>{d.ders_adi || d.ogretmen_brans || d.sinif_adi}</p>
                              {d.sinif_adi && d.sinif_adi !== (d.ders_adi || d.ogretmen_brans || d.sinif_adi) && (
                                <p className="text-[11px] text-gray-500 leading-tight">{d.sinif_adi}</p>
                              )}
                              {d.ogretmen_adi && <p className="text-[11px] text-gray-400 leading-tight">{d.ogretmen_adi}</p>}
                              <p className="text-[10px] text-gray-400 leading-tight">
                                {saatGoster(d.baslangic_saat)}–{saatGoster(d.bitis_saat)}
                              </p>
                              {isOgretmen && d.sinif_id && (
                                <button
                                  type="button"
                                  onClick={() => setYoklamaModalDers(d)}
                                  className="mt-1 w-full text-[10px] font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 rounded px-1 py-0.5 transition-colors"
                                >
                                  Yoklama / Konu
                                </button>
                              )}
                              {/* Bire bir tekil dersler (sınıf dersi değil, d.sinif_id yok) —
                                  YoklamaKonuModal sınıf yoklamasına özel olduğu için burada
                                  onun yerine basit Geldi/Gelmedi durumu + butonları gösteriliyor. */}
                              {isOgretmen && d._bireBir && (
                                <div className="mt-1 flex items-center gap-1 flex-wrap">
                                  <span
                                    className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                                      d._durum === 'geldi'
                                        ? 'bg-green-100 text-green-700'
                                        : d._durum === 'gelmedi'
                                          ? 'bg-red-100 text-red-600'
                                          : 'bg-yellow-100 text-yellow-700'
                                    }`}
                                  >
                                    {d._durum === 'geldi' ? 'Geldi' : d._durum === 'gelmedi' ? 'Gelmedi' : 'Bekliyor'}
                                  </span>
                                  {d._durum !== 'geldi' && (
                                    <button
                                      type="button"
                                      onClick={() => bireBirDurumDegistir(d._yoklamaId, d._durum, 'geldi')}
                                      className="text-[9px] font-semibold text-green-700 hover:underline"
                                    >
                                      Geldi
                                    </button>
                                  )}
                                  {d._durum !== 'gelmedi' && (
                                    <button
                                      type="button"
                                      onClick={() => bireBirDurumDegistir(d._yoklamaId, d._durum, 'gelmedi')}
                                      className="text-[9px] font-semibold text-red-600 hover:underline"
                                    >
                                      Gelmedi
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            )
                          })}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sinifProgramiGoster && !loading && kendiProgram.length > 0 && gorunum === 'liste' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {gunlereGore.map((dersler, i) =>
            dersler.length === 0 ? null : (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-navy text-white font-semibold">{GUNLER[i + 1]}</div>
                <div className="divide-y divide-gray-50">
                  {dersler.map((d) => {
                    // Başlıkta önce ders adı, o da yoksa öğretmenin branşı gösterilir —
                    // sınıf adı başlık olarak öne çıkmıyor, sadece başlıktan farklıysa
                    // silik bir alt satırda gösteriliyor (bkz. Tablo görünümündeki
                    // aynı desen).
                    const baslik = d.ders_adi || d.ogretmen_brans || d.sinif_adi
                    const sinifAdiGoster = d.sinif_adi && d.sinif_adi !== baslik
                    // Tablo görünümündeki AYNI renk teması (task: mobilde "bir açık bir
                    // koyu" ayrımı istendi) — Liste görünümünde de her satır türüne göre
                    // (sınıf dersi mavi, bire bir tekil ders amber, soru çözümü mor)
                    // arka plan rengi alıyor, sadece Tablo'da değil.
                    const satirRengi = d.sinif_id
                      ? 'bg-blue-50/60'
                      : d._bireBir
                        ? 'bg-amber-100/70'
                        : 'bg-purple-50/60'
                    const baslikRengi = d.sinif_id ? 'text-gray-800' : d._bireBir ? 'text-amber-900' : 'text-purple-800'
                    return (
                    <div key={d.id} className={`px-4 py-3 flex items-start justify-between gap-2 ${satirRengi}`}>
                      <div>
                        <p className={`font-medium ${baslikRengi}`}>{baslik}</p>
                        <p className="text-xs text-gray-400">
                          {sinifAdiGoster ? d.sinif_adi : ''}
                          {d.ogretmen_adi ? `${sinifAdiGoster ? ' · ' : ''}${d.ogretmen_adi}` : ''}
                        </p>
                        <p className="text-sm text-gray-500">
                          {saatGoster(d.baslangic_saat)} – {saatGoster(d.bitis_saat)}
                        </p>
                      </div>
                      {isYonetici && (
                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            onClick={() => duzenle(d)}
                            className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            Düzenle
                          </button>
                          <button
                            onClick={() => sil(d.id)}
                            className="text-xs text-red-500 hover:text-red-700 hover:underline"
                          >
                            Sil
                          </button>
                        </div>
                      )}
                      {isOgretmen && d.sinif_id && (
                        <button
                          type="button"
                          onClick={() => setYoklamaModalDers(d)}
                          className="text-xs font-semibold text-white bg-blue rounded-lg px-3 py-1.5 hover:bg-navy transition-colors shrink-0"
                        >
                          Yoklama / Konu İşle
                        </button>
                      )}
                      {/* Bire bir tekil dersler — YoklamaKonuModal sınıf yoklamasına özel
                          olduğu için burada basit Geldi/Gelmedi durumu + butonları var. */}
                      {isOgretmen && d._bireBir && (
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          <span
                            className={`text-xs font-semibold px-2 py-1 rounded-full ${
                              d._durum === 'geldi'
                                ? 'bg-green-100 text-green-700'
                                : d._durum === 'gelmedi'
                                  ? 'bg-red-100 text-red-600'
                                  : 'bg-yellow-100 text-yellow-700'
                            }`}
                          >
                            {d._durum === 'geldi' ? 'Geldi' : d._durum === 'gelmedi' ? 'Gelmedi' : 'Bekliyor'}
                          </span>
                          {d._durum !== 'geldi' && (
                            <button
                              type="button"
                              onClick={() => bireBirDurumDegistir(d._yoklamaId, d._durum, 'geldi')}
                              className="text-xs font-semibold text-green-700 hover:underline"
                            >
                              Geldi
                            </button>
                          )}
                          {d._durum !== 'gelmedi' && (
                            <button
                              type="button"
                              onClick={() => bireBirDurumDegistir(d._yoklamaId, d._durum, 'gelmedi')}
                              className="text-xs font-semibold text-red-600 hover:underline"
                            >
                              Gelmedi
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )})}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {yoklamaModalDers && (
        <YoklamaKonuModal
          dersProgramiId={yoklamaModalDers.id}
          sinifId={yoklamaModalDers.sinif_id}
          sinifAdi={yoklamaModalDers.sinif_adi}
          dersAdi={yoklamaModalDers.ders_adi}
          tarih={enYakinGunTarihi(yoklamaModalDers.gun)}
          profile={profile}
          onClose={() => setYoklamaModalDers(null)}
        />
      )}
    </div>
  )
}
