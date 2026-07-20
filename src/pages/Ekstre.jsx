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
  // Fatura Ortağı (ör. ikiz kardeşler): bu öğrenci başka birine bağlıysa
  // (ya da başka biri buna bağlıysa) hepsinin borç/ödemesi burada BİRLEŞİK
  // gösterilir. faturaGrubu.length > 1 olduğunda ekranda "kimin" borcu/dersi
  // olduğunu ayrıca gösteriyoruz (bkz. aşağıdaki render).
  const [faturaGrubu, setFaturaGrubu] = useState([])

  useEffect(() => {
    setLoading(true)
    supabase
      .from('ogrenciler')
      .select('*')
      .eq('id', ogrenciId)
      .single()
      .then(({ data: kendisi }) => {
        if (!kendisi) {
          setOgrenci(null)
          setLoading(false)
          return
        }
        const efektifId = kendisi.fatura_sahibi_id || kendisi.id
        supabase
          .from('ogrenciler')
          .select('*')
          .or(`id.eq.${efektifId},fatura_sahibi_id.eq.${efektifId}`)
          .then(({ data: grupOgrencileri }) => {
            const grup = (grupOgrencileri || []).map((g) => g.id)
            Promise.all([
              supabase.from('sozlesmeler').select('*').in('ogrenci_id', grup),
              supabase.from('aylik_borclar').select('*').in('ogrenci_id', grup),
              supabase.from('odemeler').select('*, ogrenciler(ad_soyad)').in('ogrenci_id', grup).order('tarih', { ascending: false }),
              // Öğretmen adını (profiles join) ve — birden fazla öğrenci varsa
              // dersin kime ait olduğunu gösterebilmek için öğrenci adını
              // (ogrenciler join) da çekiyoruz.
              supabase
                .from('bire_bir_atamalari')
                .select('*, profiles:ogretmen_profile_id(ad_soyad, brans), ogrenciler(ad_soyad)')
                .in('ogrenci_id', grup),
              // "Ek Ders" (atamaya bağlı olmayan, tek seferlik bire bir) kayıtları
              supabase
                .from('bire_bir_yoklama')
                .select('*, profiles:ogretmen_profile_id(ad_soyad, brans), ogrenciler(ad_soyad)')
                .in('ogrenci_id', grup)
                .is('atama_id', null),
              supabase.from('kantin_alislar').select('*').in('ogrenci_id', grup),
            ]).then(([s, a, od, bba, ekDersler, kantin]) => {
              const atamalar = bba.data || []
              const atamaIdleri = atamalar.map((x) => x.id)
              const yoklamaSorgusu =
                atamaIdleri.length > 0
                  ? supabase.from('bire_bir_yoklama').select('*, ogrenciler(ad_soyad)').in('atama_id', atamaIdleri)
                  : Promise.resolve({ data: [] })
              yoklamaSorgusu.then((by) => {
                const tumYoklamalar = [...(by.data || []), ...(ekDersler.data || [])]
                const bireBirBorclar = bireBirBorclariOlustur(atamalar, tumYoklamalar)
                const kantinBorclar = kantinBorclariOlustur(kantin.data || [])
                setOgrenci(kendisi)
                setFaturaGrubu(grupOgrencileri || [])
                setSozlesmeler(s.data || [])
                setAylikBorclar([...(a.data || []), ...bireBirBorclar, ...kantinBorclar])
                setOdemeler(od.data || [])
                setBireBirDersleri(bireBirDersDetaylariOlustur(atamalar, tumYoklamalar))
                setLoading(false)
              })
            })
          })
      })
  }, [ogrenciId])

  const faturaDigerleri = faturaGrubu.filter((o) => o.id !== ogrenciId)

  // İndirilen PDF/yazdırma çıktısının dosya adı (ve tarayıcı sekme başlığı)
  // öğrenci adı ve dönemi göstersin diye — "Savaş Akça Eğitim Portalı" gibi
  // genel bir isimle kaydedilmesin. Sayfadan ayrılınca eski başlığa dönüyoruz.
  useEffect(() => {
    if (!ogrenci) return
    const ayMetni = new Date(seciliAy + '-01').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
    document.title = `${ogrenci.ad_soyad} Aylık Muhasebe - ${ayMetni}`
    return () => {
      document.title = 'Savaş Akça Eğitim Portalı'
    }
  }, [ogrenci, seciliAy])

  if (loading) return <p className="p-6 text-gray-400">Yükleniyor...</p>
  if (!ogrenci) return <p className="p-6 text-gray-400">Öğrenci bulunamadı.</p>

  const satirlar = ogrenciSatirlariHesapla(sozlesmeler, aylikBorclar, odemeler, seciliAy)

  const buAyToplam = satirlar.reduce((t, x) => t + x.buAyTutar, 0)
  const gecmisBorcToplam = satirlar.reduce((t, x) => t + x.gecmisBorc, 0)
  const buAyOdenmesiGereken = satirlar.reduce((t, x) => t + x.toplamOdenecek, 0)
  // Bu dönemde herhangi bir kalemde fazla ödeme (alacak) var mı — açıklama
  // notunun altında yeşil bir uyarı gösterebilmek için ayrıca toplanıyor.
  const fazlaOdemeVarMi = satirlar.some((x) => x.fazlaOdeme > 0.01)

  // "Genel Kalan Bakiye" — tüm zamanların, tüm kalemlerin toplu bakiyesi (dönemden bağımsız)
  const toplamSozlesme = sozlesmeler.reduce((t, s) => t + Number(s.toplam_tutar), 0)
  const toplamAylikBorc = aylikBorclar.reduce((t, a) => t + Number(a.tutar), 0)
  const toplamOdenen = odemeler.reduce((t, o) => t + Number(o.tutar), 0)
  const genelKalanBakiye = Math.max(0, toplamSozlesme + toplamAylikBorc - toplamOdenen)

  // Veli, "Devreden Ödeme" (sisteme geçmeden önceki eski ödeme) kayıtlarını görmesin —
  // kafası karışabilir, o ödemeyi kendisi yapmış gibi görünmesin diye. Yönetici hepsini görür.
  // (Not: bu filtre sadece GÖRÜNÜR listeyi etkiler, borç hesaplarına devreden ödemeler dahildir.)
  const gorunurOdemeler = isVeli ? odemeler.filter((o) => !o.kalem?.includes('Devreden')) : odemeler
  // Veli "bugüne kadar yaptığım tüm ödemeleri PDF olarak istiyorum" dediğinde
  // elindeki çıktı eksiksiz olsun diye — burada artık SADECE son 10 kayıt değil,
  // öğrencinin (görünür) tüm ödeme geçmişi listeleniyor.
  const gosterilecekOdemeler = gorunurOdemeler
  const gosterilenOdemeToplami = gosterilecekOdemeler.reduce((t, o) => t + Number(o.tutar), 0)

  return (
    <div className="min-h-screen bg-cream py-8 px-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          tr { break-inside: avoid; page-break-inside: avoid; }
          .bire-bir-baslik-blok { break-inside: avoid; page-break-inside: avoid; }
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

        {faturaDigerleri.length > 0 && (
          <div className="no-print bg-purple-50 border border-purple-200 rounded-xl p-3 mb-4 text-sm text-purple-800">
            Birleşik ekstre: aşağıdaki tutarlar <strong>{faturaDigerleri.map((o) => o.ad_soyad).join(', ')}</strong> ile
            ortak tutuluyor (Fatura Ortağı bağlantısı). Bire bir ders dökümünde her satırın kime ait olduğu ayrıca gösterilir.
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="bg-navy text-white py-5 px-6 flex items-center gap-4">
            <div className="bg-white rounded-xl p-1.5 shrink-0">
              <img src="/logo.png" alt="Savaş Akça Eğitim" className="w-12 h-12 object-contain" />
            </div>
            <div>
              <p className="font-bold text-xl tracking-wide">SAVAŞ AKÇA EĞİTİM</p>
              <p className="text-sm text-white/80 mt-1">AYLIK ÖĞRENCİ EKSTRESİ</p>
            </div>
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
                {satirlar.map((s, i) => {
                  // Bu kalemde borçtan fazla ödeme yapılmışsa (alacaklı durumu),
                  // satırı borç satırlarından ayrı, yeşil ve "+X" olarak gösteriyoruz.
                  const alacakli = s.fazlaOdeme > 0.01 && s.toplamOdenecek <= 0.01
                  return (
                    <tr
                      key={i}
                      className={alacakli ? 'bg-green-50' : s.gecmisBorc > 0 ? 'bg-red-50' : i % 2 ? 'bg-gray-50' : ''}
                    >
                      <td className={`px-2 sm:px-3 py-2 ${s.gecmisBorc > 0 ? 'text-red-700 font-medium' : alacakli ? 'text-green-700 font-medium' : ''}`}>
                        {s.label}
                      </td>
                      <td className={`px-2 sm:px-3 py-2 ${s.gecmisBorc > 0 ? 'text-red-700' : alacakli ? 'text-green-700' : 'text-gray-500'}`}>
                        {s.durum}
                      </td>
                      <td className={`px-2 sm:px-3 py-2 text-right font-medium ${s.gecmisBorc > 0 ? 'text-red-700' : ''}`}>{paraFormat(s.buAyTutar)}</td>
                      <td className={`px-2 sm:px-3 py-2 text-right font-medium ${s.gecmisBorc > 0 ? 'text-red-700' : 'text-gray-400'}`}>
                        {s.gecmisBorc > 0 ? paraFormat(s.gecmisBorc) : '—'}
                      </td>
                      <td className={`px-2 sm:px-3 py-2 text-right font-semibold ${s.gecmisBorc > 0 ? 'text-red-700' : alacakli ? 'text-green-700' : ''}`}>
                        {alacakli ? `+ ${paraFormat(s.fazlaOdeme)}` : paraFormat(s.toplamOdenecek)}
                      </td>
                    </tr>
                  )
                })}
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
            {fazlaOdemeVarMi && (
              <p className="text-xs text-green-700 mt-1">
                🟢 Yeşil satır = bu kalemde borçtan fazla ödeme yapılmış (alacaklısınız). Bu tutar ayrıca
                bir işlem yapmanıza gerek kalmadan, o kalemde bir sonraki borç doğduğunda (bir sonraki ay
                taksiti / yeni ders ya da alış) otomatik olarak düşülür.
              </p>
            )}

            {bireBirDersleri.length > 0 && (
              <div className="mt-6 bire-bir-baslik-blok">
                <p className="font-semibold text-navy mb-2">Bire Bir Ders Dökümü</p>
                <BireBirDersDokumu
                  dersler={bireBirDersleri.map((d) => ({
                    ...d,
                    karsiTarafAdi: d.ogretmenAdi,
                    karsiTarafBransi: d.ogretmenBransi,
                    ikinciTarafAdi: d.ogrenciAdi,
                  }))}
                  karsiTarafBasligi="Öğretmen"
                  {...(faturaDigerleri.length > 0 ? { ikinciTarafBasligi: 'Öğrenci' } : {})}
                  hedefDonem={`${seciliAy}-01`}
                />
              </div>
            )}

            <div className="mt-6">
              <p className="font-semibold text-navy mb-2">Ödeme Geçmişi — Bugüne Kadar Yapılan Tüm Ödemeler ({gosterilecekOdemeler.length} Kayıt)</p>
              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-navy text-white text-left">
                    <th className="px-3 py-2 font-semibold">Tarih</th>
                    {faturaDigerleri.length > 0 && <th className="px-3 py-2 font-semibold">Öğrenci</th>}
                    <th className="px-3 py-2 font-semibold">Kalem</th>
                    <th className="px-3 py-2 font-semibold text-right">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {gosterilecekOdemeler.length === 0 && (
                    <tr><td colSpan={faturaDigerleri.length > 0 ? 4 : 3} className="px-3 py-3 text-center text-gray-400">Ödeme kaydı yok.</td></tr>
                  )}
                  {gosterilecekOdemeler.map((o, i) => (
                    <tr key={o.id} className={i % 2 ? 'bg-gray-50' : ''}>
                      <td className="px-3 py-2">{new Date(o.tarih).toLocaleDateString('tr-TR')}</td>
                      {faturaDigerleri.length > 0 && <td className="px-3 py-2">{o.ogrenciler?.ad_soyad || '—'}</td>}
                      <td className="px-3 py-2">{o.kalem || '—'}</td>
                      <td className="px-3 py-2 text-right">{paraFormat(o.tutar)}</td>
                    </tr>
                  ))}
                </tbody>
                {gosterilecekOdemeler.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold border-t border-gray-200">
                      <td className="px-3 py-2" colSpan={faturaDigerleri.length > 0 ? 3 : 2}>TOPLAM ÖDENEN</td>
                      <td className="px-3 py-2 text-right">{paraFormat(gosterilenOdemeToplami)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
