import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Yöneticinin bir öğretmen seçip, o öğretmene özel haftalık/aylık,
// yazdırılabilir/PDF alınabilir bire bir ders dökümünü yeni sekmede açmasını
// sağlayan seçim sayfası. Önce Bire Bir sayfasının içindeydi, sonra Muhasebe
// sayfasına gömülü olarak denendi — kullanıcı isteğiyle son olarak, Muhasebe/
// Toplu Ekstre gibi diğer ödeme araçlarıyla AYNI seviyede, sol menüdeki
// "Ödemeler" grubunda kendi başına bir sayfa/nav linki olarak burada.
export default function OgretmenEkstreSecici() {
  const [ogretmenler, setOgretmenler] = useState([])
  const [seciliOgretmen, setSeciliOgretmen] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .eq('rol', 'ogretmen')
      .order('ad_soyad')
      .then(({ data }) => {
        setOgretmenler(data || [])
        setLoading(false)
      })
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">Öğretmen Ekstresi</h1>
      {loading ? (
        <p className="text-gray-400">Yükleniyor...</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 max-w-md">
          <p className="text-xs text-gray-400 mb-3">
            Bir öğretmen seçip, sadece ona ait haftalık/aylık bire bir ders dökümünü yeni sekmede
            görüntüleyin — buradan yazdırabilir ya da PDF olarak kaydedebilirsiniz.
          </p>
          <label className="block text-sm font-medium text-gray-700 mb-1">Öğretmen</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={seciliOgretmen}
              onChange={(e) => setSeciliOgretmen(e.target.value)}
              className="flex-1 min-w-0 w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
            >
              <option value="">Öğretmen seçiniz...</option>
              {ogretmenler.map((o) => (
                <option key={o.id} value={o.id}>{o.brans ? `${o.ad_soyad} — ${o.brans}` : o.ad_soyad}</option>
              ))}
            </select>
            {seciliOgretmen ? (
              <Link
                to={`/ogretmen-ekstre/${seciliOgretmen}`}
                target="_blank"
                className="bg-navy text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap text-center"
              >
                Ekstre Görüntüle
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="bg-gray-200 text-gray-400 text-sm font-semibold px-4 py-2 rounded-lg whitespace-nowrap cursor-not-allowed"
              >
                Ekstre Görüntüle
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
