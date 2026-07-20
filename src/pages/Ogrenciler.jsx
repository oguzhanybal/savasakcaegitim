import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { adSoyadDuzelt, ilkHarfleriBuyukYap, kullaniciAdiOner } from '../lib/adSoyadFormat'
import { telefonYerelGoster } from '../lib/telefonFormat'
import TelefonInput from '../components/TelefonInput'

// Okulun kendi kayıt formuyla (SAVAŞ AKÇA ÖĞRENCİ KAYIT FORMU) BİREBİR aynı
// başlıklar — form her yeni öğrenci geldiğinde zaten dolduruluyor, burada da
// aynı alanlar bulunsun diye.
const BOS_FORM = {
  ad_soyad: '',
  tc_kimlik_no: '',
  dogum_tarihi: '',
  telefon: '',
  sinif_ve_alan: '',
  okul: '',
  anne_adi_soyadi: '',
  anne_telefon: '',
  baba_adi_soyadi: '',
  baba_telefon: '',
  adres: '',
  notlar: '',
}

function ogrenciyiFormaCevir(o) {
  return {
    ad_soyad: o.ad_soyad || '',
    tc_kimlik_no: o.tc_kimlik_no || '',
    dogum_tarihi: o.dogum_tarihi || '',
    telefon: o.telefon || '',
    sinif_ve_alan: o.sinif_ve_alan || '',
    okul: o.okul || '',
    anne_adi_soyadi: o.anne_adi_soyadi || '',
    anne_telefon: o.anne_telefon || '',
    baba_adi_soyadi: o.baba_adi_soyadi || '',
    baba_telefon: o.baba_telefon || '',
    adres: o.adres || '',
    notlar: o.notlar || '',
  }
}

// Veli hesabının "Hoş geldiniz, ..." ekranında görünecek ismi için üç seçenek
// üretir — anne kayıtlıysa anne adı, baba kayıtlıysa baba adı, ikisi de yoksa
// (ya da admin özellikle genel bir isim istiyorsa) "{Öğrenci Adı} Veli Hesabı"
// gibi nötr bir isim. Hem otomatik veli hesabı oluştururken hem de sonradan
// "Veli İsmini Değiştir" ile kullanılan ORTAK fonksiyon — böylece ikisinde de
// aynı üç seçenek, aynı sırada görünür.
function veliGorunenIsimSecenekleri(o) {
  return {
    anne: o.anne_adi_soyadi || null,
    baba: o.baba_adi_soyadi || null,
    hesap: `${o.ad_soyad} Veli Hesabı`,
  }
}

// anne/baba'dan hangisi varsa onu varsayılan seçili getirir (ikisi de varsa
// baba — Sözleşme.jsx'teki "ikisi de kayıtlıysa baba düzenlenebilir varsayılan"
// deseniyle aynı mantık); hiçbiri yoksa nötr "Veli Hesabı" seçeneğine düşer.
function veliGorunenIsimVarsayilanSecim(secenekler) {
  if (secenekler.baba) return 'baba'
  if (secenekler.anne) return 'anne'
  return 'hesap'
}

// Otomatik veli hesabı oluştururken VE sonradan ismi değiştirirken kullanılan
// ortak 3'lü seçim arayüzü (radyo düğmeleri). Kayıtlı olmayan (anne ya da
// baba adı boş) seçenekler hiç gösterilmez — seçilemeyen bir seçeneği
// göstermenin anlamı yok.
function VeliGorunenIsimSecici({ o, secim, setSecim }) {
  const secenekler = veliGorunenIsimSecenekleri(o)
  return (
    <div className="flex flex-wrap gap-3 mt-1.5">
      {secenekler.anne && (
        <label className="flex items-center gap-1.5 text-xs text-gray-600 select-none">
          <input type="radio" checked={secim === 'anne'} onChange={() => setSecim('anne')} />
          Anne — {secenekler.anne}
        </label>
      )}
      {secenekler.baba && (
        <label className="flex items-center gap-1.5 text-xs text-gray-600 select-none">
          <input type="radio" checked={secim === 'baba'} onChange={() => setSecim('baba')} />
          Baba — {secenekler.baba}
        </label>
      )}
      <label className="flex items-center gap-1.5 text-xs text-gray-600 select-none">
        <input type="radio" checked={secim === 'hesap'} onChange={() => setSecim('hesap')} />
        Veli Hesabı — {secenekler.hesap}
      </label>
    </div>
  )
}

// Hem "Öğrenci Ekle" formunda hem "Düzenle" satırında AYNI alan setini
// tekrar tekrar yazmamak için ortak bir alan grubu — kayıt formundaki
// sırayla: öğrenci bilgileri, veli (anne/baba) bilgileri, notlar.
function KayitFormuAlanlari({ form, alanGuncelle, boyut = 'normal' }) {
  const girdiSinifi =
    boyut === 'kucuk'
      ? 'w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue'
      : 'w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue'
  const etiketSinifi = boyut === 'kucuk' ? 'block text-xs font-medium text-gray-500 mb-1' : 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Öğrenci Bilgileri</p>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className={etiketSinifi}>Öğrenci Adı Soyadı</label>
            <input
              value={form.ad_soyad}
              onChange={(e) => alanGuncelle('ad_soyad', e.target.value)}
              className={girdiSinifi}
              placeholder="Ad Soyad"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className={etiketSinifi}>T.C. Kimlik No</label>
            <input
              value={form.tc_kimlik_no}
              onChange={(e) => alanGuncelle('tc_kimlik_no', e.target.value)}
              className={girdiSinifi}
              placeholder="11 haneli TC No"
              maxLength={11}
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className={etiketSinifi}>Doğum Tarihi</label>
            <input
              type="date"
              value={form.dogum_tarihi}
              onChange={(e) => alanGuncelle('dogum_tarihi', e.target.value)}
              className={girdiSinifi}
            />
          </div>
          <div className="flex-1 min-w-[170px]">
            <label className={etiketSinifi}>Öğrenci Telefonu</label>
            <TelefonInput
              value={form.telefon}
              onChange={(v) => alanGuncelle('telefon', v)}
              girdiSinifi={girdiSinifi}
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className={etiketSinifi}>Sınıfı ve Alanı</label>
            <input
              value={form.sinif_ve_alan}
              onChange={(e) => alanGuncelle('sinif_ve_alan', e.target.value)}
              className={girdiSinifi}
              placeholder="örn. 11-Sayısal"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className={etiketSinifi}>Okulu</label>
            <input
              value={form.okul}
              onChange={(e) => alanGuncelle('okul', e.target.value)}
              className={girdiSinifi}
              placeholder="örn. ODTÜ Koleji"
            />
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Veli Bilgileri</p>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className={etiketSinifi}>Anne Adı Soyadı</label>
            <input
              value={form.anne_adi_soyadi}
              onChange={(e) => alanGuncelle('anne_adi_soyadi', e.target.value)}
              className={girdiSinifi}
            />
          </div>
          <div className="flex-1 min-w-[170px]">
            <label className={etiketSinifi}>Anne Telefonu</label>
            <TelefonInput
              value={form.anne_telefon}
              onChange={(v) => alanGuncelle('anne_telefon', v)}
              girdiSinifi={girdiSinifi}
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className={etiketSinifi}>Baba Adı Soyadı</label>
            <input
              value={form.baba_adi_soyadi}
              onChange={(e) => alanGuncelle('baba_adi_soyadi', e.target.value)}
              className={girdiSinifi}
            />
          </div>
          <div className="flex-1 min-w-[170px]">
            <label className={etiketSinifi}>Baba Telefonu</label>
            <TelefonInput
              value={form.baba_telefon}
              onChange={(v) => alanGuncelle('baba_telefon', v)}
              girdiSinifi={girdiSinifi}
            />
          </div>
          <div className="flex-[2] min-w-[220px]">
            <label className={etiketSinifi}>Adres</label>
            <input
              value={form.adres}
              onChange={(e) => alanGuncelle('adres', e.target.value)}
              className={girdiSinifi}
            />
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notlar</p>
        <textarea
          value={form.notlar}
          onChange={(e) => alanGuncelle('notlar', e.target.value)}
          rows={2}
          placeholder="Görüş, öneri veya eklemek istediğiniz diğer hususlar (opsiyonel)"
          className={girdiSinifi}
        />
      </div>
    </div>
  )
}

export default function Ogrenciler() {
  const [ogrenciler, setOgrenciler] = useState([])
  const [veliler, setVeliler] = useState([])
  const [ogrenciHesaplari, setOgrenciHesaplari] = useState([])
  const [loading, setLoading] = useState(true)
  const [yeniForm, setYeniForm] = useState(BOS_FORM)
  const [ekleniyor, setEkleniyor] = useState(false)
  const [filtre, setFiltre] = useState('aktif') // aktif | pasif | tumu
  const [duzenlenenId, setDuzenlenenId] = useState(null)
  const [duzenleForm, setDuzenleForm] = useState(BOS_FORM)
  const [veliBaglanan, setVeliBaglanan] = useState(null)
  const [seciliVeli, setSeciliVeli] = useState('')
  const [ogrenciHesabiBaglanan, setOgrenciHesabiBaglanan] = useState(null)
  const [seciliOgrenciHesabi, setSeciliOgrenciHesabi] = useState('')
  // Fatura Ortağı — ör. ikiz kardeşler: ders programı/bire bir dersleri ayrı
  // ayrı kalır, ama biri "fatura_sahibi_id" ile diğerine bağlanınca tüm
  // borç/ödemesi o kişinin ekstresinde toplanır (bkz. Muhasebe.jsx/Ekstre.jsx).
  const [faturaBaglanan, setFaturaBaglanan] = useState(null)
  const [seciliFaturaSahibi, setSeciliFaturaSahibi] = useState('')
  // "Öğrenci Ekle" formunda işaretliyse, kayıt tamamlandığı anda otomatik
  // hesap önerisi satırı açılır (kullanıcı adı isimden, şifre varsayılan
  // "123456" — ikisi de onaylamadan önce değiştirilebilir) — "teker teker
  // hesap açmak zor" isteğine karşılık, tek adımda hem kayıt hem giriş
  // açılabilsin diye.
  const [otomatikHesapAc, setOtomatikHesapAc] = useState(true)
  // Hangi öğrenci satırında "Otomatik Hesap Oluştur" önizleme/düzenleme
  // satırı açık — kullanıcı adı ve şifre ONAYLANMADAN önce değiştirilebilsin
  // diye (bkz. "değiştirebiliyor muyum" isteği), diğer "X Bağla" akışlarıyla
  // aynı satır-içi düzenleme deseni kullanılıyor.
  const [otomatikHesapBaglanan, setOtomatikHesapBaglanan] = useState(null)
  const [otomatikKullaniciAdi, setOtomatikKullaniciAdi] = useState('')
  const [otomatikSifre, setOtomatikSifre] = useState('')
  const [otomatikHesapIslemde, setOtomatikHesapIslemde] = useState(false)
  // Okulun tüm öğrencilerine tek tip, hatırlaması kolay bir varsayılan şifre
  // verilsin isteniyor — admin isterse satırda değiştirebilir, istemezse hep
  // bu değer önerilir. Öğrenci daha sonra "Şifremi Değiştir" sayfasından
  // kendi şifresini değiştirebilir.
  const VARSAYILAN_SIFRE = '123456'
  // "Otomatik Veli Hesabı Oluştur" — öğrenci akışıyla BİREBİR aynı önizleme/
  // onay deseni, tek farkı: kullanıcı adı sonuna "veli" eklenir (ör.
  // "yigitatikveli") ve görünen isim (profiles.ad_soyad, "Hoş geldiniz, ..."
  // ekranında görünür) anne/baba/"Veli Hesabı" arasından seçiliyor —
  // bkz. VeliGorunenIsimSecici.
  const [otomatikVeliBaglanan, setOtomatikVeliBaglanan] = useState(null)
  const [otomatikVeliKullaniciAdi, setOtomatikVeliKullaniciAdi] = useState('')
  const [otomatikVeliSifre, setOtomatikVeliSifre] = useState('')
  const [otomatikVeliGorunenIsimSecim, setOtomatikVeliGorunenIsimSecim] = useState('hesap')
  const [otomatikVeliIslemde, setOtomatikVeliIslemde] = useState(false)
  // "Veli İsmini Değiştir" — hesap ZATEN bağlıyken, görünen ismi (anne/baba/
  // Veli Hesabı arasında) sonradan değiştirebilmek için. Ör. "baba daha çok
  // ilgileniyor, anneden baba adına geçireyim" gibi durumlar için.
  const [veliIsimDegistiren, setVeliIsimDegistiren] = useState(null)
  const [veliIsimGuncelSecim, setVeliIsimGuncelSecim] = useState('hesap')
  const [veliIsimIslemde, setVeliIsimIslemde] = useState(false)

  async function yukle() {
    setLoading(true)
    const [o, v, oh] = await Promise.all([
      supabase
        .from('ogrenciler')
        .select('*, veli:veli_profile_id(ad_soyad), ogrenci_hesabi:ogrenci_profile_id(ad_soyad), fatura_sahibi:fatura_sahibi_id(ad_soyad)')
        .order('ad_soyad'),
      supabase.from('profiles').select('*').eq('rol', 'veli').order('ad_soyad'),
      // "Öğrenci" rolüyle giriş yapan hesaplar — bir öğrenci kaydına bağlanmazsa
      // (ogrenci_profile_id boş kalırsa) o hesap giriş yapabilir ama kendi
      // bilgilerinden hiçbirini göremez, bu yüzden bağlama arayüzü şart.
      supabase.from('profiles').select('*').eq('rol', 'ogrenci').order('ad_soyad'),
    ])
    setOgrenciler(o.data || [])
    setVeliler(v.data || [])
    setOgrenciHesaplari(oh.data || [])
    setLoading(false)
  }

  useEffect(() => {
    yukle()
  }, [])

  function yeniAlanGuncelle(alan, deger) {
    setYeniForm((f) => ({ ...f, [alan]: deger }))
  }

  function duzenleAlanGuncelle(alan, deger) {
    setDuzenleForm((f) => ({ ...f, [alan]: deger }))
  }

  async function ogrenciEkle(e) {
    e.preventDefault()
    if (!yeniForm.ad_soyad.trim()) return
    setEkleniyor(true)
    const { data: eklenen, error } = await supabase
      .from('ogrenciler')
      .insert({
        ad_soyad: adSoyadDuzelt(yeniForm.ad_soyad),
        tc_kimlik_no: yeniForm.tc_kimlik_no.trim() || null,
        dogum_tarihi: yeniForm.dogum_tarihi || null,
        telefon: yeniForm.telefon.trim() || null,
        sinif_ve_alan: yeniForm.sinif_ve_alan.trim() ? ilkHarfleriBuyukYap(yeniForm.sinif_ve_alan.trim()) : null,
        okul: yeniForm.okul.trim() ? ilkHarfleriBuyukYap(yeniForm.okul.trim()) : null,
        anne_adi_soyadi: yeniForm.anne_adi_soyadi.trim() ? adSoyadDuzelt(yeniForm.anne_adi_soyadi) : null,
        anne_telefon: yeniForm.anne_telefon.trim() || null,
        baba_adi_soyadi: yeniForm.baba_adi_soyadi.trim() ? adSoyadDuzelt(yeniForm.baba_adi_soyadi) : null,
        baba_telefon: yeniForm.baba_telefon.trim() || null,
        adres: yeniForm.adres.trim() ? ilkHarfleriBuyukYap(yeniForm.adres.trim()) : null,
        notlar: yeniForm.notlar.trim() || null,
      })
      .select()
      .single()
    setEkleniyor(false)
    if (!error) {
      setYeniForm(BOS_FORM)
      yukle()
      // "Kaydederken otomatik öğrenci girişi öner" işaretliyse, kayıt biter
      // bitmez aynı satırda onay bekleyen hesap-oluşturma önizlemesini
      // açıyoruz — admin ayrıca aşağı inip "Otomatik Hesap Oluştur"a
      // basmak zorunda kalmasın diye.
      if (otomatikHesapAc && eklenen) {
        otomatikHesapOnizlemeyeBasla(eklenen)
      }
    } else {
      alert('Hata: ' + error.message)
    }
  }

  async function durumDegistir(ogrenciId, yeniDurum) {
    const { error } = await supabase.from('ogrenciler').update({ durum: yeniDurum }).eq('id', ogrenciId)
    if (!error) yukle()
    else alert('Hata: ' + error.message)
  }

  function duzenlemeyeBasla(o) {
    setDuzenlenenId(o.id)
    setDuzenleForm(ogrenciyiFormaCevir(o))
  }

  function duzenlemeyiVazgec() {
    setDuzenlenenId(null)
  }

  async function duzenlemeyiKaydet(ogrenciId) {
    if (!duzenleForm.ad_soyad.trim()) return
    const { error } = await supabase
      .from('ogrenciler')
      .update({
        ad_soyad: adSoyadDuzelt(duzenleForm.ad_soyad),
        tc_kimlik_no: duzenleForm.tc_kimlik_no.trim() || null,
        dogum_tarihi: duzenleForm.dogum_tarihi || null,
        telefon: duzenleForm.telefon.trim() || null,
        sinif_ve_alan: duzenleForm.sinif_ve_alan.trim() ? ilkHarfleriBuyukYap(duzenleForm.sinif_ve_alan.trim()) : null,
        okul: duzenleForm.okul.trim() ? ilkHarfleriBuyukYap(duzenleForm.okul.trim()) : null,
        anne_adi_soyadi: duzenleForm.anne_adi_soyadi.trim() ? adSoyadDuzelt(duzenleForm.anne_adi_soyadi) : null,
        anne_telefon: duzenleForm.anne_telefon.trim() || null,
        baba_adi_soyadi: duzenleForm.baba_adi_soyadi.trim() ? adSoyadDuzelt(duzenleForm.baba_adi_soyadi) : null,
        baba_telefon: duzenleForm.baba_telefon.trim() || null,
        adres: duzenleForm.adres.trim() ? ilkHarfleriBuyukYap(duzenleForm.adres.trim()) : null,
        notlar: duzenleForm.notlar.trim() || null,
      })
      .eq('id', ogrenciId)
    if (!error) {
      setDuzenlenenId(null)
      yukle()
    } else {
      alert('Hata: ' + error.message)
    }
  }

  async function ogrenciSil(o) {
    const onay = confirm(
      `"${o.ad_soyad}" öğrencisini KALICI OLARAK silmek istediğinize emin misiniz?\n\n` +
      `DİKKAT: Bu işlem, bu öğrenciye ait TÜM ödeme geçmişini, sözleşmelerini, sınıf kayıtlarını ve ` +
      `yoklama kayıtlarını da kalıcı olarak silecektir. Bu işlem GERİ ALINAMAZ.\n\n` +
      `Emin değilseniz, silmek yerine "Pasif Yap" seçeneğini kullanmanızı öneririz.`
    )
    if (!onay) return
    const { error } = await supabase.from('ogrenciler').delete().eq('id', o.id)
    if (!error) yukle()
    else alert('Hata: ' + error.message)
  }

  function veliBaglamayaBasla(o) {
    setVeliBaglanan(o.id)
    setSeciliVeli(o.veli_profile_id || '')
  }

  async function veliBaglamayiKaydet(ogrenciId) {
    const { error } = await supabase
      .from('ogrenciler')
      .update({ veli_profile_id: seciliVeli || null })
      .eq('id', ogrenciId)
    if (!error) {
      setVeliBaglanan(null)
      yukle()
    } else {
      alert('Hata: ' + error.message)
    }
  }

  function ogrenciHesabiBaglamayaBasla(o) {
    setOgrenciHesabiBaglanan(o.id)
    setSeciliOgrenciHesabi(o.ogrenci_profile_id || '')
  }

  async function ogrenciHesabiBaglamayiKaydet(ogrenciId) {
    const { error } = await supabase
      .from('ogrenciler')
      .update({ ogrenci_profile_id: seciliOgrenciHesabi || null })
      .eq('id', ogrenciId)
    if (!error) {
      setOgrenciHesabiBaglanan(null)
      yukle()
    } else {
      alert('Hata: ' + error.message)
    }
  }

  // "Öğrenci Hesabı Bağla" akışı (isim ara, hesap seç, kaydet) her öğrenci
  // için teker teker yapılınca çok yavaş kalıyordu. Bu akış; isimden bir
  // kullanıcı adı ÖNERİR (ör. "Yiğit Atik" -> "yigitatik") ve varsayılan
  // şifreyi ("123456") satırda ONAY BEKLEYEN, İKİSİ DE DÜZENLENEBİLİR bir
  // önizleme olarak açar — admin isterse kullanıcı adını/şifreyi değiştirip
  // öyle onaylar. Onaylayınca /api/kullanici-olustur ile hesap oluşturulur
  // ve doğrudan bu öğrenciye bağlanır. Kullanıcı adı çakışırsa (aynı isimde
  // başka bir kayıt varsa) sunucu otomatik olarak sonuna 2, 3... ekleyerek
  // çözüyor (bkz. api/kullanici-olustur.js).
  function otomatikHesapOnizlemeyeBasla(o) {
    setOtomatikHesapBaglanan(o.id)
    setOtomatikKullaniciAdi(kullaniciAdiOner(o.ad_soyad))
    setOtomatikSifre(VARSAYILAN_SIFRE)
  }

  async function otomatikHesabiOnayla(o) {
    const kullaniciAdi = otomatikKullaniciAdi.trim()
    const sifre = otomatikSifre
    if (!kullaniciAdi) {
      alert('Kullanıcı adı boş olamaz.')
      return
    }
    if (!sifre || sifre.length < 6) {
      alert('Şifre en az 6 karakter olmalı.')
      return
    }
    setOtomatikHesapIslemde(true)
    try {
      const yanit = await fetch('/api/kullanici-olustur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adSoyad: o.ad_soyad,
          kullaniciAdi,
          sifre,
          rol: 'ogrenci',
          telefon: o.telefon || '',
        }),
      })
      const veri = await yanit.json()
      if (!yanit.ok) {
        alert('Hesap oluşturulamadı: ' + (veri.error || 'Bilinmeyen bir hata oluştu.'))
        setOtomatikHesapIslemde(false)
        return
      }
      const { error: baglamaHatasi } = await supabase
        .from('ogrenciler')
        .update({ ogrenci_profile_id: veri.userId })
        .eq('id', o.id)
      if (baglamaHatasi) {
        alert('Hesap oluşturuldu ama öğrenciye bağlanamadı: ' + baglamaHatasi.message)
        setOtomatikHesapIslemde(false)
        return
      }
      // Sunucu, çakışma varsa kullanıcı adına numara eklemiş olabilir — admin
      // gerçekte hangi adla oluşturulduğunu görsün diye sunucudan dönen adı
      // gösteriyoruz (kendi yazdığından farklı olabilir).
      alert(
        `Hesap oluşturuldu ve "${o.ad_soyad}" öğrencisine bağlandı.\n\n` +
        `Giriş adı: ${veri.kullaniciAdi}\nŞifre: ${sifre}${veri.kullaniciAdi !== kullaniciAdi ? '\n\n(Not: yazdığınız kullanıcı adı doluydu, sonuna numara eklendi.)' : ''}`
      )
      setOtomatikHesapIslemde(false)
      setOtomatikHesapBaglanan(null)
      yukle()
    } catch (err) {
      alert('Bağlantı hatası: ' + err.message)
      setOtomatikHesapIslemde(false)
    }
  }

  function otomatikVeliOnizlemeyeBasla(o) {
    setOtomatikVeliBaglanan(o.id)
    setOtomatikVeliKullaniciAdi(`${kullaniciAdiOner(o.ad_soyad)}veli`)
    setOtomatikVeliSifre(VARSAYILAN_SIFRE)
    setOtomatikVeliGorunenIsimSecim(veliGorunenIsimVarsayilanSecim(veliGorunenIsimSecenekleri(o)))
  }

  async function otomatikVeliHesabiOnayla(o) {
    const kullaniciAdi = otomatikVeliKullaniciAdi.trim()
    const sifre = otomatikVeliSifre
    const secenekler = veliGorunenIsimSecenekleri(o)
    const gorunenAd = secenekler[otomatikVeliGorunenIsimSecim] || secenekler.hesap
    if (!kullaniciAdi) {
      alert('Kullanıcı adı boş olamaz.')
      return
    }
    if (!sifre || sifre.length < 6) {
      alert('Şifre en az 6 karakter olmalı.')
      return
    }
    setOtomatikVeliIslemde(true)
    try {
      const telefon =
        otomatikVeliGorunenIsimSecim === 'anne' ? o.anne_telefon : otomatikVeliGorunenIsimSecim === 'baba' ? o.baba_telefon : ''
      const yanit = await fetch('/api/kullanici-olustur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adSoyad: gorunenAd, kullaniciAdi, sifre, rol: 'veli', telefon: telefon || '' }),
      })
      const veri = await yanit.json()
      if (!yanit.ok) {
        alert('Hesap oluşturulamadı: ' + (veri.error || 'Bilinmeyen bir hata oluştu.'))
        setOtomatikVeliIslemde(false)
        return
      }
      const { error: baglamaHatasi } = await supabase
        .from('ogrenciler')
        .update({ veli_profile_id: veri.userId })
        .eq('id', o.id)
      if (baglamaHatasi) {
        alert('Hesap oluşturuldu ama öğrenciye bağlanamadı: ' + baglamaHatasi.message)
        setOtomatikVeliIslemde(false)
        return
      }
      alert(
        `Hesap oluşturuldu ve "${o.ad_soyad}" öğrencisine veli olarak bağlandı.\n\n` +
        `Giriş adı: ${veri.kullaniciAdi}\nŞifre: ${sifre}${veri.kullaniciAdi !== kullaniciAdi ? '\n\n(Not: yazdığınız kullanıcı adı doluydu, sonuna numara eklendi.)' : ''}`
      )
      setOtomatikVeliIslemde(false)
      setOtomatikVeliBaglanan(null)
      yukle()
    } catch (err) {
      alert('Bağlantı hatası: ' + err.message)
      setOtomatikVeliIslemde(false)
    }
  }

  // "Görünen isim" (profiles.ad_soyad) bağlantı KURULDUKTAN SONRA da
  // değiştirilebilsin diye — ör. "başta anne adına açmıştık ama baba daha
  // çok ilgileniyor, ona geçirelim" gibi durumlar için. Ogretmenler.jsx'teki
  // "pasif yap" ile aynı, kanıtlanmış desen: yönetici doğrudan profiles
  // tablosunu (başka bir kullanıcının satırını) update edebiliyor.
  function veliIsmiDegistirmeyeBasla(o) {
    setVeliIsimDegistiren(o.id)
    const secenekler = veliGorunenIsimSecenekleri(o)
    const mevcutAd = o.veli?.ad_soyad
    const tahmin = mevcutAd === secenekler.anne ? 'anne' : mevcutAd === secenekler.baba ? 'baba' : 'hesap'
    setVeliIsimGuncelSecim(tahmin)
  }

  async function veliIsmiDegistirmeyiKaydet(o) {
    if (!o.veli_profile_id) return
    const secenekler = veliGorunenIsimSecenekleri(o)
    const yeniAd = secenekler[veliIsimGuncelSecim] || secenekler.hesap
    setVeliIsimIslemde(true)
    const { error } = await supabase.from('profiles').update({ ad_soyad: yeniAd }).eq('id', o.veli_profile_id)
    setVeliIsimIslemde(false)
    if (!error) {
      setVeliIsimDegistiren(null)
      yukle()
    } else {
      alert('Hata: ' + error.message)
    }
  }

  function faturaBaglamayaBasla(o) {
    setFaturaBaglanan(o.id)
    setSeciliFaturaSahibi(o.fatura_sahibi_id || '')
  }

  async function faturaBaglamayiKaydet(ogrenciId) {
    const { error } = await supabase
      .from('ogrenciler')
      .update({ fatura_sahibi_id: seciliFaturaSahibi || null })
      .eq('id', ogrenciId)
    if (!error) {
      setFaturaBaglanan(null)
      yukle()
    } else {
      alert('Hata: ' + error.message)
    }
  }

  const gosterilecekler = ogrenciler.filter((o) => {
    if (filtre === 'tumu') return true
    return (o.durum || 'aktif') === filtre
  })

  const aktifSayisi = ogrenciler.filter((o) => (o.durum || 'aktif') === 'aktif').length
  const pasifSayisi = ogrenciler.filter((o) => o.durum === 'pasif').length

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">Öğrenciler</h1>

      <form onSubmit={ogrenciEkle} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <p className="font-semibold text-gray-700 mb-3">Öğrenci Ekle</p>
        <KayitFormuAlanlari form={yeniForm} alanGuncelle={yeniAlanGuncelle} />
        <label className="flex items-center gap-2 text-sm text-gray-600 select-none mt-4">
          <input
            type="checkbox"
            checked={otomatikHesapAc}
            onChange={(e) => setOtomatikHesapAc(e.target.checked)}
          />
          Kaydederken otomatik öğrenci girişi öner (kullanıcı adı isimden, şifre varsayılan "123456" — onaylamadan önce değiştirebilirsiniz)
        </label>
        <button
          type="submit"
          disabled={ekleniyor}
          className="mt-3 bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {ekleniyor ? 'Ekleniyor...' : 'Öğrenci Ekle'}
        </button>
        <p className="text-xs text-gray-400 mt-2">
          Ad Soyad dışındaki alanlar opsiyoneldir — "SAVAŞ AKÇA ÖĞRENCİ KAYIT FORMU"ndaki başlıklarla aynıdır,
          sözleşme yazdırırken ve öğrenciyi tanırken kullanılır.
        </p>
      </form>

      {veliler.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4 text-sm text-yellow-800">
          Henüz hiç veli hesabı yok. Bir veliyi öğrenciye bağlayabilmek için önce Supabase Dashboard'dan
          o velinin giriş hesabını oluşturup (rol = 'veli' ile) profiles tablosuna eklemeniz gerekir.
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFiltre('aktif')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filtre === 'aktif' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          Aktif ({aktifSayisi})
        </button>
        <button
          onClick={() => setFiltre('pasif')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filtre === 'pasif' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          Pasif ({pasifSayisi})
        </button>
        <button
          onClick={() => setFiltre('tumu')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filtre === 'tumu' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          Tümü ({ogrenciler.length})
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="bg-navy text-white text-left">
              <th className="px-4 py-3 font-semibold">Ad Soyad</th>
              <th className="px-4 py-3 font-semibold">Telefon</th>
              <th className="px-4 py-3 font-semibold">Sınıfı / Alanı</th>
              <th className="px-4 py-3 font-semibold">Veli</th>
              <th className="px-4 py-3 font-semibold">Öğrenci Hesabı</th>
              <th className="px-4 py-3 font-semibold">Fatura Ortağı</th>
              <th className="px-4 py-3 font-semibold">Durum</th>
              <th className="px-4 py-3 font-semibold text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">Yükleniyor...</td></tr>
            )}
            {!loading && gosterilecekler.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">Bu filtrede öğrenci bulunamadı.</td></tr>
            )}
            {gosterilecekler.map((o, i) => {
              const durum = o.durum || 'aktif'
              const duzenleniyor = duzenlenenId === o.id
              const veliBagli = veliBaglanan === o.id
              const ogrenciHesabiBagli = ogrenciHesabiBaglanan === o.id
              const faturaBagli = faturaBaglanan === o.id
              const otomatikHesapBagli = otomatikHesapBaglanan === o.id
              const otomatikVeliBagli = otomatikVeliBaglanan === o.id
              const veliIsimDegistiriliyor = veliIsimDegistiren === o.id

              if (duzenleniyor) {
                return (
                  <tr key={o.id} className="bg-blue-50">
                    <td colSpan={8} className="px-4 py-4">
                      <KayitFormuAlanlari form={duzenleForm} alanGuncelle={duzenleAlanGuncelle} boyut="kucuk" />
                      <div className="space-x-3 whitespace-nowrap mt-3">
                        <button onClick={() => duzenlemeyiKaydet(o.id)} className="text-green-600 text-sm font-semibold hover:underline">
                          Kaydet
                        </button>
                        <button onClick={duzenlemeyiVazgec} className="text-gray-500 text-sm hover:underline">
                          Vazgeç
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              }

              if (veliBagli) {
                return (
                  <tr key={o.id} className="bg-purple-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{o.ad_soyad}</td>
                    <td className="px-4 py-3 text-gray-500">{o.telefon || '—'}</td>
                    <td className="px-4 py-2" colSpan={5}>
                      <select
                        value={seciliVeli}
                        onChange={(e) => setSeciliVeli(e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue"
                      >
                        <option value="">Bağlı veli yok</option>
                        {veliler.map((v) => (
                          <option key={v.id} value={v.id}>{v.ad_soyad}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-right space-x-3 whitespace-nowrap">
                      <button onClick={() => veliBaglamayiKaydet(o.id)} className="text-green-600 text-sm font-semibold hover:underline">
                        Kaydet
                      </button>
                      <button onClick={() => setVeliBaglanan(null)} className="text-gray-500 text-sm hover:underline">
                        Vazgeç
                      </button>
                    </td>
                  </tr>
                )
              }

              if (ogrenciHesabiBagli) {
                return (
                  <tr key={o.id} className="bg-purple-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{o.ad_soyad}</td>
                    <td className="px-4 py-3 text-gray-500">{o.telefon || '—'}</td>
                    <td className="px-4 py-2" colSpan={5}>
                      <select
                        value={seciliOgrenciHesabi}
                        onChange={(e) => setSeciliOgrenciHesabi(e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue"
                      >
                        <option value="">Bağlı öğrenci hesabı yok</option>
                        {ogrenciHesaplari.map((h) => (
                          <option key={h.id} value={h.id}>{h.ad_soyad}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-right space-x-3 whitespace-nowrap">
                      <button onClick={() => ogrenciHesabiBaglamayiKaydet(o.id)} className="text-green-600 text-sm font-semibold hover:underline">
                        Kaydet
                      </button>
                      <button onClick={() => setOgrenciHesabiBaglanan(null)} className="text-gray-500 text-sm hover:underline">
                        Vazgeç
                      </button>
                    </td>
                  </tr>
                )
              }

              if (faturaBagli) {
                return (
                  <tr key={o.id} className="bg-purple-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{o.ad_soyad}</td>
                    <td className="px-4 py-3 text-gray-500">{o.telefon || '—'}</td>
                    <td className="px-4 py-2" colSpan={5}>
                      <select
                        value={seciliFaturaSahibi}
                        onChange={(e) => setSeciliFaturaSahibi(e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue"
                      >
                        <option value="">Fatura ortağı yok (kendi hesabı ayrı)</option>
                        {ogrenciler
                          .filter((diger) => diger.id !== o.id)
                          .map((diger) => (
                            <option key={diger.id} value={diger.id}>{diger.ad_soyad}</option>
                          ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Burada seçilen kişi, "fatura sahibi" olur: {o.ad_soyad} adına oluşan tüm borç/ödemeler
                        (kantin, bire bir vb.) seçilen kişinin ekstresinde toplu görünür. Ders programı ayrı kalmaya devam eder.
                      </p>
                    </td>
                    <td className="px-4 py-2 text-right space-x-3 whitespace-nowrap">
                      <button onClick={() => faturaBaglamayiKaydet(o.id)} className="text-green-600 text-sm font-semibold hover:underline">
                        Kaydet
                      </button>
                      <button onClick={() => setFaturaBaglanan(null)} className="text-gray-500 text-sm hover:underline">
                        Vazgeç
                      </button>
                    </td>
                  </tr>
                )
              }

              if (otomatikHesapBagli) {
                return (
                  <tr key={o.id} className="bg-orange/10">
                    <td className="px-4 py-3 font-medium text-gray-800">{o.ad_soyad}</td>
                    <td className="px-4 py-3 text-gray-500">{o.telefon || '—'}</td>
                    <td className="px-4 py-2" colSpan={5}>
                      <div className="flex flex-wrap gap-3">
                        <div className="flex-1 min-w-[160px]">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Kullanıcı Adı</label>
                          <input
                            value={otomatikKullaniciAdi}
                            onChange={(e) => setOtomatikKullaniciAdi(e.target.value)}
                            autoCapitalize="none"
                            autoCorrect="off"
                            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                          />
                        </div>
                        <div className="flex-1 min-w-[140px]">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Şifre</label>
                          <input
                            value={otomatikSifre}
                            onChange={(e) => setOtomatikSifre(e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        İkisi de otomatik önerildi, isterseniz değiştirebilirsiniz. "Oluştur"a basınca bu bilgilerle
                        öğrenci girişi açılır ve {o.ad_soyad} öğrencisine bağlanır.
                      </p>
                    </td>
                    <td className="px-4 py-2 text-right space-x-3 whitespace-nowrap">
                      <button
                        onClick={() => otomatikHesabiOnayla(o)}
                        disabled={otomatikHesapIslemde}
                        className="text-green-600 text-sm font-semibold hover:underline disabled:opacity-50"
                      >
                        {otomatikHesapIslemde ? 'Oluşturuluyor...' : 'Oluştur'}
                      </button>
                      <button
                        onClick={() => setOtomatikHesapBaglanan(null)}
                        disabled={otomatikHesapIslemde}
                        className="text-gray-500 text-sm hover:underline disabled:opacity-50"
                      >
                        Vazgeç
                      </button>
                    </td>
                  </tr>
                )
              }

              if (otomatikVeliBagli) {
                return (
                  <tr key={o.id} className="bg-orange/10">
                    <td className="px-4 py-3 font-medium text-gray-800">{o.ad_soyad}</td>
                    <td className="px-4 py-3 text-gray-500">{o.telefon || '—'}</td>
                    <td className="px-4 py-2" colSpan={5}>
                      <div className="flex flex-wrap gap-3">
                        <div className="flex-1 min-w-[160px]">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Kullanıcı Adı</label>
                          <input
                            value={otomatikVeliKullaniciAdi}
                            onChange={(e) => setOtomatikVeliKullaniciAdi(e.target.value)}
                            autoCapitalize="none"
                            autoCorrect="off"
                            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                          />
                        </div>
                        <div className="flex-1 min-w-[140px]">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Şifre</label>
                          <input
                            value={otomatikVeliSifre}
                            onChange={(e) => setOtomatikVeliSifre(e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mt-2">
                          Giriş yapınca "Hoş geldiniz, ..." ekranında görünecek isim
                        </label>
                        <VeliGorunenIsimSecici o={o} secim={otomatikVeliGorunenIsimSecim} setSecim={setOtomatikVeliGorunenIsimSecim} />
                      </div>
                      <p className="text-xs text-gray-500 mt-1.5">
                        Kullanıcı adı/şifre otomatik önerildi, isterseniz değiştirebilirsiniz. "Oluştur"a basınca bu bilgilerle
                        veli girişi açılır ve {o.ad_soyad} öğrencisine bağlanır. Görünen ismi daha sonra da değiştirebilirsiniz.
                      </p>
                    </td>
                    <td className="px-4 py-2 text-right space-x-3 whitespace-nowrap">
                      <button
                        onClick={() => otomatikVeliHesabiOnayla(o)}
                        disabled={otomatikVeliIslemde}
                        className="text-green-600 text-sm font-semibold hover:underline disabled:opacity-50"
                      >
                        {otomatikVeliIslemde ? 'Oluşturuluyor...' : 'Oluştur'}
                      </button>
                      <button
                        onClick={() => setOtomatikVeliBaglanan(null)}
                        disabled={otomatikVeliIslemde}
                        className="text-gray-500 text-sm hover:underline disabled:opacity-50"
                      >
                        Vazgeç
                      </button>
                    </td>
                  </tr>
                )
              }

              if (veliIsimDegistiriliyor) {
                return (
                  <tr key={o.id} className="bg-orange/10">
                    <td className="px-4 py-3 font-medium text-gray-800">{o.ad_soyad}</td>
                    <td className="px-4 py-3 text-gray-500">{o.telefon || '—'}</td>
                    <td className="px-4 py-2" colSpan={5}>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Şu an: <span className="font-semibold text-gray-700">{o.veli?.ad_soyad || '—'}</span> — yeni görünen isim:
                      </label>
                      <VeliGorunenIsimSecici o={o} secim={veliIsimGuncelSecim} setSecim={setVeliIsimGuncelSecim} />
                      <p className="text-xs text-gray-500 mt-1.5">
                        Bu, sadece velinin giriş yaptığında gördüğü "Hoş geldiniz, ..." ismini değiştirir — kullanıcı adı/şifre aynı kalır.
                      </p>
                    </td>
                    <td className="px-4 py-2 text-right space-x-3 whitespace-nowrap">
                      <button
                        onClick={() => veliIsmiDegistirmeyiKaydet(o)}
                        disabled={veliIsimIslemde}
                        className="text-green-600 text-sm font-semibold hover:underline disabled:opacity-50"
                      >
                        {veliIsimIslemde ? 'Kaydediliyor...' : 'Kaydet'}
                      </button>
                      <button
                        onClick={() => setVeliIsimDegistiren(null)}
                        disabled={veliIsimIslemde}
                        className="text-gray-500 text-sm hover:underline disabled:opacity-50"
                      >
                        Vazgeç
                      </button>
                    </td>
                  </tr>
                )
              }

              return (
                <tr key={o.id} className={i % 2 ? 'bg-gray-50' : ''}>
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/ogrenci/${o.id}`} className="text-blue hover:underline" title="Zaman çizelgesini görüntüle">
                      {o.ad_soyad}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{o.telefon ? telefonYerelGoster(o.telefon) : '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{o.sinif_ve_alan || '—'}</td>
                  <td className="px-4 py-3">
                    {o.veli?.ad_soyad ? (
                      <span className="text-gray-700">{o.veli.ad_soyad}</span>
                    ) : (
                      <span className="text-gray-400 text-xs">Bağlı değil</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {o.ogrenci_hesabi?.ad_soyad ? (
                      <span className="text-gray-700">{o.ogrenci_hesabi.ad_soyad}</span>
                    ) : (
                      <span className="text-gray-400 text-xs">Bağlı değil</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {o.fatura_sahibi?.ad_soyad ? (
                      <span className="text-gray-700">{o.fatura_sahibi.ad_soyad}</span>
                    ) : (
                      <span className="text-gray-400 text-xs">Yok</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      durum === 'aktif' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {durum === 'aktif' ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/* ÖNEMLİ: burada 5 ayrı işlem linki var — hepsini TEK SATIRDA
                        (whitespace-nowrap) sıkıştırmak, dar ekranlarda/pencerelerde
                        bazılarının (özellikle en yeni eklenen "Öğrenci Hesabı Bağla")
                        görünür alanın dışına taşıp fark edilmeden kaybolmasına yol
                        açıyordu. flex-wrap ile gerekirse 2. satıra sarıyoruz, hiçbir
                        buton görünmez şekilde kesilmesin diye. */}
                    <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                      <button onClick={() => veliBaglamayaBasla(o)} className="text-purple-600 text-sm hover:underline">
                        Veli Bağla
                      </button>
                      {!o.veli_profile_id ? (
                        <button
                          onClick={() => otomatikVeliOnizlemeyeBasla(o)}
                          className="text-orange text-sm hover:underline"
                          title="İsimden kullanıcı adı (...veli) ve varsayılan şifre önerir, görünen ismi anne/baba/Veli Hesabı arasından seçebilirsiniz"
                        >
                          Otomatik Veli Hesabı Oluştur
                        </button>
                      ) : (
                        <button
                          onClick={() => veliIsmiDegistirmeyeBasla(o)}
                          className="text-orange text-sm hover:underline"
                          title="Bağlı velinin giriş yaptığında gördüğü ismi (anne/baba/Veli Hesabı) sonradan değiştirir"
                        >
                          Veli İsmini Değiştir
                        </button>
                      )}
                      <button onClick={() => ogrenciHesabiBaglamayaBasla(o)} className="text-purple-600 text-sm hover:underline">
                        Öğrenci Hesabı Bağla
                      </button>
                      {!o.ogrenci_profile_id && (
                        <button
                          onClick={() => otomatikHesapOnizlemeyeBasla(o)}
                          className="text-orange text-sm hover:underline"
                          title="İsimden kullanıcı adı ve varsayılan şifre önerir, onaylamadan önce değiştirebilirsiniz"
                        >
                          Otomatik Hesap Oluştur
                        </button>
                      )}
                      <button onClick={() => faturaBaglamayaBasla(o)} className="text-purple-600 text-sm hover:underline">
                        Fatura Ortağı Bağla
                      </button>
                      <button onClick={() => duzenlemeyeBasla(o)} className="text-blue text-sm hover:underline">
                        Düzenle
                      </button>
                      {durum === 'aktif' ? (
                        <button onClick={() => durumDegistir(o.id, 'pasif')} className="text-gray-500 text-sm hover:underline">
                          Pasif Yap
                        </button>
                      ) : (
                        <button onClick={() => durumDegistir(o.id, 'aktif')} className="text-green-600 text-sm hover:underline">
                          Aktif Yap
                        </button>
                      )}
                      <button onClick={() => ogrenciSil(o)} className="text-red-500 text-sm hover:underline">
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        "Sil" işlemi geri alınamaz ve öğrencinin tüm ödeme/sözleşme/yoklama geçmişini de siler. Geçmiş yıldan
        sadece ödeme takibi kalan öğrenciler için "Sil" yerine "Pasif Yap" kullanmanızı öneririz. "Veli Bağla" ile
        bir veli hesabını bu öğrenciyle eşleştirebilirsiniz — veli giriş yaptığında sadece bu öğrencinin bilgilerini görür.
        "Fatura Ortağı Bağla" ise ör. ikiz kardeşler gibi ders programı ayrı ama muhasebesi ortak olan öğrenciler
        içindir: bir öğrenciyi diğerine bağlarsanız, bağlanan öğrencinin tüm borç/ödemeleri diğerinin ekstresinde
        toplu görünür; ders programları yine ayrı ayrı kalır. "Otomatik Hesap Oluştur" ise öğrencinin kendi girişi
        (kullanıcı adı+şifre) yoksa, isminden bir kullanıcı adı ve varsayılan "123456" şifresini önerir — onaylamadan
        önce ikisini de satırda değiştirebilirsiniz — sonra hesabı açıp doğrudan bu öğrenciye bağlar. "Otomatik Veli
        Hesabı Oluştur" aynı şekilde çalışır (kullanıcı adı isim+"veli", ör. "yigitatikveli"), farkı velinin giriş
        yaptığında göreceği ismi anne/baba/"Veli Hesabı" arasından seçebilmenizdir — bu seçimi hesap açıldıktan
        sonra da "Veli İsmini Değiştir" ile istediğiniz zaman değiştirebilirsiniz.
      </p>
    </div>
  )
}
