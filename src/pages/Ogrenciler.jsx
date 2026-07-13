import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { adSoyadDuzelt, ilkHarfleriBuyukYap } from '../lib/adSoyadFormat'

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
          <div className="flex-1 min-w-[150px]">
            <label className={etiketSinifi}>Öğrenci Telefonu</label>
            <input
              value={form.telefon}
              onChange={(e) => alanGuncelle('telefon', e.target.value)}
              className={girdiSinifi}
              placeholder="905XXXXXXXXX"
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
          <div className="flex-1 min-w-[150px]">
            <label className={etiketSinifi}>Anne Telefonu</label>
            <input
              value={form.anne_telefon}
              onChange={(e) => alanGuncelle('anne_telefon', e.target.value)}
              className={girdiSinifi}
              placeholder="905XXXXXXXXX"
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
          <div className="flex-1 min-w-[150px]">
            <label className={etiketSinifi}>Baba Telefonu</label>
            <input
              value={form.baba_telefon}
              onChange={(e) => alanGuncelle('baba_telefon', e.target.value)}
              className={girdiSinifi}
              placeholder="905XXXXXXXXX"
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

  async function yukle() {
    setLoading(true)
    const [o, v, oh] = await Promise.all([
      supabase
        .from('ogrenciler')
        .select('*, veli:veli_profile_id(ad_soyad), ogrenci_hesabi:ogrenci_profile_id(ad_soyad)')
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
    const { error } = await supabase.from('ogrenciler').insert({
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
    setEkleniyor(false)
    if (!error) {
      setYeniForm(BOS_FORM)
      yukle()
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
        <button
          type="submit"
          disabled={ekleniyor}
          className="mt-4 bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
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
              <th className="px-4 py-3 font-semibold">Durum</th>
              <th className="px-4 py-3 font-semibold text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Yükleniyor...</td></tr>
            )}
            {!loading && gosterilecekler.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Bu filtrede öğrenci bulunamadı.</td></tr>
            )}
            {gosterilecekler.map((o, i) => {
              const durum = o.durum || 'aktif'
              const duzenleniyor = duzenlenenId === o.id
              const veliBagli = veliBaglanan === o.id
              const ogrenciHesabiBagli = ogrenciHesabiBaglanan === o.id

              if (duzenleniyor) {
                return (
                  <tr key={o.id} className="bg-blue-50">
                    <td colSpan={7} className="px-4 py-4">
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
                    <td className="px-4 py-2" colSpan={4}>
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
                    <td className="px-4 py-2" colSpan={4}>
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

              return (
                <tr key={o.id} className={i % 2 ? 'bg-gray-50' : ''}>
                  <td className="px-4 py-3 font-medium text-gray-800">{o.ad_soyad}</td>
                  <td className="px-4 py-3 text-gray-500">{o.telefon || '—'}</td>
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
                      <button onClick={() => ogrenciHesabiBaglamayaBasla(o)} className="text-purple-600 text-sm hover:underline">
                        Öğrenci Hesabı Bağla
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
      </p>
    </div>
  )
}
