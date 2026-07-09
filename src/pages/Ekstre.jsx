import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function paraFormat(n) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n || 0)
}

// "YYYY-MM" -> { yil, ay } (ay: 1-12)
function ayCoz(ayStr) {
  const [yil, ay] = ayStr.split('-').map(Number)
  return { yil, ay }
}

// Bir sözleşmenin seçili ayda kaçıncı taksitinin düştüğünü hesaplar (1 tabanlı), yoksa null döner
function taksitHesapla(sozlesme, seciliAy) {
  if (!sozlesme.ilk_taksit_tarihi) return null
  const ilk = new Date(sozlesme.ilk_taksit_tarihi)
  const { yil, ay } = ayCoz(seciliAy)
  const ayFarki = (yil - ilk.getFullYear()) * 12 + (ay - (ilk.getMonth() + 1))
  const taksitNo = ayFarki + 1
  if (taksitNo < 1 || taksitNo > sozlesme.taksit_sayisi) return null
  const vade = new Date(ilk)
  vade.setMonth(vade.getMonth() + ayFarki)
  return {
    taksitNo,
    tutar: Number(sozlesme.toplam_tutar) / Number(sozlesme.taksit_sayisi),
    vade,
  }
}

export default function Ekstre() {
  const { ogrenciId } = useParams()
  const [ogrenci, setOgrenci] = useState(null)
  const [sozlesmeler, setSozlesmeler] = useState([])
  const [aylikBorclar, setAylikBorclar] = useState([])
  const [odemeler, setOdemeler] = useState([])
  const [seciliAy, setSeciliAy] = useState(() => new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('ogrenciler').select('*').eq('id', ogrenciId).single(),
      supabase.from('sozlesmeler').select('*').eq('ogrenci_id', ogrenciId),
      supabase.from('aylik_borclar').select('*').eq('ogrenci_id', ogrenciId),
      supabase.from('odemeler').select('*').eq('ogrenci_id', ogrenciId).order('tarih', { ascending: false }),
    ]).then(([o, s, a, od]) => {
      setOgrenci(o.data)
      setSozlesmeler(s.data || [])
      setAylikBorclar(a.data || [])
      setOdemeler(od.data || [])
      setLoading(false)
    })
  }, [ogrenciId])

  if (loading) return <p className="p-6 text-gray-400">Yükleniyor...</p>
  if (!ogrenci) return <p className="p-6 text-gray-400">Öğrenci bulunamadı.</p>

  const buAyTaksitler = sozlesmeler
    .map((s) => {
      const t = taksitHesapla(s, seciliAy)
      return t ? { kalem: s.kalem, ...t } : null
    })
    .filter(Boolean)

  const buAyKalemBorclari = aylikBorclar.filter((a) => a.donem && a.donem.slice(0, 7) === seciliAy)

  const buAyToplam =
    buAyTaksitler.reduce((t, x) => t + x.tutar, 0) + buAyKalemBorclari.reduce((t, x) => t + Number(x.tutar), 0)

  const toplamSozlesme = sozlesmeler.reduce((t, s) => t + Number(s.toplam_tutar), 0)
  const toplamAylikBorc = aylikBorclar.reduce((t, a) => t + Number(a.tutar), 0)
  const toplamOdenen = odemeler.reduce((t, o) => t + Number(o.tutar), 0)
  const genelKalanBakiye = Math.max(0, toplamSozlesme + toplamAylikBorc - toplamOdenen)

  const sonOdemeler = odemeler.slice(0, 10)

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
          <Link to="/muhasebe" className="text-sm text-blue hover:underline">← Muhasebe'ye Dön</Link>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600">Dönem:</label>
            <input
              type="month"
              value={seciliAy}
              onChange={(e) => setSeciliAy(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue"
            />
            <button
              onClick={() => window.print()}
              className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity"
            >
              Yazdır / PDF Kaydet
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <p className="text-center font-bold text-lg text-navy">AYLIK ÖĞRENCİ EKSTRESİ</p>
          <p className="mt-4"><span className="font-medium text-gray-600">Öğrenci Adı:</span> {ogrenci.ad_soyad}</p>
          <p><span className="font-medium text-gray-600">Bilgilendirme Dönemi:</span> {new Date(seciliAy + '-01').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</p>

          <table className="w-full text-sm mt-4 border-t border-gray-200">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2">Açıklama / Kalem</th>
                <th className="py-2">Vade / Durum</th>
                <th className="py-2 text-right">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {buAyTaksitler.length === 0 && buAyKalemBorclari.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-gray-400">Bu dönem için kayıt bulunamadı.</td></tr>
              )}
              {buAyTaksitler.map((t, i) => (
                <tr key={'t' + i} className="border-t border-gray-100">
                  <td className="py-2">{t.kalem} - Taksit ({t.taksitNo}/{sozlesmeler.find((s) => s.kalem === t.kalem)?.taksit_sayisi})</td>
                  <td className="py-2 text-gray-500">Vade: {t.vade.toLocaleDateString('tr-TR')}</td>
                  <td className="py-2 text-right">{paraFormat(t.tutar)}</td>
                </tr>
              ))}
              {buAyKalemBorclari.map((a) => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="py-2">{a.kalem}</td>
                  <td className="py-2 text-gray-500">Bu Dönem</td>
                  <td className="py-2 text-right">{paraFormat(a.tutar)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-gray-200 mt-2 pt-3 space-y-1">
            <div className="flex justify-between font-semibold">
              <span>Bu Dönem Toplamı</span>
              <span>{paraFormat(buAyToplam)}</span>
            </div>
            <div className="flex justify-between text-orange font-bold text-lg mt-2">
              <span>Genel Kalan Bakiye (Tüm Zamanlar)</span>
              <span>{paraFormat(genelKalanBakiye)}</span>
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-4">
            "Bu Dönem Toplamı" seçilen aya denk gelen taksit ve aylık kalemleri gösterir. "Genel Kalan Bakiye"
            bugüne kadarki tüm sözleşme + aylık kalem borcundan tüm ödemeler düşülerek hesaplanan güncel toplam bakiyedir.
          </p>

          <div className="mt-6">
            <p className="font-semibold text-gray-700 mb-2">Ödeme Geçmişi (Son {sonOdemeler.length} Kayıt)</p>
            <table className="w-full text-sm border-t border-gray-200">
              <tbody>
                {sonOdemeler.length === 0 && (
                  <tr><td className="py-3 text-center text-gray-400">Ödeme kaydı yok.</td></tr>
                )}
                {sonOdemeler.map((o) => (
                  <tr key={o.id} className="border-t border-gray-100">
                    <td className="py-2">{new Date(o.tarih).toLocaleDateString('tr-TR')}</td>
                    <td className="py-2">{o.kalem || '—'}</td>
                    <td className="py-2 text-right">{paraFormat(o.tutar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
