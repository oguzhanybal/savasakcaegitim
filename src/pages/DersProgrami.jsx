import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

export default function DersProgrami() {
  const [program, setProgram] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('ders_programi')
      .select('*, siniflar(ad)')
      .order('gun')
      .order('baslangic_saat')
      .then(({ data }) => {
        setProgram(data || [])
        setLoading(false)
      })
  }, [])

  const gunlereGore = GUNLER.map((_, gun) => program.filter((p) => p.gun === gun)).slice(1)

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">Ders Programı</h1>

      {loading && <p className="text-gray-400">Yükleniyor...</p>}

      {!loading && program.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-gray-400">Görüntülenecek ders programı bulunamadı.</p>
        </div>
      )}

      {!loading && program.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {gunlereGore.map((dersler, i) =>
            dersler.length === 0 ? null : (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-navy text-white font-semibold">{GUNLER[i + 1]}</div>
                <div className="divide-y divide-gray-50">
                  {dersler.map((d) => (
                    <div key={d.id} className="px-4 py-3">
                      <p className="font-medium text-gray-800">{d.siniflar?.ad}</p>
                      <p className="text-sm text-gray-500">
                        {d.baslangic_saat?.slice(0, 5)} – {d.bitis_saat?.slice(0, 5)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
