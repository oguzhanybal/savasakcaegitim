import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import BireBirDersDokumu from '../components/BireBirDersDokumu'
import {
  paraFormat,
  bireBirDersDetaylariOlustur,
  sinifDersDetaylariOlustur,
  ayEtiketi,
  ayBaslangici,
  haftaEtiketi,
  haftaBaslangici,
} from '../lib/ekstreHesap'

// Ayı "YYYY-MM" olarak YEREL saate göre üretir (toISOString KULLANMIYORUZ —
// Türkiye UTC+3 gece yarısına yakın saatlerde bir gün geriye kayabiliyor).
function suankiAy() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

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
  // Aşağıdaki BireBirDersDokumu bileşeni ekranda O AN hangi dönemi
  // gösteriyorsa (Haftalık/Aylık/Tüm Zamanlar + hangi ay/hafta seçili) bu
  // state onu takip eder — bkz. BireBirDersDokumu'nun onDonemDegisti prop
  // açıklaması. Üstteki özet kutusu artık SABİT "bugünün ayı" değil, bu
  // dönemi baz alıyor.
  const [gosterilenDonem, setGosterilenDonem] = useState(null) // { periyot, anahtar } | null

  useEffect(() => {
    // Bu fonksiyon hem sayfa ilk açıldığında hem de aşağıdaki
    // görünürlük/odak dinleyicileri tetiklendiğinde çağrılıyor (bkz. altta).
    function veriyiGetir(ilkYuklemeMi) {
      if (ilkYuklemeMi) setLoading(true)
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
        // Bu öğretmenin verdiği (yoklaması alınmış) SINIF dersleri — sadece kayıt
        // için gösteriliyor, ücret hesabına dahil değil (tutar hep 0'dır).
        supabase
          .from('yoklama')
          .select('*, ders_programi!inner(ders_adi, baslangic_saat, bitis_saat, siniflar(ad))')
          .eq('ders_programi.ogretmen_profile_id', ogretmenId),
      ]).then(([ogr, bba, ekDersler, sinifYoklamalari]) => {
        const atamalar = bba.data || []
        const atamaIdleri = atamalar.map((x) => x.id)
        const yoklamaSorgusu =
          atamaIdleri.length > 0
            ? supabase.from('bire_bir_yoklama').select('*').in('atama_id', atamaIdleri)
            : Promise.resolve({ data: [] })
        yoklamaSorgusu.then((by) => {
          const tumYoklamalar = [...(by.data || []), ...(ekDersler.data || [])]
          const bireBirDersler = bireBirDersDetaylariOlustur(atamalar, tumYoklamalar)
          const sinifDersler = sinifDersDetaylariOlustur(sinifYoklamalari.data || [])
          setOgretmen(ogr.data)
          setDersler([...bireBirDersler, ...sinifDersler].sort((a, b) => (a.tarih < b.tarih ? 1 : -1)))
          setLoading(false)
        })
      })
    }

    veriyiGetir(true)

    // Bu sekme günlerce kapatılmadan açık bırakılabiliyor (ör. yönetici bir
    // öğretmenin ekstresini bir kez açıp sekmeyi hiç kapatmıyor). O durumda
    // veriler ilk açılıştaki hâliyle donuk kalıyor, "bu ay verilen ders"
    // güncellenmiyor ve aşağıdaki BireBirDersDokumu bileşeni de eski veriye
    // göre hesaplanmış bir dönemde takılı kalabiliyordu. Sekme tekrar
    // görünür/odaklı hâle geldiğinde veriyi sessizce (loading ekranı
    // göstermeden) tazeliyoruz.
    function gorunurlukDegisti() {
      if (document.visibilityState === 'visible') veriyiGetir(false)
    }
    document.addEventListener('visibilitychange', gorunurlukDegisti)
    return () => document.removeEventListener('visibilitychange', gorunurlukDegisti)
  }, [ogretmenId])

  // İndirilen PDF/yazdırma çıktısının dosya adı (ve tarayıcı sekme başlığı)
  // öğretmen adını göstersin diye — "Savaş Akça Eğitim Portalı" gibi genel
  // bir isimle kaydedilmesin.
  useEffect(() => {
    if (!ogretmen) return
    document.title = `${ogretmen.ad_soyad} Ekstresi`
    return () => {
      document.title = 'Savaş Akça Eğitim Portalı'
    }
  }, [ogretmen])

  if (loading) return <p className="p-6 text-gray-400">Yükleniyor...</p>
  if (!ogretmen) return <p className="p-6 text-gray-400">Öğretmen bulunamadı.</p>

  // ÖNEMLİ: bu kutu eskiden HEP "bugünün ayı"nı (suankiAy) özetliyordu — ama
  // aşağıdaki Haftalık/Aylık/Tüm Zamanlar seçici FARKLI bir dönem
  // gösterdiğinde (ör. bu ayda henüz kayıt yoksa otomatik geçen aya
  // düşülüyordu) kutu ile tablo TUTARSIZ görünüyordu ("Ağustos 2026" yazan
  // kutu, altta Temmuz'un derslerini gösteriyordu). Şimdi bu kutu aşağıdaki
  // bileşenin O AN gösterdiği dönemi (gosterilenDonem) baz alıyor — hangi ay/
  // hafta/"Tüm Zamanlar" seçiliyse kutu da onu özetliyor.
  const buAy = suankiAy()
  let ozetBaslik = ayEtiketi(buAy + '-01')
  let ozetDersler = dersler.filter((d) => d.tarih?.slice(0, 7) === buAy)
  if (gosterilenDonem?.periyot === 'hepsi') {
    ozetBaslik = 'Tüm Zamanlar'
    ozetDersler = dersler
  } else if (gosterilenDonem?.anahtar) {
    const haftaMi = gosterilenDonem.periyot === 'hafta'
    const anahtarUret = haftaMi ? haftaBaslangici : ayBaslangici
    ozetBaslik = (haftaMi ? haftaEtiketi : ayEtiketi)(gosterilenDonem.anahtar)
    ozetDersler = dersler.filter((d) => anahtarUret(d.tarih) === gosterilenDonem.anahtar)
  }
  const ozetDersSayisi = ozetDersler.length
  const ozetTutar = ozetDersler.reduce((t, d) => t + d.tutar, 0)
  // Soru Çözümü seansları ücretsiz olduğu için toplam tutara katkısı yok, ama
  // toplam ders SAYISINA dahil oluyor — kaç tanesinin ders, kaç tanesinin
  // soru çözümü olduğu ayrıca belirtilmezse yanıltıcı olabiliyor.
  const ozetSoruCozumuSayisi = ozetDersler.filter((d) => d.tur === 'soru_cozumu').length
  // Sınıf dersleri de aynı şekilde ücretsiz (tutara katkısı yok) ama ders
  // SAYISINA dahil — kaç tanesinin sınıf dersi olduğu ayrıca belirtiliyor.
  const ozetSinifDersSayisi = ozetDersler.filter((d) => d.tur === 'sinif').length
  // Asıl ÜCRETLİ olan (tutara dahil) bire bir dersleri — kullanıcı isteğiyle
  // eklendi: Soru Çözümü ve Sınıf Dersi sayıları ayrıca yazılıyordu ama kaç
  // tanesinin gerçek (ücretli) bire bir dersi olduğu belirtilmiyordu.
  const ozetBireBirDersSayisi = ozetDersler.filter((d) => d.tur === 'ders').length

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
          <div className="bg-navy text-white py-5 px-6 flex items-center gap-4">
            <div className="bg-white rounded-xl p-1.5 shrink-0">
              <img src="/logo.png" alt="Savaş Akça Eğitim" className="w-12 h-12 object-contain" />
            </div>
            <div>
              <p className="font-bold text-xl tracking-wide">SAVAŞ AKÇA EĞİTİM</p>
              <p className="text-sm text-white/80 mt-1">ÖĞRETMEN BİRE BİR DERS DÖKÜMÜ</p>
            </div>
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
                <span className="font-bold text-navy">
                  VERİLEN DERS <span className="font-normal text-gray-400 capitalize">({ozetBaslik})</span>
                </span>
                {/* Öğretmen KENDİ dökümünü görürken ücret bilgisi (ne tutar ne
                    "ücretli"/"ücretsiz" ifadesi) hiçbir şekilde gösterilmesin —
                    kullanıcı isteğiyle. Sadece yönetici görüntülerken tutar
                    yazılır; öğretmen için burada sadece ders sayısı kalır. */}
                <span className="font-bold text-navy text-lg">
                  {ozetDersSayisi} ders{isYonetici ? ` — ${paraFormat(ozetTutar)}` : ''}
                </span>
              </div>
              <div className="px-4 py-2 bg-purple-50 border-t border-purple-100 text-xs text-purple-700">
                Bunların <b>{ozetSoruCozumuSayisi}</b> tanesi Soru Çözümü seansı{isYonetici ? ' (ücretsiz, tutara dahil değil)' : ''}.
              </div>
              <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 text-xs text-blue-700">
                Bunların <b>{ozetSinifDersSayisi}</b> tanesi sınıf dersi{isYonetici ? ' (ücretsiz, tutara dahil değil)' : ''}.
              </div>
              <div className="px-4 py-2 bg-green-50 border-t border-green-100 text-xs text-green-700">
                Bunların <b>{ozetBireBirDersSayisi}</b> tanesi bire bir dersi{isYonetici ? ' (ücretli, tutara dahil)' : ''}.
              </div>
            </div>

            {dersler.length === 0 ? (
              <p className="text-sm text-gray-400">Bu öğretmene ait onaylanmış ders kaydı bulunamadı.</p>
            ) : (
              <BireBirDersDokumu
                dersler={dersler.map((d) => ({ ...d, karsiTarafAdi: d.ogrenciAdi }))}
                karsiTarafBasligi="Öğrenci"
                onDonemDegisti={setGosterilenDonem}
                tutarGizle={!isYonetici}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
