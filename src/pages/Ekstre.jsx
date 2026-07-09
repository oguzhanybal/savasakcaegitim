import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

function paraFormat(n) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n || 0)
}

// ---- Ay yardımcıları ("YYYY-MM" string'i ile {yil, ay} arasında dönüşüm) ----
function ayCoz(ayStr) {
  const [yil, ay] = ayStr.split('-').map(Number)
  return { yil, ay }
}

function ayEkle(ayStr, adet) {
  const { yil, ay } = ayCoz(ayStr)
  const toplam = yil * 12 + (ay - 1) + adet
  return { yil: Math.floor(toplam / 12), ay: (toplam % 12) + 1 }
}

function ayIndexOf(ay) {
  return ay.yil * 12 + ay.ay
}

function ayFarki(hedef, ilk) {
  return ayIndexOf(hedef) - ayIndexOf(ilk)
}

// Bir ödemenin "kalem" alanı tam eşleşme değilse de (ör. "Okul - Devreden Ödeme")
// ilgili kalemle başlıyorsa sayılır — devreden (eski sistemden gelen) ödemeler de
// borç hesabına dahil edilsin diye.
function odemeToplamKalem(odemeler, kalemAdi, hedefAy) {
  const hedefIndex = ayIndexOf(hedefAy)
  return odemeler
    .filter((o) => o.kalem && o.kalem.startsWith(kalemAdi))
    .filter((o) => {
      const t = new Date(o.tarih)
      return ayIndexOf({ yil: t.getFullYear(), ay: t.getMonth() + 1 }) <= hedefIndex
    })
    .reduce((t, o) => t + Number(o.tutar), 0)
}

// ============================================================================
// SÖZLEŞME KALEMLERİ (Okul / Kurs / Kitap) — Excel'deki _HESAP_EKSTRE mantığı:
// Her ay için "o aya kadar vadesi gelmiş TOPLAM borç" ile "o aya kadar ÖDENMİŞ
// TOPLAM" karşılaştırılır (tek bir ayın taksiti değil, kümülatif bakiye).
// Böylece ödenmeyen taksit otomatik olarak bir sonraki aya da taşınır.
// ============================================================================
function sozlesmeKalemHesapla(sozlesme, odemeler, seciliAy) {
  const taksitSayisi = Number(sozlesme.taksit_sayisi) || 0
  const toplamTutar = Number(sozlesme.toplam_tutar) || 0
  if (!sozlesme.ilk_taksit_tarihi || taksitSayisi <= 0) return null

  const ilkTarih = new Date(sozlesme.ilk_taksit_tarihi)
  const ilk = { yil: ilkTarih.getFullYear(), ay: ilkTarih.getMonth() + 1 }
  const hedef = ayEkle(seciliAy, 1) // vade ayı: seçili ay + 1 (Excel: EOMONTH(B4,1))
  const simdi = ayEkle(seciliAy, 0) // seçili ayın kendisi (Excel: EOMONTH(B4,0))

  const taksitTutari = toplamTutar / taksitSayisi

  // G: hedef aya kadar vadesi gelmiş taksit sayısı (kümülatif, taksit_sayisi ile sınırlı)
  const G = Math.max(0, Math.min(taksitSayisi, ayFarki(hedef, ilk) + 1))
  // H: seçili aya kadar vadesi gelmiş taksit sayısı
  const H = Math.max(0, Math.min(taksitSayisi, ayFarki(simdi, ilk) + 1))

  // Bu kalem için şimdiye kadar (hedef aya kadar) yapılmış TÜM ödemeler
  // (devreden ödemeler dahil, çünkü onlar da odemeler tablosunda kayıtlı)
  const odenen = odemeToplamKalem(odemeler, sozlesme.kalem, hedef)

  const J = taksitTutari * G // hedef aya kadar vadesi gelen toplam borç
  const L = taksitTutari * H // seçili aya kadar vadesi gelen toplam borç
  const M = taksitTutari > 0 ? Math.min(taksitSayisi, Math.floor(odenen / taksitTutari)) : 0 // ödenmiş taksit sayısı

  let vade = null
  if (G > 0) {
    const vadeAyIndex = G >= taksitSayisi ? taksitSayisi - 1 : G - 1
    vade = new Date(ilkTarih)
    vade.setMonth(vade.getMonth() + vadeAyIndex)
  }

  const kalanToplam = Math.max(0, J - odenen) // TOPLAM ÖDENECEK
  const buAyTutar = Math.max(0, J - L) // BU AYIN TUTARI (bu dönemde yeni eklenen taksit)
  const gecmisBorc = Math.max(0, kalanToplam - buAyTutar) // GEÇMİŞ BORÇ (devreden bakiye)

  if (kalanToplam <= 0) return null // tamamen ödenmiş -> Excel'deki gibi satır hiç gösterilmez

  return {
    label: `${sozlesme.kalem} - Taksit (${M}/${taksitSayisi})`,
    durum: `Ödenmesi Gereken Vade: ${vade.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}`,
    buAyTutar,
    gecmisBorc,
    toplamOdenecek: kalanToplam,
  }
}

// ============================================================================
// AYLIK KALEM BORÇLARI (Bire Bir / Yemek / Kantin) — taksit yok, sadece
// "o aya kadar kümülatif borç" vs "o aya kadar kümülatif ödenen" karşılaştırması.
// ============================================================================
function aylikKalemHesapla(kalemAdi, aylikBorclar, odemeler, seciliAy) {
  const simdi = ayEkle(seciliAy, 0)
  const simdiIndex = ayIndexOf(simdi)

  const borclarBuKaleme = aylikBorclar.filter((a) => a.kalem === kalemAdi)
  if (borclarBuKaleme.length === 0) return null

  const J = borclarBuKaleme
    .filter((a) => {
      const d = new Date(a.donem)
      return ayIndexOf({ yil: d.getFullYear(), ay: d.getMonth() + 1 }) <= simdiIndex
    })
    .reduce((t, a) => t + Number(a.tutar), 0)

  const odenen = odemeToplamKalem(odemeler, kalemAdi, simdi)

  const buAyTutar = borclarBuKaleme
    .filter((a) => {
      const d = new Date(a.donem)
      return d.getFullYear() === simdi.yil && d.getMonth() + 1 === simdi.ay
    })
    .reduce((t, a) => t + Number(a.tutar), 0)

  const kalanToplam = Math.max(0, J - odenen)
  const gecmisBorc = Math.max(0, kalanToplam - buAyTutar)

  if (kalanToplam <= 0) return null

  return {
    label: kalemAdi,
    durum: 'Bakiye Borçlu',
    buAyTutar,
    gecmisBorc,
    toplamOdenecek: kalanToplam,
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

  const satirlar = [
    ...sozlesmeler.map((s) => sozlesmeKalemHesapla(s, odemeler, seciliAy)),
    ...['Bire Bir', 'Yemek', 'Kantin'].map((k) => aylikKalemHesapla(k, aylikBorclar, odemeler, seciliAy)),
  ].filter(Boolean)

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
