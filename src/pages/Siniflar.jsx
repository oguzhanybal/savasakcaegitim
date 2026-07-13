import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ilkHarfleriBuyukYap } from '../lib/adSoyadFormat'

const EGITIM_YILLARI = ['2026-2027', '2027-2028', '2028-2029']

function ogretmenEtiket(o) {
  return o.brans ? `${o.ad_soyad} — ${o.brans}` : o.ad_soyad
}

export default function Siniflar() {
  const [siniflar, setSiniflar] = useState([])
  const [ogretmenler, setOgretmenler] = useState([])
  const [yeniAd, setYeniAd] = useState('')
  const [yeniOgretmen, setYeniOgretmen] = useState('')
  const [seciliYil, setSeciliYil] = useState('2026-2027')
  const [loading, setLoading] = useState(true)
  const [duzenlenenId, setDuzenlenenId] = useState(null)
  const [duzenleAd, setDuzenleAd] = useState('')
  const [duzenleOgretmen, setDuzenleOgretmen] = useState('')

  async function yukle() {
    setLoading(true)
    const [s, o] = await Promise.all([
      supabase.from('siniflar').select('*, profiles:ogretmen_profile_id(ad_soyad, brans)').eq('egitim_yili', seciliYil).order('ad'),
      supabase.from('profiles').select('*').eq('rol', 'ogretmen').order('ad_soyad'),
    ])
    setSiniflar(s.data || [])
    setOgretmenler(o.data || [])
    setLoading(false)
  }

  useEffect(() => {
    yukle()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seciliYil])

  async function sinifEkle(e) {
    e.preventDefault()
    if (!yeniAd.trim()) return
    const { error } = await supabase.from('siniflar').insert({
      ad: ilkHarfleriBuyukYap(yeniAd.trim()),
      ogretmen_profile_id: yeniOgretmen || null,
      egitim_yili: seciliYil,
    })
    if (!error) {
      setYeniAd('')
      setYeniOgretmen('')
      yukle()
    } else {
      alert('Hata: ' + error.message)
    }
  }

  function duzenlemeyeBasla(s) {
    setDuzenlenenId(s.id)
    setDuzenleAd(s.ad)
    setDuzenleOgretmen(s.ogretmen_profile_id || '')
  }

  function duzenlemeyiVazgec() {
    setDuzenlenenId(null)
  }

  async function duzenlemeyiKaydet(sinifId) {
    if (!duzenleAd.trim()) return
    const { error } = await supabase
      .from('siniflar')
      .update({ ad: ilkHarfleriBuyukYap(duzenleAd.trim()), ogretmen_profile_id: duzenleOgretmen || null })
      .eq('id', sinifId)
    if (!error) {
      setDuzenlenenId(null)
      yukle()
    } else {
      alert('Hata: ' + error.message)
    }
  }

  async function sinifSil(s) {
    const onay = confirm(
      `"${s.ad}" sınıfını KALICI OLARAK silmek istediğinize emin misiniz?\n\n` +
      `DİKKAT: Bu işlem, bu sınıfa ait tüm ders saatlerini, öğrenci kayıtlarını (öğrencilerin kendisi silinmez, ` +
      `sadece bu sınıfla bağlantısı kalkar) ve yoklama kayıtlarını da kalıcı olarak silecektir. Bu işlem GERİ ALINAMAZ.`
    )
    if (!onay) return
    const { error } = await supabase.from('siniflar').delete().eq('id', s.id)
    if (!error) yukle()
    else alert('Hata: ' + error.message)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-navy">Sınıflar</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">Eğitim Yılı:</label>
          <select
            value={seciliYil}
            onChange={(e) => setSeciliYil(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg bg-white font-semibold text-navy focus:outline-none focus:ring-2 focus:ring-blue"
          >
            {EGITIM_YILLARI.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <form onSubmit={sinifEkle} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Sınıf / Grup Adı</label>
          <input
            value={yeniAd}
            onChange={(e) => setYeniAd(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
            placeholder="örn. 12-Sayısal"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Sınıf Öğretmeni (opsiyonel)</label>
          <select
            value={yeniOgretmen}
            onChange={(e) => setYeniOgretmen(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            <option value="">Seçiniz (opsiyonel)</option>
            {ogretmenler.map((o) => (
              <option key={o.id} value={o.id}>{ogretmenEtiket(o)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity">
          {seciliYil} İçin Sınıf Ekle
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy text-white text-left">
              <th className="px-4 py-3 font-semibold">Sınıf Adı</th>
              <th className="px-4 py-3 font-semibold">Sınıf Öğretmeni</th>
              <th className="px-4 py-3 font-semibold text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">Yükleniyor...</td></tr>}
            {!loading && siniflar.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">{seciliYil} için henüz sınıf eklenmedi.</td></tr>
            )}
            {siniflar.map((s, i) => {
              const duzenleniyor = duzenlenenId === s.id

              if (duzenleniyor) {
                return (
                  <tr key={s.id} className="bg-blue-50">
                    <td className="px-4 py-2">
                      <input
                        value={duzenleAd}
                        onChange={(e) => setDuzenleAd(e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={duzenleOgretmen}
                        onChange={(e) => setDuzenleOgretmen(e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue"
                      >
                        <option value="">Yok</option>
                        {ogretmenler.map((o) => (
                          <option key={o.id} value={o.id}>{ogretmenEtiket(o)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-right space-x-3 whitespace-nowrap">
                      <button onClick={() => duzenlemeyiKaydet(s.id)} className="text-green-600 text-sm font-semibold hover:underline">
                        Kaydet
                      </button>
                      <button onClick={duzenlemeyiVazgec} className="text-gray-500 text-sm hover:underline">
                        Vazgeç
                      </button>
                    </td>
                  </tr>
                )
              }

              return (
                <tr key={s.id} className={i % 2 ? 'bg-gray-50' : ''}>
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/siniflar/${s.id}`} className="text-blue hover:underline">
                      {s.ad}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {s.profiles?.ad_soyad ? (
                      <>
                        {s.profiles.ad_soyad}
                        {s.profiles.brans && (
                          <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                            {s.profiles.brans}
                          </span>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                    <button onClick={() => duzenlemeyeBasla(s)} className="text-blue text-sm hover:underline">
                      Düzenle
                    </button>
                    <button onClick={() => sinifSil(s)} className="text-red-500 text-sm hover:underline">
                      Sil
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Sınıf adına tıklayarak öğrenci ekleyebilir ve o sınıfın haftalık ders saatlerini (ders adı + öğretmen ile) belirleyebilirsiniz. "Sil" işlemi geri alınamaz.
      </p>
    </div>
  )
}
