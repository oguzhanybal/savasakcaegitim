import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { tutarYaziyla } from '../lib/sayiYaziyla'

function MakbuzGovdesi({ nusha, odeme, ogrenciAdi }) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-navy text-white text-center py-4">
        <p className="font-bold text-lg tracking-wide">SAVAŞ AKÇA EĞİTİM</p>
        <p className="text-sm text-white/80 mt-1">TAHSİLAT MAKBUZU</p>
      </div>
      <div className="p-5">
        <p className="text-xs text-gray-400 mb-3">Nüsha: {nusha}</p>
        <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
          <tbody>
            <tr className="bg-gray-50">
              <td className="px-3 py-2 font-semibold text-gray-600 w-1/3">Öğrenci</td>
              <td className="px-3 py-2 font-bold text-navy">{ogrenciAdi}</td>
            </tr>
            <tr>
              <td className="px-3 py-2 font-semibold text-gray-600">Ödeme Tarihi</td>
              <td className="px-3 py-2">{new Date(odeme.tarih).toLocaleString('tr-TR')}</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="px-3 py-2 font-semibold text-gray-600">Kalem</td>
              <td className="px-3 py-2">{odeme.kalem || '—'}</td>
            </tr>
            <tr>
              <td className="px-3 py-2 font-semibold text-gray-600">İşlem Açıklaması</td>
              <td className="px-3 py-2">{odeme.odeme_turu || '—'}</td>
            </tr>
            <tr className="bg-orange/10">
              <td className="px-3 py-2 font-semibold text-orange">Tahsil Edilen Tutar</td>
              <td className="px-3 py-2 font-bold text-orange">{tutarYaziyla(odeme.tutar)}</td>
            </tr>
            <tr>
              <td className="px-3 py-2 font-semibold text-gray-600">Makbuz #</td>
              <td className="px-3 py-2">{odeme.makbuz_no || '—'}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-right text-sm text-gray-500 mt-6">Ad Soyad / İmza</p>
      </div>
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

        <div className="space-y-4">
          <MakbuzGovdesi nusha="ÖĞRENCİ KOPYASI" odeme={odeme} ogrenciAdi={ogrenciAdi} />
          <p className="text-center text-xs text-gray-400">--------------------------- KESİM ALANI ---------------------------</p>
          <MakbuzGovdesi nusha="KURUM KOPYASI" odeme={odeme} ogrenciAdi={ogrenciAdi} />
        </div>
      </div>
    </div>
  )
}
