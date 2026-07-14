import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { paraFormat, bireBirDersDetaylariOlustur } from '../lib/ekstreHesap'

// ============================================================================
// ÖĞRENCİ ZAMAN ÇİZELGESİ — bir öğrenciyle ilgili HER ŞEYİ (ödemeler, bire bir
// dersler, ödevler, sınav sonuçları) tek bir kronolojik akışta gösteren, sadece
// yönetici için, salt-okunur bir "hikaye" görünümü. Amaç: bir veli görüşmesi
// öncesi ya da yeni bir öğretmene öğrenciyi tanıtırken, beş ayrı sayfaya
// bakmak yerine tek ekranda her şeyi görebilmek.
//
// NOT: Genel sınıf yoklaması (devamsızlık) şimdilik bu çizelgeye DAHİL DEĞİL —
// o tablonun güncel şeması bu dosyayı hazırlarken elimizde yoktu. İstenirse
// ayrıca eklenebilir.
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
}

const FILTRELER = [
  { tur: null, etiket: 'Tümü' },
  { tur: 'odeme', etiket: 'Ödemeler' },
  { tur: 'birebir', etiket: 'Bire Bir' },
  { tur: 'odev', etiket: 'Ödevler' },
  { tur: 'sinav', etiket: 'Sınavlar' },
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

export default function OgrenciZamanCizelgesi() {
  const { ogrenciId } = useParams()
  const [ogrenci, setOgrenci] = useState(null)
  const [olaylar, setOlaylar] = useState([])
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
    ]).then(async ([o, odemelerRes, bbaRes, ekDersRes, odevRes, sinavRes]) => {
      if (iptalEdildi) return
      if (o.error || !o.data) {
        setHata('Öğrenci bulunamadı.')
        setLoading(false)
        return
      }
      setOgrenci(o.data)

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
