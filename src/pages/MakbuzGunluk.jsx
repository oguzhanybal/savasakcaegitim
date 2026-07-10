import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { tutarYaziyla } from '../lib/sayiYaziyla'
import { gunAnahtari } from '../lib/ekstreHesap'

function paraFormat(n) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n || 0)
}

function MakbuzGovdesi({ nusha, odemeler, ogrenciAdi, tarihMetni, toplam }) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-navy text-white text-center py-4">
        <p className="font-bold text-lg tracking-wide">SAVAŞ AKÇA EĞİTİM</p>
        <p className="text-sm text-white/80 mt-1">TAHSİLAT MAKBUZU</p>
      </div>
      <div className="p-5">
        <p className="text-xs text-gray-400 mb-3">Nüsha: {nusha}</p>

        <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden mb-3">
          <tbody>
            <tr className="bg-gray-50">
              <td className="px-3 py-2 font-semibold text-gray-600 w-1/3">Öğrenci</td>
              <td className="px-3 py-2 font-bold text-navy">{ogrenciAdi}</td>
            </tr>
            <tr>
              <td className="px-3 py-2 font-semibold text-gray-600">Tarih</td>
              <td className="px-3 py-2">{tarihMetni}</td>
            </tr>
          </tbody>
        </table>

        <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-600">
              <th className="px-3 py-2 font-semibold">Kalem</th>
              <th className="px-3 py-2 font-semibold text-right">Tutar</th>
            </tr>
          </thead>
          <tbody>
            {odemeler.map((o) => (
              <tr key={o.id} className="border-t border-gray-100">
                <td className="px-3 py-2">{o.kalem || '—'}</td>
                <td className="px-3 py-2 text-right">{paraFormat(o.tutar)}</td>
              </tr>
            ))}
            <tr className="border-t border-gray-200 bg-orange/10">
              <td className="px-3 py-2 font-bold text-orange">TOPLAM</td>
              <td className="px-3 py-2 font-bold text-orange text-right">{paraFormat(toplam)}</td>
            </tr>
          </tbody>
        </table>

        <p className="text-sm text-gray-600 mt-3">{tutarYaziyla(toplam)}</p>
        <p className="text-right text-sm text-gray-500 mt-6">Ad Soyad / İmza</p>
      </div>
    </div>
  )
}

export default function MakbuzGunluk() {
  const { ogrenciId, tarih } = useParams() // tarih: "YYYY-MM-DD"
  const [odemeler, setOdemeler] = useState([])
  const [ogrenciAdi, setOgrenciAdi] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('odemeler').select('*').eq('ogrenci_id', ogrenciId).order('tarih'),
      supabase.from('ogrenciler').select('ad_soyad').eq('id', ogrenciId).single(),
    ]).then(([o, og]) => {
      const gununOdemeleri = (o.data || []).filter((odm) => gunAnahtari(odm.tarih) === tarih)
      setOdemeler(gununOdemeleri)
      setOgrenciAdi(og.data?.ad_soyad || '')
      setLoading(false)
    })
  }, [ogrenciId, tarih])

  if (loading) return <p className="p-6 text-gray-400">Yükleniyor...</p>
  if (odemeler.length === 0) return <p className="p-6 text-gray-400">Bu tarihte ödeme kaydı bulunamadı.</p>

  const toplam = odemeler.reduce((t, o) => t + Number(o.tutar), 0)
  const tarihMetni = new Date(`${tarih}T12:00:00`).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-cream py-8 px-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
      <div className="max-w-xl mx-auto">
        <div className="no-print flex items-center justify-between mb-4">
          <Link to="/muhasebe" className="text-sm text-blue hover:underline">← Muhasebe'ye Dön</Link>
          <button
            onClick={() => window.print()}
            className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            Yazdır / PDF Kaydet
          </button>
        </div>

        <div className="space-y-4">
          <MakbuzGovdesi nusha="ÖĞRENCİ KOPYASI" odemeler={odemeler} ogrenciAdi={ogrenciAdi} tarihMetni={tarihMetni} toplam={toplam} />
          <p className="text-center text-xs text-gray-400">--------------------------- KESİM ALANI ---------------------------</p>
          <MakbuzGovdesi nusha="KURUM KOPYASI" odemeler={odemeler} ogrenciAdi={ogrenciAdi} tarihMetni={tarihMetni} toplam={toplam} />
        </div>
      </div>
    </div>
  )
}
