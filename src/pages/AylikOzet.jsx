import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { paraFormat, bireBirDersDetaylariOlustur, sozlesmeKalemHesapla } from '../lib/ekstreHesap'

// Taksitler sekmesinde hangi sözleşme kalemleri toplanıyor — kullanıcı
// isteğiyle sadece Kurs/Okul/Kitap (Deneme Kulübü ve aylık kalemler — Bire
// Bir/Yemek/Kantin — bu sekmenin dışında, onlar zaten kendi sekmelerinde ya
// da başka raporlarda ayrıca gösteriliyor).
const TAKSIT_KALEMLERI = ['Okul', 'Kurs', 'Kitap']

// Ayı "YYYY-MM" olarak YEREL saate göre üretir (toISOString KULLANMIYORUZ —
// Türkiye UTC+3 gece yarısına yakın saatlerde bir gün geriye kayabiliyor).
function suankiAy() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

function ayEtiketiUret(ay) {
  return new Date(ay + '-01T12:00:00').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
}

// Bir satır listesini (bire bir ders ya da kantin alışı) öğrenci adına göre
// gruplar — her öğrenci için kaç kayıt olduğunu ve toplam tutarı hesaplar.
// En yüksek tutardan en düşüğe sıralı döner (patronun en çok kimin harcadığını
// ilk bakışta görmesi için).
function gruplaOgrenciye(satirlar, adFn) {
  const map = new Map()
  for (const s of satirlar) {
    const ad = adFn(s) || '—'
    if (!map.has(ad)) map.set(ad, { ad, sayi: 0, tutar: 0 })
    const g = map.get(ad)
    g.sayi += 1
    g.tutar += Number(s.tutar) || 0
  }
  return Array.from(map.values()).sort((a, b) => b.tutar - a.tutar || a.ad.localeCompare(b.ad, 'tr'))
}

// Belirli bir ayda okulda alınan TÜM bire bir dersleri (ücretiyle) ve kantin
// alışlarını, hem genel toplam hem öğrenci bazında döküm olarak gösteren,
// yazdırılabilir/PDF alınabilir bir rapor sayfası. "Ay sonu patronla
// paylaşacağım" isteğine karşılık — GenelBireBirEkstre (sadece bire bir,
// öğrenci bazında toplamı yok) ve GelirRaporu (sadece fiilen alınan ödemeler,
// kalem bazında, öğrenci bazında değil) sayfalarından FARKLI olarak, bu sayfa
// "o ay kimden ne kadar bire bir/kantin geliri oluştu" sorusuna tek bakışta
// cevap verir. Sadece yönetici erişebilir (App.jsx'te kısıtlı).
export default function AylikOzet() {
  const [seciliAy, setSeciliAy] = useState(suankiAy)
  // Bire Bir ve Kantin, üstteki özet kutusu DAHİL tamamen ayrı sekmeler —
  // ikisi asla aynı anda görünmez. Kullanıcı bunları patrona AYRI AYRI
  // (iki farklı PDF/ekran görüntüsü olarak) göndereceği için, "Kantin"
  // seçiliyken Bire Bir'e ait hiçbir şey (üst kutu dahil) görünmemeli.
  const [sekme, setSekme] = useState('birebir') // 'birebir' | 'kantin' | 'taksit'
  const [bireBirDersler, setBireBirDersler] = useState([])
  const [kantinAlislari, setKantinAlislari] = useState([])
  const [sozlesmeler, setSozlesmeler] = useState([])
  const [odemeler, setOdemeler] = useState([])
  const [ogrenciler, setOgrenciler] = useState([])
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
      supabase.from('kantin_alislar').select('*, ogrenciler(ad_soyad)'),
      supabase.from('sozlesmeler').select('*'),
      supabase.from('odemeler').select('*'),
      supabase.from('ogrenciler').select('id, ad_soyad'),
    ]).then(([bba, ekDersler, kantin, sozlesme, odeme, ogrenci]) => {
      const atamalar = bba.data || []
      const atamaIdleri = atamalar.map((x) => x.id)
      const yoklamaSorgusu =
        atamaIdleri.length > 0
          ? supabase.from('bire_bir_yoklama').select('*').in('atama_id', atamaIdleri)
          : Promise.resolve({ data: [] })
      yoklamaSorgusu.then((by) => {
        const tumYoklamalar = [...(by.data || []), ...(ekDersler.data || [])]
        setBireBirDersler(bireBirDersDetaylariOlustur(atamalar, tumYoklamalar))
        setKantinAlislari(kantin.data || [])
        setSozlesmeler(sozlesme.data || [])
        setOdemeler(odeme.data || [])
        setOgrenciler(ogrenci.data || [])
        setLoading(false)
      })
    })
  }, [])

  // İndirilen PDF/yazdırma çıktısının dosya adı (ve tarayıcı sekme başlığı)
  // hangi sekme + hangi ay olduğunu göstersin diye — "Savaş Akça Eğitim
  // Portalı" gibi genel bir isimle kaydedilmesin.
  useEffect(() => {
    const sekmeAdi = sekme === 'kantin' ? 'Kantin' : sekme === 'taksit' ? 'Taksitler' : 'Bire Bir'
    document.title = `Aylık Özet — ${sekmeAdi} — ${ayEtiketiUret(seciliAy)}`
    return () => {
      document.title = 'Savaş Akça Eğitim Portalı'
    }
  }, [sekme, seciliAy])

  const { bireBirBuAy, kantinBuAy, soruCozumuSayisi, aylar } = useMemo(() => {
    const bireBirBuAy = bireBirDersler.filter((d) => d.tarih?.slice(0, 7) === seciliAy && d.tur !== 'soru_cozumu')
    const soruCozumuSayisi = bireBirDersler.filter(
      (d) => d.tarih?.slice(0, 7) === seciliAy && d.tur === 'soru_cozumu'
    ).length
    const kantinBuAy = kantinAlislari.filter((k) => k.tarih?.slice(0, 7) === seciliAy)
    // Ay seçici dropdown'ında SADECE verinin gerçekten bulunduğu aylar
    // görünsün diye — boş aylar listede kirlilik yaratmasın. Ödemeler de
    // dahil edildi (Taksitler sekmesinde, sadece bire bir/kantin işlemi
    // olmayan ama o ay ödeme alınmış bir ay da listede görünebilsin diye).
    const aySet = new Set(
      [
        ...bireBirDersler.map((d) => d.tarih?.slice(0, 7)),
        ...kantinAlislari.map((k) => k.tarih?.slice(0, 7)),
        ...odemeler.map((o) => o.tarih?.slice(0, 7)),
      ].filter(Boolean)
    )
    const aylar = Array.from(aySet).sort((a, b) => (a < b ? 1 : -1))
    return { bireBirBuAy, kantinBuAy, soruCozumuSayisi, aylar }
  }, [bireBirDersler, kantinAlislari, odemeler, seciliAy])

  const bireBirOgrenciler = useMemo(() => gruplaOgrenciye(bireBirBuAy, (d) => d.ogrenciAdi), [bireBirBuAy])
  const kantinOgrenciler = useMemo(
    () => gruplaOgrenciye(kantinBuAy, (k) => k.ogrenciler?.ad_soyad),
    [kantinBuAy]
  )

  const bireBirToplamTutar = bireBirBuAy.reduce((t, d) => t + Number(d.tutar), 0)
  const kantinToplamTutar = kantinBuAy.reduce((t, k) => t + Number(k.tutar), 0)

  const ogrenciAdMap = useMemo(() => new Map(ogrenciler.map((o) => [o.id, o.ad_soyad])), [ogrenciler])

  // Taksitler sekmesi: her öğrenci için "o ay alınması gereken" (bu ayın
  // taksiti, ekstredeki AYNI mantık — sozlesmeKalemHesapla) ile "o ay
  // gerçekten alınan" (odemeler tablosunda, ödeme TARİHİ seçili aya denk
  // gelen) tutarları Okul/Kurs/Kitap kalemleri için yan yana gösterir.
  // "Gereken" ödeme geçmişine göre kümülatif hesaplandığı (bkz.
  // sozlesmeKalemHesapla'daki yorum) için her öğrencinin KENDİ ödemeleriyle
  // hesaplanması gerekiyor — tüm ödemeleri karıştırıp tek havuzda toplamak
  // yanlış sonuç verir.
  const taksitSatirlari = useMemo(() => {
    const map = new Map() // ogrenci_id -> { ad, gereken, alinan }
    function satirAl(ogrenciId) {
      if (!map.has(ogrenciId)) {
        map.set(ogrenciId, { ad: ogrenciAdMap.get(ogrenciId) || '—', gereken: 0, alinan: 0 })
      }
      return map.get(ogrenciId)
    }
    for (const s of sozlesmeler) {
      if (!TAKSIT_KALEMLERI.includes(s.kalem)) continue
      const oOdemeler = odemeler.filter((od) => od.ogrenci_id === s.ogrenci_id)
      const sonuc = sozlesmeKalemHesapla(s, oOdemeler, seciliAy)
      if (!sonuc || sonuc.buAyTutar <= 0) continue
      satirAl(s.ogrenci_id).gereken += sonuc.buAyTutar
    }
    for (const od of odemeler) {
      if (!od.kalem || !TAKSIT_KALEMLERI.some((k) => od.kalem.startsWith(k))) continue
      if (od.tarih?.slice(0, 7) !== seciliAy) continue
      satirAl(od.ogrenci_id).alinan += Number(od.tutar) || 0
    }
    return Array.from(map.values())
      .filter((r) => r.gereken > 0.01 || r.alinan > 0.01)
      .sort((a, b) => b.gereken - a.gereken || a.ad.localeCompare(b.ad, 'tr'))
  }, [sozlesmeler, odemeler, seciliAy, ogrenciAdMap])

  const taksitToplamGereken = taksitSatirlari.reduce((t, r) => t + r.gereken, 0)
  const taksitToplamAlinan = taksitSatirlari.reduce((t, r) => t + r.alinan, 0)

  if (loading) return <p className="p-6 text-gray-400">Yükleniyor...</p>

  return (
    <div className="min-h-screen bg-cream py-8 px-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          tr { break-inside: avoid; page-break-inside: avoid; }
          .aylik-ozet-baslik { break-after: avoid; page-break-after: avoid; }
        }
      `}</style>
      <div className="max-w-3xl mx-auto">
        <div className="no-print flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 font-medium">Ay:</label>
            <select
              value={seciliAy}
              onChange={(e) => setSeciliAy(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue"
            >
              {!aylar.includes(seciliAy) && <option value={seciliAy}>{ayEtiketiUret(seciliAy)}</option>}
              {aylar.map((ay) => (
                <option key={ay} value={ay}>
                  {ayEtiketiUret(ay)}
                </option>
              ))}
            </select>
          </div>
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
              <p className="text-sm text-white/80 mt-1">AYLIK BİRE BİR + KANTİN ÖZETİ</p>
            </div>
          </div>

          <div className="p-6">
            <p className="text-lg font-bold text-navy capitalize mb-4">{ayEtiketiUret(seciliAy)}</p>

            <div className="no-print flex gap-1.5 mb-4">
              <button
                type="button"
                onClick={() => setSekme('birebir')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  sekme === 'birebir' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                Bire Bir
              </button>
              <button
                type="button"
                onClick={() => setSekme('kantin')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  sekme === 'kantin' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                Kantin
              </button>
              <button
                type="button"
                onClick={() => setSekme('taksit')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  sekme === 'taksit' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                Taksitler
              </button>
            </div>

            {sekme === 'birebir' && (
              <div className="border-2 border-navy rounded-lg p-4 bg-navy/5 inline-block min-w-[220px] mb-6">
                <p className="text-xs font-semibold text-navy uppercase tracking-wide">Bire Bir</p>
                <p className="text-lg font-bold text-navy mt-1">{bireBirBuAy.length} ders</p>
                <p className="text-sm text-gray-600">{paraFormat(bireBirToplamTutar)}</p>
              </div>
            )}
            {sekme === 'kantin' && (
              <div className="border-2 border-navy rounded-lg p-4 bg-navy/5 inline-block min-w-[220px] mb-6">
                <p className="text-xs font-semibold text-navy uppercase tracking-wide">Kantin</p>
                <p className="text-lg font-bold text-navy mt-1">{kantinBuAy.length} alış</p>
                <p className="text-sm text-gray-600">{paraFormat(kantinToplamTutar)}</p>
              </div>
            )}
            {sekme === 'taksit' && (
              <div className="border-2 border-navy rounded-lg p-4 bg-navy/5 inline-block min-w-[280px] mb-6">
                <p className="text-xs font-semibold text-navy uppercase tracking-wide">Okul / Kurs / Kitap Taksitleri</p>
                <p className="text-lg font-bold text-navy mt-1">Gereken: {paraFormat(taksitToplamGereken)}</p>
                <p className="text-sm text-green-700 font-medium">Alınan: {paraFormat(taksitToplamAlinan)}</p>
                <p className="text-sm text-gray-500">Kalan: {paraFormat(Math.max(0, taksitToplamGereken - taksitToplamAlinan))}</p>
              </div>
            )}

            {sekme === 'birebir' && soruCozumuSayisi > 0 && (
              <p className="text-xs text-purple-700 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 mb-6">
                Bu ay ayrıca <b>{soruCozumuSayisi}</b> Soru Çözümü seansı verildi (ücretsiz, yukarıdaki
                toplamlara dahil değil).
              </p>
            )}

            <div className={sekme === 'birebir' ? '' : 'hidden'}>
              <p className="font-bold text-navy mb-2 aylik-ozet-baslik">Bire Bir Dersler — Öğrenci Bazında</p>
              {bireBirOgrenciler.length === 0 ? (
                <p className="text-sm text-gray-400">Bu ay bire bir ders kaydı yok.</p>
              ) : (
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-navy text-white text-left">
                      <th className="px-3 py-2 font-semibold">Öğrenci</th>
                      <th className="px-3 py-2 font-semibold text-right">Ders Sayısı</th>
                      <th className="px-3 py-2 font-semibold text-right">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bireBirOgrenciler.map((o, i) => (
                      <tr key={o.ad} className={i % 2 ? 'bg-gray-50' : ''}>
                        <td className="px-3 py-2">{o.ad}</td>
                        <td className="px-3 py-2 text-right">{o.sayi}</td>
                        <td className="px-3 py-2 text-right font-medium">{paraFormat(o.tutar)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-3 py-2">Toplam</td>
                      <td className="px-3 py-2 text-right">{bireBirBuAy.length}</td>
                      <td className="px-3 py-2 text-right">{paraFormat(bireBirToplamTutar)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            <div className={sekme === 'kantin' ? '' : 'hidden'}>
              <p className="font-bold text-navy mb-2 aylik-ozet-baslik">Kantin — Öğrenci Bazında</p>
              {kantinOgrenciler.length === 0 ? (
                <p className="text-sm text-gray-400">Bu ay kantin alışı kaydı yok.</p>
              ) : (
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-navy text-white text-left">
                      <th className="px-3 py-2 font-semibold">Öğrenci</th>
                      <th className="px-3 py-2 font-semibold text-right">Alış Sayısı</th>
                      <th className="px-3 py-2 font-semibold text-right">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kantinOgrenciler.map((o, i) => (
                      <tr key={o.ad} className={i % 2 ? 'bg-gray-50' : ''}>
                        <td className="px-3 py-2">{o.ad}</td>
                        <td className="px-3 py-2 text-right">{o.sayi}</td>
                        <td className="px-3 py-2 text-right font-medium">{paraFormat(o.tutar)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-3 py-2">Toplam</td>
                      <td className="px-3 py-2 text-right">{kantinBuAy.length}</td>
                      <td className="px-3 py-2 text-right">{paraFormat(kantinToplamTutar)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            <div className={sekme === 'taksit' ? '' : 'hidden'}>
              <p className="font-bold text-navy mb-2 aylik-ozet-baslik">Okul / Kurs / Kitap Taksitleri — Öğrenci Bazında</p>
              {taksitSatirlari.length === 0 ? (
                <p className="text-sm text-gray-400">Bu ay alınması gereken ya da alınan bir taksit kaydı yok.</p>
              ) : (
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-navy text-white text-left">
                      <th className="px-3 py-2 font-semibold">Öğrenci</th>
                      <th className="px-3 py-2 font-semibold text-right">Gereken</th>
                      <th className="px-3 py-2 font-semibold text-right">Alınan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taksitSatirlari.map((r, i) => (
                      <tr key={r.ad} className={i % 2 ? 'bg-gray-50' : ''}>
                        <td className="px-3 py-2">{r.ad}</td>
                        <td className="px-3 py-2 text-right">{paraFormat(r.gereken)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${r.alinan >= r.gereken ? 'text-green-700' : ''}`}>
                          {paraFormat(r.alinan)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-3 py-2">Toplam</td>
                      <td className="px-3 py-2 text-right">{paraFormat(taksitToplamGereken)}</td>
                      <td className="px-3 py-2 text-right">{paraFormat(taksitToplamAlinan)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
