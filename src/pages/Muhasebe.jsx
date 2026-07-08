import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

function paraFormat(n) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n || 0)
}

export default function Muhasebe() {
  const { profile } = useAuth()
  const isYonetici = profile?.rol === 'yonetici'

  const [ogrenciler, setOgrenciler] = useState([])
  const [seciliId, setSeciliId] = useState('')
  const [sozlesmeler, setSozlesmeler] = useState([])
  const [odemeler, setOdemeler] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('ogrenciler').select('*').order('ad_soyad').then(({ data }) => {
      setOgrenciler(data || [])
      if (data && data.length > 0) setSeciliId(data[0].id)
      else setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!seciliId) return
    setLoading(true)
    Promise.all([
      supabase.from('sozlesmeler').select('*').eq('ogrenci_id', seciliId),
      supabase.from('odemeler').select('*').eq('ogrenci_id', seciliId).order('tarih', { ascending: false }),
    ]).then(([s, o]) => {
      setSozlesmeler(s.data || [])
      setOdemeler(o.data || [])
      setLoading(false)
    })
  }, [seciliId])

  const seciliOgrenci = ogrenciler.find((o) => o.id === seciliId)

  const toplamOdenen = odemeler.reduce((t, o) => t + Number(o.tutar), 0)
  const toplamSozlesme = sozlesmeler.reduce((t, s) => t + Number(s.toplam_tutar), 0)
  const kalanBakiye = Math.max(0, toplamSozlesme - toplamOdenen)

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">{isYonetici ? 'Muhasebe' : 'Ödeme Durumu'}</h1>

      {isYonetici && ogrenciler.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Öğrenci Seç</label>
          <select
            value={seciliId}
            onChange={(e) => setSeciliId(e.target.value)}
            className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            {ogrenciler.map((o) => (
              <option key={o.id} value={o.id}>{o.ad_soyad}</option>
            ))}
          </select>
        </div>
      )}

      {ogrenciler.length === 0 && !loading && (
        <p className="text-gray-400">Görüntülenecek öğrenci kaydı bulunamadı.</p>
      )}

      {seciliOgrenci && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm text-gray-500 font-medium">Toplam Sözleşme</p>
              <p className="text-2xl font-bold text-navy mt-1">{paraFormat(toplamSozlesme)}</p>
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

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-700">Ödeme Geçmişi</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Tarih</th>
                  <th className="px-4 py-2 font-medium">Kalem</th>
                  <th className="px-4 py-2 font-medium">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {odemeler.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-4 text-center text-gray-400">Ödeme kaydı bulunamadı.</td></tr>
                )}
                {odemeler.map((o) => (
                  <tr key={o.id} className="border-t border-gray-50">
                    <td className="px-4 py-2">{new Date(o.tarih).toLocaleDateString('tr-TR')}</td>
                    <td className="px-4 py-2">{o.kalem || '—'}</td>
                    <td className="px-4 py-2 font-medium">{paraFormat(o.tutar)}</td>
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
