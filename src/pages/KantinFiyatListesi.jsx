import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { paraFormat } from '../lib/ekstreHesap'

// Kantindeki tüm (aktif) ürünleri fiyatlarıyla birlikte gösteren, yazdırılabilir/
// PDF alınabilir basit bir fiyat listesi. Kantin.jsx > Ürün Yönetimi'nden
// "Fiyat Listesini Yazdır / PDF Al" ile açılır. Sadece yönetici erişebilir
// (App.jsx'te kısıtlı).
export default function KantinFiyatListesi() {
  const [urunler, setUrunler] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('kantin_urunler')
      .select('*')
      .eq('aktif', true)
      .order('ad')
      .then(({ data }) => {
        setUrunler(data || [])
        setLoading(false)
      })
  }, [])

  if (loading) return <p className="p-6 text-gray-400">Yükleniyor...</p>

  return (
    <div className="min-h-screen bg-cream py-8 px-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          tr { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
      <div className="max-w-xl mx-auto">
        <div className="no-print flex items-center justify-between mb-4 flex-wrap gap-3">
          <Link to="/kantin" className="text-sm text-blue hover:underline">← Kantin'e Dön</Link>
          <button
            onClick={() => window.print()}
            className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            Yazdır / PDF Kaydet
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="bg-navy text-white py-5 px-6 flex items-center gap-4">
            <div className="bg-white rounded-xl p-1.5 shrink-0">
              <img src="/logo.png" alt="Savaş Akça Eğitim" className="w-12 h-12 object-contain" />
            </div>
            <div>
              <p className="font-bold text-xl tracking-wide">SAVAŞ AKÇA EĞİTİM</p>
              <p className="text-sm text-white/80 mt-1">KANTİN FİYAT LİSTESİ</p>
            </div>
          </div>

          <div className="p-6">
            <p className="text-xs text-gray-400 mb-4">
              {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} tarihi
              itibarıyla geçerli fiyatlardır.
            </p>

            {urunler.length === 0 ? (
              <p className="text-sm text-gray-400">Kayıtlı ürün bulunamadı.</p>
            ) : (
              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-navy text-white text-left">
                    <th className="px-3 py-2 font-semibold">Ürün</th>
                    <th className="px-3 py-2 font-semibold text-right">Fiyat</th>
                  </tr>
                </thead>
                <tbody>
                  {urunler.map((u, i) => (
                    <tr key={u.id} className={i % 2 ? 'bg-gray-50' : ''}>
                      <td className="px-3 py-2">{u.ad}</td>
                      <td className="px-3 py-2 text-right font-medium">{paraFormat(u.fiyat)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
