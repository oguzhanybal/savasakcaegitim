import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Ogrenciler() {
  const [ogrenciler, setOgrenciler] = useState([])
  const [loading, setLoading] = useState(true)
  const [yeniAd, setYeniAd] = useState('')
  const [yeniTelefon, setYeniTelefon] = useState('')
  const [ekleniyor, setEkleniyor] = useState(false)

  async function yukle() {
    setLoading(true)
    const { data } = await supabase.from('ogrenciler').select('*').order('ad_soyad')
    setOgrenciler(data || [])
    setLoading(false)
  }

  useEffect(() => {
    yukle()
  }, [])

  async function ogrenciEkle(e) {
    e.preventDefault()
    if (!yeniAd.trim()) return
    setEkleniyor(true)
    const { error } = await supabase.from('ogrenciler').insert({ ad_soyad: yeniAd.trim(), telefon: yeniTelefon.trim() || null })
    setEkleniyor(false)
    if (!error) {
      setYeniAd('')
      setYeniTelefon('')
      yukle()
    } else {
      alert('Hata: ' + error.message)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">Öğrenciler</h1>

      <form onSubmit={ogrenciEkle} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Öğrenci Adı Soyadı</label>
          <input
            value={yeniAd}
            onChange={(e) => setYeniAd(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
            placeholder="Ad Soyad"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Telefon (opsiyonel)</label>
          <input
            value={yeniTelefon}
            onChange={(e) => setYeniTelefon(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
            placeholder="905XXXXXXXXX"
          />
        </div>
        <button
          type="submit"
          disabled={ekleniyor}
          className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {ekleniyor ? 'Ekleniyor...' : 'Öğrenci Ekle'}
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy text-white text-left">
              <th className="px-4 py-3 font-semibold">Ad Soyad</th>
              <th className="px-4 py-3 font-semibold">Telefon</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-400">Yükleniyor...</td></tr>
            )}
            {!loading && ogrenciler.length === 0 && (
              <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-400">Henüz öğrenci eklenmedi.</td></tr>
            )}
            {ogrenciler.map((o, i) => (
              <tr key={o.id} className={i % 2 ? 'bg-gray-50' : ''}>
                <td className="px-4 py-3 font-medium text-gray-800">{o.ad_soyad}</td>
                <td className="px-4 py-3 text-gray-500">{o.telefon || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
