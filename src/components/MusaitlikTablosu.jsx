import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { DERS_PERIYOTLARI } from '../lib/dersPeriyotlari'
import { saatGoster } from '../lib/saatFormat'
import { useBugununTarihi } from '../lib/bugununTarihi'

// Hem Bire Bir sayfasında hem Ders Programı sayfasında kullanılan ortak bileşen:
// seçilen bir tarih için, tüm öğretmenlerin o gün hangi saatlerde dolu/boş
// olduğunu tek tabloda gösterir. Hem sınıf derslerini (ders_programi), hem
// haftalık bire bir dersleri (bire_bir_atamalari), hem de tek seferlik bire bir
// dersleri (bire_bir_yoklama, atama_id boş) birleştirir.
//
// onHucreTikla verilirse (opsiyonel), BOŞ hücreler tıklanabilir olur — üstteki
// sayfaya { ogretmenId, ogretmenAdi, tarih, gun, baslangic, bitis } bilgisini
// iletir. Dolu hücrelere tıklama hiçbir zaman bir şey yapmaz (yanlışlıkla
// üzerine yazmayı önlemek için).
//
// secili verilirse (opsiyonel, { ogretmenId, tarih, baslangic }), o hücre koyu
// renkle işaretlenir — kullanıcı tıkladıktan sonra "hangi saate ekliyordum"
// sorusuna cevap versin diye. Üstteki sayfa, ders eklenene/taslağa kaydedilene
// kadar bu bilgiyi tutar.

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

function saatKisalt(s) {
  return s ? s.slice(0, 5) : s
}

function araliklarCakisiyorMu(b1, s1, b2, s2) {
  return saatKisalt(b1) < saatKisalt(s2) && saatKisalt(b2) < saatKisalt(s1)
}

// Bir öğrencinin KENDİ sınıfının, seçilen gün/saatte bir dersi olup olmadığını
// kontrol eder — BireBir.jsx'teki (manuel form) aynı isimli fonksiyonun
// buradaki karşılığı. SERT bir engel değil, sadece bir UYARI döndürür — admin
// "Evet, yine de ekle" diyerek Hızlı Ekle ile devam edebilir. Daha önce Hızlı
// Ekle akışı bu kontrolü hiç yapmıyordu (sadece manuel formda vardı) — bu
// yüzden aynı çakışma manuel formda uyarı gösterirken Hızlı Ekle'de sessizce
// atlanıyordu. sinifOgrencileri: öğrencinin hangi sınıf(lar)a kayıtlı
// olduğunu tutan ara tablo ([{ ogrenci_id, sinif_id }]).
function ogrenciSinifDersiUyarisiBul(ogrenciId, gun, baslangic, bitis, dersProgrami, sinifOgrencileri) {
  if (!ogrenciId || !gun || !baslangic || !bitis) return null
  const sinifIdleri = new Set(
    (sinifOgrencileri || []).filter((so) => so.ogrenci_id === ogrenciId).map((so) => so.sinif_id)
  )
  if (sinifIdleri.size === 0) return null
  for (const d of dersProgrami || []) {
    if (!sinifIdleri.has(d.sinif_id)) continue
    if (d.gun !== gun) continue
    if (!araliklarCakisiyorMu(baslangic, bitis, d.baslangic_saat, d.bitis_saat)) continue
    return {
      aciklama: `bu öğrencinin ${GUNLER[d.gun]} günü ${saatGoster(d.baslangic_saat)}–${saatGoster(d.bitis_saat)} arası "${d.ders_adi || d.sinif_adi || 'sınıf'}" dersi var`,
    }
  }
  return null
}

// Taslak Modu açıkken Hızlı Ekle ile oluşturulan taslakların BİRBİRİYLE
// çakışıp çakışmadığını kontrol eder (DersProgrami.jsx/BireBir.jsx'teki
// taslagaKaydet()'lerle aynı amaç) — 'sinif'/'bire_bir_haftalik' taslakları
// haftanın GÜNÜNE göre tekrar eder (veri.gun), 'bire_bir_tekil'/'soru_cozumu'
// ise belirli bir TARİHE bağlıdır (veri.tarih). Çakışma varsa açıklama metni,
// yoksa null döner.
function taslakCakismasiAciklamasi(taslaklar, { ogretmenId, sinifId, ogrenciId, gun, tarih, baslangic, bitis }) {
  for (const t of taslaklar || []) {
    const v = t.veri || {}
    if (!v.baslangic_saat || !v.bitis_saat) continue
    const gunEslesiyor = t.tur === 'sinif' || t.tur === 'bire_bir_haftalik' ? v.gun === gun : v.tarih === tarih
    if (!gunEslesiyor) continue
    if (!araliklarCakisiyorMu(baslangic, bitis, v.baslangic_saat, v.bitis_saat)) continue
    if (ogretmenId && v.ogretmen_profile_id === ogretmenId) {
      const turAdi = t.tur === 'sinif' ? 'sınıf dersi' : t.tur === 'soru_cozumu' ? 'soru çözümü' : 'bire bir ders'
      return `Bu öğretmenin bu saatte zaten bekleyen bir taslağı var (${turAdi}).`
    }
    if (sinifId && t.tur === 'sinif' && v.sinif_id === sinifId) {
      return 'Bu sınıfın bu saatte zaten bekleyen bir taslağı var.'
    }
    if (ogrenciId && (t.tur === 'bire_bir_haftalik' || t.tur === 'bire_bir_tekil') && v.ogrenci_id === ogrenciId) {
      return 'Bu öğrencinin bu saatte zaten bekleyen bir taslağı var.'
    }
  }
  return null
}

function gunNumaraTarihten(tarihStr) {
  if (!tarihStr) return null
  const g = new Date(tarihStr + 'T12:00:00').getDay()
  return g === 0 ? 7 : g
}

function gunEkle(tarihStr, gunSayisi) {
  const t = new Date(tarihStr + 'T12:00:00')
  t.setDate(t.getDate() + gunSayisi)
  return t.toISOString().slice(0, 10)
}

function yerelBugunTarihi() {
  const simdi = new Date()
  return `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, '0')}-${String(simdi.getDate()).padStart(2, '0')}`
}

function yerelSuankiSaatDakika() {
  const simdi = new Date()
  return `${String(simdi.getHours()).padStart(2, '0')}:${String(simdi.getMinutes()).padStart(2, '0')}`
}

// Sütun başlıkları artık serbest 30dk dilimler DEĞİL, okulun gerçek sabit
// ders periyotları (45dk ders + 10dk teneffüs, bkz. dersPeriyotlari.js).
const SAAT_DILIMLERI = DERS_PERIYOTLARI

export default function MusaitlikTablosu({
  ogretmenler,
  dersProgrami,
  atamalar,
  yoklamalar,
  ogrenciAdMap,
  onHucreTikla,
  secili,
  // Aşağıdaki 3 prop OPSİYONEL — sadece Ders Programı sayfasındaki "Ders Ekleme
  // Aracı" bu şekilde kullanır (Bire Bir sayfası bunları hiç geçmez, oradaki
  // davranış eskisi gibi aynen kalır). true ise, boş bir hücreye tıklandığında
  // ESKİ davranışa (onHucreTikla ile aşağıdaki forma yönlendirme) EK OLARAK,
  // hücrenin üzerinde küçük bir "hızlı ekle" kutusu açılır: öğrenci ya da sınıf
  // adı yazılıp listeden seçilince (serbest yazılan, eşleşmeyen bir isim kabul
  // edilmez) direkt o saate ders eklenir.
  ogrenciler = [],
  siniflar = [],
  hizliEkleEtkin = false,
  onHizliEklendi,
  // Opsiyonel — verilirse, Hızlı Ekle ile bir öğrenciye bire bir ders
  // eklenirken, o öğrencinin kendi sınıfının aynı gün/saatte dersi olup
  // olmadığı da kontrol edilir (manuel "Bire Bir Ders Ekle" formundaki sarı
  // "⚠ Uyarı" ile aynı davranış — kullanıcı isteğiyle eklendi: bu uyarı daha
  // önce sadece manuel formda çıkıyor, Hızlı Ekle'de hiç çıkmıyordu).
  sinifOgrencileri = [],
  // Taslak Modu — sayfa üstündeki aç/kapa anahtarı açıkken (hem taslakModuAcik
  // hem aktifPlanAdi doluyken) "Hızlı Ekle" ile eklenen HER ders (soru çözümü,
  // sınıf, öğrenci) canlı tabloya değil, taslaklar tablosuna, aktifPlanAdi ile
  // isimlendirilmiş TEK bir plana kaydedilir. taslaklar propu, bekleyen diğer
  // taslaklarla da çakışma kontrolü yapabilmek için veriliyor (opsiyonel —
  // sadece Ders Programı sayfası bunu geçer, bkz. dosya başındaki genel not).
  taslakModuAcik = false,
  aktifPlanAdi = '',
  taslaklar = [],
  // Opsiyonel — bu tabloda gösterilen tarih değiştikçe (◀/▶ ok ya da tarih
  // kutusu) üst sayfaya haber verir. Ör. DersProgrami.jsx/BireBir.jsx bunu
  // kullanarak, altındaki "Ders Ekle" formunun tarih/gün alanını buradaki
  // tarihle otomatik aynı tutar (kullanıcı isteğiyle eklendi — müsaitlik
  // tablosunda tarihi değiştirince, aşağıdaki formun da elle değiştirmeye
  // gerek kalmadan aynı tarihe/güne geçmesi isteniyor).
  onTarihDegisti,
  // Opsiyonel — verilirse, dolu bir SINIF DERSİ hücresinin üzerine gelince
  // küçük bir "✕" silme butonu belirir (Sınıflar > o sınıfa girip Ders
  // Saatleri listesinden aramaya gerek kalmadan, buradan direkt silinebilsin
  // diye — kullanıcı isteğiyle eklendi). Bire bir/soru çözümü/taslak
  // hücrelerine bilerek dokunulmuyor, onların kendi yönetim ekranları var.
  onSinifDersiSil,
  // Opsiyonel — verilirse, dolu bir SINIF DERSİ hücresindeki ✏️ butonuna
  // tıklanınca çağrılır (id ile) — sayfa bunu, mevcut "Düzenle" akışına
  // (aşağıdaki forma kaydırma) yönlendirmek için kullanır. Sınıf dersinin
  // sınıf/ders adı/öğretmen gibi çok alanı olduğu için burada küçük bir
  // popup açmak yerine, zaten var olan tam formu kullanmak daha güvenilir.
  onSinifDersiGuncelle,
}) {
  const { profile } = useAuth()
  // Sayfa açık bırakılıp gece yarısı geçildiğinde, hâlâ "bugün"e bakılıyorsa
  // (kullanıcı elle başka bir tarihe geçmediyse) gösterilen tarih otomatik
  // yeni güne ilerlesin diye — bkz. lib/bugununTarihi.js (kullanıcı isteğiyle
  // eklendi: sayfa açık kalınca hep önceki günü göstermeye devam ediyordu).
  const bugununTarihi = useBugununTarihi()
  const oncekiBugunRef = useRef(bugununTarihi)
  const [tarih, setTarih] = useState(bugununTarihi)
  useEffect(() => {
    if (bugununTarihi !== oncekiBugunRef.current) {
      setTarih((mevcut) => (mevcut === oncekiBugunRef.current ? bugununTarihi : mevcut))
      oncekiBugunRef.current = bugununTarihi
    }
  }, [bugununTarihi])
  const gun = gunNumaraTarihten(tarih)

  useEffect(() => {
    onTarihDegisti && onTarihDegisti(tarih)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarih])

  // Taslak Modu'nda "geçen hafta bu saatte tek seferlik bir bire-bir ders var
  // mıydı" sorusunu cevaplamak için, seçili tarihten TAM 1 HAFTA ÖNCESİNİN
  // (aynı haftanın günü) tek seferlik (atama_id boş) bire_bir_yoklama
  // kayıtlarını ayrıca çekiyoruz — yoklamalar propu sadece SEÇİLİ tarihe göre
  // geldiği için (üst sayfa öyle sorguluyor), geçmiş haftanın verisi onda
  // bulunmuyor. Sadece Taslak Modu bir plana bağlıyken anlamlı olduğundan,
  // gereksiz sorgu atmamak için sadece o zaman çekiyoruz.
  const [gecenHaftaYoklamalari, setGecenHaftaYoklamalari] = useState([])
  useEffect(() => {
    if (!taslakModuAcik || !aktifPlanAdi) {
      setGecenHaftaYoklamalari([])
      return
    }
    let iptalEdildi = false
    const gecenHaftaTarihi = gunEkle(tarih, -7)
    supabase
      .from('bire_bir_yoklama')
      .select('id, ogretmen_profile_id, ogrenci_id, baslangic_saat, bitis_saat, tur, durum, tarih')
      .is('atama_id', null)
      .eq('tarih', gecenHaftaTarihi)
      .then(({ data, error }) => {
        if (!iptalEdildi && !error) setGecenHaftaYoklamalari(data || [])
      })
    return () => {
      iptalEdildi = true
    }
  }, [tarih, taslakModuAcik, aktifPlanAdi])

  // "Hızlı Ekle" kutusu — bkz. yukarıdaki hizliEkleEtkin açıklaması.
  const [hizliPopup, setHizliPopup] = useState(null)
  const [aramaMetni, setAramaMetni] = useState('')
  const [secilen, setSecilen] = useState(null) // { tur: 'ogrenci'|'sinif', id, ad }
  const [ucret, setUcret] = useState('')
  const [hpHata, setHpHata] = useState('')
  const [hpGonderiliyor, setHpGonderiliyor] = useState(false)
  // Sınıf dersi çakışması SERT bir hata değil (hpHata gibi engellemiyor),
  // sadece "Evet, yine de ekle" ile geçilebilen bir uyarı — bkz.
  // ogrenciSinifDersiUyarisiBul.
  const [hpSinifUyarisi, setHpSinifUyarisi] = useState('')

  // Öğrenci/sınıf arama kutusu — sadece "autoFocus" prop'una güvenmiyoruz,
  // çünkü hücreye tıklayınca aynı click event'i içinde yeni DOM'a eklenen
  // input bazı tarayıcı/React sürümlerinde otomatik odaklanmıyor (kullanıcı
  // ekstra bir kez daha tıklamak zorunda kalıyordu). Popup hangi hücrede
  // açıksa (hizliPopup değiştiğinde) input'u elle odaklıyoruz.
  // GERÇEK KÖK NEDEN (bir öncekinden farklı, daha derin bir sorun): hücreye
  // tıklanınca YUKARIDAKİ onHucreTikla de AYNI ANDA çağrılıyor — bu, alttaki
  // "Yeni Ders Saati Ekle" / "Bire Bir Ders Ekle" formunu da dolduruyor ve o
  // formun KENDİ useEffect'i (doldurBilgisi değişince) kendi "Sınıf" seçim
  // kutusuna odaklanıyor (sinifSelectRef.current?.focus()). İki bileşenin
  // effect'leri AYNI render turunda çalıştığı için, DersEkleForm/
  // BireBirDersEkleForm ağaçta bizden SONRA render edildiğinden onun odak
  // çağrısı bizimkini eziyor — biz odaklanır odaklanmaz hemen form çalıp
  // alıyordu, kullanıcı ekstra tıklayana kadar hiçbir şey yazamıyordu. Çözüm:
  // kendi odaklanmamızı bir sonraki "tick"e (setTimeout 0) erteleyip, diğer
  // effect'lerin senkron aşaması bittikten SONRA çalışmasını, yani her zaman
  // EN SON biz kazanacak şekilde garanti ediyoruz.
  const hizliInputRef = useRef(null)
  useEffect(() => {
    if (hizliPopup && !secilen) {
      const zamanlayici = setTimeout(() => {
        hizliInputRef.current?.focus()
      }, 0)
      return () => clearTimeout(zamanlayici)
    }
  }, [hizliPopup, secilen])

  function hizliPopupKapat() {
    setHizliPopup(null)
    setAramaMetni('')
    setSecilen(null)
    setUcret('')
    setHpHata('')
    setHpSinifUyarisi('')
  }

  // Sınıf dersi uyarısı gösterilirken "Evet, yine de ekle" — hard/çakışma
  // kontrolleri hizliKaydet(true) içinde yine çalışır, sadece sınıf dersi
  // uyarısı tekrar sorulmaz.
  function hpSinifUyarisinaRagmenEkle() {
    setHpSinifUyarisi('')
    hizliKaydet(true)
  }

  // "Yönetim" popup'ı — dolu bir bire bir/soru çözümü hücresindeki ✏️ ikonuna
  // tıklanınca açılır; saat (ve bire bir/tekil derslerde ayrıca ücret)
  // düzeltilip kaydedilebilir. Sınıf dersleri için ayrı bir popup açmaya
  // gerek yok — onlar zaten aşağıdaki "Ders Ekleme Aracı" formuna
  // yönlendiriliyor (bkz. onSinifDersiGuncelle).
  const [yonetimPopup, setYonetimPopup] = useState(null) // { ogretmenId, tarih, baslangic, kayit }
  const [ymBaslangic, setYmBaslangic] = useState('')
  const [ymBitis, setYmBitis] = useState('')
  const [ymTutar, setYmTutar] = useState('')
  const [ymHata, setYmHata] = useState('')
  const [ymGonderiliyor, setYmGonderiliyor] = useState(false)

  function yonetimPopupAc(ogretmenId, tarih, baslangicSutun, kayit) {
    setYonetimPopup({ ogretmenId, tarih, baslangic: baslangicSutun, kayit })
    setYmBaslangic(saatKisalt(kayit.baslangic))
    setYmBitis(saatKisalt(kayit.bitis))
    setYmTutar(kayit.tutar != null ? String(kayit.tutar) : '')
    setYmHata('')
  }

  function yonetimPopupKapat() {
    setYonetimPopup(null)
    setYmHata('')
  }

  async function yonetimKaydet() {
    if (!yonetimPopup) return
    const { kayit } = yonetimPopup
    if (!ymBaslangic || !ymBitis || ymBaslangic >= ymBitis) {
      setYmHata('Başlangıç saati bitiş saatinden önce olmalı.')
      return
    }
    setYmGonderiliyor(true)
    // Bekleyen bir taslak (henüz canlıya/başka bir tabloya yazılmamış) —
    // taslaklar tablosunda saat bilgisi düz kolon değil, "veri" jsonb'si
    // içinde tutuluyor, o yüzden burada ayrı bir güncelleme şekli gerekiyor:
    // diğer alanları (sinif_id, ders_adi, ogrenci_id, tarih/gun vb.) olduğu
    // gibi koruyup sadece baslangic_saat/bitis_saat'i güncelliyoruz.
    if (kayit.kaynak === 'taslaklar') {
      const { error } = await supabase
        .from('taslaklar')
        .update({ veri: { ...kayit.veri, baslangic_saat: ymBaslangic, bitis_saat: ymBitis } })
        .eq('id', kayit.id)
      setYmGonderiliyor(false)
      if (error) {
        setYmHata('Hata: ' + error.message)
        return
      }
      yonetimPopupKapat()
      onHizliEklendi && onHizliEklendi()
      return
    }
    const guncelleme = { baslangic_saat: ymBaslangic, bitis_saat: ymBitis }
    if (kayit.kaynak === 'bire_bir_atamalari' || (kayit.kaynak === 'bire_bir_yoklama' && !kayit.soruCozumuMu)) {
      if (!ymTutar || Number(ymTutar) <= 0) {
        setYmHata('Lütfen geçerli bir ücret girin.')
        setYmGonderiliyor(false)
        return
      }
      guncelleme.tutar = Number(ymTutar)
      // bire_bir_atamalari tablosunda ücret kolonu "ders_ucreti", bire_bir_yoklama'da "tutar".
      if (kayit.kaynak === 'bire_bir_atamalari') {
        delete guncelleme.tutar
        guncelleme.ders_ucreti = Number(ymTutar)
      }
    }
    const { error } = await supabase.from(kayit.kaynak).update(guncelleme).eq('id', kayit.id)
    setYmGonderiliyor(false)
    if (error) {
      setYmHata('Hata: ' + error.message)
      return
    }
    yonetimPopupKapat()
    onHizliEklendi && onHizliEklendi()
  }

  async function yonetimSil(kayit) {
    // Taslak Modu açıkken, hücrenin rengi taslak (amber, kesik çizgili) mi
    // yoksa CANLI (turuncu/mor, düz çizgili) mi olduğu ekranda kolayca
    // karışabiliyor — ikisi de görsel olarak birbirine yakın. Kullanıcı bir
    // taslağı sildiğini sanıp yanlışlıkla canlı bir kaydı silmesin diye,
    // Taslak Modu açıkken canlı (taslaklar DIŞI) bir kayıt siliniyorsa uyarıyı
    // özellikle "bu bir taslak DEĞİL, gerçek/canlı bir kayıt" diye başlatıyoruz.
    const canliUyariOnEki =
      taslakModuAcik && kayit.kaynak !== 'taslaklar'
        ? '⚠️ DİKKAT: Bu bir taslak DEĞİL, CANLI/gerçek bir kayıt! Taslak Modu açık olsa bile bu kayıt hemen ve kalıcı olarak silinecek.\n\n'
        : ''
    const mesaj =
      canliUyariOnEki +
      (kayit.kaynak === 'taslaklar'
        ? 'Bu taslağı iptal etmek istediğinize emin misiniz?'
        : kayit.kaynak === 'bire_bir_atamalari'
        ? 'Bu atamayı ve tüm yoklama geçmişini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.'
        : kayit.soruCozumuMu
        ? 'Bu Soru Çözümü seansını silmek istediğinize emin misiniz?'
        : 'Bu dersi silmek istediğinize emin misiniz?')
    if (!confirm(mesaj)) return
    const { error } = await supabase.from(kayit.kaynak).delete().eq('id', kayit.id)
    if (error) {
      alert('Hata: ' + error.message)
      return
    }
    onHizliEklendi && onHizliEklendi()
  }

  // Yazılan metne göre öğrenci + sınıf önerileri (en fazla 6'şar tane).
  const oneriler = useMemo(() => {
    const q = aramaMetni.trim().toLocaleLowerCase('tr')
    if (!q) return []
    const sinifSonuc = (siniflar || [])
      .filter((s) => s.ad?.toLocaleLowerCase('tr').includes(q))
      .slice(0, 6)
      .map((s) => ({ tur: 'sinif', id: s.id, ad: s.ad }))
    const ogrenciSonuc = (ogrenciler || [])
      .filter((o) => o.ad_soyad?.toLocaleLowerCase('tr').includes(q))
      .slice(0, 6)
      .map((o) => ({ tur: 'ogrenci', id: o.id, ad: o.ad_soyad }))
    return [...sinifSonuc, ...ogrenciSonuc]
  }, [aramaMetni, ogrenciler, siniflar])

  // Bu öğrenci-öğretmen ikilisi için daha önce kullanılmış bir ücret varsa
  // (önce haftalık atamalara, yoksa geçmiş tek seferlik derslere bakarak) önerir.
  function ucretOner(ogrenciId, ogretmenId) {
    const atamaEslesen = (atamalar || []).find((a) => a.ogrenci_id === ogrenciId && a.ogretmen_profile_id === ogretmenId)
    if (atamaEslesen) return atamaEslesen.ders_ucreti
    const gecmis = (yoklamalar || [])
      .filter((y) => !y.atama_id && y.ogrenci_id === ogrenciId && y.ogretmen_profile_id === ogretmenId && y.tutar != null)
      .sort((a, b) => (a.tarih < b.tarih ? 1 : a.tarih > b.tarih ? -1 : 0))
    return gecmis.length > 0 ? gecmis[0].tutar : null
  }

  function oneriSecildi(op) {
    setSecilen(op)
    setAramaMetni(op.ad)
    setHpHata('')
    if (op.tur === 'ogrenci') {
      const oner = ucretOner(op.id, hizliPopup.ogretmenId)
      setUcret(oner != null ? String(oner) : '')
    }
  }

  // zorlaEkle=true, sınıf dersi uyarısı gösterildikten sonra kullanıcı "Evet,
  // yine de ekle" derse geçilir — o durumda uyarı kontrolü tekrar
  // ÇALIŞTIRILMAZ (aynı çakışma tekrar sorulup dursun istemiyoruz), ama
  // yukarıdaki hard/sert kontroller (öğrencinin başka dersi var mı gibi) yine
  // de tekrar çalışır — zararsız, veriler bu kısa süre içinde değişmemiştir.
  async function hizliKaydet(zorlaEkle = false) {
    if (!hizliPopup || !secilen) return
    setHpHata('')
    if (!zorlaEkle) setHpSinifUyarisi('')

    // Taslak Modu anahtarı AÇIKKEN plan adı boş bırakılırsa, eskiden burada
    // sessizce CANLI tabloya yazılıyordu (kullanıcı anahtarın açık göründüğünü
    // görüp taslağa gittiğini sanıyor, oysa direkt yayınlanıyordu) — bu artık
    // KESİN olarak engelleniyor: anahtar açıkken plan adı yoksa hiçbir şey
    // eklenmez, açık ve net bir hata gösterilir. Anahtar açıkken TEK yol,
    // canlıya ya da taslağa gitmek değil, önce bir plan adı yazmaktır.
    if (taslakModuAcik && !aktifPlanAdi) {
      setHpHata('Taslak Modu açık — devam etmeden önce sayfanın üstündeki kutuya bir plan adı yazın (yoksa hiçbir yere eklenmez).')
      return
    }

    // Geçmiş bir tarih için taslak oluşturmak mantıksız (o gün zaten geçti) —
    // kullanıcı isteğiyle engellendi. Sadece Taslak Modu'nda kontrol ediyoruz;
    // canlı (anlık) ekleme geçmişe dönük düzeltme amaçlı hâlâ mümkün.
    if (taslakModuAcik && aktifPlanAdi && hizliPopup.tarih && hizliPopup.tarih < bugununTarihi) {
      setHpHata('Geçmiş bir tarih için taslak oluşturulamaz. Lütfen bugün veya daha ileri bir tarih seçin.')
      return
    }

    // Taslak Modu: sayfa üstündeki anahtar açık VE bir plan adı girilmişse,
    // aşağıdaki 3 dalın hiçbiri canlı tabloya yazmaz — hepsi taslaklar
    // tablosuna, aynı plan_adi ile kaydedilir (bkz. dosya başındaki not).
    const taslakModuEtkin = taslakModuAcik && !!aktifPlanAdi
    // Taslak-vs-taslak çakışma kontrolü SADECE aynı plana ait taslaklara karşı
    // yapılır — farklı isimli planlar birbirinden bağımsızdır, "fafa" planına
    // eklerken "deneme" planındaki bir taslakla asla çakışma sayılmaz.
    const buPlanaAitTaslaklar = taslakModuEtkin ? (taslaklar || []).filter((t) => t.plan_adi === aktifPlanAdi) : []

    if (secilen.tur === 'soru_cozumu') {
      // Soru Çözümü: öğrenciye bağlı değil, fiyatlandırılmaz — sadece öğretmen +
      // tarih + saat kaydedilir. Öğretmenin ekstresinde görünsün diye
      // bire_bir_yoklama'ya "tur: soru_cozumu" ile, ücretsiz bir satır olarak
      // eklenir (bkz. ekstreHesap.js bireBirBorclariOlustur — bu tur asla
      // borç oluşturmaz).
      if (taslakModuEtkin) {
        const cakisma = taslakCakismasiAciklamasi(buPlanaAitTaslaklar, {
          ogretmenId: hizliPopup.ogretmenId,
          gun: hizliPopup.gun,
          tarih: hizliPopup.tarih,
          baslangic: hizliPopup.baslangic,
          bitis: hizliPopup.bitis,
        })
        if (cakisma) {
          setHpHata(cakisma)
          return
        }
        setHpGonderiliyor(true)
        const { error } = await supabase.from('taslaklar').insert({
          tur: 'soru_cozumu',
          veri: {
            ogretmen_profile_id: hizliPopup.ogretmenId,
            tarih: hizliPopup.tarih,
            baslangic_saat: hizliPopup.baslangic,
            bitis_saat: hizliPopup.bitis,
          },
          olusturan_profile_id: profile?.id,
          plan_adi: aktifPlanAdi || null,
        })
        setHpGonderiliyor(false)
        if (error) {
          setHpHata('Hata: ' + error.message)
          return
        }
      } else {
        setHpGonderiliyor(true)
        const { error } = await supabase.from('bire_bir_yoklama').insert({
          ogretmen_profile_id: hizliPopup.ogretmenId,
          tur: 'soru_cozumu',
          tutar: 0,
          tarih: hizliPopup.tarih,
          durum: 'geldi',
          baslangic_saat: hizliPopup.baslangic,
          bitis_saat: hizliPopup.bitis,
        })
        setHpGonderiliyor(false)
        if (error) {
          setHpHata('Hata: ' + error.message)
          return
        }
      }
    } else if (secilen.tur === 'sinif') {
      // Bu sınıfın bu gün/saatte (farklı bir öğretmenle bile olsa) başka dersi
      // var mı? Bu kontrol taslak modunda da anlamlı (canlı program hâlâ
      // canlı program), o yüzden HER İKİ modda da çalışır.
      //
      // İSTİSNA: aktif planda bu ders için bekleyen bir "sinif_kaldir"
      // (kaldırma) taslağı varsa, artık bu dersi "hâlâ orada" sayıp çakışma
      // vermiyoruz — kullanıcı zaten o dersi kaldırmak üzere işaretlemiş,
      // üzerine yeni bir ders/taslak ekleyebilmeli.
      const kaldirilacakDersIdleri = new Set(
        (taslakModuAcik && aktifPlanAdi ? taslaklar || [] : [])
          .filter((t) => t.tur === 'sinif_kaldir' && t.plan_adi === aktifPlanAdi)
          .map((t) => t.veri?.ders_programi_id)
          .filter(Boolean)
      )
      const cakisan = (dersProgrami || []).find(
        (d) =>
          d.sinif_id === secilen.id &&
          d.gun === hizliPopup.gun &&
          !kaldirilacakDersIdleri.has(d.id) &&
          araliklarCakisiyorMu(hizliPopup.baslangic, hizliPopup.bitis, d.baslangic_saat, d.bitis_saat)
      )
      if (cakisan) {
        setHpHata(`Bu sınıfın bu saatte zaten "${cakisan.ders_adi || cakisan.sinif_adi || 'bir'}" dersi var.`)
        return
      }
      if (taslakModuEtkin) {
        const taslakCakisma = taslakCakismasiAciklamasi(buPlanaAitTaslaklar, {
          ogretmenId: hizliPopup.ogretmenId,
          sinifId: secilen.id,
          gun: hizliPopup.gun,
          tarih: hizliPopup.tarih,
          baslangic: hizliPopup.baslangic,
          bitis: hizliPopup.bitis,
        })
        if (taslakCakisma) {
          setHpHata(taslakCakisma)
          return
        }
        setHpGonderiliyor(true)
        const { error } = await supabase.from('taslaklar').insert({
          tur: 'sinif',
          veri: {
            sinif_id: secilen.id,
            ders_adi: null,
            ogretmen_profile_id: hizliPopup.ogretmenId,
            gun: hizliPopup.gun,
            baslangic_saat: hizliPopup.baslangic,
            bitis_saat: hizliPopup.bitis,
          },
          olusturan_profile_id: profile?.id,
          plan_adi: aktifPlanAdi || null,
        })
        setHpGonderiliyor(false)
        if (error) {
          setHpHata('Hata: ' + error.message)
          return
        }
      } else {
        setHpGonderiliyor(true)
        const { error } = await supabase.from('ders_programi').insert({
          sinif_id: secilen.id,
          ders_adi: null,
          ogretmen_profile_id: hizliPopup.ogretmenId,
          gun: hizliPopup.gun,
          baslangic_saat: hizliPopup.baslangic,
          bitis_saat: hizliPopup.bitis,
        })
        setHpGonderiliyor(false)
        if (error) {
          setHpHata('Hata: ' + error.message)
          return
        }
      }
    } else {
      if (!ucret || Number(ucret) <= 0) {
        setHpHata('Lütfen geçerli bir ücret girin.')
        return
      }
      // Bu öğrencinin bu saatte (haftalık atama ya da tek seferlik) başka dersi
      // var mı? Canlı verilere karşı kontrol her iki modda da çalışır.
      const atamaCakisan = (atamalar || []).find(
        (a) =>
          a.ogrenci_id === secilen.id &&
          a.aktif &&
          a.gun === hizliPopup.gun &&
          araliklarCakisiyorMu(hizliPopup.baslangic, hizliPopup.bitis, a.baslangic_saat, a.bitis_saat)
      )
      const tekSeferlikCakisan = (yoklamalar || []).find(
        (y) =>
          y.ogrenci_id === secilen.id &&
          y.tarih === hizliPopup.tarih &&
          y.baslangic_saat &&
          y.bitis_saat &&
          araliklarCakisiyorMu(hizliPopup.baslangic, hizliPopup.bitis, y.baslangic_saat, y.bitis_saat)
      )
      if (atamaCakisan || tekSeferlikCakisan) {
        setHpHata('Bu öğrencinin bu saatte başka bir dersi var.')
        return
      }
      // Sınıf dersiyle çakışma SERT bir engel değil, sadece uyarı — manuel
      // "Bire Bir Ders Ekle" formundaki "Evet, yine de ekle" ile aynı davranış
      // (bkz. dosya başındaki ogrenciSinifDersiUyarisiBul).
      if (!zorlaEkle) {
        const sinifUyari = ogrenciSinifDersiUyarisiBul(
          secilen.id,
          hizliPopup.gun,
          hizliPopup.baslangic,
          hizliPopup.bitis,
          dersProgrami,
          sinifOgrencileri
        )
        if (sinifUyari) {
          setHpSinifUyarisi(sinifUyari.aciklama)
          return
        }
      }
      if (taslakModuEtkin) {
        const taslakCakisma = taslakCakismasiAciklamasi(buPlanaAitTaslaklar, {
          ogretmenId: hizliPopup.ogretmenId,
          ogrenciId: secilen.id,
          gun: hizliPopup.gun,
          tarih: hizliPopup.tarih,
          baslangic: hizliPopup.baslangic,
          bitis: hizliPopup.bitis,
        })
        if (taslakCakisma) {
          setHpHata(taslakCakisma)
          return
        }
        setHpGonderiliyor(true)
        // Hızlı Ekle her zaman belirli bir TARİHE bağlı olduğu için (haftalık
        // tekrar eden bir atama değil), taslak her zaman 'bire_bir_tekil'
        // türünde kaydedilir — BireBir.jsx'teki "Hayır, sadece bu sefer"
        // taslağıyla AYNI veri şekli (ogrenci_id, ogretmen_profile_id, tutar,
        // tarih, baslangic_saat, bitis_saat).
        const { error } = await supabase.from('taslaklar').insert({
          tur: 'bire_bir_tekil',
          veri: {
            ogrenci_id: secilen.id,
            ogretmen_profile_id: hizliPopup.ogretmenId,
            tutar: Number(ucret),
            tarih: hizliPopup.tarih,
            baslangic_saat: hizliPopup.baslangic,
            bitis_saat: hizliPopup.bitis,
          },
          olusturan_profile_id: profile?.id,
          plan_adi: aktifPlanAdi || null,
        })
        setHpGonderiliyor(false)
        if (error) {
          setHpHata('Hata: ' + error.message)
          return
        }
      } else {
        const ileriTarihli =
          hizliPopup.tarih > yerelBugunTarihi() ||
          (hizliPopup.tarih === yerelBugunTarihi() && hizliPopup.baslangic > yerelSuankiSaatDakika())
        setHpGonderiliyor(true)
        const { error } = await supabase.from('bire_bir_yoklama').insert({
          ogrenci_id: secilen.id,
          ogretmen_profile_id: hizliPopup.ogretmenId,
          tutar: Number(ucret),
          tarih: hizliPopup.tarih,
          durum: ileriTarihli ? 'bekliyor' : 'geldi',
          baslangic_saat: hizliPopup.baslangic,
          bitis_saat: hizliPopup.bitis,
        })
        setHpGonderiliyor(false)
        if (error) {
          setHpHata('Hata: ' + error.message)
          return
        }
      }
    }

    hizliPopupKapat()
    onHizliEklendi && onHizliEklendi()
  }

  // Taslak Modu'ndaki bir planın "hangi tarihten itibaren geçerli" olduğu —
  // hem ders_programi/kaldirilacak hesaplamasında hem de aşağıdaki "geçen
  // haftanın echo'sunu taslak ipucusu gibi göster" kuralında ortak kullanılıyor.
  // 'sinif'/'sinif_kaldir' taslaklarının KENDİ tarihi yok — sadece haftanın
  // günü var, o yüzden hiç kısıtlanmazsa BUGÜN dahil o güne denk gelen HER
  // haftanın gerçek dersini gizleyip yerine taslağı gösterirdi (yaşanan
  // gerçek vaka: "17-23 Ağustos Programı" adlı, gelecek haftaya ait bir plan,
  // taslak modu açılır açılmaz BUGÜNÜN — aynı gün adını taşıdığı için —
  // gerçek dersini "Kaldırılacak" gösterip yerine taslağı koydu). Planda hiç
  // tarihli taslak yoksa (saf sınıf-dersi planı) bugünden itibaren göster
  // (eski davranış), ama geçmişe asla sızdırma.
  const planBuTarihteGecerli = useMemo(() => {
    const planTarihliTaslaklar = (taslakModuAcik && aktifPlanAdi ? taslaklar || [] : []).filter(
      (t) => t.plan_adi === aktifPlanAdi && t.veri?.tarih
    )
    const planBaslangicTarihi =
      planTarihliTaslaklar.length > 0
        ? planTarihliTaslaklar.reduce((min, t) => (t.veri.tarih < min ? t.veri.tarih : min), planTarihliTaslaklar[0].veri.tarih)
        : bugununTarihi
    return tarih >= planBaslangicTarihi
  }, [taslakModuAcik, aktifPlanAdi, taslaklar, tarih, bugununTarihi])

  // Taslak Modu açık, bir plan seçili VE gösterilen tarih o planın geçerli
  // olduğu aralıktaysa — bu üç şart birden sağlanınca "geçen haftanın
  // echo'su" (hem sınıf dersi hem tek seferlik bire-bir) artık KESİN bir
  // blokaj değil, sadece soluk gri bir HATIRLATMA: hücre boş sayılır,
  // tıklanıp üzerine başka bir şey planlanabilir. Kullanıcı isteğiyle:
  // taslak yaparken hiçbir şey henüz "kesin" değil, sınıf dersi dahil —
  // gerçek çakışma koruması (aynı sınıfın/öğrencinin ikinci kez eklenmesi)
  // yine de hizliKaydet() içindeki kontrollerle korunuyor, sadece bu görsel
  // katman "dolu" görünümünü kaldırıyor.
  const taslakIpucuAktif = taslakModuAcik && !!aktifPlanAdi && planBuTarihteGecerli

  // Her öğretmen için, seçilen tarihteki tüm dolu aralıkları (kaynağı ne olursa
  // olsun) tek listede topluyoruz.
  const ogretmenMesguliyetleri = useMemo(() => {
    const harita = new Map()
    for (const o of ogretmenler) harita.set(o.id, [])

    // Taslak Modu açıkken, aktif plana ait "sinif_kaldir" (kaldırma) taslağı
    // olan ders_programi satırları — bunlar henüz GERÇEKTEN silinmedi (o
    // ancak taslak yayınlanınca olur) ama kullanıcı bu hücrenin üzerine hemen
    // yeni bir ders/taslak ekleyebilsin istiyor. Bu yüzden bu satırları normal
    // "dolu" gibi bloke etmek yerine ayrı bir görünüm+tıklanabilir hâle
    // getiriyoruz (bkz. aşağıdaki push ve JSX'teki kaldirilacak kontrolü).
    const kaldirilacakDersIdleri = new Set(
      (taslakIpucuAktif ? taslaklar || [] : [])
        .filter((t) => t.tur === 'sinif_kaldir' && t.plan_adi === aktifPlanAdi)
        .map((t) => t.veri?.ders_programi_id)
        .filter(Boolean)
    )

    for (const d of dersProgrami) {
      if (d.gun !== gun || !harita.has(d.ogretmen_profile_id)) continue
      const kaldirilacakMi = kaldirilacakDersIdleri.has(d.id)
      // Taslak Modu'nda (bkz. yukarıdaki taslakIpucuAktif) sınıf dersi artık
      // kesin bir blokaj değil, soluk gri bir hatırlatma — kaldırılacak
      // işaretliyse zaten kendi (kırmızı) görünümü öncelikli, o durumda ipucu
      // görünümüne çevirmiyoruz.
      const ipucuMu = taslakIpucuAktif && !kaldirilacakMi
      harita.get(d.ogretmen_profile_id).push({
        baslangic: d.baslangic_saat,
        bitis: d.bitis_saat,
        // Öğretmen adı zaten satırda göründüğü için hangi dersi/branşı olduğu
        // belli oluyor — burada asıl bilinmek istenen HANGİ SINIFA girdiği,
        // o yüzden önce sınıf adı, o yoksa (bire bir ya da isimsiz kayıt) ders
        // adı gösteriliyor.
        etiket: (kaldirilacakMi ? '❌ ' : '') + (d.sinif_adi || d.ders_adi || 'Sınıf dersi'),
        renk: kaldirilacakMi
          ? 'bg-red-100 text-red-700 border-l-4 border-l-red-500 border-dashed line-through'
          : ipucuMu
          ? 'bg-gray-100 text-gray-400 border-l-4 border-l-gray-300 border-dashed italic'
          : 'bg-blue-200 text-blue-900 border-l-4 border-l-blue-600',
        id: d.id,
        kaynak: 'ders_programi',
        kaldirilacak: kaldirilacakMi,
        ipucuMu,
      })
    }
    for (const a of atamalar || []) {
      if (!a.aktif || a.gun !== gun || !harita.has(a.ogretmen_profile_id)) continue
      harita.get(a.ogretmen_profile_id).push({
        baslangic: a.baslangic_saat,
        bitis: a.bitis_saat,
        etiket: a.ogrenci_adi || 'Bire bir',
        // ÖNEMLİ DÜZELTME: "orange" Tailwind renk sınıfları (hangi ton olursa
        // olsun — 200, 300, hiç fark etmiyor) bu sitede hiç render olmuyor
        // (muhtemelen tailwind.config.js'teki özel renk paletinde "orange"
        // hiç tanımlı değil — bkz. "seciliMi" için kullanılan ring-orange-400
        // de aynı şekilde hiç görünmüyordu). Bunu tekrar tahmin etmek yerine,
        // Bire bir'in rengini artık Tailwind sınıfı OLARAK DEĞİL, doğrudan
        // satır-içi (inline) stil olarak veriyoruz — bu, Tailwind'in hangi
        // renkleri ürettiğinden tamamen bağımsız olduğu için KESİN çalışır.
        renk: 'border-l-4',
        stil: { backgroundColor: '#fed7aa', color: '#431407', borderLeftColor: '#c2410c' },
        id: a.id,
        kaynak: 'bire_bir_atamalari',
        tutar: a.ders_ucreti,
      })
    }
    for (const y of yoklamalar || []) {
      if (y.atama_id || y.tarih !== tarih || !y.baslangic_saat || !y.bitis_saat) continue
      if (y.durum === 'gelmedi') continue // öğrenci gelmediyse o saat artık boş sayılır
      if (!harita.has(y.ogretmen_profile_id)) continue
      // Soru Çözümü: öğrenciye bağlı olmadığı için ogrenciAdMap'te karşılığı
      // yok — eskiden bu yüzden genel "Bire bir" etiketine düşüyordu, kafa
      // karıştırıyordu. Ayrı bir etiket ve renk (mor, Hızlı Ekle'deki 🧠
      // butonuyla aynı ton) ile gerçek bire bir derslerden ayırıyoruz.
      const soruCozumuMu = y.tur === 'soru_cozumu'
      harita.get(y.ogretmen_profile_id).push({
        baslangic: y.baslangic_saat,
        bitis: y.bitis_saat,
        etiket: soruCozumuMu ? 'Soru Çözümü' : (ogrenciAdMap && ogrenciAdMap.get(y.ogrenci_id)) || 'Bire bir',
        renk: soruCozumuMu ? 'bg-purple-200 text-purple-900 border-l-4 border-l-purple-600' : 'border-l-4',
        stil: soruCozumuMu ? null : { backgroundColor: '#fed7aa', color: '#431407', borderLeftColor: '#c2410c' },
        id: y.id,
        kaynak: 'bire_bir_yoklama',
        tutar: soruCozumuMu ? null : y.tutar,
        soruCozumuMu,
      })
    }
    // Bekleyen TASLAKLAR — "taslağa ekleyince o saat hala boş görünüyor, aynı
    // saate bir daha eklemek isteyebilirim ama unutabilirim" karışıklığını
    // önlemek için, henüz yayınlanmamış taslaklar da (ayrı, "taslak" rengiyle)
    // dolu sayılıyor. 'sinif'/'bire_bir_haftalik' taslakları haftanın GÜNÜNE
    // göre (v.gun), 'bire_bir_tekil'/'soru_cozumu' ise belirli bir TARİHE göre
    // (v.tarih) bu günle eşleşip eşleşmediği kontrol edilir.
    //
    // ÖNEMLİ: farklı isimli planlar birbirinden TAMAMEN BAĞIMSIZDIR — sadece
    // şu an üstteki kutuda yazılı olan aktif plana (aktifPlanAdi) ait
    // taslaklar burada "dolu" gösterilir. Başka bir plandaki (ör. "deneme")
    // taslaklar, siz "fafa" planı üzerinde çalışırken hiç görünmez/karışmaz.
    // Aktif bir plan yoksa (Taslak Modu kapalı ya da plan adı henüz
    // yazılmamışsa) hiç taslak overlay'i gösterilmez.
    // "sinif_kaldir" taslakları burada hariç tutuluyor — onlar bir EKLEME
    // değil, yukarıda ayrıca işlenen bir KALDIRMA taslağı, bu overlay
    // döngüsüne dahil edilirse yanlışlıkla "Bire bir" gibi görünürlerdi.
    const aktifPlanaAitTaslaklar = taslakIpucuAktif
      ? (taslaklar || []).filter((t) => t.plan_adi === aktifPlanAdi && t.tur !== 'sinif_kaldir')
      : []
    for (const t of aktifPlanaAitTaslaklar) {
      const v = t.veri || {}
      if (!v.baslangic_saat || !v.bitis_saat || !v.ogretmen_profile_id) continue
      const gunEslesiyor = t.tur === 'sinif' || t.tur === 'bire_bir_haftalik' ? v.gun === gun : v.tarih === tarih
      if (!gunEslesiyor || !harita.has(v.ogretmen_profile_id)) continue
      // "Taslak: " ön eki eskiden buraya da yazılıyordu ama hücrede yer
      // kaplıyordu — artık sadece renk (amber, kesik çizgili) taslak olduğunu
      // gösteriyor, isim düz yazılıyor (canlı hücrelerle aynı biçimde).
      let etiket
      if (t.tur === 'sinif') {
        const sinifAdi = (siniflar || []).find((s) => s.id === v.sinif_id)?.ad
        etiket = v.ders_adi || sinifAdi || 'Sınıf'
      } else if (t.tur === 'soru_cozumu') {
        etiket = 'Soru Çözümü'
      } else {
        etiket = (ogrenciler || []).find((o) => o.id === v.ogrenci_id)?.ad_soyad || 'Bire bir'
      }
      harita.get(v.ogretmen_profile_id).push({
        baslangic: v.baslangic_saat,
        bitis: v.bitis_saat,
        etiket,
        renk: 'bg-amber-100 text-amber-900 border-l-4 border-l-amber-500 border-dashed',
        // id/kaynak/veri: bekleyen taslağı hücrenin üzerinden de (Taslaklarım
        // listesine gitmeden) düzenleyip silebilmek için — bkz. aşağıdaki
        // yonetimPopupAc/yonetimKaydet/yonetimSil, "taslaklar" kaynağı için
        // özel dallar eklendi.
        id: t.id,
        kaynak: 'taslaklar',
        veri: v,
      })
    }
    return harita
  }, [ogretmenler, dersProgrami, atamalar, yoklamalar, gun, tarih, ogrenciAdMap, taslaklar, siniflar, ogrenciler, taslakModuAcik, aktifPlanAdi, bugununTarihi, taslakIpucuAktif])

  // Geçen haftanın AYNI GÜNÜNDE var olan tek seferlik (atama_id boş) bire-bir
  // dersler — sadece taslakIpucuAktif iken (bkz. yukarısı) hücre boşsa bir
  // "geçen hafta burada X vardı" hatırlatması olarak gösterilir. Gerçek bir
  // ders DEĞİL — tıklanıp normal şekilde yeniden eklenebilir ya da hiç
  // dokunulmadan bırakılabilir, öğrenciye/veliye/başka hiçbir yerde asla
  // görünmez (sadece bu tablodaki geçici bir render, hiçbir tabloya yazılmaz).
  const gecenHaftaMesguliyetleri = useMemo(() => {
    const harita = new Map()
    for (const o of ogretmenler) harita.set(o.id, [])
    if (!taslakIpucuAktif) return harita
    for (const y of gecenHaftaYoklamalari) {
      if (!y.baslangic_saat || !y.bitis_saat || !harita.has(y.ogretmen_profile_id)) continue
      if (y.durum === 'gelmedi') continue
      const soruCozumuMu = y.tur === 'soru_cozumu'
      harita.get(y.ogretmen_profile_id).push({
        baslangic: y.baslangic_saat,
        bitis: y.bitis_saat,
        etiket: (soruCozumuMu ? 'Soru Çözümü' : (ogrenciAdMap && ogrenciAdMap.get(y.ogrenci_id)) || 'Bire bir') + ' (geçen hafta)',
        renk: 'bg-gray-100 text-gray-400 border-l-4 border-l-gray-300 border-dashed italic',
        ipucuMu: true,
      })
    }
    return harita
  }, [ogretmenler, gecenHaftaYoklamalari, ogrenciAdMap, taslakIpucuAktif])

  function hucreDurumu(ogretmenId, dilim) {
    const mesguliyetler = ogretmenMesguliyetleri.get(ogretmenId) || []
    const cakisanlar = mesguliyetler.filter((m) => araliklarCakisiyorMu(dilim.baslangic, dilim.bitis, m.baslangic, m.bitis))
    if (cakisanlar.length > 0) {
      // Aynı saatte hem "kaldırılacak" (üstü çizili, henüz gerçekten silinmemiş)
      // eski bir ders HEM DE onun üzerine yeni eklenen bir taslak varsa, eski
      // (kaldırılacak) olanı göstermeye devam etmek kafa karıştırır — kullanıcı
      // "ekledim ama görünmüyor" sanır. Bu yüzden YENİ eklenen taslak/ders varsa
      // o öne çıkar, kaldırılacak/ipucu olan sadece başka bir şey yoksa gösterilir.
      return (
        cakisanlar.find((m) => !m.kaldirilacak && !m.ipucuMu) ||
        cakisanlar.find((m) => !m.kaldirilacak) ||
        cakisanlar[0]
      )
    }
    if (!taslakIpucuAktif) return undefined
    const gecenHafta = gecenHaftaMesguliyetleri.get(ogretmenId) || []
    return gecenHafta.find((m) => araliklarCakisiyorMu(dilim.baslangic, dilim.bitis, m.baslangic, m.bitis))
  }

  // Aynı ders/atama, 30 dakikalık birden fazla sütuna yayılıyorsa (ör. 2 saatlik
  // bire bir ders 4 sütunü kaplıyorsa), her sütunda ismi tekrar tekrar basmak
  // yerine ardışık sütunları TEK hücrede birleştiriyoruz (colSpan) ve o hücrede
  // dersin gerçek başlangıç-bitiş saatini yazıyoruz. Böylece bir ders 45 dakika
  // sürüp bir sonraki 30'luk süturu tam doldurmasa bile, gerçek bitiş saati
  // hücrenin içinde açıkça görünür.
  function satirHucreleriniOlustur(ogretmenId) {
    const hucreler = []
    let i = 0
    while (i < SAAT_DILIMLERI.length) {
      const dilim = SAAT_DILIMLERI[i]
      const dolu = hucreDurumu(ogretmenId, dilim)
      let span = 1
      if (dolu) {
        while (
          i + span < SAAT_DILIMLERI.length &&
          hucreDurumu(ogretmenId, SAAT_DILIMLERI[i + span]) === dolu
        ) {
          span++
        }
      }
      hucreler.push({ baslangic: dilim.baslangic, bitis: dilim.bitis, span, dolu })
      i += span
    }
    return hucreler
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-gray-700">Günlük Müsaitlik</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Hangi öğretmenin hangi saatte dersi var, hangisi boş — tek bakışta.
            {onHucreTikla && ' Boş bir hücreye tıklayarak o saate direkt ders ekleyebilirsiniz'}
            {hizliEkleEtkin ? ' — açılan kutuya öğrenci ya da sınıf adı yazıp seçebilir, ya da aşağıdaki formu kullanabilirsiniz.' : onHucreTikla ? '.' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setTarih((t) => gunEkle(t, -1))} className="px-2 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100">
            ◀
          </button>
          <input
            type="date"
            value={tarih}
            onChange={(e) => setTarih(e.target.value)}
            className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
          />
          <button type="button" onClick={() => setTarih((t) => gunEkle(t, 1))} className="px-2 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100">
            ▶
          </button>
          <span className="text-xs text-gray-400 whitespace-nowrap">{GUNLER[gun]}</span>
        </div>
      </div>
      <div className="overflow-x-auto" style={{ touchAction: 'pan-x pan-y' }}>
        <table className="border-collapse text-xs w-full">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-navy text-white px-3 py-2 text-left font-semibold min-w-[150px]">
                Öğretmen
              </th>
              {SAAT_DILIMLERI.map((d) => (
                <th key={d.baslangic} className="bg-navy text-white px-1 py-2 font-medium border-l border-white/10 min-w-[46px]">
                  <span className="block">{saatGoster(d.baslangic)}</span>
                  <span className="block text-[9px] font-normal opacity-70">{saatGoster(d.bitis)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ogretmenler.map((o, i) => {
              const hucreler = satirHucreleriniOlustur(o.id)
              return (
                <tr key={o.id} className={i % 2 ? 'bg-gray-50/60' : ''}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-semibold text-gray-700 border-t border-gray-100 whitespace-nowrap">
                    {o.ad_soyad}
                  </td>
                  {hucreler.map((h) => {
                    // "kaldirilacak" = taslak modunda kaldırılmak üzere işaretlenmiş
                    // ama henüz gerçekten silinmemiş bir ders_programi hücresi —
                    // normal dolu hücrelerin aksine bu hâlâ tıklanabilir/eklenebilir.
                    // "ipucuMu" = geçen haftanın echo'su. Sınıf dersi echo'su
                    // (kaynak: 'ders_programi') KALICI olarak zaten her hafta
                    // otomatik tekrarlanıyor — üzerine "ekle" denince "zaten
                    // var" hatası vermesi kafa karıştırıyordu, o yüzden onun
                    // hücre gövdesi ARTIK tıklanabilir DEĞİL (sadece rengi
                    // soluk gri). Değiştirmek/kaldırmak isteyen aşağıdaki ✏️/✕
                    // hover butonlarını kullanır (mevcut Düzenle/Sil akışı).
                    // Tek seferlik bire-bir/soru çözümü echo'su ise (kaynak
                    // yok) gerçekten YOK ve yeniden eklenmesi gerekebileceği
                    // için o hâlâ tıklanabilir.
                    const ipucuTiklanabilirMi = h.dolu?.ipucuMu && h.dolu?.kaynak !== 'ders_programi'
                    const tiklanabilir = (!h.dolu || h.dolu.kaldirilacak || ipucuTiklanabilirMi) && !!onHucreTikla
                    const seciliMi =
                      (!h.dolu || h.dolu.kaldirilacak || ipucuTiklanabilirMi) &&
                      secili &&
                      secili.ogretmenId === o.id &&
                      secili.tarih === tarih &&
                      secili.baslangic === h.baslangic
                    const hizliPopupBuradaMi =
                      hizliEkleEtkin &&
                      hizliPopup &&
                      hizliPopup.ogretmenId === o.id &&
                      hizliPopup.tarih === tarih &&
                      hizliPopup.baslangic === h.baslangic
                    const yonetimPopupBuradaMi =
                      yonetimPopup &&
                      yonetimPopup.ogretmenId === o.id &&
                      yonetimPopup.tarih === tarih &&
                      yonetimPopup.baslangic === h.baslangic
                    return (
                      <td
                        key={h.baslangic}
                        colSpan={h.span}
                        title={
                          h.dolu && ipucuTiklanabilirMi
                            ? `${h.dolu.etiket} — geçen hafta bu saatteydi, sadece hatırlatma amaçlı gösteriliyor. Tıklayarak farklı bir şey planlayabilir ya da hiç dokunmayabilirsiniz.`
                            : h.dolu && !h.dolu.kaldirilacak
                            ? `${h.dolu.etiket} (${saatGoster(h.dolu.baslangic)}–${saatGoster(h.dolu.bitis)})`
                            : seciliMi
                            ? 'Şu an bunu ekliyorsunuz'
                            : tiklanabilir
                            ? 'Boş — tıklayarak ders ekle'
                            : 'Boş'
                        }
                        onClick={
                          tiklanabilir
                            ? () => {
                                onHucreTikla({ ogretmenId: o.id, ogretmenAdi: o.ad_soyad, tarih, gun, baslangic: h.baslangic, bitis: h.bitis })
                                if (hizliEkleEtkin) {
                                  setHizliPopup({ ogretmenId: o.id, ogretmenAdi: o.ad_soyad, tarih, gun, baslangic: h.baslangic, bitis: h.bitis })
                                  setAramaMetni('')
                                  setSecilen(null)
                                  setUcret('')
                                  setHpHata('')
                                }
                              }
                            : undefined
                        }
                        className={`group relative border-t border-l border-gray-100 text-center align-middle py-1 ${
                          h.dolu && !h.dolu.kaldirilacak
                            ? h.dolu.renk + (ipucuTiklanabilirMi ? ' cursor-pointer hover:bg-gray-200 transition-colors' : '')
                            : seciliMi
                            ? 'bg-navy text-white h-8 cursor-pointer ring-2 ring-inset'
                            : tiklanabilir
                            ? 'bg-green-50 h-8 cursor-pointer hover:bg-green-200 transition-colors'
                            : 'bg-green-50 h-8'
                        }`}
                        style={
                          h.dolu && !h.dolu.kaldirilacak && !ipucuTiklanabilirMi
                            ? h.dolu.stil
                            : seciliMi
                            ? { boxShadow: 'inset 0 0 0 2px #fb923c' }
                            : undefined
                        }
                      >
                        {h.dolu && !h.dolu.kaldirilacak ? (
                          <span className="leading-none block px-0.5">
                            {h.dolu.kaynak === 'ders_programi' && onSinifDersiSil && (
                              <div className="absolute top-0 right-0 flex opacity-0 group-hover:opacity-100 transition-opacity">
                                {onSinifDersiGuncelle && (
                                  <button
                                    type="button"
                                    title="Bu ders saatini güncelle"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      onSinifDersiGuncelle(h.dolu.id)
                                    }}
                                    className="w-3.5 h-3.5 leading-none flex items-center justify-center bg-blue-600 text-white text-[8px]"
                                  >
                                    ✏
                                  </button>
                                )}
                                <button
                                  type="button"
                                  title="Bu ders saatini sil"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onSinifDersiSil(h.dolu.id)
                                  }}
                                  className="w-3.5 h-3.5 leading-none flex items-center justify-center rounded-bl bg-red-600 text-white text-[9px]"
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                            {(h.dolu.kaynak === 'bire_bir_atamalari' ||
                              h.dolu.kaynak === 'bire_bir_yoklama' ||
                              h.dolu.kaynak === 'taslaklar') &&
                              !h.dolu.ipucuMu && (
                              <div className="absolute top-0 right-0 flex opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  title="Güncelle"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    yonetimPopupAc(o.id, tarih, h.baslangic, h.dolu)
                                  }}
                                  className="w-3.5 h-3.5 leading-none flex items-center justify-center bg-blue-600 text-white text-[8px]"
                                >
                                  ✏
                                </button>
                                <button
                                  type="button"
                                  title="Sil"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    yonetimSil(h.dolu)
                                  }}
                                  className="w-3.5 h-3.5 leading-none flex items-center justify-center rounded-bl bg-red-600 text-white text-[9px]"
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                            <span className="block truncate text-[11px] font-semibold">{h.dolu.etiket}</span>
                            {/* Saat, sütun başlığındaki periyotla (h.baslangic/h.bitis) BİREBİR
                                aynıysa tekrar yazmıyoruz — zaten sütun başlığında görünüyor.
                                Farklıysa (ör. ders manuel olarak periyot dışı bir saate girildiyse,
                                ya da ders birden fazla periyotu kaplayıp gerçek bitişi ilk periyodun
                                bitişinden farklıysa) fark fark edilsin diye saat burada da gösterilir. */}
                            {(saatKisalt(h.dolu.baslangic) !== h.baslangic || saatKisalt(h.dolu.bitis) !== h.bitis) && (
                              <span className="block text-[9px] opacity-70 whitespace-nowrap">
                                {saatGoster(h.dolu.baslangic)}–{saatGoster(h.dolu.bitis)}
                              </span>
                            )}
                          </span>
                        ) : seciliMi ? (
                          <span className="text-[9px] font-semibold">●</span>
                        ) : (
                          ''
                        )}

                        {hizliPopupBuradaMi && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute z-30 top-full left-1/2 -translate-x-1/2 mt-1 w-60 bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-left cursor-default normal-case text-gray-700"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[11px] font-semibold text-gray-500">
                                Hızlı Ekle · {saatGoster(hizliPopup.baslangic)}–{saatGoster(hizliPopup.bitis)}
                              </span>
                              <button type="button" onClick={hizliPopupKapat} className="text-gray-300 hover:text-gray-500 text-sm leading-none">
                                ✕
                              </button>
                            </div>
                            {taslakModuAcik && aktifPlanAdi && (
                              <p className="text-[10px] font-medium text-orange-600 bg-orange-50 border border-orange-100 rounded px-1.5 py-1 mb-1.5">
                                📋 Taslak Modu açık — "{aktifPlanAdi}" planına eklenecek
                              </p>
                            )}
                            {taslakModuAcik && !aktifPlanAdi && (
                              <p className="text-[10px] font-medium text-red-600 bg-red-50 border border-red-100 rounded px-1.5 py-1 mb-1.5">
                                ⚠ Taslak Modu açık ama plan adı boş — önce sayfanın üstüne bir plan adı yazın, yoksa ekleyemezsiniz.
                              </p>
                            )}
                            {!secilen ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => oneriSecildi({ tur: 'soru_cozumu', id: null, ad: 'Soru Çözümü' })}
                                  className="w-full text-left px-2 py-1.5 mb-1.5 rounded-lg text-xs font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-100"
                                >
                                  🧠 Soru Çözümü olarak ekle
                                </button>
                                <input
                                  ref={hizliInputRef}
                                  autoFocus
                                  type="text"
                                  value={aramaMetni}
                                  onChange={(e) => {
                                    setAramaMetni(e.target.value)
                                    setHpHata('')
                                  }}
                                  placeholder="Öğrenci ya da sınıf adı yazın."
                                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs mb-1 font-normal"
                                />
                                {aramaMetni.trim().length > 0 && (
                                  <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                                    {oneriler.length === 0 && <p className="px-2 py-1.5 text-[11px] text-gray-400 font-normal">Eşleşme yok.</p>}
                                    {oneriler.map((op) => (
                                      <button
                                        key={`${op.tur}-${op.id}`}
                                        type="button"
                                        onClick={() => oneriSecildi(op)}
                                        className="w-full text-left px-2 py-1.5 text-xs font-normal hover:bg-gray-50"
                                      >
                                        {op.tur === 'ogrenci' ? '🎓 ' : '🏫 '}
                                        {op.ad}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                <p className="text-xs font-medium text-gray-700 mb-1.5">
                                  {secilen.tur === 'ogrenci' ? '🎓 ' : secilen.tur === 'sinif' ? '🏫 ' : '🧠 '}
                                  {secilen.ad}
                                </p>
                                {secilen.tur === 'ogrenci' && (
                                  <input
                                    type="number"
                                    value={ucret}
                                    onChange={(e) => setUcret(e.target.value)}
                                    placeholder="Ders ücreti"
                                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs mb-1.5 font-normal"
                                  />
                                )}
                                {hpHata && <p className="text-[11px] text-red-500 mb-1.5 font-normal">{hpHata}</p>}
                                {hpSinifUyarisi ? (
                                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-1">
                                    <p className="text-[11px] text-yellow-800 font-normal mb-1.5">
                                      ⚠ {hpSinifUyarisi}. Yine de eklemek ister misiniz?
                                    </p>
                                    <div className="flex gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => setHpSinifUyarisi('')}
                                        className="flex-1 px-2 py-1.5 rounded-lg text-xs text-gray-500 bg-white border border-gray-200 hover:bg-gray-50"
                                      >
                                        Vazgeç
                                      </button>
                                      <button
                                        type="button"
                                        disabled={hpGonderiliyor}
                                        onClick={hpSinifUyarisinaRagmenEkle}
                                        className="flex-1 px-2 py-1.5 rounded-lg text-xs text-white bg-orange hover:opacity-90 disabled:opacity-50"
                                      >
                                        {hpGonderiliyor ? 'Ekleniyor...' : 'Evet, yine de ekle'}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSecilen(null)
                                        setAramaMetni('')
                                      }}
                                      className="flex-1 px-2 py-1.5 rounded-lg text-xs text-gray-500 bg-gray-50 hover:bg-gray-100"
                                    >
                                      Geri
                                    </button>
                                    <button
                                      type="button"
                                      disabled={hpGonderiliyor || (secilen.tur === 'ogrenci' && !ucret)}
                                      onClick={() => hizliKaydet()}
                                      className="flex-1 px-2 py-1.5 rounded-lg text-xs text-white bg-navy hover:bg-navy/90 disabled:opacity-50"
                                    >
                                      {hpGonderiliyor ? 'Ekleniyor...' : taslakModuAcik && aktifPlanAdi ? 'Plana Ekle' : 'Ekle'}
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}

                        {yonetimPopupBuradaMi && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute z-30 top-full left-1/2 -translate-x-1/2 mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-left cursor-default normal-case text-gray-700"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[11px] font-semibold text-gray-500">
                                {yonetimPopup.kayit.etiket} Güncelle
                              </span>
                              <button type="button" onClick={yonetimPopupKapat} className="text-gray-300 hover:text-gray-500 text-sm leading-none">
                                ✕
                              </button>
                            </div>
                            <div className="flex gap-1.5 mb-1.5">
                              <input
                                type="time"
                                value={ymBaslangic}
                                onChange={(e) => setYmBaslangic(e.target.value)}
                                className="w-1/2 px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-normal"
                              />
                              <input
                                type="time"
                                value={ymBitis}
                                onChange={(e) => setYmBitis(e.target.value)}
                                className="w-1/2 px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-normal"
                              />
                            </div>
                            {(yonetimPopup.kayit.kaynak === 'bire_bir_atamalari' ||
                              (yonetimPopup.kayit.kaynak === 'bire_bir_yoklama' && !yonetimPopup.kayit.soruCozumuMu)) && (
                              <input
                                type="number"
                                value={ymTutar}
                                onChange={(e) => setYmTutar(e.target.value)}
                                placeholder="Ders ücreti"
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs mb-1.5 font-normal"
                              />
                            )}
                            {ymHata && <p className="text-[11px] text-red-500 mb-1.5 font-normal">{ymHata}</p>}
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={yonetimPopupKapat}
                                className="flex-1 px-2 py-1.5 rounded-lg text-xs text-gray-500 bg-gray-50 hover:bg-gray-100"
                              >
                                Vazgeç
                              </button>
                              <button
                                type="button"
                                disabled={ymGonderiliyor}
                                onClick={yonetimKaydet}
                                className="flex-1 px-2 py-1.5 rounded-lg text-xs text-white bg-navy hover:bg-navy/90 disabled:opacity-50"
                              >
                                {ymGonderiliyor ? 'Kaydediliyor...' : 'Kaydet'}
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {ogretmenler.length === 0 && (
              <tr>
                <td colSpan={SAAT_DILIMLERI.length + 1} className="px-4 py-4 text-center text-gray-400">
                  Öğretmen bulunamadı.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4 text-[11px] text-gray-500 flex-wrap">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-50 border border-green-200 inline-block"></span> Boş
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-200 border-l-4 border-l-blue-600 inline-block"></span> Sınıf dersi
        </span>
        <span className="flex items-center gap-1">
          <span
            className="w-3 h-3 rounded border-l-4 inline-block"
            style={{ backgroundColor: '#fed7aa', borderLeftColor: '#c2410c' }}
          ></span> Bire bir
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-purple-200 border-l-4 border-l-purple-600 inline-block"></span> Soru Çözümü
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-100 border-l-4 border-l-amber-500 border border-dashed inline-block"></span> Taslak (henüz yayınlanmadı)
        </span>
        {taslakIpucuAktif && (
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-gray-100 border-l-4 border-l-gray-300 border border-dashed inline-block"></span> Geçen hafta — sınıf dersi otomatik devam eder (değiştirmek için ✏️/✕), bire-bir/soru çözümü sadece hatırlatma (tıklayıp ekleyebilirsiniz)
          </span>
        )}
      </div>
    </div>
  )
}
