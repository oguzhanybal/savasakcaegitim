import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

// ============================================================================
// GEÇMİŞ YOKLAMA — Yoklama.jsx'in "sadece bugün" kısıtlaması olmayan hâli.
// Bir öğretmen (ya da yönetici) o gün yoklama almayı unuttuysa, buradan
// GEÇMİŞ bir tarih seçip o güne ait yoklamayı sonradan alabilir/düzenleyebilir
// (kullanıcı isteğiyle eklendi — Yoklama.jsx bilerek "bugün"e kilitli
// bırakıldı, günlük akışta yanlışlıkla geçmiş bir tarihe yoklama girilmesin
// diye; bu sayfa ayrı, bilinçli bir "unutulanı tamamla" aracı).
// ============================================================================

// Bugünün tarihini "YYYY-MM-DD" olarak YEREL saate göre üretir — projedeki
// diğer sayfalarla (DersProgrami.jsx, YoklamaRaporu.jsx vb.) aynı desen,
// toISOString KULLANILMIYOR çünkü UTC+3'te gece yarısına yakın saatlerde bir
// gün geriye kayabiliyor.
function yerelTarih(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function birGunOnce(tarihStr) {
  const d = new Date(tarihStr + 'T12:00:00')
  d.setDate(d.getDate() - 1)
  return yerelTarih(d)
}

// Bir ders saati sonradan düzenlenip eski satırı pasife alınmış, yenisi
// eklenmiş olabilir (ders_programi'nin "aktif=false + pasif_tarihi" soft-
// delete deseni) — bu durumda AYNI başlangıç/bitiş saatine sahip birden
// fazla satır o günün listesine girip "Ders Saati" açılır listesinde aynı
// saat aralığı iki kez görünüyordu (kullanıcı bildirdi). Aynı saat aralığına
// sahip satırları TEK satıra indiriyoruz — o tarihe ait GERÇEKTEN yoklaması
// kayıtlı olan satır varsa onu, yoksa aktif olanı tercih ederek.
function saatleriBirlestir(saatler, yoklamasiOlanIdler) {
  const gruplar = new Map()
  for (const d of saatler) {
    const anahtar = `${d.baslangic_saat}-${d.bitis_saat}`
    const mevcut = gruplar.get(anahtar)
    if (!mevcut) {
      gruplar.set(anahtar, d)
      continue
    }
    const mevcutYoklamasiVar = yoklamasiOlanIdler.has(mevcut.id)
    const yeniYoklamasiVar = yoklamasiOlanIdler.has(d.id)
    if (yeniYoklamasiVar && !mevcutYoklamasiVar) {
      gruplar.set(anahtar, d)
    } else if (yeniYoklamasiVar === mevcutYoklamasiVar && d.aktif !== false && mevcut.aktif === false) {
      gruplar.set(anahtar, d)
    }
  }
  return [...gruplar.values()].sort((a, b) => (a.baslangic_saat || '').localeCompare(b.baslangic_saat || ''))
}

export default function GecmisYoklama() {
  const { profile } = useAuth()
  const bugun = yerelTarih(new Date())
  const [siniflar, setSiniflar] = useState([])
  const [seciliSinif, setSeciliSinif] = useState('')
  // Varsayılan olarak DÜN açılıyor — bu sayfanın amacı zaten "geçmişte
  // unutulan bir günü tamamlamak", bugünün yoklaması normal "Yoklama Al"
  // akışından (ya da Ders Programım'daki popup'tan) alınmaya devam ediyor.
  const [seciliTarih, setSeciliTarih] = useState(birGunOnce(bugun))
  const seciliGunNo = ((new Date(seciliTarih + 'T12:00:00').getDay() + 6) % 7) + 1
  const [gununSaatleri, setGununSaatleri] = useState([])
  const [seciliSaat, setSeciliSaat] = useState('')
  const [ogrenciler, setOgrenciler] = useState([])
  const [yoklamaKayitlari, setYoklamaKayitlari] = useState({})
  const [loading, setLoading] = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  useEffect(() => {
    supabase.from('siniflar').select('*').then(({ data }) => {
      setSiniflar(data || [])
      if (data && data.length > 0) setSeciliSinif(data[0].id)
      else setLoading(false)
    })
  }, [])

  // Seçili sınıfın, seçili TARİHTEKİ ders saatlerini getir — Yoklama.jsx'teki
  // AYNI mantık, tek fark "bugun" yerine "seciliTarih" kullanılması.
  useEffect(() => {
    if (!seciliSinif) return
    supabase
      .from('ders_programi')
      .select('*')
      .eq('sinif_id', seciliSinif)
      .eq('gun', seciliGunNo)
      .or(`aktif.eq.true,pasif_tarihi.gte.${seciliTarih}`)
      .order('baslangic_saat')
      .then(async ({ data }) => {
        const tumSaatler = (data || []).filter(
          (d) => !d.baslangic_tarihi || d.baslangic_tarihi <= seciliTarih
        )
        // Sadece pasif satırlar için değil, TÜMÜ için yoklama var mı bakıyoruz
        // — aşağıdaki saatleriBirlestir() aynı saat aralığındaki satırlardan
        // hangisinin GERÇEKTEN yoklaması kayıtlı olduğunu bilmeli (aktif olan
        // da olabilir, pasif olan da).
        const tumIdler = tumSaatler.map((d) => d.id)
        let yoklamasiOlanIdler = new Set()
        if (tumIdler.length > 0) {
          const { data: yoklamaVarMi } = await supabase
            .from('yoklama')
            .select('ders_programi_id')
            .in('ders_programi_id', tumIdler)
            .eq('tarih', seciliTarih)
          yoklamasiOlanIdler = new Set((yoklamaVarMi || []).map((y) => y.ders_programi_id))
        }
        const gosterilecekSaatler = tumSaatler.filter(
          (d) => d.aktif !== false || yoklamasiOlanIdler.has(d.id)
        )
        const benzersizSaatler = saatleriBirlestir(gosterilecekSaatler, yoklamasiOlanIdler)
        setGununSaatleri(benzersizSaatler)
        setSeciliSaat(benzersizSaatler.length > 0 ? benzersizSaatler[0].id : '')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seciliSinif, seciliTarih])

  useEffect(() => {
    if (!seciliSinif) return
    setLoading(true)
    Promise.all([
      supabase
        .from('sinif_ogrenciler')
        .select('ogrenciler(id, ad_soyad)')
        .eq('sinif_id', seciliSinif),
      seciliSaat
        ? supabase.from('yoklama').select('*').eq('ders_programi_id', seciliSaat).eq('tarih', seciliTarih)
        : supabase.from('yoklama').select('*').eq('sinif_id', seciliSinif).eq('tarih', seciliTarih).is('ders_programi_id', null),
    ]).then(([so, y]) => {
      const liste = (so.data || []).map((r) => r.ogrenciler).filter(Boolean)
      setOgrenciler(liste)
      const mevcut = {}
      ;(y.data || []).forEach((k) => {
        mevcut[k.ogrenci_id] = k.geldi
      })
      setYoklamaKayitlari(mevcut)
      setLoading(false)
    })
  }, [seciliSinif, seciliSaat, seciliTarih])

  function isaretle(ogrenciId, geldi) {
    setYoklamaKayitlari((prev) => ({ ...prev, [ogrenciId]: geldi }))
  }

  // Yoklama.jsx'teki AYNI bildirim mekanizması — yöneticiye e-posta gider,
  // sadece tarih artık "bugün" değil seçilen geçmiş tarih olabilir, e-postada
  // zaten tarih ayrıca belirtildiği için ek bir "geçmişe dönük" etiketine
  // gerek yok. Bu isteğin başarısız olması yoklama kaydını asla etkilemez.
  function bildirimGonder(kayitlar) {
    const sinifAdi = siniflar.find((s) => s.id === seciliSinif)?.ad
    const seciliSaatBilgi = gununSaatleri.find((s) => s.id === seciliSaat)
    const saatMetni = seciliSaatBilgi
      ? `${seciliSaatBilgi.baslangic_saat?.slice(0, 5)}–${seciliSaatBilgi.bitis_saat?.slice(0, 5)}`
      : 'Genel yoklama'
    const gelmeyenIsimler = ogrenciler.filter((o) => !kayitlar.find((k) => k.ogrenci_id === o.id)?.geldi).map((o) => o.ad_soyad)
    fetch('/api/yoklama-bildirim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sinifAdi,
        saatMetni,
        tarih: seciliTarih,
        ogretmenAdi: profile?.ad_soyad,
        gelenSayisi: kayitlar.length - gelmeyenIsimler.length,
        gelmeyenSayisi: gelmeyenIsimler.length,
        gelmeyenIsimler,
      }),
    }).catch(() => {})
  }

  async function kaydet() {
    setKaydediliyor(true)
    const kayitlar = ogrenciler.map((o) => ({
      sinif_id: seciliSinif,
      ders_programi_id: seciliSaat || null,
      ogrenci_id: o.id,
      tarih: seciliTarih,
      geldi: yoklamaKayitlari[o.id] ?? true,
    }))
    const { error } = await supabase
      .from('yoklama')
      .upsert(kayitlar, { onConflict: seciliSaat ? 'ders_programi_id,ogrenci_id,tarih' : 'sinif_id,ogrenci_id,tarih' })
    setKaydediliyor(false)
    if (error) alert('Hata: ' + error.message)
    else {
      alert('Yoklama kaydedildi.')
      bildirimGonder(kayitlar)
    }
  }

  const seciliTarihBasligi = new Date(seciliTarih + 'T12:00:00').toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-1">Geçmiş Yoklama</h1>
      <p className="text-gray-500 mb-6">
        O gün unutulan ya da eksik kalan bir yoklamayı buradan sonradan girebilirsiniz.
      </p>

      <div className="mb-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tarih</label>
          <input
            type="date"
            value={seciliTarih}
            max={bugun}
            onChange={(e) => setSeciliTarih(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>

        {siniflar.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sınıf</label>
            <select
              value={seciliSinif}
              onChange={(e) => setSeciliSinif(e.target.value)}
              className="w-full min-w-[220px] px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
            >
              {siniflar.map((s) => (
                <option key={s.id} value={s.id}>{s.ad}</option>
              ))}
            </select>
          </div>
        )}

        {gununSaatleri.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ders Saati</label>
            <select
              value={seciliSaat}
              onChange={(e) => setSeciliSaat(e.target.value)}
              className="w-full min-w-[180px] px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
            >
              {gununSaatleri.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.baslangic_saat?.slice(0, 5)} – {s.bitis_saat?.slice(0, 5)}
                  {s.ders_adi ? ` — ${s.ders_adi}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {gununSaatleri.length === 1 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ders Saati</label>
            <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-700 font-medium">
              {gununSaatleri[0].baslangic_saat?.slice(0, 5)} – {gununSaatleri[0].bitis_saat?.slice(0, 5)}
              {gununSaatleri[0].ders_adi ? ` — ${gununSaatleri[0].ders_adi}` : ''}
            </p>
          </div>
        )}

        {gununSaatleri.length === 0 && seciliSinif && !loading && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ders Saati</label>
            <p className="px-3 py-2 bg-yellow-50 rounded-lg text-yellow-700 text-sm">
              Bu sınıfın seçilen tarihte ({GUNLER[seciliGunNo]}) programlı dersi yok, yine de genel yoklama girebilirsiniz.
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mb-3">{seciliTarihBasligi} için yoklama.</p>

      {loading && <p className="text-gray-400">Yükleniyor...</p>}

      {!loading && ogrenciler.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {ogrenciler.map((o) => {
              const geldi = yoklamaKayitlari[o.id] ?? true
              return (
                <div key={o.id} className="px-4 py-3 flex items-center justify-between">
                  <p className="font-medium text-gray-800">{o.ad_soyad}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => isaretle(o.id, true)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        geldi ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      Geldi
                    </button>
                    <button
                      onClick={() => isaretle(o.id, false)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        !geldi ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      Gelmedi
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="px-4 py-4 bg-gray-50 border-t border-gray-100">
            <button
              onClick={kaydet}
              disabled={kaydediliyor}
              className="bg-navy text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-blue transition-colors disabled:opacity-50"
            >
              {kaydediliyor ? 'Kaydediliyor...' : 'Yoklamayı Kaydet'}
            </button>
          </div>
        </div>
      )}

      {!loading && ogrenciler.length === 0 && seciliSinif && (
        <p className="text-gray-400">Bu sınıfa henüz öğrenci eklenmemiş.</p>
      )}
    </div>
  )
}
