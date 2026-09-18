import { useEffect, useMemo, useState } from 'react'
import { supabase, tumSatirlariGetir } from '../lib/supabase'
import {
  paraFormat,
  bireBirDersDetaylariOlustur,
  bireBirBorclariOlustur,
  taksitPlaniOlustur,
  kantinBorclariOlustur,
  buAyTutarininOdemeDurumu,
  ayEkle,
  ayIndexOf,
  odemeToplamKalem,
} from '../lib/ekstreHesap'

// taksitPlaniOlustur'un döndürdüğü 'durum' kodlarını Türkçe etikete çevirir.
const TAKSIT_DURUM_ETIKETI = {
  odendi: 'Ödendi',
  kismi: 'Kısmi Ödendi',
  gecikti: 'Gecikmiş',
  bekliyor: 'Bekliyor',
}
const TAKSIT_DURUM_RENGI = {
  odendi: 'bg-green-50 text-green-700 border-green-200',
  kismi: 'bg-amber-50 text-amber-700 border-amber-200',
  gecikti: 'bg-red-50 text-red-700 border-red-200',
  bekliyor: 'bg-gray-50 text-gray-500 border-gray-200',
}

// Taksitler sekmesinde hangi sözleşme kalemleri (taksitli, vadeli) gösteriliyor.
const TAKSIT_KALEMLERI = ['Okul', 'Kurs', 'Kitap']
// Kantin, sözleşme/taksit değil — her alışta biriken KÜMÜLATİF bir bakiye
// (vade yok). Bu yüzden ayrı bir hesap mantığıyla ama AYNI "Taksitler"
// sekmesinde, kendi ayrı tablosunda gösteriliyor (kullanıcı isteğiyle).
const KANTIN_KALEM = 'Kantin'

// Ayı "YYYY-MM" olarak YEREL saate göre üretir (toISOString KULLANMIYORUZ —
// Türkiye UTC+3 gece yarısına yakın saatlerde bir gün geriye kayabiliyor).
function suankiAy() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

function ayEtiketiUret(ay) {
  return new Date(ay + '-01T12:00:00').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
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
  // "Bire Bir — Öğrenci Bazında" tablosunda da Kantin'dekiyle AYNI şekilde
  // "bu ayki tutarın ödenen/ödenmeyen kısmı" gösterebilmek için — bireBirDersler
  // (yukarıdaki) sadece ders dökümü, borç/ödeme kümülatif hesabı için AYRICA
  // bireBirBorclariOlustur çıktısı (aylik_borclar ile AYNI şekil) gerekiyor.
  const [bireBirBorclarTumu, setBireBirBorclarTumu] = useState([])
  const [kantinAlislari, setKantinAlislari] = useState([])
  const [sozlesmeler, setSozlesmeler] = useState([])
  const [odemeler, setOdemeler] = useState([])
  const [ogrenciler, setOgrenciler] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    // ÖNEMLİ (bkz. supabase.js → tumSatirlariGetir yorumu): bu sayfa
    // KÜMÜLATİF bakiye hesapladığı için (bir öğrencinin "bugüne kadarki"
    // toplam borç/ödeme durumu) aşağıdaki sorguların HİÇBİRİ tarihe göre
    // filtrelenemez — hepsinin TÜM ZAMANLARDAKİ satırlarını çekmesi gerekiyor.
    // kantin_alislar/odemeler/bire_bir_yoklama gibi tablolar kolayca 1000
    // satırı aştığı için (kurum genelinde tek bir ayda bile 900'ün üzerinde
    // kantin alışı olabiliyor), düz `.select('*')` yerine tumSatirlariGetir
    // kullanılıyor — aksi halde en güncel satırlar sessizce kesiliyordu
    // (bkz. Tural Hamid örneği: bir öğrencinin o ayki gerçek kantin tutarı
    // ₺8.741 iken, kesilen veriyle sadece ₺1.982 hesaplanıyordu).
    Promise.all([
      tumSatirlariGetir(() =>
        supabase
          .from('bire_bir_atamalari')
          .select('*, ogrenciler(ad_soyad), profiles:ogretmen_profile_id(ad_soyad, brans)')
      ),
      tumSatirlariGetir(() =>
        supabase
          .from('bire_bir_yoklama')
          .select('*, ogrenciler(ad_soyad), profiles:ogretmen_profile_id(ad_soyad, brans)')
          .is('atama_id', null)
      ),
      tumSatirlariGetir(() => supabase.from('kantin_alislar').select('*, ogrenciler(ad_soyad)')),
      tumSatirlariGetir(() => supabase.from('sozlesmeler').select('*')),
      tumSatirlariGetir(() => supabase.from('odemeler').select('*')),
      tumSatirlariGetir(() => supabase.from('ogrenciler').select('id, ad_soyad')),
    ]).then(([bba, ekDersler, kantin, sozlesme, odeme, ogrenci]) => {
      const atamalar = bba.data || []
      const atamaIdleri = atamalar.map((x) => x.id)
      const yoklamaSorgusu =
        atamaIdleri.length > 0
          ? tumSatirlariGetir(() => supabase.from('bire_bir_yoklama').select('*').in('atama_id', atamaIdleri))
          : Promise.resolve({ data: [] })
      yoklamaSorgusu.then((by) => {
        const tumYoklamalar = [...(by.data || []), ...(ekDersler.data || [])]
        setBireBirDersler(bireBirDersDetaylariOlustur(atamalar, tumYoklamalar))
        setBireBirBorclarTumu(bireBirBorclariOlustur(atamalar, tumYoklamalar))
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

  // Kullanıcı isteği: "Bire Bir'de de ödenen/ödenmeyen görünsün" (Kantin
  // tablosuna eklendikten sonra) — Kantin'de yaptığımız DÜZELTMEYLE AYNI
  // sebepten (aynı isimli iki öğrenci karışmasın, ödeme durumu haritasıyla
  // güvenilir eşleşsin diye) burası da artık ad string'i yerine ogrenci_id'ye
  // göre gruplanıyor (bkz. bireBirDersDetaylariOlustur'a eklenen ogrenciId).
  const bireBirOgrenciler = useMemo(() => {
    const map = new Map()
    for (const d of bireBirBuAy) {
      const anahtar = d.ogrenciId || `isimsiz-${d.ogrenciAdi || '—'}`
      if (!map.has(anahtar)) {
        map.set(anahtar, { ogrenciId: d.ogrenciId, ad: d.ogrenciAdi || '—', sayi: 0, tutar: 0 })
      }
      const g = map.get(anahtar)
      g.sayi += 1
      g.tutar += Number(d.tutar) || 0
    }
    return Array.from(map.values()).sort((a, b) => b.tutar - a.tutar || a.ad.localeCompare(b.ad, 'tr'))
  }, [bireBirBuAy])
  // Kullanıcı isteği: "Kantin — Öğrenci Bazında" tablosunda, o ayki alış
  // tutarının yanında ödenip ödenmediği de görünsün. Bunun için burada artık
  // ad string'ine göre değil ogrenci_id'ye göre gruplanıyor (aşağıdaki ödeme
  // durumu haritasıyla GÜVENİLİR eşleşsin diye — aynı isimli iki öğrenci ad
  // string'iyle eşleştirilirse karışabilirdi).
  const kantinOgrenciler = useMemo(() => {
    const map = new Map()
    for (const k of kantinBuAy) {
      const anahtar = k.ogrenci_id || `isimsiz-${k.ogrenciler?.ad_soyad || '—'}`
      if (!map.has(anahtar)) {
        map.set(anahtar, { ogrenciId: k.ogrenci_id, ad: k.ogrenciler?.ad_soyad || '—', sayi: 0, tutar: 0 })
      }
      const g = map.get(anahtar)
      g.sayi += 1
      g.tutar += Number(k.tutar) || 0
    }
    return Array.from(map.values()).sort((a, b) => b.tutar - a.tutar || a.ad.localeCompare(b.ad, 'tr'))
  }, [kantinBuAy])

  const bireBirToplamTutar = bireBirBuAy.reduce((t, d) => t + Number(d.tutar), 0)
  const kantinToplamTutar = kantinBuAy.reduce((t, k) => t + Number(k.tutar), 0)

  const ogrenciAdMap = useMemo(() => new Map(ogrenciler.map((o) => [o.id, o.ad_soyad])), [ogrenciler])

  // Taksitler sekmesi: kullanıcı isteğiyle kalemler HİÇBİR ŞEKİLDE
  // birleştirilmiyor — Okul, Kurs, Kitap, Kantin her biri kendi AYRI
  // tablosunda, kendi öğrenci listesiyle gösteriliyor.
  //
  // Okul/Kurs/Kitap: taksitPlaniOlustur ile sözleşmenin TÜM taksitleri (vade
  // tarihi + o taksitin kümülatif sıradaki ödenme durumu: ödendi/kısmi/
  // gecikti/bekliyor) hesaplanır, sonra SADECE vadesi seçili aya denk gelen
  // taksit satırı gösterilir. Bu, "Temmuz taksitlerinin kaçı ödenmiş kaçı
  // ödenmemiş" sorusuna DOĞRUDAN cevap verir — taksit o ay vade aldıysa,
  // ödenmiş olsa bile (durum: Ödendi) listede görünür; sadece "bakiyesi kalan"
  // öğrencilerle sınırlı değildir.
  // Kantin: sözleşme/vade yok — her alış kümülatif bir bakiye oluşturur, bu
  // yüzden "toplam borç / bu ay ödenen / kalan bakiye" olarak ayrı hesaplanır.
  //
  // Her iki tür için de "Bu ay ödenen", SADECE o kaleme ait ödemelerin
  // toplamıdır — tüm ödemeleri karıştırıp tek havuzda toplamak yanlış sonuç
  // verir, bu yüzden her öğrencinin KENDİ ödemeleriyle hesaplanır.
  const kantinBorclarTumu = useMemo(() => kantinBorclariOlustur(kantinAlislari), [kantinAlislari])

  const taksitKalemTablolari = useMemo(() => {
    const sonuc = {}

    function buAyOdenenHesapla(kendiOdemeler, kalemAdi) {
      return kendiOdemeler
        .filter((o) => o.kalem === kalemAdi || (o.kalem && o.kalem.startsWith(kalemAdi)))
        .filter((o) => o.tarih?.slice(0, 7) === seciliAy)
        .reduce((t, o) => t + (Number(o.tutar) || 0), 0)
    }

    // Okul / Kurs / Kitap — sözleşme (taksit) kalemleri: seçili ayda VADESİ
    // olan taksit satırı (ödenmiş olsa da olmasa da) gösterilir.
    for (const kalem of TAKSIT_KALEMLERI) {
      const satirlar = []
      for (const s of sozlesmeler) {
        if (s.kalem !== kalem) continue
        const kendiOdemeler = odemeler.filter((od) => od.ogrenci_id === s.ogrenci_id)
        const taksitler = taksitPlaniOlustur(s, kendiOdemeler)
        const buAyTaksit = taksitler.find((t) => {
          const ayStr = `${t.vade.getFullYear()}-${String(t.vade.getMonth() + 1).padStart(2, '0')}`
          return ayStr === seciliAy
        })
        if (!buAyTaksit) continue
        satirlar.push({
          ad: ogrenciAdMap.get(s.ogrenci_id) || '—',
          taksitNo: buAyTaksit.taksitNo,
          taksitSayisi: Number(s.taksit_sayisi) || 0,
          tutar: buAyTaksit.tutar,
          odenen: buAyTaksit.odenenTutar,
          kalan: buAyTaksit.kalanTutar,
          durum: buAyTaksit.durum,
        })
      }
      sonuc[kalem] = satirlar.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
    }

    // Kantin — kümülatif bakiye kalemi (taksit/vade yok)
    const simdi = ayEkle(seciliAy, 0)
    const simdiIndex = ayIndexOf(simdi)
    const kantinliOgrenciIdleri = new Set(kantinBorclarTumu.map((b) => b.ogrenci_id))
    const kantinSatirlari = []
    for (const ogrenciId of kantinliOgrenciIdleri) {
      const kendiBorclar = kantinBorclarTumu.filter((b) => b.ogrenci_id === ogrenciId)
      const kendiOdemeler = odemeler.filter((od) => od.ogrenci_id === ogrenciId)
      const toplamBorc = kendiBorclar
        .filter((b) => {
          const d = new Date(b.donem)
          return ayIndexOf({ yil: d.getFullYear(), ay: d.getMonth() + 1 }) <= simdiIndex
        })
        .reduce((t, b) => t + b.tutar, 0)
      if (toplamBorc <= 0.01) continue
      const odenenKumulatif = odemeToplamKalem(kendiOdemeler, KANTIN_KALEM, simdi)
      const kalanBakiye = Math.max(0, toplamBorc - odenenKumulatif)
      const buAyOdenen = buAyOdenenHesapla(kendiOdemeler, KANTIN_KALEM)
      const durum = kalanBakiye <= 0.01 ? 'odendi' : buAyOdenen > 0.01 || odenenKumulatif > 0.01 ? 'kismi' : 'bekliyor'
      kantinSatirlari.push({
        ogrenciId,
        ad: ogrenciAdMap.get(ogrenciId) || '—',
        toplamBorc,
        buAyOdenen,
        kalanBakiye,
        durum,
      })
    }
    sonuc[KANTIN_KALEM] = kantinSatirlari.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))

    return sonuc
  }, [sozlesmeler, odemeler, kantinBorclarTumu, seciliAy, ogrenciAdMap])

  // "Kantin — Öğrenci Bazında" (sekme='kantin') tablosundaki "Ödenen"/
  // "Ödenmeyen" — DİKKAT: bu, Taksitler sekmesindeki "Bu Ay Ödenen" (o takvim
  // ayında yatan NAKİT, hangi ayın borcunu kapattığına bakılmaksızın) ile AYNI
  // ŞEY DEĞİL — o mantık kullanıldığında "Tutar 2.492 ama Ödenen 12.000" gibi
  // anlamsız görünen satırlar çıkıyordu (veli o ay büyük bir ödeme yapıp geçmiş
  // ayların borcunu da kapatmış olabiliyor). Burada onun yerine
  // buAyTutarininOdemeDurumu kullanılıyor: SADECE bu ayki "Tutar" sütununun ne
  // kadarının (kümülatif bakiyeye göre, en eski borçtan başlanarak) fiilen
  // kapandığını hesaplar — Ödenen + Ödenmeyen her zaman tam olarak Tutar'a
  // eşittir, böylece sütunlar artık birbiriyle çelişmez.
  const kantinOdemeDurumMap = useMemo(() => {
    const map = new Map()
    for (const o of kantinOgrenciler) {
      map.set(o.ogrenciId, buAyTutarininOdemeDurumu(KANTIN_KALEM, o.ogrenciId, kantinBorclarTumu, odemeler, seciliAy))
    }
    return map
  }, [kantinOgrenciler, kantinBorclarTumu, odemeler, seciliAy])

  const kantinBuAyOdenenToplam = kantinOgrenciler.reduce(
    (t, o) => t + (kantinOdemeDurumMap.get(o.ogrenciId)?.buAyOdenen || 0),
    0
  )
  const kantinKalanBakiyeToplam = kantinOgrenciler.reduce(
    (t, o) => t + (kantinOdemeDurumMap.get(o.ogrenciId)?.buAyOdenmeyen || 0),
    0
  )

  // "Bire Bir — Öğrenci Bazında" tablosu için AYNI mantık (kullanıcı isteği:
  // Kantin'de eklendikten sonra "bire birde ödenenler hiç görünmüyor" —
  // burada henüz bu sütunlar hiç yoktu, şimdi Kantin'le BİREBİR aynı şekilde
  // ekleniyor). Bire Bir de taksitsiz, kümülatif bakiyeli bir kalem olduğu
  // için (bkz. ekstreHesap.js — aylikKalemHesapla), aynı yardımcı fonksiyon
  // kullanılabiliyor.
  const bireBirOdemeDurumMap = useMemo(() => {
    const map = new Map()
    for (const o of bireBirOgrenciler) {
      map.set(o.ogrenciId, buAyTutarininOdemeDurumu('Bire Bir', o.ogrenciId, bireBirBorclarTumu, odemeler, seciliAy))
    }
    return map
  }, [bireBirOgrenciler, bireBirBorclarTumu, odemeler, seciliAy])

  const bireBirBuAyOdenenToplam = bireBirOgrenciler.reduce(
    (t, o) => t + (bireBirOdemeDurumMap.get(o.ogrenciId)?.buAyOdenen || 0),
    0
  )
  const bireBirBuAyOdenmeyenToplam = bireBirOgrenciler.reduce(
    (t, o) => t + (bireBirOdemeDurumMap.get(o.ogrenciId)?.buAyOdenmeyen || 0),
    0
  )

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
              <p className="text-xs text-gray-400 mb-4">
                Her kalem (Okul, Kurs, Kitap, Kantin) kendi ayrı tablosunda gösterilir — hiçbiri birbirine
                karıştırılmaz veya toplanmaz.
              </p>
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
                      <th className="px-3 py-2 font-semibold text-right">Ödenen</th>
                      <th className="px-3 py-2 font-semibold text-right">Ödenmeyen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bireBirOgrenciler.map((o, i) => {
                      const d = bireBirOdemeDurumMap.get(o.ogrenciId)
                      const odenen = d?.buAyOdenen || 0
                      const odenmeyen = d?.buAyOdenmeyen || 0
                      return (
                        <tr key={o.ogrenciId ?? o.ad} className={i % 2 ? 'bg-gray-50' : ''}>
                          <td className="px-3 py-2">{o.ad}</td>
                          <td className="px-3 py-2 text-right">{o.sayi}</td>
                          <td className="px-3 py-2 text-right font-medium">{paraFormat(o.tutar)}</td>
                          <td className={`px-3 py-2 text-right ${odenen > 0.01 ? 'text-green-700 font-medium' : 'text-gray-400'}`}>
                            {paraFormat(odenen)}
                          </td>
                          <td className={`px-3 py-2 text-right font-medium ${odenmeyen > 0.01 ? 'text-red-700' : 'text-gray-400'}`}>
                            {paraFormat(odenmeyen)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-3 py-2">Toplam</td>
                      <td className="px-3 py-2 text-right">{bireBirBuAy.length}</td>
                      <td className="px-3 py-2 text-right">{paraFormat(bireBirToplamTutar)}</td>
                      <td className="px-3 py-2 text-right">{paraFormat(bireBirBuAyOdenenToplam)}</td>
                      <td className="px-3 py-2 text-right">{paraFormat(bireBirBuAyOdenmeyenToplam)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
              <p className="text-xs text-gray-400 mt-2">
                "Ödenen" ve "Ödenmeyen", bu ayki ders tutarının (en eski borçtan başlanarak kapanan kümülatif
                bakiyeye göre) ne kadarının fiilen ödendiğini gösterir — ikisinin toplamı her zaman "Tutar" sütununa eşittir.
              </p>
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
                      <th className="px-3 py-2 font-semibold text-right">Ödenen</th>
                      <th className="px-3 py-2 font-semibold text-right">Ödenmeyen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Kullanıcı isteği: "ödendiyse ödenen tutar da görünsün,
                        ödenmediyse ödenmeyen miktar görünsün" — burada "Ödenen"
                        ve "Ödenmeyen", bu satırdaki "Tutar" (SADECE bu ayki
                        alış) sütununun ne kadarının kümülatif bakiyeye göre
                        kapandığını gösterir (bkz. ekstreHesap.js →
                        buAyTutarininOdemeDurumu) — ikisi her zaman Tutar'a
                        toplanır, farklı bir ayın ödemesiyle karışıp "Tutardan
                        büyük Ödenen" gibi anlamsız satırlar oluşmaz. */}
                    {kantinOgrenciler.map((o, i) => {
                      const d = kantinOdemeDurumMap.get(o.ogrenciId)
                      const odenen = d?.buAyOdenen || 0
                      const odenmeyen = d?.buAyOdenmeyen || 0
                      return (
                        <tr key={o.ogrenciId ?? o.ad} className={i % 2 ? 'bg-gray-50' : ''}>
                          <td className="px-3 py-2">{o.ad}</td>
                          <td className="px-3 py-2 text-right">{o.sayi}</td>
                          <td className="px-3 py-2 text-right font-medium">{paraFormat(o.tutar)}</td>
                          <td className={`px-3 py-2 text-right ${odenen > 0.01 ? 'text-green-700 font-medium' : 'text-gray-400'}`}>
                            {paraFormat(odenen)}
                          </td>
                          <td className={`px-3 py-2 text-right font-medium ${odenmeyen > 0.01 ? 'text-red-700' : 'text-gray-400'}`}>
                            {paraFormat(odenmeyen)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-3 py-2">Toplam</td>
                      <td className="px-3 py-2 text-right">{kantinBuAy.length}</td>
                      <td className="px-3 py-2 text-right">{paraFormat(kantinToplamTutar)}</td>
                      <td className="px-3 py-2 text-right">{paraFormat(kantinBuAyOdenenToplam)}</td>
                      <td className="px-3 py-2 text-right">{paraFormat(kantinKalanBakiyeToplam)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
              <p className="text-xs text-gray-400 mt-2">
                "Ödenen" ve "Ödenmeyen", bu ayki alış tutarının (en eski borçtan başlanarak kapanan kümülatif
                bakiyeye göre) ne kadarının fiilen ödendiğini gösterir — ikisinin toplamı her zaman "Tutar" sütununa
                eşittir. Öğrencinin bundan ÖNCEKİ aylardan kalan genel bakiyesi burada değil, "Taksitler" sekmesindeki
                Kantin tablosunda ("Toplam Borç" / "Kalan Bakiye") görünür.
              </p>
            </div>

            <div className={sekme === 'taksit' ? '' : 'hidden'}>
              {TAKSIT_KALEMLERI.map((kalem) => {
                const satirlar = taksitKalemTablolari[kalem] || []
                const odenenSayisi = satirlar.filter((s) => s.durum === 'odendi').length
                return (
                  <div key={kalem} className="mb-6">
                    <p className="font-bold text-navy mb-1 aylik-ozet-baslik">{kalem}</p>
                    {satirlar.length === 0 ? (
                      <p className="text-sm text-gray-400">Bu ay vadesi gelen {kalem} taksiti yok.</p>
                    ) : (
                      <>
                        <p className="text-xs text-gray-400 mb-2">
                          Bu ay vadesi gelen {satirlar.length} taksitten <b>{odenenSayisi}</b>'i ödendi.
                        </p>
                        <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                          <thead>
                            <tr className="bg-navy text-white text-left">
                              <th className="px-3 py-2 font-semibold">Öğrenci</th>
                              <th className="px-3 py-2 font-semibold text-right">Taksit</th>
                              <th className="px-3 py-2 font-semibold text-right">Tutar</th>
                              <th className="px-3 py-2 font-semibold text-right">Ödenen</th>
                              <th className="px-3 py-2 font-semibold text-right">Kalan</th>
                              <th className="px-3 py-2 font-semibold text-center">Durum</th>
                            </tr>
                          </thead>
                          <tbody>
                            {satirlar.map((s, i) => (
                              <tr key={s.ad + i} className={i % 2 ? 'bg-gray-50' : ''}>
                                <td className="px-3 py-2">{s.ad}</td>
                                <td className="px-3 py-2 text-right text-gray-500">
                                  {s.taksitNo}/{s.taksitSayisi}
                                </td>
                                <td className="px-3 py-2 text-right">{paraFormat(s.tutar)}</td>
                                <td className={`px-3 py-2 text-right ${s.odenen > 0 ? 'text-green-700 font-medium' : 'text-gray-400'}`}>
                                  {paraFormat(s.odenen)}
                                </td>
                                <td className={`px-3 py-2 text-right font-medium ${s.kalan > 0.01 ? 'text-red-700' : 'text-gray-400'}`}>
                                  {paraFormat(s.kalan)}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TAKSIT_DURUM_RENGI[s.durum]}`}
                                  >
                                    {TAKSIT_DURUM_ETIKETI[s.durum]}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>
                )
              })}

              <div className="mb-6">
                <p className="font-bold text-navy mb-1 aylik-ozet-baslik">Kantin</p>
                {(() => {
                  const satirlar = taksitKalemTablolari[KANTIN_KALEM] || []
                  if (satirlar.length === 0) {
                    return <p className="text-sm text-gray-400">Kantin bakiyesi olan öğrenci yok.</p>
                  }
                  return (
                    <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-navy text-white text-left">
                          <th className="px-3 py-2 font-semibold">Öğrenci</th>
                          <th className="px-3 py-2 font-semibold text-right">Toplam Borç</th>
                          <th className="px-3 py-2 font-semibold text-right">Bu Ay Ödenen</th>
                          <th className="px-3 py-2 font-semibold text-right">Kalan Bakiye</th>
                          <th className="px-3 py-2 font-semibold text-center">Durum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {satirlar.map((s, i) => (
                          <tr key={s.ad + i} className={i % 2 ? 'bg-gray-50' : ''}>
                            <td className="px-3 py-2">{s.ad}</td>
                            <td className="px-3 py-2 text-right">{paraFormat(s.toplamBorc)}</td>
                            <td className={`px-3 py-2 text-right ${s.buAyOdenen > 0 ? 'text-green-700 font-medium' : 'text-gray-400'}`}>
                              {paraFormat(s.buAyOdenen)}
                            </td>
                            <td className={`px-3 py-2 text-right font-medium ${s.kalanBakiye > 0.01 ? 'text-red-700' : 'text-gray-400'}`}>
                              {paraFormat(s.kalanBakiye)}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TAKSIT_DURUM_RENGI[s.durum]}`}
                              >
                                {TAKSIT_DURUM_ETIKETI[s.durum]}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
