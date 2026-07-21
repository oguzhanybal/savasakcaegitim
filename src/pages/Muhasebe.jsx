import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { ilkHarfleriBuyukYap } from '../lib/adSoyadFormat'
import BireBirDersDokumu from '../components/BireBirDersDokumu'
import {
  taksitPlaniOlustur,
  aylikBorcDurumHesapla,
  gunAnahtari,
  bireBirBorclariOlustur,
  kantinBorclariOlustur,
  aylikBorclariKalemAyaGoreGrupla,
  bireBirDersDetaylariOlustur,
  fazlaOdemeleriHesapla,
  ogrenciSatirlariHesapla,
  sonOdemeleriGrupSiniriylaKes,
} from '../lib/ekstreHesap'

function paraFormat(n) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n || 0)
}

const DURUM_ETIKET = {
  odendi: { text: 'Ödendi', cls: 'bg-green-100 text-green-700' },
  kismi: { text: 'Kısmi Ödendi', cls: 'bg-amber-100 text-amber-700' },
  gecikti: { text: 'Gecikti', cls: 'bg-red-100 text-red-700' },
  bekliyor: { text: 'Bekliyor', cls: 'bg-gray-100 text-gray-600' },
}

function DurumRozeti({ durum }) {
  const d = DURUM_ETIKET[durum] || DURUM_ETIKET.bekliyor
  return <span className={`text-xs font-semibold px-2 py-1 rounded-full ${d.cls}`}>{d.text}</span>
}

const DAGITILAMAYAN_ETIKET = 'Dağıtılmamış'
const DAGITILABILIR_KALEMLER = ['Okul', 'Kurs', 'Kitap', 'Bire Bir', 'Yemek', 'Kantin']

function saatKisalt(s) {
  return s ? s.slice(0, 5) : s
}

// Veli genel bir tutar bıraktığında (hangi kaleme ne kadar gideceği henüz belli
// değilken), bu tek satırı sonradan birden fazla kalem satırına böler.
function OdemeDagitForm({ odeme, onTamam, onVazgec }) {
  const [satirlar, setSatirlar] = useState([{ kalem: 'Okul', tutar: '' }])
  const [gonderiliyor, setGonderiliyor] = useState(false)

  const toplamDagitilan = satirlar.reduce((t, s) => t + (Number(s.tutar) || 0), 0)
  const kalanTutar = Number(odeme.tutar) - toplamDagitilan

  function satirGuncelle(i, alan, deger) {
    setSatirlar((prev) => prev.map((s, idx) => (idx === i ? { ...s, [alan]: deger } : s)))
  }
  function satirEkle() {
    setSatirlar((prev) => [...prev, { kalem: 'Okul', tutar: '' }])
  }
  function satirSil(i) {
    setSatirlar((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function kaydet() {
    if (toplamDagitilan <= 0) {
      alert('En az bir kaleme tutar girin.')
      return
    }
    if (toplamDagitilan > Number(odeme.tutar) + 0.01) {
      alert('Dağıtılan toplam, ödeme tutarını geçemez.')
      return
    }
    setGonderiliyor(true)
    const eklenecekler = satirlar
      .filter((s) => Number(s.tutar) > 0)
      .map((s) => ({
        ogrenci_id: odeme.ogrenci_id,
        tutar: Number(s.tutar),
        kalem: s.kalem,
        tarih: odeme.tarih,
        // created_at'i de orijinal (dağıtılmamış) ödemenin created_at'inden
        // aynen devralıyoruz. Aksi halde Supabase yeni satırlara created_at'i
        // "şu an" (dağıtma butonuna basılan an) olarak verirdi — bir ödeme
        // birden fazla oturumda (önce bir kısmı, sonra geri kalanı) dağıtılırsa
        // bu, gerçek alınma sırasını bozup başka öğrencilerin ödemeleriyle
        // karışık/tutarsız görünmesine yol açıyordu. Kalan tutar güncellenirken
        // (update) satırın created_at'i zaten değişmediği için, ikinci dağıtımda
        // da odeme.created_at hâlâ doğru/orijinal alınma anını taşıyor.
        created_at: odeme.created_at,
      }))
    const { error: eklemeHatasi } = await supabase.from('odemeler').insert(eklenecekler)
    if (eklemeHatasi) {
      alert('Hata: ' + eklemeHatasi.message)
      setGonderiliyor(false)
      return
    }
    if (kalanTutar > 0.01) {
      await supabase.from('odemeler').update({ tutar: kalanTutar }).eq('id', odeme.id)
    } else {
      await supabase.from('odemeler').delete().eq('id', odeme.id)
    }
    setGonderiliyor(false)
    onTamam()
  }

  return (
    <div className="p-4 bg-gray-50 border-t border-gray-100">
      <p className="text-sm text-gray-600 mb-3">
        Toplam {paraFormat(odeme.tutar)} — hangi kaleme ne kadar gideceğini gir.
      </p>
      {satirlar.map((s, i) => (
        <div key={i} className="flex gap-2 items-center mb-2">
          <select
            value={s.kalem}
            onChange={(e) => satirGuncelle(i, 'kalem', e.target.value)}
            className="px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-sm"
          >
            {DAGITILABILIR_KALEMLER.map((k) => <option key={k}>{k}</option>)}
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            value={s.tutar}
            onChange={(e) => satirGuncelle(i, 'tutar', e.target.value)}
            placeholder="0.00"
            className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
          />
          {satirlar.length > 1 && (
            <button type="button" onClick={() => satirSil(i)} className="text-red-500 text-xs hover:underline shrink-0">
              Sil
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={satirEkle}
        className="text-navy text-xs font-semibold underline hover:no-underline mb-3"
      >
        + Satır Ekle
      </button>
      <p className={`text-sm font-medium mb-3 ${kalanTutar < -0.01 ? 'text-red-600' : 'text-gray-600'}`}>
        Dağıtılan: {paraFormat(toplamDagitilan)} · Kalan: {paraFormat(kalanTutar)}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={kaydet}
          disabled={gonderiliyor || toplamDagitilan <= 0}
          className="bg-orange text-white font-semibold px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {gonderiliyor ? 'Kaydediliyor...' : 'Kalemlere Dağıt'}
        </button>
        <button type="button" onClick={onVazgec} className="text-gray-500 text-sm px-3 py-2 hover:text-gray-700">
          Vazgeç
        </button>
      </div>
    </div>
  )
}

function DagitilmamisOdemelerPaneli({ odemeler, onDegisti, digerOgrenciAdlari }) {
  const [acikId, setAcikId] = useState(null)
  const dagitilmamislar = odemeler.filter((o) => o.kalem === DAGITILAMAYAN_ETIKET)

  if (dagitilmamislar.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-orange/30 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-100 bg-orange/10">
        <h2 className="font-semibold text-orange">Dağıtılmamış Ödemeler</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Veli genel bir tutar bıraktığında buraya düşer. Makbuzu hemen kesebilirsiniz, hangi kaleme ne kadar
          gideceğini sonradan burada belirleyin.
        </p>
      </div>
      <div className="divide-y divide-gray-50">
        {dagitilmamislar.map((o) => (
          <div key={o.id}>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium text-gray-800">
                  {paraFormat(o.tutar)}
                  {digerOgrenciAdlari && (
                    <span className="text-purple-600 font-normal text-xs ml-2">({o.ogrenciler?.ad_soyad || '—'})</span>
                  )}
                </p>
                <p className="text-xs text-gray-400">{new Date(o.tarih).toLocaleDateString('tr-TR')}</p>
              </div>
              <button
                type="button"
                onClick={() => setAcikId(acikId === o.id ? null : o.id)}
                className="text-blue text-sm font-semibold hover:underline shrink-0"
              >
                {acikId === o.id ? 'Kapat' : 'Kalemlere Dağıt'}
              </button>
            </div>
            {acikId === o.id && (
              <OdemeDagitForm
                odeme={o}
                onTamam={() => { setAcikId(null); onDegisti() }}
                onVazgec={() => setAcikId(null)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function OdemeEkleForm({ ogrenciId, onEklendi }) {
  const [tutar, setTutar] = useState('')
  const [kalem, setKalem] = useState('Okul')
  const [gonderiliyor, setGonderiliyor] = useState(false)

  async function ekle(e) {
    e.preventDefault()
    if (!tutar || Number(tutar) <= 0) return
    setGonderiliyor(true)
    const { error } = await supabase.from('odemeler').insert({
      ogrenci_id: ogrenciId,
      tutar: Number(tutar),
      kalem,
      tarih: new Date().toISOString(),
    })
    setGonderiliyor(false)
    if (!error) {
      setTutar('')
      onEklendi()
    } else {
      alert('Hata: ' + error.message)
    }
  }

  return (
    <form onSubmit={ekle} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6 flex flex-wrap gap-3 items-end">
      <div className="flex-1 min-w-[140px]">
        <label className="block text-sm font-medium text-gray-700 mb-1">Kalem</label>
        <select
          value={kalem}
          onChange={(e) => setKalem(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
        >
          <option value="Dağıtılmamış">Dağıtılmamış (Genel Ödeme)</option>
          <option>Okul</option>
          <option>Kurs</option>
          <option>Kitap</option>
          <option>Bire Bir</option>
          <option>Yemek</option>
          <option>Kantin</option>
        </select>
        <p className="text-xs text-gray-400 mt-1">
          Hangi kaleme gideceği belli değilse "Dağıtılmamış" seçip makbuzu hemen kesin, sonra aşağıdan dağıtın.
        </p>
      </div>
      <div className="flex-1 min-w-[140px]">
        <label className="block text-sm font-medium text-gray-700 mb-1">Tutar (₺)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={tutar}
          onChange={(e) => setTutar(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          placeholder="0.00"
        />
      </div>
      <button
        type="submit"
        disabled={gonderiliyor}
        className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {gonderiliyor ? 'Ekleniyor...' : 'Ödeme Ekle'}
      </button>
    </form>
  )
}

function SozlesmeEkleForm({ ogrenciId, onEklendi }) {
  const [kalem, setKalem] = useState('Okul')
  const [toplamTutar, setToplamTutar] = useState('')
  const [taksitSayisi, setTaksitSayisi] = useState('1')
  const [ilkTaksitTarihi, setIlkTaksitTarihi] = useState('')
  // Sözleşme yazdırılırken kullanılan ek bilgiler — öğrencinin o anki sınıf
  // durumu sonradan değişse bile bu sözleşmede sabit kalsın diye ayrıca
  // saklanıyor. Eğitim dönemi bir önceki sözleşmeden hatırlanabilsin diye
  // basit bir varsayım (bugünün yılına göre) ile başlatılıyor.
  const [egitimDonemi, setEgitimDonemi] = useState(() => {
    const yil = new Date().getFullYear()
    const ay = new Date().getMonth() + 1
    return ay >= 6 ? `${yil}-${yil + 1}` : `${yil - 1}-${yil}`
  })
  const [sinifMetni, setSinifMetni] = useState('')
  const [sozlesmeTarihi, setSozlesmeTarihi] = useState(() => new Date().toISOString().slice(0, 10))
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [acik, setAcik] = useState(false)

  async function ekle(e) {
    e.preventDefault()
    if (!toplamTutar || Number(toplamTutar) <= 0) return
    setGonderiliyor(true)
    const { error } = await supabase.from('sozlesmeler').insert({
      ogrenci_id: ogrenciId,
      kalem,
      toplam_tutar: Number(toplamTutar),
      taksit_sayisi: Number(taksitSayisi) || 1,
      ilk_taksit_tarihi: ilkTaksitTarihi || null,
      egitim_donemi: egitimDonemi.trim() || null,
      sinif_metni: sinifMetni.trim() ? ilkHarfleriBuyukYap(sinifMetni.trim()) : null,
      sozlesme_tarihi: sozlesmeTarihi || null,
    })
    setGonderiliyor(false)
    if (!error) {
      setToplamTutar('')
      setTaksitSayisi('1')
      setIlkTaksitTarihi('')
      setSinifMetni('')
      setAcik(false)
      onEklendi()
    } else {
      alert('Hata: ' + error.message)
    }
  }

  if (!acik) {
    return (
      <button
        onClick={() => setAcik(true)}
        className="text-navy font-semibold text-sm underline hover:no-underline"
      >
        + Yeni sözleşme ekle
      </button>
    )
  }

  return (
    <form onSubmit={ekle} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[120px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Kalem</label>
          <select
            value={kalem}
            onChange={(e) => setKalem(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            <option>Okul</option>
            <option>Kurs</option>
            <option>Kitap</option>
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Toplam Tutar (₺)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={toplamTutar}
            onChange={(e) => setToplamTutar(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
        <div className="flex-1 min-w-[110px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Taksit Sayısı</label>
          <input
            type="number"
            min="1"
            value={taksitSayisi}
            onChange={(e) => setTaksitSayisi(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">İlk Taksit Tarihi</label>
          <input
            type="date"
            value={ilkTaksitTarihi}
            onChange={(e) => setIlkTaksitTarihi(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-3 items-end mt-3 pt-3 border-t border-gray-100">
        <div className="flex-1 min-w-[130px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Sözleşme Tarihi</label>
          <input
            type="date"
            value={sozlesmeTarihi}
            onChange={(e) => setSozlesmeTarihi(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
        <div className="flex-1 min-w-[130px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Eğitim Dönemi</label>
          <input
            value={egitimDonemi}
            onChange={(e) => setEgitimDonemi(e.target.value)}
            placeholder="2026-2027"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
        <div className="flex-1 min-w-[130px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Sınıf (sözleşmede yazsın)</label>
          <input
            value={sinifMetni}
            onChange={(e) => setSinifMetni(e.target.value)}
            placeholder="örn. 9-A ya da Bire Bir"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Bu son üç alan sadece "Sözleşmeyi Görüntüle/Yazdır" çıktısında kullanılır, boş bırakılabilir.
      </p>
      <div className="flex gap-2 mt-3">
        <button
          type="submit"
          disabled={gonderiliyor}
          className="bg-navy text-white font-semibold px-5 py-2 rounded-lg hover:bg-blue transition-colors disabled:opacity-50"
        >
          {gonderiliyor ? 'Ekleniyor...' : 'Sözleşme Ekle'}
        </button>
        <button
          type="button"
          onClick={() => setAcik(false)}
          className="text-gray-500 font-medium px-4 py-2 hover:text-gray-700"
        >
          Vazgeç
        </button>
      </div>
    </form>
  )
}

// Hem düz "aylık kalem borcu" (Yemek/Kantin — devam eden, tekrar eden borç)
// HEM DE "sistem öncesi / geçmiş borç" (öğrenci bu sisteme geçmeden önceki
// borcunu, hangi kaleme ve hangi aya ait olduğunu seçerek tek satırda girmek)
// için kullanılan TEK form. Kurs/Okul kalemleri normalde "sözleşme" (taksit
// planı) üzerinden yürüdüğü için, bu iki kalem seçildiğinde arka planda
// "sozlesmeler" tablosuna TEK TAKSİTLİ (peşin) bir kayıt olarak yazılır —
// böylece hem taksit/ekstre hesaplamasıyla birebir uyumlu olur hem de normal
// bir borç gibi görünüp ödeme düştükçe otomatik kapanır. Yemek/Kantin/Bire Bir
// ise doğrudan "aylik_borclar" tablosuna yazılır. "Bire Bir" için ÖNEMLİ: bu,
// yeni bir ders GİRMEZ (öğretmen seçmeye gerek YOK) — sadece geçmişe dönük
// düz bir borç satırı ekler, hiçbir öğretmenin ekstresini etkilemez.
const GECMIS_BORC_KALEMLERI = ['Okul', 'Kurs', 'Yemek', 'Kantin', 'Bire Bir']
const GECMIS_BORC_SOZLESME_KALEMLERI = ['Okul', 'Kurs']

function GecmisBorcEkleForm({ ogrenciId, onEklendi }) {
  const [kalem, setKalem] = useState('Okul')
  const [tutar, setTutar] = useState('')
  const [donem, setDonem] = useState(() => new Date().toISOString().slice(0, 7))
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [acik, setAcik] = useState(false)

  async function ekle(e) {
    e.preventDefault()
    if (!tutar || Number(tutar) <= 0 || !donem) return
    setGonderiliyor(true)
    let error
    if (GECMIS_BORC_SOZLESME_KALEMLERI.includes(kalem)) {
      // Okul/Kurs taksit sistemiyle çalıştığı için, geçmiş borç TEK taksitli
      // (1/1) bir sözleşme gibi kaydedilir — vadesi seçilen ay olur, öğretmen
      // seçmeye gerek yoktur.
      ;({ error } = await supabase.from('sozlesmeler').insert({
        ogrenci_id: ogrenciId,
        kalem,
        toplam_tutar: Number(tutar),
        taksit_sayisi: 1,
        ilk_taksit_tarihi: `${donem}-01`,
        sinif_metni: 'Sistem Öncesi Borç',
      }))
    } else {
      ;({ error } = await supabase.from('aylik_borclar').insert({
        ogrenci_id: ogrenciId,
        kalem,
        tutar: Number(tutar),
        donem: `${donem}-01`,
      }))
    }
    setGonderiliyor(false)
    if (!error) {
      setTutar('')
      setAcik(false)
      onEklendi()
    } else {
      alert('Hata: ' + error.message)
    }
  }

  if (!acik) {
    return (
      <button
        onClick={() => setAcik(true)}
        className="text-navy font-semibold text-sm underline hover:no-underline"
      >
        + Sistem Öncesi (Geçmiş) Borç Ekle
      </button>
    )
  }

  return (
    <form onSubmit={ekle} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
      <p className="text-sm text-gray-500 mb-3">
        Öğrencinin bu sisteme geçmeden ÖNCEKİ borcunu buradan girin — kalemi ve hangi aya ait olduğunu
        seçmeniz yeterli, öğretmen seçmenize gerek yok. (Yeni bire bir dersler yine Bire Bir sayfasında
        yoklama alındıkça otomatik borç oluşturur — bunları buraya elle girmeyin.)
      </p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[120px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Kalem</label>
          <select
            value={kalem}
            onChange={(e) => setKalem(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            {GECMIS_BORC_KALEMLERI.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Tutar (₺)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={tutar}
            onChange={(e) => setTutar(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Hangi Ay</label>
          <input
            type="month"
            value={donem}
            onChange={(e) => setDonem(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          type="submit"
          disabled={gonderiliyor}
          className="bg-navy text-white font-semibold px-5 py-2 rounded-lg hover:bg-blue transition-colors disabled:opacity-50"
        >
          {gonderiliyor ? 'Ekleniyor...' : 'Borç Ekle'}
        </button>
        <button
          type="button"
          onClick={() => setAcik(false)}
          className="text-gray-500 font-medium px-4 py-2 hover:text-gray-700"
        >
          Vazgeç
        </button>
      </div>
    </form>
  )
}

// Bir kalemde borçtan FAZLA ödeme yapılmışsa (veli taksitini/borcunu önden ya
// da fazladan ödediyse), bu paneli göster — tutar otomatik olarak o kalemde
// bir sonraki borç doğduğunda (sonraki ay taksiti / yeni ders ya da alış)
// kendiliğinden düşer, burada sadece bilgi amaçlı gösteriliyor.
function FazlaOdemePaneli({ fazlaOdemeler }) {
  if (!fazlaOdemeler || fazlaOdemeler.length === 0) return null
  const toplam = fazlaOdemeler.reduce((t, f) => t + f.fazlaOdeme, 0)
  return (
    <div className="bg-white rounded-2xl border border-green-200 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-green-100 bg-green-50">
        <h2 className="font-semibold text-green-700">Fazla Ödeme (Alacaklı)</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Bu kalemlerde borçtan fazla ödeme yapılmış. Ayrıca bir işlem gerekmez — tutar, o kalemde bir
          sonraki borç doğduğunda (bir sonraki ay taksiti / yeni ders ya da alış) otomatik olarak düşer.
        </p>
      </div>
      <div className="divide-y divide-gray-50">
        {fazlaOdemeler.map((f, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-2.5">
            <span className="font-medium text-gray-800">{f.label}</span>
            <span className="font-semibold text-green-700">+ {paraFormat(f.fazlaOdeme)}</span>
          </div>
        ))}
        {fazlaOdemeler.length > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50">
            <span className="font-semibold text-gray-700">Toplam Alacak</span>
            <span className="font-bold text-green-700">+ {paraFormat(toplam)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Muhasebe() {
  const { profile } = useAuth()
  const isYonetici = profile?.rol === 'yonetici'

  const [ogrenciler, setOgrenciler] = useState([])
  const [seciliId, setSeciliId] = useState('')
  // Öğrenci Seç kutusu — Kantin.jsx'teki "yazarak arayın ya da listeden seçin"
  // ile AYNI davranış: kutuya tıklayınca tüm liste açılır, isim yazınca
  // filtrelenir, mobilde klavyeden yazmak zorunda kalmadan da listeden
  // seçilebilir.
  const [ogrenciArama, setOgrenciArama] = useState('')
  const [ogrenciOneriAcik, setOgrenciOneriAcik] = useState(false)
  const [sozlesmeler, setSozlesmeler] = useState([])
  const [aylikBorclar, setAylikBorclar] = useState([])
  const [odemeler, setOdemeler] = useState([])
  const [bireBirDersleri, setBireBirDersleri] = useState([])
  const [loading, setLoading] = useState(true)
  // Herhangi bir öğrenci seçilmeden ÖNCE, giriş ekranında "en son kim ne
  // ödedi" görülsün diye tüm öğrencilerin son ödemelerini ayrıca tutuyoruz
  // (seçili öğrenciye özel odemeler state'inden bağımsız).
  const [sonOdemeler, setSonOdemeler] = useState([])
  // Sözleşme yanlış girildiyse silmeden düzeltebilmek için satır-içi düzenleme.
  const [sozlesmeDuzenlenenId, setSozlesmeDuzenlenenId] = useState(null)
  const [duzenleKalem, setDuzenleKalem] = useState('Okul')
  const [duzenleToplamTutar, setDuzenleToplamTutar] = useState('')
  const [duzenleTaksitSayisi, setDuzenleTaksitSayisi] = useState('1')
  const [duzenleIlkTaksitTarihi, setDuzenleIlkTaksitTarihi] = useState('')
  const [duzenleEgitimDonemi, setDuzenleEgitimDonemi] = useState('')
  const [duzenleSinifMetni, setDuzenleSinifMetni] = useState('')
  const [duzenleSozlesmeTarihi, setDuzenleSozlesmeTarihi] = useState('')
  const [sozlesmeKaydediliyor, setSozlesmeKaydediliyor] = useState(false)

  function sonOdemeleriYukle() {
    // İkinci sıralama ölçütü created_at: "Dağıtılmamış" bir ödeme sonradan
    // kalemlere bölününce (bkz. OdemeDagitForm.kaydet), yeni satırlar orijinal
    // ödemenin "tarih"ini aynen devralır — sadece tarihe göre sıralarsak aynı
    // güne ait farklı öğrencilerin dağıtılmış kayıtları rastgele karışabiliyor.
    // created_at (gerçek giriş sırası) ile bu karışıklık düzeliyor.
    //
    // 40 satır çekip sonOdemeleriGrupSiniriylaKes ile en az 15'e tamamlıyoruz —
    // düz limit(15) kullansaydık, bir öğrencinin aynı günkü tek işlemi (ör.
    // Bire Bir + Kitap diye 2 satıra bölünmüş) tam sınırın ortasına denk
    // gelirse ikiye bölünüp yarısı görünmez olurdu.
    supabase
      .from('odemeler')
      .select('*, ogrenciler(ad_soyad)')
      .order('tarih', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(40)
      .then(({ data }) => setSonOdemeler(sonOdemeleriGrupSiniriylaKes(data || [], 15)))
  }

  useEffect(() => {
    if (!profile) return
    supabase.from('ogrenciler').select('*').order('ad_soyad').then(({ data }) => {
      const tumu = data || []
      // GÜVENLİK: veli için listeyi burada, İSTEMCİ TARAFINDA da kendi bağlı
      // olduğu öğrenci(ler)e göre filtreliyoruz — sunucudaki RLS kuralına
      // körü körüne güvenmek yerine, veli_profile_id kendi profiliyle
      // eşleşmeyen HİÇBİR öğrenci bu listeye/otomatik seçime girmesin diye.
      const liste = profile.rol === 'yonetici' ? tumu : tumu.filter((o) => o.veli_profile_id === profile.id)
      setOgrenciler(liste)
      setLoading(false)
      // Aşağıdaki tüm içerik seciliId dolu olmadan HİÇ görünmüyor (yönetici
      // elle seçim yapsın diye böyle tasarlandı) — veli için bunu bekletmeden
      // otomatik ilk (genelde tek) çocuğunu seçili getiriyoruz, sayfa boş
      // görünmesin.
      if (profile.rol !== 'yonetici' && liste.length > 0) {
        setSeciliId(liste[0].id)
      }
    })
    if (profile.rol === 'yonetici') sonOdemeleriYukle()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.rol, profile?.id])

  function veriyiYenile() {
    if (!seciliId) return
    setLoading(true)
    // Fatura Ortağı (ör. ikiz kardeşler): ders programları ayrı kalır, ama
    // muhasebeleri ortak tutulsun diye biri diğerine "fatura_sahibi_id" ile
    // bağlanabilir. Hangi taraf seçilirse seçilsin AYNI birleşik ekstre
    // görünsün diye "efektif sahip"i (kendisi fatura_sahibi_id'liyse onun
    // işaret ettiği kişi, değilse kendisi) ve ona bağlı tüm grubu buluyoruz.
    // Partneri olmayan bir öğrenci için grup=[seciliId] olur — yani hiçbir
    // mevcut hesaplama/davranış değişmez.
    const secili = ogrenciler.find((o) => o.id === seciliId)
    const efektifId = secili?.fatura_sahibi_id || seciliId
    const grup = [...new Set([efektifId, ...ogrenciler.filter((o) => o.fatura_sahibi_id === efektifId).map((o) => o.id)])]
    Promise.all([
      supabase.from('sozlesmeler').select('*').in('ogrenci_id', grup),
      supabase.from('aylik_borclar').select('*').in('ogrenci_id', grup).order('donem', { ascending: false }),
      // "ogrenciler(ad_soyad)" join'i bu sorguda zaten daha önceden (sonOdemeleriYukle
      // fonksiyonunda) kanıtlanmış bir kalıp — Fatura Ortağı birleştirmesinde "kime
      // ait" gösterebilmek için (Ödeme Geçmişi tablosu) burada da kullanıyoruz.
      supabase.from('odemeler').select('*, ogrenciler(ad_soyad)').in('ogrenci_id', grup).order('tarih', { ascending: false }),
      // Öğretmen adını da (profiles join) çekiyoruz — döküm tablosunda "hangi
      // öğretmenden" görebilmek için.
      supabase.from('bire_bir_atamalari').select('*, profiles:ogretmen_profile_id(ad_soyad, brans), ogrenciler(ad_soyad)').in('ogrenci_id', grup),
      // "Ek Ders" (atamaya bağlı olmayan, tek seferlik bire bir) kayıtları
      supabase
        .from('bire_bir_yoklama')
        .select('*, profiles:ogretmen_profile_id(ad_soyad, brans), ogrenciler(ad_soyad)')
        .in('ogrenci_id', grup)
        .is('atama_id', null),
      supabase.from('kantin_alislar').select('*').in('ogrenci_id', grup),
    ]).then(([s, a, o, bba, ekDersler, kantin]) => {
      const atamalar = bba.data || []
      const atamaIdleri = atamalar.map((x) => x.id)
      const yoklamaSorgusu =
        atamaIdleri.length > 0
          ? supabase.from('bire_bir_yoklama').select('*').in('atama_id', atamaIdleri)
          : Promise.resolve({ data: [] })
      yoklamaSorgusu.then((by) => {
        const tumYoklamalar = [...(by.data || []), ...(ekDersler.data || [])]
        const bireBirBorclar = bireBirBorclariOlustur(atamalar, tumYoklamalar)
        const kantinBorclar = kantinBorclariOlustur(kantin.data || [])
        setSozlesmeler(s.data || [])
        setAylikBorclar([...(a.data || []), ...bireBirBorclar, ...kantinBorclar])
        setOdemeler(o.data || [])
        setBireBirDersleri(bireBirDersDetaylariOlustur(atamalar, tumYoklamalar))
        setLoading(false)
        // Bu öğrenciye yeni bir ödeme eklenmiş/silinmiş olabilir — giriş
        // ekranındaki "Son Alınan Ödemeler" listesini de güncel tutalım.
        sonOdemeleriYukle()
      })
    })
  }

  useEffect(() => {
    veriyiYenile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seciliId])

  // seciliId dışarıdan (ör. veli için otomatik ilk çocuk seçimi) değiştiğinde,
  // arama kutusunun içindeki metni de o öğrencinin adıyla senkron tutuyoruz —
  // yoksa kutu boş görünüp kafa karıştırır.
  useEffect(() => {
    const secili = ogrenciler.find((o) => o.id === seciliId)
    setOgrenciArama(secili ? secili.ad_soyad : '')
  }, [seciliId, ogrenciler])

  const gorunenOgrenciler = useMemo(() => {
    const aranan = ogrenciArama.trim().toLocaleLowerCase('tr-TR')
    if (!aranan) return ogrenciler
    return ogrenciler.filter((o) => o.ad_soyad.toLocaleLowerCase('tr-TR').includes(aranan))
  }, [ogrenciler, ogrenciArama])

  // "aylikBorclar" listesi HEM gerçek "aylik_borclar" tablosundaki satırları
  // (id düz bir uuid) HEM DE Bire Bir/Kantin sayfalarından otomatik üretilen
  // sentetik satırları (id "bb-..."/"kt-..." önekiyle başlar, gerçek tabloda
  // karşılığı yok) içeriyor. Sentetik satırlar buradan silinemez — onlar
  // Bire Bir/Kantin sayfasındaki asıl kaydı (ders/alışveriş) silince otomatik
  // kalkar. Bu yüzden sadece GERÇEK (önek taşımayan) satırlar için "Sil"
  // gösteriyoruz; bu genelde elle (aylık borç ekle formuyla) girilmiş, hatalı
  // veya eskimiş bir kaydı düzeltmek için kullanılır.
  function aylikBorcGercekMi(a) {
    return !String(a.id).startsWith('bb-') && !String(a.id).startsWith('kt-')
  }

  async function aylikBorcSil(a) {
    if (
      !confirm(
        `"${a.kalem}" kalemi için ${new Date(a.donem).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })} dönemine ait ${paraFormat(a.tutar)} tutarındaki elle girilmiş borç kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`
      )
    )
      return
    const { error } = await supabase.from('aylik_borclar').delete().eq('id', a.id)
    if (error) alert('Hata: ' + error.message)
    else veriyiYenile()
  }

  async function odemeSil(o) {
    if (!confirm(`${new Date(o.tarih).toLocaleDateString('tr-TR')} tarihli "${o.kalem || 'ödeme'}" (${paraFormat(o.tutar)}) kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz, öğrencinin bakiyesi otomatik olarak yeniden hesaplanır.`)) return
    const { error } = await supabase.from('odemeler').delete().eq('id', o.id)
    if (error) alert('Hata: ' + error.message)
    else veriyiYenile()
  }

  async function sozlesmeSil(s) {
    if (!confirm(`"${s.kalem}" kalemi için ${paraFormat(s.toplam_tutar)} tutarındaki sözleşmeyi silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz. Öğrencinin kendisi SİLİNMEZ, sadece bu sözleşme kaydı ve ona bağlı ödeme planı kaldırılır.`)) return
    const { error } = await supabase.from('sozlesmeler').delete().eq('id', s.id)
    if (error) alert('Hata: ' + error.message)
    else veriyiYenile()
  }

  function sozlesmeDuzenlemeyeBasla(s) {
    setSozlesmeDuzenlenenId(s.id)
    setDuzenleKalem(s.kalem)
    setDuzenleToplamTutar(String(s.toplam_tutar))
    setDuzenleTaksitSayisi(String(s.taksit_sayisi || 1))
    setDuzenleIlkTaksitTarihi(s.ilk_taksit_tarihi || '')
    setDuzenleEgitimDonemi(s.egitim_donemi || '')
    setDuzenleSinifMetni(s.sinif_metni || '')
    setDuzenleSozlesmeTarihi(s.sozlesme_tarihi || '')
  }

  function sozlesmeDuzenlemeyiVazgec() {
    setSozlesmeDuzenlenenId(null)
  }

  async function sozlesmeDuzenlemeyiKaydet(id) {
    if (!duzenleToplamTutar || Number(duzenleToplamTutar) <= 0) {
      alert('Toplam tutar 0\'dan büyük olmalı.')
      return
    }
    setSozlesmeKaydediliyor(true)
    const { error } = await supabase
      .from('sozlesmeler')
      .update({
        kalem: duzenleKalem,
        toplam_tutar: Number(duzenleToplamTutar),
        taksit_sayisi: Number(duzenleTaksitSayisi) || 1,
        ilk_taksit_tarihi: duzenleIlkTaksitTarihi || null,
        egitim_donemi: duzenleEgitimDonemi.trim() || null,
        sinif_metni: duzenleSinifMetni.trim() ? ilkHarfleriBuyukYap(duzenleSinifMetni.trim()) : null,
        sozlesme_tarihi: duzenleSozlesmeTarihi || null,
      })
      .eq('id', id)
    setSozlesmeKaydediliyor(false)
    if (error) {
      alert('Hata: ' + error.message)
    } else {
      setSozlesmeDuzenlenenId(null)
      veriyiYenile()
    }
  }

  // "Aylık Kalem Borçları" tablosu artık her dersi/alışı tek tek değil, aynı
  // kalem+ay için TEK bir toplam satır olarak gösteriyor (bkz. yorum, ekstreHesap.js).
  const aylikBorclarGruplu = aylikBorclariKalemAyaGoreGrupla(aylikBorclar)

  const seciliOgrenci = ogrenciler.find((o) => o.id === seciliId)
  // Veli birden fazla öğrenciye bağlıysa (kardeşler), yönetici olmasa da
  // aralarında geçiş yapabilsin diye seçiciyi ona da gösteriyoruz.
  const seciciGoster = (isYonetici || ogrenciler.length > 1) && ogrenciler.length > 0

  // Fatura Ortağı grubu (bkz. veriyiYenile) — banner göstermek için burada
  // da hesaplıyoruz. Partneri olmayan öğrencide grup sadece kendisidir.
  const faturaEfektifId = seciliOgrenci?.fatura_sahibi_id || seciliId
  const faturaGrubu = ogrenciler.filter((o) => o.id === faturaEfektifId || o.fatura_sahibi_id === faturaEfektifId)
  const faturaDigerleri = faturaGrubu.filter((o) => o.id !== seciliId)
  // Birleşik görünümde her satırın KİME ait olduğunu göstermek/doğru makbuz
  // linki üretmek için — "ogrenciler" state'i zaten TÜM öğrencileri içeriyor,
  // ekstra bir sorguya gerek yok.
  function adSoyadBul(ogrenciId) {
    return ogrenciler.find((o) => o.id === ogrenciId)?.ad_soyad || '—'
  }

  const toplamOdenen = odemeler.reduce((t, o) => t + Number(o.tutar), 0)
  const toplamSozlesme = sozlesmeler.reduce((t, s) => t + Number(s.toplam_tutar), 0)
  const toplamAylikBorc = aylikBorclar.reduce((t, a) => t + Number(a.tutar), 0)
  const kalanBakiye = Math.max(0, toplamSozlesme + toplamAylikBorc - toplamOdenen)
  // Hangi kalemlerde (varsa) borçtan fazla ödeme yapılmış — "Fazla Ödeme
  // (Alacaklı)" paneli için.
  const fazlaOdemeler = fazlaOdemeleriHesapla(sozlesmeler, aylikBorclar, odemeler)
  // "Toplam Aylık Borç" kartı ÖNCEDEN şimdiye kadar birikmiş TÜM zamanların
  // brüt Bire Bir/Kantin borcunu gösteriyordu — veli bunu "bu ay ödeyeceğim
  // miktar" sanıp kafası karışıyordu. Onun yerine, Ekstre'deki "BU AY
  // ÖDENMESİ GEREKEN MİKTAR" ile AYNI mantıkla, güncel ayın gerçek ödenecek
  // toplamını gösteriyoruz — yeni bir Bire Bir dersi/Kantin alışı eklendikçe
  // bu da (veriyiYenile ile) otomatik güncellenir.
  const buAy = new Date().toISOString().slice(0, 7)
  const buAySatirlar = ogrenciSatirlariHesapla(sozlesmeler, aylikBorclar, odemeler, buAy)
  const buAyOdenecek = buAySatirlar.reduce((t, x) => t + x.toplamOdenecek, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-navy">{isYonetici ? 'Muhasebe' : 'Ödeme Durumu'}</h1>
        {isYonetici && seciliId && (
          <Link
            to={`/ekstre/${seciliId}`}
            target="_blank"
            className="bg-navy text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue transition-colors text-sm"
          >
            Aylık Ekstre Görüntüle / Yazdır
          </Link>
        )}
      </div>

      {seciciGoster && (
        <div className="mb-6 relative max-w-sm">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {isYonetici ? 'Öğrenci Seç' : 'Çocuğunuzu Seçin'}
          </label>
          <input
            type="text"
            value={ogrenciArama}
            onChange={(e) => {
              setOgrenciArama(e.target.value)
              setSeciliId('')
              setOgrenciOneriAcik(true)
            }}
            onFocus={() => setOgrenciOneriAcik(true)}
            onBlur={() => setTimeout(() => setOgrenciOneriAcik(false), 150)}
            placeholder="Yazarak arayın ya da listeden seçin..."
            autoComplete="off"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
          {ogrenciOneriAcik && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {gorunenOgrenciler.length === 0 ? (
                <p className="px-3 py-2 text-sm text-gray-400">Eşleşen öğrenci bulunamadı.</p>
              ) : (
                gorunenOgrenciler.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSeciliId(o.id)
                      setOgrenciArama(o.ad_soyad)
                      setOgrenciOneriAcik(false)
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-orange-50 ${
                      seciliId === o.id ? 'bg-orange-50 font-semibold text-navy' : 'text-gray-700'
                    }`}
                  >
                    {o.ad_soyad}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {ogrenciler.length === 0 && !loading && (
        <p className="text-gray-400">
          {isYonetici
            ? 'Görüntülenecek öğrenci kaydı bulunamadı.'
            : 'Size bağlı bir öğrenci bulunamadı. Lütfen okul yönetimiyle iletişime geçin.'}
        </p>
      )}

      {isYonetici && !seciliId && ogrenciler.length > 0 && !loading && (
        <>
          <p className="text-gray-400 mb-6">Devam etmek için yukarıdan bir öğrenci seçin.</p>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-700">Son Alınan Ödemeler</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Kimin ne ödediğini unutmayasınız diye — en son alınan 15 ödeme, tüm öğrenciler dahil.
              </p>
            </div>
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Tarih</th>
                  <th className="px-4 py-2 font-medium">Öğrenci</th>
                  <th className="px-4 py-2 font-medium">Kalem</th>
                  <th className="px-4 py-2 font-medium">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {sonOdemeler.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-4 text-center text-gray-400">Henüz ödeme kaydı yok.</td></tr>
                )}
                {sonOdemeler.map((o) => (
                  <tr key={o.id} className="border-t border-gray-50">
                    <td className="px-4 py-2">{new Date(o.tarih).toLocaleDateString('tr-TR')}</td>
                    <td className="px-4 py-2 font-medium text-gray-800">{o.ogrenciler?.ad_soyad || '—'}</td>
                    <td className="px-4 py-2">{o.kalem || '—'}</td>
                    <td className="px-4 py-2 font-medium text-green-600">{paraFormat(o.tutar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {seciliOgrenci && (
        <>
          {faturaDigerleri.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 mb-4 text-sm text-purple-800">
              Birleşik ekstre: bu görünümdeki borç/ödeme toplamları <strong>{faturaDigerleri.map((o) => o.ad_soyad).join(', ')}</strong>{' '}
              ile ortak tutuluyor (Fatura Ortağı bağlantısı, bkz. Öğrenciler sayfası). Ders programları birbirinden bağımsız kalmaya devam eder.
            </div>
          )}
          {isYonetici && (
            <>
              <OdemeEkleForm ogrenciId={seciliId} onEklendi={veriyiYenile} />
              <div className="flex flex-wrap gap-4 mb-6">
                <SozlesmeEkleForm ogrenciId={seciliId} onEklendi={veriyiYenile} />
                <GecmisBorcEkleForm ogrenciId={seciliId} onEklendi={veriyiYenile} />
              </div>
              <DagitilmamisOdemelerPaneli odemeler={odemeler} onDegisti={veriyiYenile} digerOgrenciAdlari={faturaDigerleri.length > 0} />
            </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm text-gray-500 font-medium">Toplam Sözleşme</p>
              <p className="text-2xl font-bold text-navy mt-1">{paraFormat(toplamSozlesme)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm text-gray-500 font-medium">Bu Ay Ödenecek</p>
              <p className="text-2xl font-bold text-orange mt-1">{paraFormat(buAyOdenecek)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm text-gray-500 font-medium">Toplam Ödenen</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{paraFormat(toplamOdenen)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm text-gray-500 font-medium">Kalan Bakiye</p>
              <p className="text-2xl font-bold text-orange mt-1">{paraFormat(kalanBakiye)}</p>
            </div>
          </div>

          <FazlaOdemePaneli fazlaOdemeler={fazlaOdemeler} />

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto mb-6">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-700">Sözleşmeler</h2>
            </div>
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Kalem</th>
                  {faturaDigerleri.length > 0 && <th className="px-4 py-2 font-medium">Öğrenci</th>}
                  <th className="px-4 py-2 font-medium">Toplam Tutar</th>
                  <th className="px-4 py-2 font-medium">Taksit Sayısı</th>
                  <th className="px-4 py-2 font-medium">İlk Taksit</th>
                  <th className="px-4 py-2 font-medium text-right">Sözleşme</th>
                </tr>
              </thead>
              <tbody>
                {sozlesmeler.length === 0 && (
                  <tr><td colSpan={faturaDigerleri.length > 0 ? 6 : 5} className="px-4 py-4 text-center text-gray-400">Sözleşme bulunamadı.</td></tr>
                )}
                {sozlesmeler.map((s) => {
                  if (sozlesmeDuzenlenenId === s.id) {
                    return (
                      <tr key={s.id} className="bg-blue-50 border-t border-gray-50">
                        <td colSpan={faturaDigerleri.length > 0 ? 6 : 5} className="px-4 py-3">
                          <div className="flex flex-wrap gap-3 items-end mb-3">
                            <div className="flex-1 min-w-[110px]">
                              <label className="block text-xs font-medium text-gray-500 mb-1">Kalem</label>
                              <select
                                value={duzenleKalem}
                                onChange={(e) => setDuzenleKalem(e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue"
                              >
                                <option>Okul</option>
                                <option>Kurs</option>
                                <option>Kitap</option>
                              </select>
                            </div>
                            <div className="flex-1 min-w-[130px]">
                              <label className="block text-xs font-medium text-gray-500 mb-1">Toplam Tutar (₺)</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={duzenleToplamTutar}
                                onChange={(e) => setDuzenleToplamTutar(e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                              />
                            </div>
                            <div className="flex-1 min-w-[100px]">
                              <label className="block text-xs font-medium text-gray-500 mb-1">Taksit Sayısı</label>
                              <input
                                type="number"
                                min="1"
                                value={duzenleTaksitSayisi}
                                onChange={(e) => setDuzenleTaksitSayisi(e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                              />
                            </div>
                            <div className="flex-1 min-w-[140px]">
                              <label className="block text-xs font-medium text-gray-500 mb-1">İlk Taksit Tarihi</label>
                              <input
                                type="date"
                                value={duzenleIlkTaksitTarihi}
                                onChange={(e) => setDuzenleIlkTaksitTarihi(e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                              />
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-3 items-end mb-3">
                            <div className="flex-1 min-w-[120px]">
                              <label className="block text-xs font-medium text-gray-500 mb-1">Sözleşme Tarihi</label>
                              <input
                                type="date"
                                value={duzenleSozlesmeTarihi}
                                onChange={(e) => setDuzenleSozlesmeTarihi(e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                              />
                            </div>
                            <div className="flex-1 min-w-[120px]">
                              <label className="block text-xs font-medium text-gray-500 mb-1">Eğitim Dönemi</label>
                              <input
                                value={duzenleEgitimDonemi}
                                onChange={(e) => setDuzenleEgitimDonemi(e.target.value)}
                                placeholder="2026-2027"
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                              />
                            </div>
                            <div className="flex-1 min-w-[120px]">
                              <label className="block text-xs font-medium text-gray-500 mb-1">Sınıf (sözleşmede)</label>
                              <input
                                value={duzenleSinifMetni}
                                onChange={(e) => setDuzenleSinifMetni(e.target.value)}
                                placeholder="örn. 9-A ya da Bire Bir"
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                              />
                            </div>
                          </div>
                          <div className="space-x-3">
                            <button
                              onClick={() => sozlesmeDuzenlemeyiKaydet(s.id)}
                              disabled={sozlesmeKaydediliyor}
                              className="text-green-600 text-sm font-semibold hover:underline disabled:opacity-50"
                            >
                              {sozlesmeKaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
                            </button>
                            <button onClick={sozlesmeDuzenlemeyiVazgec} className="text-gray-500 text-sm hover:underline">
                              Vazgeç
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={s.id} className="border-t border-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-800">{s.kalem}</td>
                      {faturaDigerleri.length > 0 && (
                        <td className="px-4 py-2 text-purple-700">{adSoyadBul(s.ogrenci_id)}</td>
                      )}
                      <td className="px-4 py-2">{paraFormat(s.toplam_tutar)}</td>
                      <td className="px-4 py-2">{s.taksit_sayisi}</td>
                      <td className="px-4 py-2">{s.ilk_taksit_tarihi ? new Date(s.ilk_taksit_tarihi).toLocaleDateString('tr-TR') : '—'}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap space-x-3">
                        {isYonetici ? (
                          <>
                            <Link to={`/sozlesme/${s.id}`} target="_blank" className="text-blue text-sm hover:underline">
                              Görüntüle / Yazdır
                            </Link>
                            <button onClick={() => sozlesmeDuzenlemeyeBasla(s)} className="text-navy text-sm hover:underline">
                              Düzenle
                            </button>
                            <button onClick={() => sozlesmeSil(s)} className="text-red-500 text-sm hover:underline">
                              Sil
                            </button>
                          </>
                        ) : (
                          <span className="text-gray-300 text-sm">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {sozlesmeler.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="font-semibold text-gray-700">Ödeme Planı (Taksit Taksit)</h2>
                <p className="text-xs text-gray-400 mt-0.5">Her sözleşmenin tüm taksitleri, vade tarihi ve durumuyla.</p>
              </div>
              <div className="divide-y divide-gray-50">
                {sozlesmeler.map((s) => {
                  const taksitler = taksitPlaniOlustur(s, odemeler)
                  if (taksitler.length === 0) return null
                  return (
                    <div key={s.id} className="p-4 overflow-x-auto">
                      <p className="font-semibold text-gray-800 mb-2">
                        {s.kalem}
                        {faturaDigerleri.length > 0 && (
                          <span className="text-purple-600 font-normal text-sm"> — {adSoyadBul(s.ogrenci_id)}</span>
                        )}
                      </p>
                      <table className="w-full text-sm min-w-[440px]">
                        <thead>
                          <tr className="text-left text-gray-500">
                            <th className="px-2 py-1 font-medium">Taksit</th>
                            <th className="px-2 py-1 font-medium">Vade Tarihi</th>
                            <th className="px-2 py-1 font-medium">Tutar</th>
                            <th className="px-2 py-1 font-medium">Durum</th>
                            <th className="px-2 py-1 font-medium">Kalan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {taksitler.map((t) => (
                            <tr
                              key={t.taksitNo}
                              className={`border-t border-gray-50 ${
                                t.durum === 'gecikti' ? 'bg-red-50' : t.durum === 'kismi' ? 'bg-amber-50' : ''
                              }`}
                            >
                              <td className="px-2 py-1.5">{t.taksitNo}/{s.taksit_sayisi}</td>
                              <td className="px-2 py-1.5">{t.vade.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}</td>
                              <td className="px-2 py-1.5">{paraFormat(t.tutar)}</td>
                              <td className="px-2 py-1.5"><DurumRozeti durum={t.durum} /></td>
                              <td className="px-2 py-1.5">
                                {t.durum === 'kismi' ? (
                                  <span className="text-amber-700 font-semibold">{paraFormat(t.kalanTutar)}</span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto mb-6">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-700">Aylık Kalem Borçları (Bire Bir / Yemek / Kantin)</h2>
            </div>
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Kalem</th>
                  {faturaDigerleri.length > 0 && <th className="px-4 py-2 font-medium">Öğrenci</th>}
                  <th className="px-4 py-2 font-medium">Dönem</th>
                  <th className="px-4 py-2 font-medium">Tutar</th>
                  <th className="px-4 py-2 font-medium">Durum</th>
                  <th className="px-4 py-2 font-medium">Kalan</th>
                  {isYonetici && <th className="px-4 py-2 font-medium">İşlemler</th>}
                </tr>
              </thead>
              <tbody>
                {aylikBorclarGruplu.length === 0 && (
                  <tr><td colSpan={isYonetici ? (faturaDigerleri.length > 0 ? 7 : 6) : (faturaDigerleri.length > 0 ? 6 : 5)} className="px-4 py-4 text-center text-gray-400">Aylık kalem borcu bulunamadı.</td></tr>
                )}
                {aylikBorclarGruplu.map((g) => {
                  const d = aylikBorcDurumHesapla(g, aylikBorclar, odemeler)
                  // Bu gruptaki satırlar farklı öğrencilere ait olabilir (ör. ikisi
                  // de aynı ay "Bire Bir" borcu doğurmuş olabilir) — hepsinin
                  // isimlerini tekrarsız gösteriyoruz.
                  const gOgrenciAdlari = [...new Set(g.satirlar.map((sat) => adSoyadBul(sat.ogrenci_id)))]
                  return (
                  <tr key={g.id} className={`border-t border-gray-50 ${d.durum === 'gecikti' ? 'bg-red-50' : d.durum === 'kismi' ? 'bg-amber-50' : ''}`}>
                    <td className="px-4 py-2 font-medium text-gray-800">
                      {g.kalem}
                      {g.satirlar.length > 1 && (
                        <span className="text-gray-400 font-normal text-xs ml-1">({g.satirlar.length} işlem)</span>
                      )}
                    </td>
                    {faturaDigerleri.length > 0 && (
                      <td className="px-4 py-2 text-purple-700">{gOgrenciAdlari.join(', ')}</td>
                    )}
                    <td className="px-4 py-2">{new Date(g.donem).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</td>
                    <td className="px-4 py-2">{paraFormat(g.tutar)}</td>
                    <td className="px-4 py-2"><DurumRozeti durum={d.durum} /></td>
                    <td className="px-4 py-2">
                      {d.durum === 'kismi' ? (
                        <span className="text-amber-700 font-semibold">{paraFormat(d.kalanTutar)}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    {isYonetici && (
                      <td className="px-4 py-2">
                        {g.satirlar.length === 1 && aylikBorcGercekMi(g.satirlar[0]) ? (
                          <button onClick={() => aylikBorcSil(g.satirlar[0])} className="text-red-500 text-sm hover:underline">
                            Sil
                          </button>
                        ) : (
                          <span
                            className="text-gray-300 text-xs"
                            title="Bu satır Bire Bir/Kantin sayfasındaki kayıtlardan otomatik oluşturuluyor (tek tek dersler için aşağıdaki 'Bire Bir Ders Dökümü' bölümüne bakın) — silmek için o sayfadaki asıl kaydı silin."
                          >
                            —
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {bireBirDersleri.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="font-semibold text-gray-700">Bire Bir Ders Dökümü</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Yukarıdaki "Bire Bir" toplamının ARKASINDAKİ tek tek dersler — hangi tarihte, hangi
                  öğretmenden, ne kadara. Sadece "Geldi" (faturalanmış) dersler burada görünür.
                  "Aylık" ile ay ay, "Haftalık" ile hafta hafta görebilirsiniz.
                </p>
              </div>
              <div className="p-4 overflow-x-auto">
                <BireBirDersDokumu
                  dersler={bireBirDersleri.map((d) => ({
                    ...d,
                    karsiTarafAdi: d.ogretmenAdi,
                    karsiTarafBransi: d.ogretmenBransi,
                    ikinciTarafAdi: d.ogrenciAdi,
                  }))}
                  karsiTarafBasligi="Öğretmen"
                  {...(faturaDigerleri.length > 0 ? { ikinciTarafBasligi: 'Öğrenci' } : {})}
                />
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-700">Ödeme Geçmişi</h2>
              {isYonetici && (
                <p className="text-xs text-gray-400 mt-0.5">
                  "Makbuz Yazdır" o günün TÜM kalemlerini tek makbuzda toplu gösterir — her kalem için ayrı ayrı basmanıza gerek yok.
                  {faturaDigerleri.length > 0 && ' Fatura Ortağı ile birleşik görünümde, makbuz her zaman ödemenin KENDİ öğrencisi adına kesilir.'}
                </p>
              )}
            </div>
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Tarih</th>
                  {faturaDigerleri.length > 0 && <th className="px-4 py-2 font-medium">Öğrenci</th>}
                  <th className="px-4 py-2 font-medium">Kalem</th>
                  <th className="px-4 py-2 font-medium">Tutar</th>
                  {isYonetici && <th className="px-4 py-2 font-medium text-right">Makbuz</th>}
                </tr>
              </thead>
              <tbody>
                {odemeler.length === 0 && (
                  <tr><td colSpan={isYonetici ? (faturaDigerleri.length > 0 ? 5 : 4) : (faturaDigerleri.length > 0 ? 4 : 3)} className="px-4 py-4 text-center text-gray-400">Ödeme kaydı bulunamadı.</td></tr>
                )}
                {odemeler.map((o) => (
                  <tr key={o.id} className="border-t border-gray-50">
                    <td className="px-4 py-2">{new Date(o.tarih).toLocaleDateString('tr-TR')}</td>
                    {faturaDigerleri.length > 0 && (
                      <td className="px-4 py-2 text-purple-700">{o.ogrenciler?.ad_soyad || adSoyadBul(o.ogrenci_id)}</td>
                    )}
                    <td className="px-4 py-2">{o.kalem || '—'}</td>
                    <td className="px-4 py-2 font-medium">{paraFormat(o.tutar)}</td>
                    {isYonetici && (
                      <td className="px-4 py-2 text-right whitespace-nowrap space-x-3">
                        {/* ÖNEMLİ: Fatura Ortağı ile birleşik görünümde bu liste
                            İKİ öğrencinin ödemelerini birden gösterebilir — makbuz
                            linki seçili öğrenci (seciliId) yerine HER ZAMAN o
                            ödemenin GERÇEK sahibi olan o.ogrenci_id'yi kullanmalı,
                            yoksa partnerin ödemesi için yanlış öğrenci adına (ya da
                            boş) bir makbuz üretilirdi. */}
                        <Link
                          to={`/makbuz-gun/${o.ogrenci_id}/${gunAnahtari(o.tarih)}`}
                          target="_blank"
                          className="text-blue text-sm hover:underline"
                        >
                          Makbuz Yazdır
                        </Link>
                        <button onClick={() => odemeSil(o)} className="text-red-500 text-sm hover:underline">
                          Sil
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
