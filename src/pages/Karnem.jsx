import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// Karnede dersler HANGİ SIRAYLA görünsün — sinav_ders_sonuclari tablosu
// kendi başına bir sıra garanti etmediğinden (veritabanı ORDER BY olmadan
// rastgele dönebilir), gerçek bir TYT/AYT karnesindeki sırayla aynı, sabit
// bir öncelik listesiyle diziyoruz (bkz. SinavKitapciklari.jsx'teki Toplu
// Ders Ataması'nda kullanılan aynı grup mantığı).
const DERS_SIRASI = [
  'Türkçe', 'Matematik', 'Geometri',
  'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü',
  'Fizik', 'Kimya', 'Biyoloji',
  'Sosyal Bilimler', 'Fen Bilimleri',
]
function dersSiraPuani(dersAdi) {
  const i = DERS_SIRASI.indexOf(dersAdi)
  return i === -1 ? 999 : i
}

// Net/puan gibi ondalıklı değerler PDF'te HER ZAMAN 2 basamaklı gösterilir
// (ör. "58,50") — JS'te bu tür sayıları olduğu gibi tutarsak sondaki sıfır
// otomatik düşer (58.50 → 58.5) ve karne ile ekrandaki sayı görsel olarak
// farklı görünür. Bu yüzden gösterirken her zaman 2 ondalık basamağa
// yuvarlayıp öyle yazdırıyoruz — hesaplanan değer aynı, sadece görünüm PDF'teki
// gibi sabit 2 basamaklı oluyor.
function netFormat(n) {
  return n == null ? '-' : Number(n).toFixed(2)
}

function tarihEtiket(tarih) {
  if (!tarih) return '—'
  return new Date(tarih + 'T12:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
}

// Dışarıdan bir chart kütüphanesi eklemeden (npm paketi eklemek, dosyayı elle
// GitHub'a sürükleyip yükleyen kullanıcı için ekstra bir "package.json'a da
// ekle" adımı gerektirir ve build'i bozma riski taşır), küçük, bağımlılıksız
// bir SVG çizgi grafik — sadece şekli (yükseliyor mu, düşüyor mu) göstermek
// yeterli, eksenlerde tam sayısal ölçek gerekmiyor.
//
// Tek satırlık kompakt versiyon — bir TÜR kartının (TYT/AYT/Konu Analiz)
// İÇİNDE, "Genel Net" ve her ders için ayrı ayrı kullanılıyor. Önceki
// tasarımda her ders ayrı bir üst düzey kart oluyordu (5-6 kart yan yana,
// karışık görünüyordu) — artık tür başına TEK kart var, dersler o kartın
// içinde satır satır sıralanıyor.
function TrendSatiri({ etiket, noktalar, vurgu }) {
  if (!noktalar || noktalar.length === 0) return null
  const tekNokta = noktalar.length === 1
  const degerler = noktalar.map((n) => n.deger)
  const min = Math.min(...degerler)
  const max = Math.max(...degerler)
  const araligi = max - min || 1
  const genislik = 100
  const yukseklik = 22
  const pad = 3
  const cizilenler = noktalar.map((n, i) => {
    const x = tekNokta ? genislik / 2 : pad + (i / (noktalar.length - 1)) * (genislik - pad * 2)
    const y = yukseklik - pad - ((n.deger - min) / araligi) * (yukseklik - pad * 2)
    return { ...n, x, y }
  })
  const yol = cizilenler.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const son = degerler[degerler.length - 1]
  const fark = son - degerler[0]

  return (
    <div className="flex items-center gap-2.5">
      <span className={`text-xs w-24 sm:w-28 shrink-0 truncate ${vurgu ? 'font-bold text-gray-800' : 'text-gray-500'}`}>
        {etiket}
      </span>
      <svg viewBox={`0 0 ${genislik} ${yukseklik}`} className="flex-1 h-6 min-w-0" preserveAspectRatio="none">
        <path d={yol} fill="none" stroke="#0f2a4a" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {cizilenler.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="1.4" fill="#0f2a4a" />
        ))}
      </svg>
      <span className="text-xs font-semibold text-gray-700 w-11 text-right shrink-0">{netFormat(son)}</span>
      {tekNokta ? (
        <span className="text-[10px] text-gray-400 w-9 text-right shrink-0">ilk</span>
      ) : (
        <span
          className={`text-[10px] font-bold w-9 text-right shrink-0 ${
            fark > 0 ? 'text-green-600' : fark < 0 ? 'text-red-500' : 'text-gray-400'
          }`}
        >
          {fark > 0 ? '▲' : fark < 0 ? '▼' : '–'}{Math.abs(fark).toFixed(1)}
        </span>
      )}
    </div>
  )
}

// Tür başına TEK kart (en fazla TYT / AYT / Konu Analiz / Diğer — yani en
// fazla 4 kutu). İçinde varsa "Genel Net" satırı, altında her dersin kendi
// satırı sıralanıyor.
function TurKarti({ tur, genel, dersSerileri }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-sm font-bold text-navy mb-3">{tur}</p>
      <div className="space-y-2">
        {genel.length > 0 && <TrendSatiri etiket="Genel Net" noktalar={genel} vurgu />}
        {dersSerileri.map((d) => (
          <TrendSatiri key={d.dersAdi} etiket={d.dersAdi} noktalar={d.noktalar} />
        ))}
      </div>
    </div>
  )
}

// "Konu Analizli Karne" formatında yüklenen sınavlardan gelen soru-bazlı konu
// bilgisi — bu bilgi sınavın TÜRÜNE (TYT/AYT/Konu Analiz) bağlı DEĞİL, o
// sınavın PDF'i o formatta yüklenmişse gelir (bkz. sinavPdfParse.js, sayfa 2
// "Konu Analizi" ayrıştırması). Bu yüzden burada tür ayrımı yapmadan, hangi
// sınavda konu bilgisi varsa hepsini tek havuzda topluyoruz.
function ZayifKonuSatiri({ dersAdi, konu, dogru, yanlis, bos, toplam }) {
  const yanlisYuzde = toplam > 0 ? (yanlis / toplam) * 100 : 0
  const bosYuzde = toplam > 0 ? (bos / toplam) * 100 : 0
  const dogruYuzde = Math.max(0, 100 - yanlisYuzde - bosYuzde)
  return (
    <div className="py-2.5 border-b border-gray-50 last:border-0">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <span className="text-sm font-medium text-gray-800">{konu}</span>
          <span className="text-xs text-gray-400 ml-1.5">· {dersAdi}</span>
        </div>
        <span className="text-xs text-gray-500 shrink-0 text-right">
          <b className="text-red-600">{yanlis} yanlış</b>
          {bos > 0 ? `, ${bos} boş` : ''} / {toplam} soru
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden flex">
        <div className="bg-green-400 h-full" style={{ width: `${dogruYuzde}%` }} />
        <div className="bg-gray-300 h-full" style={{ width: `${bosYuzde}%` }} />
        <div className="bg-red-400 h-full" style={{ width: `${yanlisYuzde}%` }} />
      </div>
    </div>
  )
}

// Öğrenci/veli için "kendi sınav sonuçlarını görme" sayfası — SinavYukle.jsx'te
// yöneticinin kaydettiği ogrenci_sinav_sonuclari + sinav_ders_sonuclari
// verilerini, admin panelinden ayrı, sade bir "karne" görünümünde gösterir.
// Hata Kitapçığı (yanlış soruların kitapçıktan kesilmiş hali) burada YOK —
// o hâlâ sadece yönetici tarafında, "Sınav Sonucu Yükle" sayfasından üretiliyor.
export default function Karnem() {
  const { profile } = useAuth()
  // Yönetici de bu sayfayı (özellikle Gelişim Grafiği'ni) görebilsin diye
  // rota izni genişletildi (bkz. App.jsx). Veli/öğrenci sadece KENDİ bağlı
  // olduğu öğrenci(ler)i görürken, yönetici İSTEDİĞİ HERHANGİ BİR öğrenciyi
  // seçebilmeli — aşağıdaki öğrenci sorgusu buna göre dallanıyor.
  const isYonetici = profile?.rol === 'yonetici'
  const [ogrenciler, setOgrenciler] = useState([])
  const [seciliId, setSeciliId] = useState('')
  const [sonuclar, setSonuclar] = useState([])
  const [konuVerileri, setKonuVerileri] = useState([])
  const [loading, setLoading] = useState(true)
  const [pdfIndiriliyorId, setPdfIndiriliyorId] = useState(null)
  // Akordeon: sınav sayısı arttıkça sayfa çok uzayıp karışmasın diye SADECE
  // en son sınav (liste zaten created_at'e göre en yeniden en eskiye sıralı,
  // bkz. aşağıdaki .order('created_at', {ascending:false})) varsayılan
  // olarak açık geliyor, diğerleri başlığa tıklanınca açılıyor.
  const [acikId, setAcikId] = useState(null)

  async function karnePdfIndir(s) {
    if (!s.karne_pdf_yolu) return
    setPdfIndiriliyorId(s.id)
    try {
      const { data, error } = await supabase.storage
        .from('sinav-sonuc-pdfleri')
        .createSignedUrl(s.karne_pdf_yolu, 60)
      if (error) throw error
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (e) {
      alert('PDF indirilemedi: ' + e.message)
    } finally {
      setPdfIndiriliyorId(null)
    }
  }

  useEffect(() => {
    if (!profile) return
    supabase
      .from('ogrenciler')
      .select('id, ad_soyad, veli_profile_id, ogrenci_profile_id')
      .order('ad_soyad')
      .then(({ data }) => {
        const tumu = data || []
        if (isYonetici) {
          // Yönetici okuldaki HERHANGİ BİR öğrenciyi seçebilmeli — otomatik
          // seçim yapmıyoruz (100'e yakın öğrenci arasından "ilk" öğrenciyi
          // göstermenin bir anlamı yok), aşağıdaki dropdown'dan kendisi seçer.
          setOgrenciler(tumu)
          setLoading(false)
          return
        }
        // GÜVENLİK: Muhasebe/Odev/DersProgrami'ndeki AYNI kanıtlanmış yöntem —
        // sunucudaki RLS'ye körü körüne güvenmek yerine, İSTEMCİ TARAFINDA da
        // sadece kendi bağlı olduğu öğrenci(ler)i listeye/otomatik seçime alıyoruz.
        const liste = tumu.filter(
          (o) => o.veli_profile_id === profile.id || o.ogrenci_profile_id === profile.id
        )
        setOgrenciler(liste)
        if (liste.length > 0) {
          setSeciliId(liste[0].id)
        } else {
          setLoading(false)
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  useEffect(() => {
    if (!seciliId) return
    setLoading(true)
    supabase
      .from('ogrenci_sinav_sonuclari')
      .select('*, sinavlar(sinav_adi, sinav_tarihi, tur)')
      .eq('ogrenci_id', seciliId)
      .order('created_at', { ascending: false })
      .then(async ({ data }) => {
        const liste = data || []
        const sonucIdleri = liste.map((s) => s.id)
        const { data: dersVerileri } =
          sonucIdleri.length > 0
            ? await supabase.from('sinav_ders_sonuclari').select('*').in('sonuc_id', sonucIdleri)
            : { data: [] }
        const dersMap = new Map()
        for (const d of dersVerileri || []) {
          if (!dersMap.has(d.sonuc_id)) dersMap.set(d.sonuc_id, [])
          dersMap.get(d.sonuc_id).push(d)
        }
        // Karnedeki "PUAN VE SIRALAMALAR" tablosu — üniversiteye yerleşmede
        // asıl belirleyici olan bilgi bu olduğu için (net değil) her zaman,
        // akordeon kapalıyken bile görünsün diye başlıkta gösteriyoruz.
        const { data: puanVerileri } =
          sonucIdleri.length > 0
            ? await supabase.from('sinav_puan_sonuclari').select('*').in('sonuc_id', sonucIdleri)
            : { data: [] }
        const puanMap = new Map()
        for (const p of puanVerileri || []) {
          if (!puanMap.has(p.sonuc_id)) puanMap.set(p.sonuc_id, [])
          puanMap.get(p.sonuc_id).push(p)
        }
        // Hata Kitapçığı butonu SADECE admin o sınavın o kitapçığını (A/B)
        // gerçekten hazırlayıp ONAYLADIYSA çıksın istiyoruz — yoksa öğrenci/
        // veli tıklayınca "kitapçık henüz yüklenmemiş" hata sayfasıyla
        // karşılaşırdı. sinav_kitapciklari.onaylandi = true olan (sinav_id,
        // kitapcik) çiftlerini önceden çekip bir sete koyuyoruz.
        const sinavIdleri = [...new Set(liste.map((s) => s.sinav_id).filter(Boolean))]
        const { data: kitapciklarData } =
          sinavIdleri.length > 0
            ? await supabase.from('sinav_kitapciklari').select('sinav_id, kitapcik, onaylandi').in('sinav_id', sinavIdleri)
            : { data: [] }
        const hazirKitapcikSeti = new Set(
          (kitapciklarData || []).filter((k) => k.onaylandi).map((k) => `${k.sinav_id}|${k.kitapcik}`)
        )
        // Zayıf Konu Analizi için — konu bilgisi sadece "Konu Analizli Karne"
        // formatında yüklenen sınavlarda var (bkz. ZayifKonuSatiri üstündeki
        // not), o yüzden bazı sınavlarda hiç satır dönmeyebilir, bu normal.
        const { data: konuVerileriData } =
          sonucIdleri.length > 0
            ? await supabase.from('sinav_soru_sonuclari').select('ders_adi, konu, sonuc').in('sonuc_id', sonucIdleri)
            : { data: [] }
        setKonuVerileri(konuVerileriData || [])
        setSonuclar(
          liste.map((s) => ({
            ...s,
            dersler: (dersMap.get(s.id) || [])
              .slice()
              .sort((a, b) => dersSiraPuani(a.ders_adi) - dersSiraPuani(b.ders_adi)),
            puanlar: puanMap.get(s.id) || [],
            kitapcikHazirMi: hazirKitapcikSeti.has(`${s.sinav_id}|${s.kitapcik}`),
          }))
        )
        // En son sınav (liste zaten en yeniden en eskiye sıralı) varsayılan
        // olarak açık gelsin, geri kalanlar kapalı.
        setAcikId(liste.length > 0 ? liste[0].id : null)
        setLoading(false)
      })
  }, [seciliId])

  const seciciGoster = isYonetici || ogrenciler.length > 1
  const seciliOgrenci = ogrenciler.find((o) => o.id === seciliId)

  // Gelişim grafiği için sonuçları TÜRE göre ayırıyoruz — TYT'nin neti ile
  // AYT'nin neti ya da tek dersli bir Konu Analiz testinin neti tamamen
  // farklı ölçeklerde olduğundan hepsini aynı çizgide karşılaştırmak
  // yanıltıcı olurdu (bkz. SinavYukle.jsx / SinavKitapciklari.jsx'teki
  // "Sınav Türü" alanı). Tür başına EN FAZLA BİR KART var (yani en çok 4
  // kutu: TYT / AYT / Konu Analiz / Diğer) — önceki tasarımda her ders ayrı
  // bir üst düzey kart oluyordu, çok kalabalık görünüyordu. Artık dersler o
  // tek kartın İÇİNDE satır satır sıralanıyor. "Konu Analiz" kartında genel
  // toplam net GÖSTERİLMİYOR (bir konu analiz sınavı genelde tek dersi
  // hedeflediği için, farklı derslerin karışık bir "genel net"i anlamsız
  // olurdu) — sadece ders satırları var.
  const TUR_SIRASI = ['TYT', 'AYT', 'Konu Analiz', 'Diğer']
  const trendGruplari = useMemo(() => {
    const siraliSonuclar = [...sonuclar].sort((a, b) => {
      const ta = a.sinavlar?.sinav_tarihi || a.created_at || ''
      const tb = b.sinavlar?.sinav_tarihi || b.created_at || ''
      return ta < tb ? -1 : ta > tb ? 1 : 0
    })
    const turHaritasi = new Map() // tur -> { genel: [], dersHaritasi: Map(dersAdi -> noktalar[]) }
    for (const s of siraliSonuclar) {
      const tur = s.sinavlar?.tur || 'Diğer'
      if (!turHaritasi.has(tur)) turHaritasi.set(tur, { genel: [], dersHaritasi: new Map() })
      const grup = turHaritasi.get(tur)
      if (s.toplam_net != null) {
        grup.genel.push({ etiket: tarihEtiket(s.sinavlar?.sinav_tarihi), deger: Number(s.toplam_net) })
      }
      for (const d of s.dersler || []) {
        if (d.net == null) continue
        // Aynı ders farklı sınavlarda büyük/küçük harf ya da baş/son boşlukla
        // biraz farklı yazılmış olabilir (ör. "Matematik " ile "matematik") —
        // haftalık "kası" takibinde bu, aynı dersin YANLIŞLIKLA iki ayrı
        // çizgiye bölünmesine yol açardı. Gruplamayı normalize edilmiş
        // (boşluksuz, küçük harf) anahtarla yapıyoruz; ekranda ilk görülen
        // yazım şekli gösteriliyor.
        const anahtar = (d.ders_adi || '').trim().toLocaleLowerCase('tr-TR')
        if (!grup.dersHaritasi.has(anahtar)) grup.dersHaritasi.set(anahtar, { etiket: d.ders_adi.trim(), noktalar: [] })
        grup.dersHaritasi.get(anahtar).noktalar.push({ etiket: tarihEtiket(s.sinavlar?.sinav_tarihi), deger: Number(d.net) })
      }
    }
    const turAdlari = [...turHaritasi.keys()].sort((a, b) => {
      const ia = TUR_SIRASI.indexOf(a)
      const ib = TUR_SIRASI.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
    const gruplar = []
    for (const tur of turAdlari) {
      const grup = turHaritasi.get(tur)
      const dersSerileri = [...grup.dersHaritasi.values()]
        .sort((a, b) => dersSiraPuani(a.etiket) - dersSiraPuani(b.etiket))
        .map((d) => ({ dersAdi: d.etiket, noktalar: d.noktalar }))
      const genel = tur === 'Konu Analiz' ? [] : grup.genel
      if (genel.length === 0 && dersSerileri.length === 0) continue
      gruplar.push({ tur, genel, dersSerileri })
    }
    return gruplar
  }, [sonuclar])

  // Zayıf Konu Analizi — TÜM geçmiş sınavlardaki (bu öğrencinin şimdiye kadar
  // girdiği, tür fark etmeksizin) konu bazlı soru sonuçlarını tek havuzda
  // toplayıp, en çok yanlış+boş yapılan konuları listeler. Sadece "Konu
  // Analizli Karne" formatında yüklenmiş sınavlarda veri olur — hiç yoksa
  // (ör. sadece düz karne yüklendiyse) bu bölüm hiç görünmez.
  const zayifKonular = useMemo(() => {
    const harita = new Map()
    for (const s of konuVerileri) {
      const konuAdi = (s.konu || '').trim()
      if (!konuAdi) continue
      const dersAdi = (s.ders_adi || '').trim()
      const anahtar = `${dersAdi.toLocaleLowerCase('tr-TR')}|${konuAdi.toLocaleLowerCase('tr-TR')}`
      if (!harita.has(anahtar)) {
        harita.set(anahtar, { anahtar, dersAdi, konu: konuAdi, dogru: 0, yanlis: 0, bos: 0, toplam: 0 })
      }
      const kayit = harita.get(anahtar)
      kayit.toplam += 1
      if (s.sonuc === 'dogru') kayit.dogru += 1
      else if (s.sonuc === 'yanlis') kayit.yanlis += 1
      else if (s.sonuc === 'bos') kayit.bos += 1
    }
    return [...harita.values()]
      .filter((k) => k.yanlis + k.bos > 0)
      .sort((a, b) => (b.yanlis + b.bos) - (a.yanlis + a.bos) || b.yanlis - a.yanlis)
      .slice(0, 10)
  }, [konuVerileri])

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-2">
        {isYonetici ? 'Öğrenci Gelişim Grafiği' : seciciGoster ? 'Sınav Sonuçları' : 'Sınav Sonuçlarım'}
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {isYonetici
          ? 'Bir öğrenci seçin — sınav sonuçları ve türe göre (TYT/AYT/Konu Analiz) gelişim grafiği görünsün.'
          : 'Girdiğiniz sınavların sonuçları ve ders bazında doğru/yanlış/boş dökümü.'}
      </p>

      {seciciGoster && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {isYonetici ? 'Öğrenci Seçin' : 'Çocuğunuzu Seçin'}
          </label>
          <select
            value={seciliId}
            onChange={(e) => setSeciliId(e.target.value)}
            className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            {isYonetici && <option value="">Seçiniz...</option>}
            {ogrenciler.map((o) => (
              <option key={o.id} value={o.id}>{o.ad_soyad}</option>
            ))}
          </select>
        </div>
      )}

      {isYonetici && !seciliId && !loading && (
        <p className="text-gray-400">Sonuçlarını görmek istediğiniz öğrenciyi yukarıdan seçin.</p>
      )}

      {!isYonetici && ogrenciler.length === 0 && !loading && (
        <p className="text-gray-400">
          Size bağlı bir öğrenci kaydı bulunamadı. Lütfen okul yönetimiyle iletişime geçin.
        </p>
      )}

      {loading && <p className="text-gray-400">Yükleniyor...</p>}

      {!loading && seciliId && sonuclar.length === 0 && (
        <p className="text-gray-400">
          {seciliOgrenci?.ad_soyad ? `${seciliOgrenci.ad_soyad} için ` : ''}henüz kaydedilmiş bir sınav sonucu yok.
        </p>
      )}

      {!loading && sonuclar.length > 0 && (
        <div className="space-y-5">
          {sonuclar.map((s) => {
            const acikMi = acikId === s.id
            return (
            <div key={s.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div
                onClick={() => setAcikId(acikMi ? null : s.id)}
                className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2 cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"
                    className={`shrink-0 text-gray-400 transition-transform duration-150 ${acikMi ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <div>
                    <p className="font-semibold text-navy">{s.sinavlar?.sinav_adi || 'Sınav'}</p>
                    <p className="text-xs text-gray-400">
                      {s.sinavlar?.sinav_tarihi && new Date(s.sinavlar.sinav_tarihi).toLocaleDateString('tr-TR')}
                      {s.kitapcik && ` · Kitapçık ${s.kitapcik}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="text-sm flex gap-4 flex-wrap">
                    <span>
                      Doğru: <b className="text-green-700">{s.toplam_dogru}</b>
                    </span>
                    <span>
                      Yanlış: <b className="text-red-700">{s.toplam_yanlis}</b>
                    </span>
                    <span>
                      Boş: <b className="text-gray-500">{s.toplam_bos}</b>
                    </span>
                    <span>
                      Net: <b className="text-navy">{netFormat(s.toplam_net)}</b>
                    </span>
                  </div>
                  {s.karne_pdf_yolu && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); karnePdfIndir(s) }}
                      disabled={pdfIndiriliyorId === s.id}
                      className="inline-flex items-center gap-1.5 text-xs font-bold bg-navy text-white px-3.5 py-1.5 rounded-full shadow-sm hover:opacity-90 disabled:opacity-40"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 20h16" />
                      </svg>
                      {pdfIndiriliyorId === s.id ? 'Açılıyor...' : 'Detaylı Karne İndir'}
                    </button>
                  )}
                  {(s.toplam_yanlis || 0) + (s.toplam_bos || 0) > 0 && s.kitapcikHazirMi && (
                    <Link
                      to={`/hata-kitapcigi/${s.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-semibold bg-orange text-white px-3 py-1.5 rounded-full hover:opacity-90"
                    >
                      Hata Kitapçığını Görüntüle
                    </Link>
                  )}
                </div>
              </div>
              {s.puanlar && s.puanlar.length > 0 && (
                <div className="px-5 py-3 bg-orange/5 border-b border-orange/10 flex flex-wrap gap-x-6 gap-y-1">
                  {s.puanlar.map((p) => (
                    <div key={p.id} className="text-sm">
                      <span className="font-semibold text-orange">{p.puan_turu} Puan: {netFormat(p.puan)}</span>
                      {p.genel_siralama != null && (
                        <span className="text-gray-600"> · Genel Sıralama: <b>{p.genel_siralama.toLocaleString('tr-TR')}</b></span>
                      )}
                      {p.kurum_siralama != null && <span className="text-gray-400"> · Kurum: {p.kurum_siralama}</span>}
                      {p.sube_siralama != null && <span className="text-gray-400"> · Şube: {p.sube_siralama}</span>}
                      {p.sinif_siralama != null && <span className="text-gray-400"> · Sınıf: {p.sinif_siralama}</span>}
                    </div>
                  ))}
                </div>
              )}
              {acikMi && s.dersler.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="px-5 py-2 font-medium">Ders</th>
                        <th className="px-5 py-2 font-medium text-center">Soru</th>
                        <th className="px-5 py-2 font-medium text-center">Doğru</th>
                        <th className="px-5 py-2 font-medium text-center">Yanlış</th>
                        <th className="px-5 py-2 font-medium text-center">Boş</th>
                        <th className="px-5 py-2 font-medium text-center">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.dersler.map((d) => (
                        <tr key={d.id} className="border-t border-gray-50">
                          <td className="px-5 py-2 font-medium text-gray-800">{d.ders_adi}</td>
                          <td className="px-5 py-2 text-center text-gray-500">{d.soru_sayisi}</td>
                          <td className="px-5 py-2 text-center text-green-700">{d.dogru}</td>
                          <td className="px-5 py-2 text-center text-red-700">{d.yanlis}</td>
                          <td className="px-5 py-2 text-center text-gray-500">{d.bos}</td>
                          <td className="px-5 py-2 text-center font-semibold text-navy">{netFormat(d.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            )
          })}
        </div>
      )}

      {!loading && trendGruplari.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-gray-700 mb-1">Gelişim Grafiği</h2>
          <p className="text-xs text-gray-400 mb-3">
            Yukarıdaki sınav sonuçlarının özeti — aynı türdeki (TYT/AYT/Konu Analiz) sınavların netleri zaman
            içinde nasıl değiştiğini gösterir. Yeşil ok net yükseldiğini, kırmızı ok düştüğünü, "İlk sonuç"
            etiketi ise o türde/derste henüz TEK sonuç girildiğini (ikincisiyle birlikte çizgi oluşacağını) belirtir.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {trendGruplari.map((g) => (
              <TurKarti key={g.tur} tur={g.tur} genel={g.genel} dersSerileri={g.dersSerileri} />
            ))}
          </div>
        </div>
      )}

      {!loading && zayifKonular.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-gray-700 mb-1">Zayıf Konu Analizi</h2>
          <p className="text-xs text-gray-400 mb-3">
            "Konu Analizli Karne" formatında yüklenen sınavlardaki tüm sorular taranarak, şimdiye kadarki
            sonuçlarda en çok yanlış/boş yapılan konular listelenmiştir. Bu bilgi sınav türünden (TYT/AYT/Konu
            Analiz) bağımsızdır — sadece bu formatta yüklenmiş sınavlarda bulunur, her sınavda olmayabilir.
          </p>
          <div className="bg-white rounded-xl border border-gray-100 px-4">
            {zayifKonular.map((k) => (
              <ZayifKonuSatiri key={k.anahtar} {...k} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
