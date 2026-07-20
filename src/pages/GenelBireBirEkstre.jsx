import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import BireBirDersDokumu from '../components/BireBirDersDokumu'
import { paraFormat, bireBirDersDetaylariOlustur, ayEtiketi } from '../lib/ekstreHesap'

// Ayı "YYYY-MM" olarak YEREL saate göre üretir (toISOString KULLANMIYORUZ —
// Türkiye UTC+3 gece yarısına yakın saatlerde bir gün geriye kayabiliyor).
function suankiAy() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

// Öğrenci ya da öğretmene göre AYIRMADAN, okuldaki TÜM bire bir dersleri
// (haftalık tekrarlananlardan işaretlenenler + tek seferlikler, hepsi bir
// arada) tek bir listede, haftalık/aylık seçilebilir, yazdırılabilir/PDF
// alınabilir şekilde gösteren sayfa. Ekstre.jsx (öğrenci) ve OgretmenEkstre.jsx
// (öğretmen) belirli BİR kişiye özelken, bu sayfa "bu hafta/ay okulda kaç bire
// bir dersi verildi, hangi öğrenciye, hangi öğretmenden" sorusuna herkesi aynı
// anda göstererek cevap verir. Sadece yönetici erişebilir (App.jsx'te kısıtlı).
export default function GenelBireBirEkstre() {
  const [dersler, setDersler] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase
        .from('bire_bir_atamalari')
        .select('*, ogrenciler(ad_soyad), profiles:ogretmen_profile_id(ad_soyad, brans)'),
      supabase
        .from('bire_bir_yoklama')
        .select('*, ogrenciler(ad_soyad), profiles:ogretmen_profile_id(ad_soyad, brans)')
        .is('atama_id', null),
    ]).then(([bba, ekDersler]) => {
      const atamalar = bba.data || []
      const atamaIdleri = atamalar.map((x) => x.id)
      const yoklamaSorgusu =
        atamaIdleri.length > 0
          ? supabase.from('bire_bir_yoklama').select('*').in('atama_id', atamaIdleri)
          : Promise.resolve({ data: [] })
      yoklamaSorgusu.then((by) => {
        const tumYoklamalar = [...(by.data || []), ...(ekDersler.data || [])]
        setDersler(bireBirDersDetaylariOlustur(atamalar, tumYoklamalar))
        setLoading(false)
      })
    })
  }, [])

  if (loading) return <p className="p-6 text-gray-400">Yükleniyor...</p>

  // OgretmenEkstre.jsx'teki aynı düzeltmeyle tutarlı olsun diye: bu kutu
  // artık "TÜM ZAMANLAR" değil, SADECE İÇİNDE BULUNULAN AYI özetliyor —
  // tüm zamanlar toplamı isteyen aşağıdaki "Tüm Zamanlar" sekmesine geçebilir.
  const buAy = suankiAy()
  const buAyDersler = dersler.filter((d) => d.tarih?.slice(0, 7) === buAy)
  const buAyDersSayisi = buAyDersler.length
  const buAyTutar = buAyDersler.reduce((t, d) => t + d.tutar, 0)

  return (
    <div className="min-h-screen bg-cream py-8 px-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
      <div className="max-w-3xl mx-auto">
        <div className="no-print flex items-center justify-between mb-4 flex-wrap gap-3">
          <Link to="/bire-bir" className="text-sm text-blue hover:underline">← Bire Bir'e Dön</Link>
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
              <p className="text-sm text-white/80 mt-1">GENEL BİRE BİR DERS DÖKÜMÜ</p>
            </div>
          </div>

          <div className="p-6">
            <p className="text-xs text-gray-400 mb-4">
              Öğrenci ya da öğretmene göre ayrılmadan, seçilen hafta/ayda okulda verilen TÜM bire bir
              dersler bir arada listelenir. Sadece "Geldi" (gerçekleşmiş, faturalanmış) dersler sayılır.
            </p>

            <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex justify-between px-4 py-3 bg-navy/5">
                <span className="font-bold text-navy">
                  BU AY TOPLAM <span className="font-normal text-gray-400 capitalize">({ayEtiketi(buAy + '-01')})</span>
                </span>
                <span className="font-bold text-navy text-lg">{buAyDersSayisi} ders — {paraFormat(buAyTutar)}</span>
              </div>
            </div>

            {dersler.length === 0 ? (
              <p className="text-sm text-gray-400">Kayıtlı ders bulunamadı.</p>
            ) : (
              <BireBirDersDokumu
                dersler={dersler.map((d) => ({ ...d, karsiTarafAdi: d.ogrenciAdi, ikinciTarafAdi: d.ogretmenAdi, ikinciTarafBransi: d.ogretmenBransi }))}
                karsiTarafBasligi="Öğrenci"
                ikinciTarafBasligi="Öğretmen"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
