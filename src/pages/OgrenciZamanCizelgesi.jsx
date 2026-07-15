import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { paraFormat, bireBirDersDetaylariOlustur } from '../lib/ekstreHesap'

// ============================================================================
// ÖĞRENCİ ZAMAN ÇİZELGESİ — bir öğrenciyle ilgili HER ŞEYİ (ödemeler, bire bir
// dersler, ödevler, sınav sonuçları, sınıf dersi devamsızlığı) tek bir
// kronolojik akışta gösteren, sadece yönetici için, salt-okunur bir "hikaye"
// görünümü. Amaç: bir veli görüşmesi öncesi ya da yeni bir öğretmene öğrenciyi
// tanıtırken, beş ayrı sayfaya bakmak yerine tek ekranda her şeyi görebilmek.
// ============================================================================

function tarihUzunFormat(tarihStr) {
  if (!tarihStr) return '—'
  return new Date(tarihStr + 'T12:00:00').toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

// timestamptz -> yerel (Türkiye, UTC+3) YYYY-MM-DD. Projede yerleşik kural:
// .toISOString().slice(0,10) KULLANILMAZ çünkü gece yarısına yakın saatlerde
// yanlış güne yuvarlayabilir — yerel saat bileşenleri doğrudan okunur.
function yerelTarihStrTimestamptan(ts) {
  if (!ts) return null
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const TUR_STIL = {
  odeme: { renk: 'bg-green-500', etiket: 'Ödeme' },
  birebir: { renk: 'bg-orange-500', etiket: 'Bire Bir' },
  odev: { renk: 'bg-blue-500', etiket: 'Ödev' },
  sinav: { renk: 'bg-purple-500', etiket: 'Sınav' },
  devamsizlik: { renk: 'bg-red-500', etiket: 'Devamsızlık' },
}

const FILTRELER = [
  { tur: null, etiket: 'Tümü' },
  { tur: 'odeme', etiket: 'Ödemeler' },
  { tur: 'birebir', etiket: 'Bire Bir' },
  { tur: 'odev', etiket: 'Ödevler' },
  { tur: 'sinav', etiket: 'Sınavlar' },
  { tur: 'devamsizlik', etiket: 'Devamsızlık' },
]

function OlayKarti({ olay, sonMu }) {
  const stil = TUR_STIL[olay.tur]
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className={`w-3 h-3 rounded-full ${stil.renk} mt-1.5 shrink-0`}></span>
        {!sonMu && <span className="flex-1 w-px bg-gray-200 my-1"></span>}
      </div>
      <div className={`min-w-0 flex-1 ${sonMu ? '' : 'pb-5'}`}>
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full text-white ${stil.renk}`}>
            {stil.etiket}
          </span>
          <span className="text-xs text-gray-400">{tarihUzunFormat(olay.tarih)}</span>
        </div>
        <div className="text-sm text-gray-800">{olay.icerik}</div>
      </div>
    </div>
  )
}

// Sınıf dersi devamsızlık özeti: hem genel toplam (kaç dersten kaçına
// gelmemiş), hem öğretmen bazında kırılım (ör. "Oğuzhan Yaşar Bal'ın 5
// dersinden 2'sine gelmemiş") — Yoklama Raporu'ndaki mantığın aynısı,
// burada tek bir öğrenci için.
function DevamsizlikOzeti({ yoklamaKayitlari }) {
  if (!yoklamaKayitlari || yoklamaKayitlari.length === 0) return null

  const genelGeldi = yoklamaKayitlari.filter((y) => y.geldi).length
  const genelGelmedi = yoklamaKayitlari.length - genelGeldi

  const ogretmenMap = new Map()
  for (const y of yoklamaKayitlari) {
    const ad = y.ders_programi?.profiles?.ad_soyad || 'Bilinmeyen öğretmen'
    if (!ogretmenMap.has(ad)) ogretmenMap.set(ad, { geldi: 0, gelmedi: 0 })
    const s = ogretmenMap.get(ad)
    if (y.geldi) s.geldi += 1
    else s.gelmedi += 1
  }
  const ogretmenListesi = [...ogretmenMap.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr'))

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
      <h2 className="font-semibold text-gray-700 mb-3">Sınıf Dersi Devamsızlığı</h2>
      <div className="flex flex-wrap gap-4 mb-4 text-sm">
        <span className="text-gray-500">
          Toplam <span className="font-semibold text-gray-800">{yoklamaKayitlari.length}</span> ders
        </span>
        <span className="text-green-600 font-semibold">{genelGeldi} geldi</span>
        <span className="text-red-500 font-semibold">{genelGelmedi} gelmedi</span>
      </div>
      <div className="divide-y divide-gray-50 border-t border-gray-100">
        {ogretmenListesi.map(([ad, s]) => {
          const toplam = s.geldi + s.gelmedi
          const oran = toplam > 0 ? Math.round((s.gelmedi / toplam) * 100) : 0
          return (
            <div key={ad} className="py-2.5 flex items-center justify-between gap-3 flex-wrap">
              <span className="font-medium text-gray-800 text-sm">{ad}</span>
              <span className="text-sm text-gray-500">
                <span className="text-red-500 font-semibold">{s.gelmedi}</span>/{toplam} derse gelmedi
                {' '}
                <span className={`font-semibold ${oran > 20 ? 'text-red-500' : 'text-gray-400'}`}>(%{oran})</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function OgrenciZamanCizelgesi() {
  const { ogrenciId } = useParams()
  const [ogrenci, setOgrenci] = useState(null)
  const [olaylar, setOlaylar] = useState([])
  const [yoklamaKayitlari, setYoklamaKayitlari] = useState([])
  const [aktifFiltre, setAktifFiltre] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hata, setHata] = useState('')

  useEffect(() => {
    let iptalEdildi = false
    setLoading(true)
    setHata('')

    Promise.all([
      supabase.from('ogrenciler').select('*, veli:veli_profile_id(ad_soyad)').eq('id', ogrenciId).single(),
      supabase.from('odemeler').select('*').eq('ogrenci_id', ogrenciId).order('tarih', { ascending: false }),
      supabase.from('bire_bir_atamalari').select('*, profiles:ogretmen_profile_id(ad_soyad, brans)').eq('ogrenci_id', ogrenciId),
      // "Ek Ders" (atamaya bağlı olmayan, tek seferlik bire bir) kayıtları
      supabase
        .from('bire_bir_yoklama')
        .select('*, profiles:ogretmen_profile_id(ad_soyad, brans)')
        .eq('ogrenci_id', ogrenciId)
        .is('atama_id', null),
      supabase.from('odevler').select('*, profiles:ogretmen_profile_id(ad_soyad)').eq('ogrenci_id', ogrenciId),
      supabase.from('ogrenci_sinav_sonuclari').select('*, sinavlar(sinav_adi, sinav_tarihi)').eq('ogrenci_id', ogrenciId),
      // Sınıf dersi yoklaması (devamsızlık) — hangi ders saatine, hangi
      // öğretmene ait olduğunu görebilmek için ders_programi üzerinden
      // ders adı ve öğretmen bilgisini de birlikte çekiyoruz.
      supabase
        .from('yoklama')
        .select('*, ders_programi(ders_adi, profiles:ogretmen_profile_id(ad_soyad, brans))')
        .eq('ogrenci_id', ogrenciId)
        .order('tarih', { ascending: false }),
    ]).then(async ([o, odemelerRes, bbaRes, ekDersRes, odevRes, sinavRes, yoklamaRes]) => {
      if (iptalEdildi) return
      if (o.error || !o.data) {
        setHata('Öğrenci bulunamadı.')
        setLoading(false)
        return
      }
      setOgrenci(o.data)
      setYoklamaKayitlari(yoklamaRes.data || [])

      // Haftalık atamalara bağlı yoklama kayıtları ayrı bir sorguyla çekiliyor
      // (BireBir.jsx / Muhasebe.jsx'teki AYNI desen) — atama id'leri elimize
      // geçtikten sonra onlara bağlı yoklamaları getiriyoruz.
      const atamalar = bbaRes.data || []
      const atamaIdleri = atamalar.map((a) => a.id)
      const haftalikYoklamaRes =
        atamaIdleri.length > 0
          ? await supabase.from('bire_bir_yoklama').select('*').in('atama_id', atamaIdleri)
          : { data: [] }
      const tumBireBirYoklamalar = [...(haftalikYoklamaRes.data || []), ...(ekDersRes.data || [])]
      const bireBirDersler = bireBirDersDetaylariOlustur(atamalar, tumBireBirYoklamalar)

      const yeniOlaylar = []

      for (const od of odemelerRes.data || []) {
        yeniOlaylar.push({
          tur: 'odeme',
          tarih: (od.tarih || '').slice(0, 10),
          icerik: (
            <span>
              <span className="font-semibold text-green-700">{paraFormat(od.tutar)}</span> tutarında{' '}
              <span className="font-medium">{od.kalem || 'ödeme'}</span> ödemesi alındı
              {od.odeme_turu ? ` (${od.odeme_turu})` : ''}.
            </span>
          ),
        })
      }

      for (const d of bireBirDersler) {
        yeniOlaylar.push({
          tur: 'birebir',
          tarih: d.tarih,
          icerik: (
            <span>
              <span className="font-medium">{d.ogretmenAdi}</span>
              {d.ogretmenBransi ? ` (${d.ogretmenBransi})` : ''} ile bire bir ders yapıldı
              {d.baslangicSaat ? ` (${d.baslangicSaat.slice(0, 5)}–${(d.bitisSaat || '').slice(0, 5)})` : ''}.
            </span>
          ),
        })
      }

      for (const odev of odevRes.data || []) {
        const durumEtiket = odev.durum === 'yapti' ? 'yapıldı' : odev.durum === 'yapmadi' ? 'yapılmadı' : 'bekleniyor'
        yeniOlaylar.push({
          tur: 'odev',
          tarih: yerelTarihStrTimestamptan(odev.olusturma_tarihi) || odev.son_tarih,
          icerik: (
            <span>
              <span className="font-medium">{odev.baslik}</span>
              {odev.ders ? ` (${odev.ders})` : ''} ödevi verildi
              {odev.profiles?.ad_soyad ? ` — ${odev.profiles.ad_soyad}` : ''}. Durum:{' '}
              <span className="font-medium">{durumEtiket}</span>.
            </span>
          ),
        })
      }

      for (const s of sinavRes.data || []) {
        yeniOlaylar.push({
          tur: 'sinav',
          tarih: s.sinavlar?.sinav_tarihi || (s.created_at || '').slice(0, 10),
          icerik: (
            <span>
              <span className="font-medium">{s.sinavlar?.sinav_adi || 'Sınav'}</span> sonucu:{' '}
              {s.toplam_net != null ? `${s.toplam_net} net` : ''}
              {s.puan != null ? `, ${s.puan} puan` : ''}
              {s.toplam_net == null && s.puan == null ? 'kaydedildi' : ''}.
            </span>
          ),
        })
      }

      // Devamsızlık için sadece "Gelmedi" kayıtlarını akışa ekliyoruz —
      // "Geldi" (yani her normal ders) her gün onlarca satır ekleyip
      // hikayeyi anlamsız kalabalıklaştırırdı; devamsızlık zaten dikkat
      // çekmesi gereken, istisnai durum.
      for (const y of yoklamaRes.data || []) {
        if (y.geldi) continue
        yeniOlaylar.push({
          tur: 'devamsizlik',
          tarih: y.tarih,
          icerik: (
            <span>
              <span className="font-medium">{y.ders_programi?.ders_adi || 'Sınıf dersi'}</span>
              {y.ders_programi?.profiles?.ad_soyad ? ` (${y.ders_programi.profiles.ad_soyad})` : ''} dersine{' '}
              <span className="font-medium text-red-600">gelmedi</span>.
            </span>
          ),
        })
      }

      yeniOlaylar.sort((a, b) => (a.tarih < b.tarih ? 1 : a.tarih > b.tarih ? -1 : 0))
      setOlaylar(yeniOlaylar)
      setLoading(false)
    })

    return () => {
      iptalEdildi = true
    }
  }, [ogrenciId])

  const gosterilecekler = aktifFiltre ? olaylar.filter((o) => o.tur === aktifFiltre) : olaylar

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>
  if (hata) return <p className="text-gray-400">{hata}</p>

  return (
    <div>
      <Link to="/ogrenciler" className="text-sm text-blue hover:underline mb-3 inline-block">
        ← Öğrencilere Dön
      </Link>
      <h1 className="text-2xl font-bold text-navy mb-1">{ogrenci?.ad_soyad}</h1>
      <p className="text-gray-500 mb-6">
        {ogrenci?.sinif_ve_alan || '—'}
        {ogrenci?.veli?.ad_soyad ? ` · Veli: ${ogrenci.veli.ad_soyad}` : ''}
      </p>

      <DevamsizlikOzeti yoklamaKayitlari={yoklamaKayitlari} />

      <div className="flex flex-wrap gap-2 mb-6">
        {FILTRELER.map((f) => (
          <button
            key={f.etiket}
            type="button"
            onClick={() => setAktifFiltre(f.tur)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              aktifFiltre === f.tur
                ? 'bg-navy text-white border-navy'
                : 'bg-white text-gray-600 border-gray-200 hover:border-navy'
            }`}
          >
            {f.etiket}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        {gosterilecekler.length === 0 && (
          <p className="text-center text-gray-400 py-6">Bu filtrede henüz bir kayıt yok.</p>
        )}
        {gosterilecekler.map((olay, i) => (
          <OlayKarti key={i} olay={olay} sonMu={i === gosterilecekler.length - 1} />
        ))}
      </div>
    </div>
  )
}
