import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

export default function YoklamaRaporu() {
  const [siniflar, setSiniflar] = useState([])
  const [seciliSinif, setSeciliSinif] = useState('')
  const [kayitlar, setKayitlar] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('siniflar').select('*').then(({ data }) => {
      setSiniflar(data || [])
      if (data && data.length > 0) setSeciliSinif(data[0].id)
      else setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!seciliSinif) return
    setLoading(true)
    supabase
      .from('yoklama')
      .select('*, ogrenciler(ad_soyad)')
      .eq('sinif_id', seciliSinif)
      .order('tarih', { ascending: false })
      .then(({ data }) => {
        setKayitlar(data || [])
        setLoading(false)
      })
  }, [seciliSinif])

  const ozet = {}
  kayitlar.forEach((k) => {
    const ad = k.ogrenciler?.ad_soyad || 'Bilinmeyen'
    if (!ozet[ad]) ozet[ad] = { geldi: 0, gelmedi: 0 }
    if (k.geldi) ozet[ad].geldi += 1
    else ozet[ad].gelmedi += 1
  })
  const ozetListesi = Object.entries(ozet).sort((a, b) => a[0].localeCompare(b[0], 'tr'))

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">Yoklama Raporu</h1>

      {siniflar.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Sınıf</label>
          <select
            value={seciliSinif}
            onChange={(e) => setSeciliSinif(e.target.value)}
            className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            {siniflar.map((s) => (
              <option key={s.id} value={s.id}>{s.ad}</option>
            ))}
          </select>
        </div>
      )}

      {loading && <p className="text-gray-400">Yükleniyor...</p>}

      {!loading && kayitlar.length === 0 && (
        <p className="text-gray-400">Bu sınıf için henüz yoklama kaydı yok.</p>
      )}

      {!loading && kayitlar.length > 0 && (
        <>
          <h2 className="font-semibold text-gray-700 mb-3">Öğrenci Bazlı Özet</h2>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy text-white text-left">
                  <th className="px-4 py-3 font-semibold">Öğrenci</th>
                  <th className="px-4 py-3 font-semibold text-center">Geldi</th>
                  <th className="px-4 py-3 font-semibold text-center">Gelmedi</th>
                  <th className="px-4 py-3 font-semibold text-center">Devamsızlık Oranı</th>
                </tr>
              </thead>
              <tbody>
                {ozetListesi.map(([ad, s], i) => {
                  const toplam = s.geldi + s.gelmedi
                  const oran = toplam > 0 ? Math.round((s.gelmedi / toplam) * 100) : 0
                  return (
                    <tr key={ad} className={i % 2 ? 'bg-gray-50' : ''}>
                      <td className="px-4 py-3 font-medium text-gray-800">{ad}</td>
                      <td className="px-4 py-3 text-center text-green-600 font-semibold">{s.geldi}</td>
                      <td className="px-4 py-3 text-center text-red-500 font-semibold">{s.gelmedi}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-semibold ${oran > 20 ? 'text-red-500' : 'text-gray-600'}`}>%{oran}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <h2 className="font-semibold text-gray-700 mb-3">Detaylı Geçmiş (Son Kayıtlar)</h2>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy text-white text-left">
                  <th className="px-4 py-3 font-semibold">Tarih</th>
                  <th className="px-4 py-3 font-semibold">Öğrenci</th>
                  <th className="px-4 py-3 font-semibold">Durum</th>
                </tr>
              </thead>
              <tbody>
                {kayitlar.slice(0, 100).map((k, i) => {
                  const d = new Date(k.tarih)
                  const gunAdi = GUNLER[((d.getDay() + 6) % 7) + 1]
                  return (
                    <tr key={k.id} className={i % 2 ? 'bg-gray-50' : ''}>
                      <td className="px-4 py-3 text-gray-600">
                        {d.toLocaleDateString('tr-TR')} <span className="text-gray-400">({gunAdi})</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">{k.ogrenciler?.ad_soyad}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          k.geldi ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {k.geldi ? 'Geldi' : 'Gelmedi'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
