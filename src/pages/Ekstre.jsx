import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import BireBirDersDokumu from '../components/BireBirDersDokumu'
import {
  paraFormat,
  ogrenciSatirlariHesapla,
  bireBirBorclariOlustur,
  kantinBorclariOlustur,
  bireBirDersDetaylariOlustur,
} from '../lib/ekstreHesap'

export default function Ekstre() {
  const { ogrenciId } = useParams()
  const { profile } = useAuth()
  const isVeli = profile?.rol === 'veli'

  const [ogrenci, setOgrenci] = useState(null)
  const [sozlesmeler, setSozlesmeler] = useState([])
  const [aylikBorclar, setAylikBorclar] = useState([])
  const [odemeler, setOdemeler] = useState([])
  const [bireBirDersleri, setBireBirDersleri] = useState([])
  const [seciliAy, setSeciliAy] = useState(() => new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('ogrenciler').select('*').eq('id', ogrenciId).single(),
      supabase.from('sozlesmeler').select('*').eq('ogrenci_id', ogrenciId),
      supabase.from('aylik_borclar').select('*').eq('ogrenci_id', ogrenciId),
      supabase.from('odemeler').select('*').eq('ogrenci_id', ogrenciId).order('tarih', { ascending: false }),
      // Öğretmen adını da (profiles join) çekiyoruz — "Bire Bir Ders Dökümü"nde
      // "hangi öğretmenden" görebilmek için.
      supabase.from('bire_bir_atamalari').select('*, profiles:ogretmen_profile_id(ad_soyad, brans)').eq('ogrenci_id', ogrenciId),
      // "Ek Ders" (atamaya bağlı olmayan, tek seferlik bire bir) kayıtları
      supabase
        .from('bire_bir_yoklama')
        .select('*, profiles:ogretmen_profile_id(ad_soyad, brans)')
        .eq('ogrenci_id', ogrenciId)
        .is('atama_id', null),
      supabase.from('kantin_alislar').select('*').eq('ogrenci_id', ogrenciId),
    ]).then(([o, s, a, od, bba, ekDersler, kantin]) => {
      const atamalar = bba.data || []
      const atamaIdleri = atamalar.map((x) => x.id)
      const yoklamaSorgusu =
        atamaIdleri.length > 0
          ? supabase.from('bire_bir_yoklama').select('*').in('atama_id', atamaIdleri)
          : Promise.resolve({ data: [] })
      yoklamaSorgusu.then((by) => {
        const tumYoklamalar = [...(by.data || []), ...(ekDersler.data || [])]
        const bireBirBorclar = bireBirBorclariOlustur(atamalar, tumYoklamalar)
        const kantinBorclar = kantinBorclariOlustur(kantin.data || [])
        setOgrenci(o.data)
        setSozlesmeler(s.data || [])
        setAylikBorclar([...(a.data || []), ...bireBirBorclar, ...kantinBorclar])
        setOdemeler(od.data || [])
        setBireBirDersleri(bireBirDersDetaylariOlustur(atamalar, tumYoklamalar))
        setLoading(false)
      })
    })
  }, [ogrenciId])

  // İndirilen PDF/yazdırma çıktısının dosya adı (ve tarayıcı sekme başlığı)
  // öğrenci adı ve dönemi göstersin diye — "Savaş Akça Eğitim - Sistem" gibi
  // genel bir isimle kaydedilmesin. Sayfadan ayrılınca eski başlığa dönüyoruz.
  useEffect(() => {
    if (!ogrenci) return
    const ayMetni = new Date(seciliAy + '-01').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
    document.title = `${ogrenci.ad_soyad} Aylık Muhasebe - ${ayMetni}`
    return () => {
      document.title = 'Savaş Akça Eğitim - Sistem'
    }
  }, [ogrenci, seciliAy])

  if (loading) return <p className="p-6 text-gray-400">Yükleniyor...</p>
  if (!ogrenci) return <p className="p-6 text-gray-400">Öğrenci bulunamadı.</p>

  const satirlar = ogrenciSatirlariHesapla(sozlesmeler, aylikBorclar, odemeler, seciliAy)

  const buAyToplam = satirlar.reduce((t, x) => t + x.buAyTutar, 0)
  const gecmisBorcToplam = satirlar.reduce((t, x) => t + x.gecmisBorc, 0)
  const buAyOdenmesiGereken = satirlar.reduce((t, x) => t + x.toplamOdenecek, 0)

  // "Genel Kalan Bakiye" — tüm zamanların, tüm kalemlerin toplu bakiyesi (dönemden bağımsız)
  const toplamSozlesme = sozlesmeler.reduce((t, s) => t + Number(s.toplam_tutar), 0)
  const toplamAylikBorc = aylikBorclar.reduce((t, a) => t + Number(a.tutar), 0)
  const toplamOdenen = odemeler.reduce((t, o) => t + Number(o.tutar), 0)
  const genelKalanBakiye = Math.max(0, toplamSozlesme + toplamAylikBorc - toplamOdenen)

  // Veli, "Devreden Ödeme" (sisteme geçmeden önceki eski ödeme) kayıtlarını görmesin —
  // kafası karışabilir, o ödemeyi kendisi yapmış gibi görünmesin diye. Yönetici hepsini görür.
  // (Not: bu filtre sadece GÖRÜNÜR listeyi etkiler, borç hesaplarına devreden ödemeler dahildir.)
  const gorunurOdemeler = isVeli ? odemeler.filter((o) => !o.kalem?.includes('Devreden')) : odemeler
  const sonOdemeler = gorunurOdemeler.slice(0, 10)

  return (
    <div className="min-h-screen bg-cream py-8 px-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          tr { break-inside: avoid; page-break-inside: avoid; }
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

            <table className="w-full text-xs sm:text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-navy text-white text-left">
                  <th className="px-2 sm:px-3 py-2 font-semibold">Açıklama / Kalem</th>
                  <th className="px-2 sm:px-3 py-2 font-semibold">Vade / Durum</th>
                  <th className="px-2 sm:px-3 py-2 font-semibold text-right">Bu Ayın Tutarı</th>
                  <th className="px-2 sm:px-3 py-2 font-semibold text-right">Geçmiş Borç</th>
                  <th className="px-2 sm:px-3 py-2 font-semibold text-right">Toplam Ödenecek</th>
                </tr>
              </thead>
              <tbody>
                {satirlar.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">Bu dönem için kayıt bulunamadı.</td></tr>
                )}
                {satirlar.map((s, i) => (
                  <tr
                    key={i}
                    className={s.gecmisBorc > 0 ? 'bg-red-50' : i % 2 ? 'bg-gray-50' : ''}
                  >
                    <td className={`px-2 sm:px-3 py-2 ${s.gecmisBorc > 0 ? 'text-red-700 font-medium' : ''}`}>{s.label}</td>
                    <td className={`px-2 sm:px-3 py-2 ${s.gecmisBorc > 0 ? 'text-red-700' : 'text-gray-500'}`}>{s.durum}</td>
                    <td className={`px-2 sm:px-3 py-2 text-right font-medium ${s.gecmisBorc > 0 ? 'text-red-700' : ''}`}>{paraFormat(s.buAyTutar)}</td>
                    <td className={`px-2 sm:px-3 py-2 text-right font-medium ${s.gecmisBorc > 0 ? 'text-red-700' : 'text-gray-400'}`}>
                      {s.gecmisBorc > 0 ? paraFormat(s.gecmisBorc) : '—'}
                    </td>
                    <td className={`px-2 sm:px-3 py-2 text-right font-semibold ${s.gecmisBorc > 0 ? 'text-red-700' : ''}`}>{paraFormat(s.toplamOdenecek)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex justify-between px-4 py-2 bg-gray-50 font-semibold">
                <span>BU AYKİ TAKSİT VE HARCAMALAR TOPLAMI</span>
                <span>{paraFormat(buAyToplam)}</span>
              </div>
              <div className="flex justify-between px-4 py-2 bg-gray-50 border-t border-gray-200 font-semibold">
                <span>GEÇMİŞTEN KALAN BORÇ TOPLAMI</span>
                <span className={gecmisBorcToplam > 0 ? 'text-red-700' : ''}>{paraFormat(gecmisBorcToplam)}</span>
              </div>
              <div className="flex justify-between px-4 py-3 bg-orange/10 border-t border-gray-200">
                <span className="font-bold text-orange">BU AY ÖDENMESİ GEREKEN MİKTAR</span>
                <span className="font-bold text-orange text-lg">{paraFormat(buAyOdenmesiGereken)}</span>
              </div>
              <div className="flex justify-between px-4 py-3 bg-navy/5 border-t border-gray-200">
                <span className="font-bold text-navy">GENEL KALAN BAKİYE (TÜM ZAMANLAR)</span>
                <span className="font-bold text-navy text-lg">{paraFormat(genelKalanBakiye)}</span>
              </div>
            </div>

            <p className="text-xs text-gray-400 mt-3">
              🔴 Kırmızı satır = vadesi geçmiş ödenmemiş borç var demektir. Ödeme yapılmadıysa o kalem
              otomatik olarak bir sonraki ayın ekstresinde de "Geçmiş Borç" olarak görünmeye devam eder;
              ödeme geldiğinde bu tutarlar kendiliğinden güncellenir.
            </p>

            {bireBirDersleri.length > 0 && (
              <div className="mt-6">
                <p className="font-semibold text-navy mb-2">Bire Bir Ders Dökümü</p>
                <BireBirDersDokumu
                  dersler={bireBirDersleri.map((d) => ({ ...d, karsiTarafAdi: d.ogretmenAdi, karsiTarafBransi: d.ogretmenBransi }))}
                  karsiTarafBasligi="Öğretmen"
                  hedefDonem={`${seciliAy}-01`}
                />
              </div>
            )}

            <div className="mt-6">
              <p className="font-semibold text-navy mb-2">Ödeme Geçmişi (Son {sonOdemeler.length} Kayıt)</p>
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
