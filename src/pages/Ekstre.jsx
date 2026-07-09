import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

function paraFormat(n) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n || 0)
}

// "YYYY-MM" -> { yil, ay } (ay: 1-12)
function ayCoz(ayStr) {
  const [yil, ay] = ayStr.split('-').map(Number)
  return { yil, ay }
}

// Bir "YYYY-MM" değerine 1 ay ekler, "YYYY-MM" döner
function ayEkle(ayStr, adet) {
  const { yil, ay } = ayCoz(ayStr)
  const toplam = yil * 12 + (ay - 1) + adet
  const yeniYil = Math.floor(toplam / 12)
  const yeniAy = (toplam % 12) + 1
  return { yil: yeniYil, ay: yeniAy }
}

// Ekstre "seciliAy" için gönderiliyorsa, VADESİ BİR SONRAKİ AYA denk gelen taksiti gösterir
// (örn. Haziran ekstresi -> Temmuz vadeli taksit), aylık kalemlerdeki mantığın aksine.
function taksitHesapla(sozlesme, seciliAy) {
  if (!sozlesme.ilk_taksit_tarihi) return null
  const ilk = new Date(sozlesme.ilk_taksit_tarihi)
  const hedef = ayEkle(seciliAy, 1)
  const ayFarki = (hedef.yil - ilk.getFullYear()) * 12 + (hedef.ay - (ilk.getMonth() + 1))
  const taksitNo = ayFarki
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
  const { profile } = useAuth()
  const isVeli = profile?.rol === 'veli'

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
      return t ? { kalem: s.kalem, taksitSayisi: s.taksit_sayisi, ...t } : null
    })
    .filter(Boolean)

  const buAyKalemBorclari = aylikBorclar.filter((a) => a.donem && a.donem.slice(0, 7) === seciliAy)

  const buAyToplam =
    buAyTaksitler.reduce((t, x) => t + x.tutar, 0) + buAyKalemBorclari.reduce((t, x) => t + Number(x.tutar), 0)

  const toplamSozlesme = sozlesmeler.reduce((t, s) => t + Number(s.toplam_tutar), 0)
  const toplamAylikBorc = aylikBorclar.reduce((t, a) => t + Number(a.tutar), 0)
  const toplamOdenen = odemeler.reduce((t, o) => t + Number(o.tutar), 0)
  const genelKalanBakiye = Math.max(0, toplamSozlesme + toplamAylikBorc - toplamOdenen)

  // Veli, "Devreden Ödeme" (sisteme geçmeden önceki eski ödeme) kayıtlarını görmesin —
  // kafası karışabilir, o ödemeyi kendisi yapmış gibi görünmesin diye. Yönetici hepsini görür.
  const gorunurOdemeler = isVeli ? odemeler.filter((o) => !o.kalem?.includes('Devreden')) : odemeler
  const sonOdemeler = gorunurOdemeler.slice(0, 10)

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

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="bg-navy text-white text-center py-5">
            <p className="font-bold text-xl tracking-wide">SAVAŞ AKÇA EĞİTİM</p>
            <p className="text-sm text-white/80 mt-1">AYLIK ÖĞRENCİ EKSTRESİ</p>
          </div>

          <div className="p-6">
            <table className="w-full text-sm mb-4">
              <tbody>
                <tr>
                  <td className="py-1 font-semibold text-gray-600 w-1/3">Öğrenci Adı</td>
                  <td className="py-1 font-bold text-navy">{ogrenci.ad_soyad}</td>
                </tr>
                <tr>
                  <td className="py-1 font-semibold text-gray-600">Bilgilendirme Dönemi</td>
                  <td className="py-1">{new Date(seciliAy + '-01').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</td>
                </tr>
              </tbody>
            </table>

            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-navy text-white text-left">
                  <th className="px-3 py-2 font-semibold">Açıklama / Kalem</th>
                  <th className="px-3 py-2 font-semibold">Vade / Durum</th>
                  <th className="px-3 py-2 font-semibold text-right">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {buAyTaksitler.length === 0 && buAyKalemBorclari.length === 0 && (
                  <tr><td colSpan={3} className="px-3 py-4 text-center text-gray-400">Bu dönem için kayıt bulunamadı.</td></tr>
                )}
                {buAyTaksitler.map((t, i) => (
                  <tr key={'t' + i} className={i % 2 ? 'bg-gray-50' : ''}>
                    <td className="px-3 py-2">{t.kalem} - Taksit ({t.taksitNo}/{t.taksitSayisi})</td>
                    <td className="px-3 py-2 text-gray-500">Ödenmesi Gereken Vade: {t.vade.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}</td>
                    <td className="px-3 py-2 text-right font-medium">{paraFormat(t.tutar)}</td>
                  </tr>
                ))}
                {buAyKalemBorclari.map((a, i) => (
                  <tr key={a.id} className={(buAyTaksitler.length + i) % 2 ? 'bg-gray-50' : ''}>
                    <td className="px-3 py-2">{a.kalem}</td>
                    <td className="px-3 py-2 text-gray-500">Bakiye Borçlu</td>
                    <td className="px-3 py-2 text-right font-medium">{paraFormat(a.tutar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex justify-between px-4 py-2 bg-gray-50 font-semibold">
                <span>BU AYKİ TAKSİT VE HARCAMALAR TOPLAMI</span>
                <span>{paraFormat(buAyToplam)}</span>
              </div>
              <div className="flex justify-between px-4 py-3 bg-orange/10 border-t border-gray-200">
                <span className="font-bold text-orange">GENEL KALAN BAKİYE (TÜM ZAMANLAR)</span>
                <span className="font-bold text-orange text-lg">{paraFormat(genelKalanBakiye)}</span>
              </div>
            </div>

            <p className="text-xs text-gray-400 mt-3">
              🔴 "Bu Ayki Toplam" seçilen döneme denk gelen taksit ve aylık kalemleri gösterir. "Genel Kalan
              Bakiye" bugüne kadarki tüm sözleşme + aylık kalem borcundan tüm ödemeler düşülerek hesaplanan
              güncel toplam bakiyedir.
            </p>

            <div className="mt-6">
              <p className="font-semibold text-navy mb-2">ÖDEME GEÇMİŞİ (Son {sonOdemeler.length} Kayıt)</p>
              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-navy text-white text-left">
                    <th className="px-3 py-2 font-semibold">Tarih</th>
                    <th className="px-3 py-2 font-semibold">Kalem</th>
                    <th className="px-3 py-2 font-semibold text-right">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {sonOdemeler.length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-3 text-center text-gray-400">Ödeme kaydı yok.</td></tr>
                  )}
                  {sonOdemeler.map((o, i) => (
                    <tr key={o.id} className={i % 2 ? 'bg-gray-50' : ''}>
                      <td className="px-3 py-2">{new Date(o.tarih).toLocaleDateString('tr-TR')}</td>
                      <td className="px-3 py-2">{o.kalem || '—'}</td>
                      <td className="px-3 py-2 text-right">{paraFormat(o.tutar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
