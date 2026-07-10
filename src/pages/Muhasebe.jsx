import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { taksitPlaniOlustur, aylikBorcDurumHesapla, gunAnahtari } from '../lib/ekstreHesap'

function paraFormat(n) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n || 0)
}

const DURUM_ETIKET = {
  odendi: { text: 'Ödendi', cls: 'bg-green-100 text-green-700' },
  gecikti: { text: 'Gecikti', cls: 'bg-red-100 text-red-700' },
  bekliyor: { text: 'Bekliyor', cls: 'bg-gray-100 text-gray-600' },
}

function DurumRozeti({ durum }) {
  const d = DURUM_ETIKET[durum] || DURUM_ETIKET.bekliyor
  return <span className={`text-xs font-semibold px-2 py-1 rounded-full ${d.cls}`}>{d.text}</span>
}

const DAGITILAMAYAN_ETIKET = 'Dağıtılmamış'
const DAGITILABILIR_KALEMLER = ['Okul', 'Kurs', 'Kitap', 'Bire Bir', 'Yemek', 'Kantin']

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

function DagitilmamisOdemelerPaneli({ odemeler, onDegisti }) {
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
                <p className="font-medium text-gray-800">{paraFormat(o.tutar)}</p>
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
    })
    setGonderiliyor(false)
    if (!error) {
      setToplamTutar('')
      setTaksitSayisi('1')
      setIlkTaksitTarihi('')
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

function AylikBorcEkleForm({ ogrenciId, onEklendi }) {
  const [kalem, setKalem] = useState('Bire Bir')
  const [tutar, setTutar] = useState('')
  const [donem, setDonem] = useState(() => new Date().toISOString().slice(0, 7))
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [acik, setAcik] = useState(false)

  async function ekle(e) {
    e.preventDefault()
    if (!tutar || Number(tutar) <= 0 || !donem) return
    setGonderiliyor(true)
    const { error } = await supabase.from('aylik_borclar').insert({
      ogrenci_id: ogrenciId,
      kalem,
      tutar: Number(tutar),
      donem: `${donem}-01`,
    })
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
        + Aylık kalem borcu ekle
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
            <option>Bire Bir</option>
            <option>Yemek</option>
            <option>Kantin</option>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Dönem (Ay)</label>
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
          {gonderiliyor ? 'Ekleniyor...' : 'Aylık Borç Ekle'}
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

export default function Muhasebe() {
  const { profile } = useAuth()
  const isYonetici = profile?.rol === 'yonetici'

  const [ogrenciler, setOgrenciler] = useState([])
  const [seciliId, setSeciliId] = useState('')
  const [sozlesmeler, setSozlesmeler] = useState([])
  const [aylikBorclar, setAylikBorclar] = useState([])
  const [odemeler, setOdemeler] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('ogrenciler').select('*').order('ad_soyad').then(({ data }) => {
      setOgrenciler(data || [])
      setLoading(false)
    })
  }, [])

  function veriyiYenile() {
    if (!seciliId) return
    setLoading(true)
    Promise.all([
      supabase.from('sozlesmeler').select('*').eq('ogrenci_id', seciliId),
      supabase.from('aylik_borclar').select('*').eq('ogrenci_id', seciliId).order('donem', { ascending: false }),
      supabase.from('odemeler').select('*').eq('ogrenci_id', seciliId).order('tarih', { ascending: false }),
    ]).then(([s, a, o]) => {
      setSozlesmeler(s.data || [])
      setAylikBorclar(a.data || [])
      setOdemeler(o.data || [])
      setLoading(false)
    })
  }

  useEffect(() => {
    veriyiYenile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seciliId])

  const seciliOgrenci = ogrenciler.find((o) => o.id === seciliId)

  const toplamOdenen = odemeler.reduce((t, o) => t + Number(o.tutar), 0)
  const toplamSozlesme = sozlesmeler.reduce((t, s) => t + Number(s.toplam_tutar), 0)
  const toplamAylikBorc = aylikBorclar.reduce((t, a) => t + Number(a.tutar), 0)
  const kalanBakiye = Math.max(0, toplamSozlesme + toplamAylikBorc - toplamOdenen)

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-navy">{isYonetici ? 'Muhasebe' : 'Ödeme Durumu'}</h1>
        {seciliId && (
          <Link
            to={`/ekstre/${seciliId}`}
            target="_blank"
            className="bg-navy text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue transition-colors text-sm"
          >
            Aylık Ekstre Görüntüle / Yazdır
          </Link>
        )}
      </div>

      {isYonetici && ogrenciler.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Öğrenci Seç</label>
          <select
            value={seciliId}
            onChange={(e) => setSeciliId(e.target.value)}
            className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            <option value="">— Öğrenci Seçin —</option>
            {ogrenciler.map((o) => (
              <option key={o.id} value={o.id}>{o.ad_soyad}</option>
            ))}
          </select>
        </div>
      )}

      {ogrenciler.length === 0 && !loading && (
        <p className="text-gray-400">Görüntülenecek öğrenci kaydı bulunamadı.</p>
      )}

      {isYonetici && !seciliId && ogrenciler.length > 0 && !loading && (
        <p className="text-gray-400">Devam etmek için yukarıdan bir öğrenci seçin.</p>
      )}

      {seciliOgrenci && (
        <>
          {isYonetici && (
            <>
              <OdemeEkleForm ogrenciId={seciliId} onEklendi={veriyiYenile} />
              <div className="flex flex-wrap gap-4 mb-6">
                <SozlesmeEkleForm ogrenciId={seciliId} onEklendi={veriyiYenile} />
                <AylikBorcEkleForm ogrenciId={seciliId} onEklendi={veriyiYenile} />
              </div>
              <DagitilmamisOdemelerPaneli odemeler={odemeler} onDegisti={veriyiYenile} />
            </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm text-gray-500 font-medium">Toplam Sözleşme</p>
              <p className="text-2xl font-bold text-navy mt-1">{paraFormat(toplamSozlesme)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm text-gray-500 font-medium">Toplam Aylık Borç</p>
              <p className="text-2xl font-bold text-navy mt-1">{paraFormat(toplamAylikBorc)}</p>
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

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-700">Sözleşmeler</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Kalem</th>
                  <th className="px-4 py-2 font-medium">Toplam Tutar</th>
                  <th className="px-4 py-2 font-medium">Taksit Sayısı</th>
                  <th className="px-4 py-2 font-medium">İlk Taksit</th>
                </tr>
              </thead>
              <tbody>
                {sozlesmeler.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-4 text-center text-gray-400">Sözleşme bulunamadı.</td></tr>
                )}
                {sozlesmeler.map((s) => (
                  <tr key={s.id} className="border-t border-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-800">{s.kalem}</td>
                    <td className="px-4 py-2">{paraFormat(s.toplam_tutar)}</td>
                    <td className="px-4 py-2">{s.taksit_sayisi}</td>
                    <td className="px-4 py-2">{s.ilk_taksit_tarihi ? new Date(s.ilk_taksit_tarihi).toLocaleDateString('tr-TR') : '—'}</td>
                  </tr>
                ))}
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
                    <div key={s.id} className="p-4">
                      <p className="font-semibold text-gray-800 mb-2">{s.kalem}</p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500">
                            <th className="px-2 py-1 font-medium">Taksit</th>
                            <th className="px-2 py-1 font-medium">Vade Tarihi</th>
                            <th className="px-2 py-1 font-medium">Tutar</th>
                            <th className="px-2 py-1 font-medium">Durum</th>
                          </tr>
                        </thead>
                        <tbody>
                          {taksitler.map((t) => (
                            <tr
                              key={t.taksitNo}
                              className={`border-t border-gray-50 ${t.durum === 'gecikti' ? 'bg-red-50' : ''}`}
                            >
                              <td className="px-2 py-1.5">{t.taksitNo}/{s.taksit_sayisi}</td>
                              <td className="px-2 py-1.5">{t.vade.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}</td>
                              <td className="px-2 py-1.5">{paraFormat(t.tutar)}</td>
                              <td className="px-2 py-1.5"><DurumRozeti durum={t.durum} /></td>
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

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-700">Aylık Kalem Borçları (Bire Bir / Yemek / Kantin)</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Kalem</th>
                  <th className="px-4 py-2 font-medium">Dönem</th>
                  <th className="px-4 py-2 font-medium">Tutar</th>
                  <th className="px-4 py-2 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody>
                {aylikBorclar.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-4 text-center text-gray-400">Aylık kalem borcu bulunamadı.</td></tr>
                )}
                {aylikBorclar.map((a) => (
                  <tr key={a.id} className={`border-t border-gray-50 ${aylikBorcDurumHesapla(a, aylikBorclar, odemeler) === 'gecikti' ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-2 font-medium text-gray-800">{a.kalem}</td>
                    <td className="px-4 py-2">{new Date(a.donem).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</td>
                    <td className="px-4 py-2">{paraFormat(a.tutar)}</td>
                    <td className="px-4 py-2"><DurumRozeti durum={aylikBorcDurumHesapla(a, aylikBorclar, odemeler)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-700">Ödeme Geçmişi</h2>
              {isYonetici && (
                <p className="text-xs text-gray-400 mt-0.5">
                  "Makbuz Yazdır" o günün TÜM kalemlerini tek makbuzda toplu gösterir — her kalem için ayrı ayrı basmanıza gerek yok.
                </p>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Tarih</th>
                  <th className="px-4 py-2 font-medium">Kalem</th>
                  <th className="px-4 py-2 font-medium">Tutar</th>
                  {isYonetici && <th className="px-4 py-2 font-medium text-right">Makbuz</th>}
                </tr>
              </thead>
              <tbody>
                {odemeler.length === 0 && (
                  <tr><td colSpan={isYonetici ? 4 : 3} className="px-4 py-4 text-center text-gray-400">Ödeme kaydı bulunamadı.</td></tr>
                )}
                {odemeler.map((o) => (
                  <tr key={o.id} className="border-t border-gray-50">
                    <td className="px-4 py-2">{new Date(o.tarih).toLocaleDateString('tr-TR')}</td>
                    <td className="px-4 py-2">{o.kalem || '—'}</td>
                    <td className="px-4 py-2 font-medium">{paraFormat(o.tutar)}</td>
                    {isYonetici && (
                      <td className="px-4 py-2 text-right">
                        <Link
                          to={`/makbuz-gun/${seciliId}/${gunAnahtari(o.tarih)}`}
                          target="_blank"
                          className="text-blue text-sm hover:underline"
                        >
                          Makbuz Yazdır
                        </Link>
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
