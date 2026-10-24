import { useEffect, useMemo, useState } from 'react'
import { supabase, tumSatirlariGetir } from '../lib/supabase'
import {
  paraFormat,
  taksitPlaniOlustur,
  bireBirBorclariOlustur,
  kantinBorclariOlustur,
  odemeToplamKalem,
} from '../lib/ekstreHesap'

// Bilinen kalemler bu sırayla gösterilir; veride bunların dışında bir kalem
// çıkarsa (ör. eski/elle girilmiş farklı bir isim) sona, alfabetik sırayla eklenir.
const BILINEN_KALEM_SIRASI = ['Okul', 'Kurs', 'Kitap', 'Deneme Kulübü', 'Bire Bir', 'Yemek', 'Kantin']

// Taksitsiz, "kümülatif bakiye" mantığıyla işleyen kalemler — Muhasebe/Ekstre
// tarafında aylikKalemHesapla'nın kapsadığı kalemlerle BİREBİR aynı liste
// (ekstreHesap.js'teki ['Bire Bir','Yemek','Kantin'] kullanımına bkz.).
const AYLIK_KALEM_FIFO_KAPSAMI = new Set(['Bire Bir', 'Yemek', 'Kantin'])

function ayAnahtari(tarihStr) {
  const d = new Date(tarihStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function ayEtiketi(ay) {
  return new Date(ay + '-01').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
}

export default function GelirRaporu() {
  const [odemeler, setOdemeler] = useState([])
  const [giderler, setGiderler] = useState([])
  // Aşağıdaki beşi "Beklenen" VE kümülatif/FIFO "Alınan" hesabı için gerekiyor
  // — bkz. aşağıdaki useMemo içindeki ayrıntılı yorum.
  const [sozlesmeler, setSozlesmeler] = useState([])
  const [aylikBorclarHam, setAylikBorclarHam] = useState([])
  const [bireBirAtamalari, setBireBirAtamalari] = useState([])
  const [bireBirYoklama, setBireBirYoklama] = useState([])
  const [kantinAlislari, setKantinAlislari] = useState([])
  // Sadece öğrenci isimlerini göstermek için — kullanıcı isteğiyle eklenen
  // "hücreye tıklayınca öğrenci bazında dökümü gör" özelliği (aşağıdaki
  // detayAcik/DetayModal) için gerekiyor.
  const [ogrenciler, setOgrenciler] = useState([])
  const [loading, setLoading] = useState(true)
  // Bir (ay, kalem) hücresine tıklanınca o hücrenin öğrenci bazında dökümünü
  // gösteren popup'ın hangi hücre için açık olduğu — null ise kapalı.
  // ay === null ise "Genel Toplam" satırındaki (tüm zamanlar) hücreye
  // tıklanmış demektir.
  const [detayAcik, setDetayAcik] = useState(null) // { ay: string|null, kalem: string } | null

  useEffect(() => {
    // ÖNEMLİ (bkz. supabase.js → tumSatirlariGetir yorumu): bu rapor TÜM
    // ZAMANLARI ay ay listelediği için her tablonun TAMAMI gerekiyor — 1000
    // satırı geçtiğinde filtresiz sorgu sessizce kesilip EN ESKİ aylar (ya da
    // en eski sözleşmeler/yoklamalar) kaybolabiliyordu. Sayfalanarak tüm veri
    // çekiliyor (hem gerçekleşen hem de normalde gerekli olan taraf için).
    Promise.all([
      tumSatirlariGetir(() => supabase.from('odemeler').select('*').order('tarih', { ascending: false })),
      tumSatirlariGetir(() => supabase.from('giderler').select('*').order('tarih', { ascending: false })),
      tumSatirlariGetir(() => supabase.from('sozlesmeler').select('*')),
      tumSatirlariGetir(() => supabase.from('aylik_borclar').select('*')),
      tumSatirlariGetir(() => supabase.from('bire_bir_atamalari').select('*')),
      tumSatirlariGetir(() => supabase.from('bire_bir_yoklama').select('*')),
      tumSatirlariGetir(() => supabase.from('kantin_alislar').select('*')),
      tumSatirlariGetir(() => supabase.from('ogrenciler').select('id, ad_soyad')),
    ]).then(([o, g, s, ab, bba, bby, ka, og]) => {
      setOdemeler(o.data || [])
      setGiderler(g.data || [])
      setSozlesmeler(s.data || [])
      setAylikBorclarHam(ab.data || [])
      setBireBirAtamalari(bba.data || [])
      setBireBirYoklama(bby.data || [])
      setKantinAlislari(ka.data || [])
      setOgrenciler(og.data || [])
      setLoading(false)
    })
  }, [])

  const ogrenciAdMap = useMemo(() => new Map(ogrenciler.map((o) => [o.id, o.ad_soyad])), [ogrenciler])

  const {
    aylar,
    kalemler,
    satirlar,
    beklenenSatirlar,
    giderAylik,
    kalemToplamlari,
    beklenenKalemToplamlari,
    genelToplamGelir,
    genelToplamGider,
    genelToplamBeklenen,
    detaylar,
  } = useMemo(() => {
    const kalemSet = new Set()

    // "YYYY-MM" -> { [kalem]: tutar, __toplam }
    const beklenenAyMap = new Map()
    const alinanAyMap = new Map()
    // Hücreye tıklayınca "kim ne kadar borçlu, ne kadar ödemiş" dökümünü
    // gösterebilmek için — "ay||kalem" -> Map(ogrenciId -> {beklenen, alinan}).
    // Aşağıdaki beklenenEkle/alinanEkle'nin öğrenci bazlı hali: TAM OLARAK
    // AYNI anda, aynı FIFO hesaplarından besleniyor, böylece hücredeki toplam
    // ile popup'taki öğrenci dökümünün toplamı HER ZAMAN birebir tutuyor.
    const detayMap = new Map()

    function detayEkle(ay, kalem, ogrenciId, beklenen, alinan) {
      if (!ay || !ogrenciId) return
      const anahtar = `${ay}||${kalem}`
      if (!detayMap.has(anahtar)) detayMap.set(anahtar, new Map())
      const ogrMap = detayMap.get(anahtar)
      if (!ogrMap.has(ogrenciId)) ogrMap.set(ogrenciId, { beklenen: 0, alinan: 0 })
      const kayit = ogrMap.get(ogrenciId)
      kayit.beklenen += beklenen || 0
      kayit.alinan += alinan || 0
    }

    function beklenenEkle(ay, kalem, tutar) {
      if (!ay || !tutar) return
      kalemSet.add(kalem)
      if (!beklenenAyMap.has(ay)) beklenenAyMap.set(ay, { __toplam: 0 })
      const satir = beklenenAyMap.get(ay)
      satir[kalem] = (satir[kalem] || 0) + tutar
      satir.__toplam += tutar
    }

    function alinanEkle(ay, kalem, tutar) {
      if (!ay || !tutar) return
      kalemSet.add(kalem)
      if (!alinanAyMap.has(ay)) alinanAyMap.set(ay, { __toplam: 0 })
      const satir = alinanAyMap.get(ay)
      satir[kalem] = (satir[kalem] || 0) + tutar
      satir.__toplam += tutar
    }

    // ========================================================================
    // BEKLENEN — "normalde o ay ne kadar almamız gerekiyordu" (o ay
    // vadesi/dönemi gelen borç, fiilen alınan değil).
    //
    // ALINAN — BÜYÜK HATA DÜZELTMESİ (kullanıcının fark ettiği hata): eskiden
    // burada "Alınan" tutarı, ödemenin YATTIĞI takvim ayına göre sayılıyordu.
    // Ama bir veli bu ay içinde GEÇMİŞ ayların birikmiş borcunu (ör. 3 aylık
    // kantin borcunu) tek seferde kapatırsa, o TEK ödemenin TAMAMI "bu ayın
    // tahsilatı" gibi görünüyor, bu da bu ayın gerçek tahsilat oranını
    // OLDUĞUNDAN YÜKSEK gösteriyordu ("kantinde bu ayı tam almış gibi
    // görünüyoruz ama daha eksik aldık"). Artık Muhasebe/Ekstre/Toplu
    // Ekstre'deki ile AYNI kümülatif (FIFO: ödemeler en eski borçtan
    // başlayarak kapatılır) mantık kullanılıyor — "Alınan", ödemenin
    // TARİHİNE değil, o ödemenin HANGİ AYIN BORCUNU KAPATTIĞINA göre
    // dağıtılıyor. İki ayrı kaynaktan geliyor:
    //   1) Okul/Kurs/Kitap/Deneme Kulübü gibi TAKSİTLİ kalemler:
    //      taksitPlaniOlustur zaten her taksit için kümülatif/FIFO
    //      "odenenTutar" hesaplıyor (bkz. ekstreHesap.js) — burada sadece
    //      öğrencinin bu kaleme ait TÜM ödemeleri (odemeler, kalem
    //      başlangıcı eşleşen — "Okul - Devreden Ödeme" gibi devreden
    //      kayıtlar dahil) gerçek parametre olarak veriliyor.
    //   2) Bire Bir/Yemek/Kantin gibi taksitsiz, AYLIK KALEM borçları: aynı
    //      FIFO mantığı burada öğrenci+kalem bazında elle uygulanıyor (en
    //      eski "donem"den başlayarak, öğrencinin bu kalemdeki TÜM zamanlı
    //      toplam ödemesi sırayla borçlara dağıtılıyor).
    // Her iki durumda da, öğrencinin o kalemdeki TOPLAM borcunu AŞAN kısım
    // (fazla ödeme/alacaklı bakiye) kaybolmasın diye, kalan fazlalık en son
    // borç ayına ekleniyor — böylece "Alınan Tüm Zamanlar" toplamı HER ZAMAN
    // gerçek odemeler toplamıyla birebir eşit kalıyor, sadece AYLARA dağılımı
    // değişiyor.
    // ========================================================================

    // Hangi (öğrenci, kalem) çiftlerinin yukarıdaki kümülatif mantıkla zaten
    // işlendiğini işaretliyoruz — aşağıdaki "borç kaynağı olmayan ödemeler"
    // döngüsü bunları tekrar (naif tarihe göre) saymasın diye.
    const kapsananCiftler = new Set()
    const borcluKalemler = new Set(sozlesmeler.map((s) => s.kalem).filter(Boolean))
    for (const k of AYLIK_KALEM_FIFO_KAPSAMI) borcluKalemler.add(k)

    // ---- 1) Taksitli kalemler (sözleşmeler) ----
    for (const s of sozlesmeler) {
      if (!s.kalem) continue
      const kendiOdemeleri = odemeler.filter((o) => o.ogrenci_id === s.ogrenci_id && o.kalem && o.kalem.startsWith(s.kalem))
      const taksitler = taksitPlaniOlustur(s, kendiOdemeleri)
      if (taksitler.length === 0) continue
      kapsananCiftler.add(`${s.ogrenci_id}||${s.kalem}`)

      for (const t of taksitler) {
        const ay = ayAnahtari(t.vade)
        beklenenEkle(ay, s.kalem, t.tutar)
        alinanEkle(ay, s.kalem, t.odenenTutar)
        detayEkle(ay, s.kalem, s.ogrenci_id, t.tutar, t.odenenTutar)
      }

      // Toplam sözleşme tutarını aşan fazla ödeme (alacaklı bakiye) varsa,
      // taksitler arasında hiçbir yere dağıtılmamış kalır — kaybolmasın diye
      // son taksitin ayına ekleniyor (bkz. yukarıdaki genel açıklama).
      const toplamTaksitTutari = taksitler.reduce((t, k) => t + k.tutar, 0)
      const odenenToplam = odemeToplamKalem(kendiOdemeleri, s.kalem, { yil: 9999, ay: 12 })
      const fazla = odenenToplam - toplamTaksitTutari
      if (fazla > 0.01) {
        const sonAy = ayAnahtari(taksitler[taksitler.length - 1].vade)
        alinanEkle(sonAy, s.kalem, fazla)
        detayEkle(sonAy, s.kalem, s.ogrenci_id, 0, fazla)
      }
    }

    // ---- 2) Taksitsiz, kümülatif bakiye kalemleri (Bire Bir / Yemek / Kantin) ----
    const bireBirBorclar = bireBirBorclariOlustur(bireBirAtamalari, bireBirYoklama)
    const kantinBorclar = kantinBorclariOlustur(kantinAlislari)
    const aylikKalemBorclari = [...aylikBorclarHam, ...bireBirBorclar, ...kantinBorclar].filter(
      (b) => b.donem && b.ogrenci_id && AYLIK_KALEM_FIFO_KAPSAMI.has(b.kalem)
    )

    const gruplar = new Map() // "ogrenciId||kalem" -> [borç satırları]
    for (const b of aylikKalemBorclari) {
      const anahtar = `${b.ogrenci_id}||${b.kalem}`
      if (!gruplar.has(anahtar)) gruplar.set(anahtar, [])
      gruplar.get(anahtar).push(b)
    }

    for (const [anahtar, borclar] of gruplar) {
      const [ogrenciId, kalem] = anahtar.split('||')
      kapsananCiftler.add(anahtar)

      const kendiOdemeleri = odemeler.filter((o) => o.ogrenci_id === ogrenciId && o.kalem && o.kalem.startsWith(kalem))
      const odenenToplam = odemeToplamKalem(kendiOdemeleri, kalem, { yil: 9999, ay: 12 })

      const siraliBorclar = [...borclar].sort((a, b) => (a.donem < b.donem ? -1 : a.donem > b.donem ? 1 : 0))
      let kalanButce = odenenToplam
      let toplamBorc = 0
      for (const b of siraliBorclar) {
        const tutar = Number(b.tutar) || 0
        toplamBorc += tutar
        const odenen = Math.min(Math.max(kalanButce, 0), tutar)
        kalanButce -= odenen
        const ay = ayAnahtari(b.donem)
        beklenenEkle(ay, kalem, tutar)
        alinanEkle(ay, kalem, odenen)
        detayEkle(ay, kalem, ogrenciId, tutar, odenen)
      }

      // Aynı "fazla ödeme kaybolmasın" mantığı burada da geçerli.
      const fazla = odenenToplam - toplamBorc
      if (fazla > 0.01 && siraliBorclar.length > 0) {
        const sonAy = ayAnahtari(siraliBorclar[siraliBorclar.length - 1].donem)
        alinanEkle(sonAy, kalem, fazla)
        detayEkle(sonAy, kalem, ogrenciId, 0, fazla)
      }
    }

    // ---- 3) Hiçbir borç kaynağına (sözleşme/aylık kalem) bağlanamayan
    //      ödemeler — ör. "Dağıtılmamış" genel ödemeler ya da eski/elle tek
    //      seferlik girilmiş kalemler. Bunlar için dağıtılacak bir borç
    //      planı yok, o yüzden eskisi gibi ÖDEMENİN YATTIĞI aya göre sayılır
    //      (elimizdeki tek bilgi bu).
    for (const o of odemeler) {
      if (!o.tarih) continue
      const kalem = o.kalem || 'Belirtilmemiş'
      const eslesenBorcluKalem = [...borcluKalemler].find((k) => kalem.startsWith(k))
      if (eslesenBorcluKalem && kapsananCiftler.has(`${o.ogrenci_id}||${eslesenBorcluKalem}`)) continue
      const ay = ayAnahtari(o.tarih)
      const tutar = Number(o.tutar) || 0
      alinanEkle(ay, kalem, tutar)
      detayEkle(ay, kalem, o.ogrenci_id, 0, tutar)
    }

    // Gider toplamları ay bazında ayrı bir haritada tutuluyor — giderlerin
    // kalemi (kategorisi) burada satır bazında ayrıştırılmıyor, sadece o
    // ayın TOPLAM gideri gösteriliyor (kategori bazlı döküm Giderler.jsx'te).
    const giderAylik = new Map() // "YYYY-MM" -> toplam
    for (const g of giderler) {
      if (!g.tarih) continue
      const ay = ayAnahtari(g.tarih)
      giderAylik.set(ay, (giderAylik.get(ay) || 0) + Number(g.tutar))
    }

    const bilinenler = BILINEN_KALEM_SIRASI.filter((k) => kalemSet.has(k))
    const digerleri = [...kalemSet]
      .filter((k) => !BILINEN_KALEM_SIRASI.includes(k))
      .sort((a, b) => a.localeCompare(b, 'tr'))
    const kalemler = [...bilinenler, ...digerleri]

    // Sadece gelir kaydı olan değil, sadece gider ya da sadece beklenen
    // (ör. henüz vadesi gelmemiş/ödenmemiş gelecek bir ay taksiti) kaydı olan
    // aylar da listeye girsin diye üç tarafın ay anahtarlarının birleşimi alınıyor.
    const tumAylar = new Set([...alinanAyMap.keys(), ...giderAylik.keys(), ...beklenenAyMap.keys()])
    const aylar = [...tumAylar].sort((a, b) => (a < b ? 1 : -1))

    const kalemToplamlari = {}
    const beklenenKalemToplamlari = {}
    let genelToplamGelir = 0
    let genelToplamGider = 0
    let genelToplamBeklenen = 0
    for (const ay of aylar) {
      const satir = alinanAyMap.get(ay) || { __toplam: 0 }
      const beklenenSatir = beklenenAyMap.get(ay) || { __toplam: 0 }
      for (const k of kalemler) {
        kalemToplamlari[k] = (kalemToplamlari[k] || 0) + (satir[k] || 0)
        beklenenKalemToplamlari[k] = (beklenenKalemToplamlari[k] || 0) + (beklenenSatir[k] || 0)
      }
      genelToplamGelir += satir.__toplam
      genelToplamGider += giderAylik.get(ay) || 0
      genelToplamBeklenen += beklenenSatir.__toplam
    }

    return {
      aylar,
      kalemler,
      satirlar: alinanAyMap,
      beklenenSatirlar: beklenenAyMap,
      giderAylik,
      kalemToplamlari,
      beklenenKalemToplamlari,
      genelToplamGelir,
      genelToplamGider,
      genelToplamBeklenen,
      detaylar: detayMap,
    }
  }, [odemeler, giderler, sozlesmeler, aylikBorclarHam, bireBirAtamalari, bireBirYoklama, kantinAlislari])

  // Tıklanan hücrenin ("ay||kalem", ay===null ise tüm ayların toplamı)
  // öğrenci bazlı dökümü — popup açıldığında hesaplanır. Alfabetik (ad_soyad)
  // sıralanır, borcu/ödemesi olmayan (0/0) satırlar hiç gösterilmez.
  const detaySatirlari = useMemo(() => {
    if (!detayAcik) return []
    const { ay, kalem } = detayAcik
    const birlesik = new Map() // ogrenciId -> {beklenen, alinan}
    function ekle(ogrMap) {
      for (const [ogrenciId, kayit] of ogrMap) {
        if (!birlesik.has(ogrenciId)) birlesik.set(ogrenciId, { beklenen: 0, alinan: 0 })
        const h = birlesik.get(ogrenciId)
        h.beklenen += kayit.beklenen
        h.alinan += kayit.alinan
      }
    }
    if (ay == null) {
      // "Genel Toplam" satırı — bu kalem için TÜM ayların dökümü birleştiriliyor.
      for (const [anahtar, ogrMap] of detaylar) {
        if (anahtar.endsWith(`||${kalem}`)) ekle(ogrMap)
      }
    } else {
      const ogrMap = detaylar.get(`${ay}||${kalem}`)
      if (ogrMap) ekle(ogrMap)
    }
    return [...birlesik.entries()]
      .map(([ogrenciId, kayit]) => ({
        ogrenciId,
        ad: ogrenciAdMap.get(ogrenciId) || 'Bilinmeyen öğrenci',
        beklenen: kayit.beklenen,
        alinan: kayit.alinan,
      }))
      .filter((s) => Math.abs(s.beklenen) > 0.01 || Math.abs(s.alinan) > 0.01)
      .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
  }, [detayAcik, detaylar, ogrenciAdMap])

  const netKarZarar = genelToplamGelir - genelToplamGider
  const tahsilatOrani = genelToplamBeklenen > 0 ? (genelToplamGelir / genelToplamBeklenen) * 100 : null

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-2">Gelir-Gider Raporu</h1>
      <p className="text-sm text-gray-500 mb-6">
        Her ay kalem bazında "Beklenen" (o ay vadesi/dönemi gelen taksit ve aylık borçların toplamı — normalde
        almamız gereken) ile "Alınan" (o ayın borcundan fiilen kapanmış kısım — ödemeler en eski borçtan başlayarak
        kümülatif olarak kapatılır) tutarların karşılaştırması, o ayın toplam gideri ve aradaki net kâr/zarar farkı.
      </p>

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 font-medium">Beklenen (Tüm Zamanlar)</p>
          <p className="text-2xl font-bold text-navy mt-1">{paraFormat(genelToplamBeklenen)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 font-medium">Alınan (Tüm Zamanlar)</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{paraFormat(genelToplamGelir)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 font-medium">Tahsilat Oranı</p>
          <p className="text-2xl font-bold text-blue mt-1">{tahsilatOrani == null ? '—' : `%${tahsilatOrani.toFixed(0)}`}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 font-medium">Toplam Gider (Tüm Zamanlar)</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{paraFormat(genelToplamGider)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 font-medium">Net Kâr/Zarar (Tüm Zamanlar)</p>
          <p className={`text-2xl font-bold mt-1 ${netKarZarar >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {paraFormat(netKarZarar)}
          </p>
        </div>
      </div>

      {/*
        ÖNEMLİ (sticky başlık/kaydırma düzeltmesi — kullanıcının "yapmamışsın"
        dediği gerçek hata): önceki sürümde bu kapsayıcı div'de sadece
        "overflow-x-auto" vardı (overflow-y belirtilmemiş, varsayılan
        "visible"). CSS kuralı gereği, bir eksende "auto" + diğer eksende
        "visible" birlikte DURAMAZ — tarayıcı overflow-y'yi de otomatik
        olarak "auto"ya yükseltir. Bu da bu div'i, th'lerdeki
        "position:sticky"in GERÇEKTE göre konumlandığı "en yakın kaydırma
        kapsayıcısı" yapıyordu — ama div'in kendi yüksekliği sınırsız
        (içeriğe göre büyüyor) olduğu için div'in KENDİSİ hiç kaydırılmıyordu
        (sayfanın/pencerenin kendisi kaydırılıyordu) — sonuç: sticky th,
        pencereye göre değil, bu div'in İÇİNDE sabit bir noktaya yapışıyordu
        ve sayfa kaydırıldıkça o nokta ekrandan kayıp gidiyordu (tam
        kullanıcının gördüğü hata). Çözüm: div'e GERÇEK bir sınırlı yükseklik
        ("max-h-[70vh]") ve "overflow-auto" (hem x hem y) vererek, kart
        kendi içinde GERÇEKTEN kaydırılan bir panel haline getirildi — artık
        sticky th'ler bu panelin kendi kaydırmasına göre doğru çalışıyor.
        Aynı panel içinde "Ay" sütunu da "sticky left-0" ile sağa/sola
        kaydırınca sabit kalıyor (kullanıcının istediği ikinci şey).
      */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-auto max-h-[70vh]" style={{ touchAction: 'pan-x pan-y' }}>
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="bg-navy text-white text-left">
              {/* Sol üst köşe — hem yukarı/aşağı (top-0) hem sağa/sola
                  (left-0) kaydırmada sabit kalması gereken TEK hücre, o
                  yüzden z-index'i diğer sticky hücrelerden daha yüksek. */}
              <th className="sticky top-0 left-0 z-30 bg-navy px-4 py-3 font-semibold whitespace-nowrap">Ay</th>
              {kalemler.map((k) => (
                <th key={k} className="sticky top-0 z-20 bg-navy px-4 py-3 font-semibold text-right whitespace-nowrap">
                  {k}
                  <span className="block text-[10px] font-normal text-white/60">Beklenen / Alınan</span>
                </th>
              ))}
              <th className="sticky top-0 z-20 bg-navy px-4 py-3 font-semibold text-right whitespace-nowrap">Beklenen Toplam</th>
              <th className="sticky top-0 z-20 bg-navy px-4 py-3 font-semibold text-right whitespace-nowrap">Alınan Toplam</th>
              <th className="sticky top-0 z-20 bg-navy px-4 py-3 font-semibold text-right whitespace-nowrap">Gider</th>
              <th className="sticky top-0 z-20 bg-navy px-4 py-3 font-semibold text-right whitespace-nowrap">Net Kâr/Zarar</th>
            </tr>
          </thead>
          <tbody>
            {aylar.length === 0 && (
              <tr>
                <td colSpan={kalemler.length + 5} className="px-4 py-6 text-center text-gray-400">
                  Hiç gelir/gider kaydı yok.
                </td>
              </tr>
            )}
            {aylar.map((ay, i) => {
              const satir = satirlar.get(ay) || { __toplam: 0 }
              const beklenenSatir = beklenenSatirlar.get(ay) || { __toplam: 0 }
              const gider = giderAylik.get(ay) || 0
              const net = satir.__toplam - gider
              return (
                <tr key={ay} className={i % 2 ? 'bg-gray-50' : ''}>
                  {/* Sağa/sola kaydırınca "hangi ayın satırına bakıyorum"
                      kaybolmasın diye bu hücre de sticky — kendi satırının
                      zebra rengini (beyaz/gri) burada ayrıca belirtmek
                      gerekiyor, yoksa sticky hücre altından kayan diğer
                      hücreleri şeffaf gösterirdi. */}
                  <td
                    className={`sticky left-0 z-10 px-4 py-2 font-medium text-gray-800 capitalize whitespace-nowrap ${
                      i % 2 ? 'bg-gray-50' : 'bg-white'
                    }`}
                  >
                    {ayEtiketi(ay)}
                  </td>
                  {kalemler.map((k) => (
                    <td
                      key={k}
                      onClick={() => setDetayAcik({ ay, kalem: k })}
                      title="Öğrenci bazlı dökümü görmek için tıklayın"
                      className="px-4 py-2 text-right whitespace-nowrap cursor-pointer hover:bg-navy/5"
                    >
                      <div className="text-gray-400 text-xs">{beklenenSatir[k] ? paraFormat(beklenenSatir[k]) : '—'}</div>
                      <div className="text-gray-700 font-medium">{satir[k] ? paraFormat(satir[k]) : '—'}</div>
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold text-gray-500">{paraFormat(beklenenSatir.__toplam)}</td>
                  <td className="px-4 py-2 text-right font-semibold text-navy">{paraFormat(satir.__toplam)}</td>
                  <td className="px-4 py-2 text-right font-semibold text-red-700">{gider ? paraFormat(gider) : '—'}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {paraFormat(net)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {aylar.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                <td className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-gray-800 whitespace-nowrap">Genel Toplam</td>
                {kalemler.map((k) => (
                  <td
                    key={k}
                    onClick={() => setDetayAcik({ ay: null, kalem: k })}
                    title="Öğrenci bazlı dökümü görmek için tıklayın"
                    className="px-4 py-3 text-right whitespace-nowrap cursor-pointer hover:bg-navy/5"
                  >
                    <div className="text-gray-400 text-xs font-normal">{paraFormat(beklenenKalemToplamlari[k] || 0)}</div>
                    <div className="text-gray-800">{paraFormat(kalemToplamlari[k] || 0)}</div>
                  </td>
                ))}
                <td className="px-4 py-3 text-right text-gray-600">{paraFormat(genelToplamBeklenen)}</td>
                <td className="px-4 py-3 text-right text-green-700">{paraFormat(genelToplamGelir)}</td>
                <td className="px-4 py-3 text-right text-red-700">{paraFormat(genelToplamGider)}</td>
                <td className={`px-4 py-3 text-right ${netKarZarar >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {paraFormat(netKarZarar)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Her kalem hücresinde üstteki küçük gri rakam o ay normalde tahsil edilmesi gereken ("Beklenen" — taksit
        vadesi ya da Bire Bir/Yemek/Kantin borcunun ait olduğu dönem), alttaki koyu rakam ise o ayın borcundan
        fiilen kapanmış kısımdır ("Alınan" — Muhasebe/Ekstre'deki ile aynı kümülatif mantıkla, ödemeler en eski
        borçtan başlayarak kapatılır; bir ödeme geçmiş ayların birikmiş borcunu kapatıyorsa o ay için değil,
        borcun ait olduğu eski aylar için "Alınan" sayılır). "Dağıtılmamış" kalemi, veli henüz hangi kaleme
        gideceği belirlenmemiş genel bir ödeme bıraktığında oluşur — Muhasebe sayfasından kalemlere
        dağıtıldığında buradaki ilgili kaleme geçer. Gider detaylarını (kategori, açıklama) görmek ve yeni gider
        eklemek için Giderler sayfasını kullanabilirsiniz.
      </p>

      {detayAcik && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setDetayAcik(null)}
        >
          <div
            className="bg-gray-50 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-navy text-white px-5 py-4 rounded-t-2xl flex items-center justify-between">
              <div>
                <p className="font-semibold">{detayAcik.kalem}</p>
                <p className="text-xs text-white/70">
                  {detayAcik.ay == null ? 'Tüm zamanlar — öğrenci bazlı döküm' : `${ayEtiketi(detayAcik.ay)} — öğrenci bazlı döküm`}
                </p>
              </div>
              <button
                onClick={() => setDetayAcik(null)}
                className="text-white/80 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-5">
              {detaySatirlari.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">Bu kalem için borç/ödeme kaydı yok.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="py-2 font-medium">Öğrenci</th>
                      <th className="py-2 font-medium text-right">Beklenen</th>
                      <th className="py-2 font-medium text-right">Alınan</th>
                      <th className="py-2 font-medium text-right">Kalan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detaySatirlari.map((s) => {
                      const kalan = s.beklenen - s.alinan
                      return (
                        <tr key={s.ogrenciId} className="border-b border-gray-100 last:border-0">
                          <td className="py-2 text-gray-800">{s.ad}</td>
                          <td className="py-2 text-right text-gray-500">{paraFormat(s.beklenen)}</td>
                          <td className="py-2 text-right text-green-700 font-medium">{paraFormat(s.alinan)}</td>
                          <td className={`py-2 text-right font-medium ${kalan > 0.01 ? 'text-red-600' : 'text-gray-400'}`}>
                            {kalan > 0.01 ? paraFormat(kalan) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
