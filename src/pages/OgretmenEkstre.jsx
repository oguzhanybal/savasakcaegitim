import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import BireBirDersDokumu from '../components/BireBirDersDokumu'
import { paraFormat, bireBirDersDetaylariOlustur } from '../lib/ekstreHesap'

// Öğretmenin verdiği TÜM bire bir dersleri (haftalık + tek seferlik), hangi
// öğrenciye hangi tarihte verildiği ve tutarıyla birlikte listeleyen,
// yazdırılabilir/PDF alınabilir bir döküm sayfası. Ekstre.jsx'in öğretmen
// karşılığı — aynı BireBirDersDokumu bileşenini kullanır, tek fark "karşı
// taraf" sütununun öğrenci adı olması.
export default function OgretmenEkstre() {
  const { ogretmenId } = useParams()
  const { profile } = useAuth()
  const isYonetici = profile?.rol === 'yonetici'

  const [ogretmen, setOgretmen] = useState(null)
  const [dersler, setDersler] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('profiles').select('*').eq('id', ogretmenId).single(),
      // Bu öğretmenin haftalık atamaları (öğrenci adı için ogrenciler join'i dahil)
      supabase
        .from('bire_bir_atamalari')
        .select('*, ogrenciler(ad_soyad)')
        .eq('ogretmen_profile_id', ogretmenId),
      // Bu öğretmenin verdiği "Ek Ders" (atamaya bağlı olmayan, tek seferlik) dersler
      supabase
        .from('bire_bir_yoklama')
        .select('*, ogrenciler(ad_soyad)')
        .eq('ogretmen_profile_id', ogretmenId)
        .is('atama_id', null),
    ]).then(([ogr, bba, ekDersler]) => {
      const atamalar = bba.data || []
      const atamaIdleri = atamalar.map((x) => x.id)
      const yoklamaSorgusu =
        atamaIdleri.length > 0
          ? supabase.from('bire_bir_yoklama').select('*').in('atama_id', atamaIdleri)
          : Promise.resolve({ data: [] })
      yoklamaSorgusu.then((by) => {
        const tumYoklamalar = [...(by.data || []), ...(ekDersler.data || [])]
        setOgretmen(ogr.data)
        setDersler(bireBirDersDetaylariOlustur(atamalar, tumYoklamalar))
        setLoading(false)
      })
    })
  }, [ogretmenId])

  if (loading) return <p className="p-6 text-gray-400">Yükleniyor...</p>
  if (!ogretmen) return <p className="p-6 text-gray-400">Öğretmen bulunamadı.</p>

  const toplamDers = dersler.length
  const toplamTutar = dersler.reduce((t, d) => t + d.tutar, 0)

  return (
    <div className="min-h-screen bg-cream py-8 px-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
      <div className="max-w-2xl mx-auto">
        <div className="no-print flex items-center justify-between mb-4 flex-wrap gap-3">
          {isYonetici ? (
            <Link to="/bire-bir" className="text-sm text-blue hover:underline">← Bire Bir'e Dön</Link>
          ) : (
            <span />
          )}
          <button
            onClick={() => window.print()}
            className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            Yazdır / PDF Kaydet
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="bg-navy text-white text-center py-5">
            <p className="font-bold text-xl tracking-wide">SAVAŞ AKÇA EĞİTİM</p>
            <p className="text-sm text-white/80 mt-1">ÖĞRETMEN BİRE BİR DERS DÖKÜMÜ</p>
          </div>

          <div className="p-6">
            <table className="w-full text-sm mb-4">
              <tbody>
                <tr>
                  <td className="py-1 font-semibold text-gray-600 w-1/3">Öğretmen Adı</td>
                  <td className="py-1 font-bold text-navy">{ogretmen.ad_soyad}</td>
                </tr>
              </tbody>
            </table>

            <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex justify-between px-4 py-3 bg-navy/5">
                <span className="font-bold text-navy">TOPLAM VERİLEN DERS (TÜM ZAMANLAR)</span>
                <span className="font-bold text-navy text-lg">{toplamDers} ders — {paraFormat(toplamTutar)}</span>
              </div>
            </div>

            {dersler.length === 0 ? (
              <p className="text-sm text-gray-400">Bu öğretmene ait onaylanmış ders kaydı bulunamadı.</p>
            ) : (
              <BireBirDersDokumu
                dersler={dersler.map((d) => ({ ...d, karsiTarafAdi: d.ogrenciAdi }))}
                karsiTarafBasligi="Öğrenci"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
