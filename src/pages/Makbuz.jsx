import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { tutarYaziyla } from '../lib/sayiYaziyla'

function paraFormat(n) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n || 0)
}

function MakbuzGovdesi({ nusha, odeme, ogrenciAdi }) {
  return (
    <div className="border-2 border-gray-800 p-6 mb-6">
      <p className="text-center font-bold text-lg">SAVAŞ AKÇA EĞİTİM</p>
      <p className="text-center font-semibold mt-1 mb-4">TAHSİLAT MAKBUZU</p>
      <p className="text-xs text-gray-500 mb-3">Nüsha: {nusha}</p>
      <table className="w-full text-sm">
        <tbody>
          <tr className="border-t border-gray-200">
            <td className="py-2 font-medium text-gray-600 w-1/3">Öğrenci</td>
            <td className="py-2">{ogrenciAdi}</td>
          </tr>
          <tr className="border-t border-gray-200">
            <td className="py-2 font-medium text-gray-600">Ödeme Tarihi</td>
            <td className="py-2">{new Date(odeme.tarih).toLocaleString('tr-TR')}</td>
          </tr>
          <tr className="border-t border-gray-200">
            <td className="py-2 font-medium text-gray-600">Kalem</td>
            <td className="py-2">{odeme.kalem || '—'}</td>
          </tr>
          <tr className="border-t border-gray-200">
            <td className="py-2 font-medium text-gray-600">İşlem Açıklaması</td>
            <td className="py-2">{odeme.odeme_turu || '—'}</td>
          </tr>
          <tr className="border-t border-gray-200">
            <td className="py-2 font-medium text-gray-600">Tahsil Edilen Tutar</td>
            <td className="py-2 font-semibold">{tutarYaziyla(odeme.tutar)}</td>
          </tr>
          <tr className="border-t border-gray-200">
            <td className="py-2 font-medium text-gray-600">Makbuz #</td>
            <td className="py-2">{odeme.makbuz_no || '—'}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-right text-sm text-gray-500 mt-6">Ad Soyad / İmza</p>
    </div>
  )
}

export default function Makbuz() {
  const { odemeId } = useParams()
  const [odeme, setOdeme] = useState(null)
  const [ogrenciAdi, setOgrenciAdi] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('odemeler')
      .select('*, ogrenciler(ad_soyad)')
      .eq('id', odemeId)
      .single()
      .then(({ data }) => {
        setOdeme(data)
        setOgrenciAdi(data?.ogrenciler?.ad_soyad || '')
        setLoading(false)
      })
  }, [odemeId])

  if (loading) return <p className="p-6 text-gray-400">Yükleniyor...</p>
  if (!odeme) return <p className="p-6 text-gray-400">Ödeme kaydı bulunamadı.</p>

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

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <MakbuzGovdesi nusha="ÖĞRENCİ KOPYASI" odeme={odeme} ogrenciAdi={ogrenciAdi} />
          <p className="text-center text-xs text-gray-400 my-4">--------- KESİM ALANI ---------</p>
          <MakbuzGovdesi nusha="KURUM KOPYASI" odeme={odeme} ogrenciAdi={ogrenciAdi} />
        </div>
      </div>
    </div>
  )
}
