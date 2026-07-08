import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function Yoklama() {
  const { profile } = useAuth()
  const [siniflar, setSiniflar] = useState([])
  const [seciliSinif, setSeciliSinif] = useState('')
  const [ogrenciler, setOgrenciler] = useState([])
  const [yoklamaBugun, setYoklamaBugun] = useState({})
  const [loading, setLoading] = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const bugun = new Date().toISOString().slice(0, 10)

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
    Promise.all([
      supabase
        .from('sinif_ogrenciler')
        .select('ogrenciler(id, ad_soyad)')
        .eq('sinif_id', seciliSinif),
      supabase.from('yoklama').select('*').eq('sinif_id', seciliSinif).eq('tarih', bugun),
    ]).then(([so, y]) => {
      const liste = (so.data || []).map((r) => r.ogrenciler).filter(Boolean)
      setOgrenciler(liste)
      const mevcut = {}
      ;(y.data || []).forEach((k) => {
        mevcut[k.ogrenci_id] = k.geldi
      })
      setYoklamaBugun(mevcut)
      setLoading(false)
    })
  }, [seciliSinif])

  function isaretle(ogrenciId, geldi) {
    setYoklamaBugun((prev) => ({ ...prev, [ogrenciId]: geldi }))
  }

  async function kaydet() {
    setKaydediliyor(true)
    const kayitlar = ogrenciler.map((o) => ({
      sinif_id: seciliSinif,
      ogrenci_id: o.id,
      tarih: bugun,
      geldi: yoklamaBugun[o.id] ?? true,
    }))
    const { error } = await supabase.from('yoklama').upsert(kayitlar, { onConflict: 'sinif_id,ogrenci_id,tarih' })
    setKaydediliyor(false)
    if (error) alert('Hata: ' + error.message)
    else alert('Yoklama kaydedildi.')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-1">Yoklama Al</h1>
      <p className="text-gray-500 mb-6">{new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

      {siniflar.length === 0 && !loading && (
        <p className="text-gray-400">Size atanmış bir sınıf bulunamadı.</p>
      )}

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

      {!loading && ogrenciler.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {ogrenciler.map((o) => {
              const geldi = yoklamaBugun[o.id] ?? true
              return (
                <div key={o.id} className="px-4 py-3 flex items-center justify-between">
                  <p className="font-medium text-gray-800">{o.ad_soyad}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => isaretle(o.id, true)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        geldi ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      Geldi
                    </button>
                    <button
                      onClick={() => isaretle(o.id, false)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        !geldi ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      Gelmedi
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="px-4 py-4 bg-gray-50 border-t border-gray-100">
            <button
              onClick={kaydet}
              disabled={kaydediliyor}
              className="bg-navy text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-blue transition-colors disabled:opacity-50"
            >
              {kaydediliyor ? 'Kaydediliyor...' : 'Yoklamayı Kaydet'}
            </button>
          </div>
        </div>
      )}

      {!loading && ogrenciler.length === 0 && seciliSinif && (
        <p className="text-gray-400">Bu sınıfa henüz öğrenci eklenmemiş.</p>
      )}
    </div>
  )
}
