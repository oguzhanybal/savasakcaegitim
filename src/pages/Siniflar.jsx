import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Siniflar() {
  const [siniflar, setSiniflar] = useState([])
  const [ogretmenler, setOgretmenler] = useState([])
  const [yeniAd, setYeniAd] = useState('')
  const [yeniOgretmen, setYeniOgretmen] = useState('')
  const [loading, setLoading] = useState(true)

  async function yukle() {
    setLoading(true)
    const [s, o] = await Promise.all([
      supabase.from('siniflar').select('*, profiles:ogretmen_profile_id(ad_soyad)').order('ad'),
      supabase.from('profiles').select('*').eq('rol', 'ogretmen'),
    ])
    setSiniflar(s.data || [])
    setOgretmenler(o.data || [])
    setLoading(false)
  }

  useEffect(() => {
    yukle()
  }, [])

  async function sinifEkle(e) {
    e.preventDefault()
    if (!yeniAd.trim()) return
    const { error } = await supabase.from('siniflar').insert({
      ad: yeniAd.trim(),
      ogretmen_profile_id: yeniOgretmen || null,
    })
    if (!error) {
      setYeniAd('')
      setYeniOgretmen('')
      yukle()
    } else {
      alert('Hata: ' + error.message)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">Sınıflar</h1>

      <form onSubmit={sinifEkle} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Sınıf / Grup Adı</label>
          <input
            value={yeniAd}
            onChange={(e) => setYeniAd(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
            placeholder="örn. 8. Sınıf Matematik"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Öğretmen</label>
          <select
            value={yeniOgretmen}
            onChange={(e) => setYeniOgretmen(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            <option value="">Seçiniz (opsiyonel)</option>
            {ogretmenler.map((o) => (
              <option key={o.id} value={o.id}>{o.ad_soyad}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity">
          Sınıf Ekle
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy text-white text-left">
              <th className="px-4 py-3 font-semibold">Sınıf Adı</th>
              <th className="px-4 py-3 font-semibold">Öğretmen</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-400">Yükleniyor...</td></tr>}
            {!loading && siniflar.length === 0 && (
              <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-400">Henüz sınıf eklenmedi.</td></tr>
            )}
            {siniflar.map((s, i) => (
              <tr key={s.id} className={i % 2 ? 'bg-gray-50' : ''}>
                <td className="px-4 py-3 font-medium text-gray-800">{s.ad}</td>
                <td className="px-4 py-3 text-gray-500">{s.profiles?.ad_soyad || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Not: Öğrencileri bir sınıfa eklemek ve ders saatlerini belirlemek için ileride "Sınıf Detayı" ekranını birlikte ekleyebiliriz.
      </p>
    </div>
  )
}
