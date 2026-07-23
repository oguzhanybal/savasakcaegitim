import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import KonuTakipBolumu from '../components/KonuTakipBolumu'

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

export default function Yoklama() {
  const { profile } = useAuth()
  const [siniflar, setSiniflar] = useState([])
  const [seciliSinif, setSeciliSinif] = useState('')
  const [gununSaatleri, setGununSaatleri] = useState([])
  const [seciliSaat, setSeciliSaat] = useState('')
  const [ogrenciler, setOgrenciler] = useState([])
  const [yoklamaBugun, setYoklamaBugun] = useState({})
  const [loading, setLoading] = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const bugun = new Date().toISOString().slice(0, 10)
  const bugunGunNo = ((new Date().getDay() + 6) % 7) + 1 // Pazartesi=1 ... Pazar=7

  useEffect(() => {
    supabase.from('siniflar').select('*').then(({ data }) => {
      setSiniflar(data || [])
      if (data && data.length > 0) setSeciliSinif(data[0].id)
      else setLoading(false)
    })
  }, [])

  // Seçili sınıfın BUGÜNKÜ ders saatlerini getir
  useEffect(() => {
    if (!seciliSinif) return
    supabase
      .from('ders_programi')
      .select('*')
      .eq('sinif_id', seciliSinif)
      .eq('gun', bugunGunNo)
      .order('baslangic_saat')
      .then(({ data }) => {
        setGununSaatleri(data || [])
        setSeciliSaat(data && data.length > 0 ? data[0].id : '')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seciliSinif])

  useEffect(() => {
    if (!seciliSinif) return
    setLoading(true)
    Promise.all([
      supabase
        .from('sinif_ogrenciler')
        .select('ogrenciler(id, ad_soyad)')
        .eq('sinif_id', seciliSinif),
      seciliSaat
        ? supabase.from('yoklama').select('*').eq('ders_programi_id', seciliSaat).eq('tarih', bugun)
        : supabase.from('yoklama').select('*').eq('sinif_id', seciliSinif).eq('tarih', bugun).is('ders_programi_id', null),
    ]).then(([so, y]) => {
      const liste = (so.data || []).map((r) => r.ogrenciler).filter(Boolean)
      setOgrenciler(liste)
      const mevcut = {}
      ;(y.data || []).forEach((k) => {
        mevcut[k.ogrenci_id] = k.geldi
      })
      setYoklamaBugun(mevcut)
      setLoading(false)
    })
  }, [seciliSinif, seciliSaat])

  function isaretle(ogrenciId, geldi) {
    setYoklamaBugun((prev) => ({ ...prev, [ogrenciId]: geldi }))
  }

  async function kaydet() {
    setKaydediliyor(true)
    const kayitlar = ogrenciler.map((o) => ({
      sinif_id: seciliSinif,
      ders_programi_id: seciliSaat || null,
      ogrenci_id: o.id,
      tarih: bugun,
      geldi: yoklamaBugun[o.id] ?? true,
    }))
    const { error } = await supabase
      .from('yoklama')
      .upsert(kayitlar, { onConflict: seciliSaat ? 'ders_programi_id,ogrenci_id,tarih' : 'sinif_id,ogrenci_id,tarih' })
    setKaydediliyor(false)
    if (error) alert('Hata: ' + error.message)
    else alert('Yoklama kaydedildi.')
  }

  // Konu Takip Planı — yoklama alınan ders saatinin ders_adi'sı, konular
  // tablosundaki ders_adi'yla BİREBİR aynıysa (örn. tam olarak "Türkçe",
  // "Felsefe" ya da "Din Kültürü" yazılmışsa) o ders sekmesi otomatik seçili
  // gelsin diye — TYT/AYT'ye bölünen derslerde ders saatinin adı genelde
  // sade yazıldığı için (ör. "Matematik") otomatik eşleşme olmaz, öğretmen
  // o zaman sekmeyi kendisi seçer.
  const seciliSaatDersAdi = gununSaatleri.find((s) => s.id === seciliSaat)?.ders_adi || ''

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-1">Yoklama Al</h1>
      <p className="text-gray-500 mb-6">{new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

      {siniflar.length === 0 && !loading && (
        <p className="text-gray-400">Size atanmış bir sınıf bulunamadı.</p>
      )}

      {siniflar.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-4">
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

          {gununSaatleri.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bugünkü Ders Saati</label>
              <select
                value={seciliSaat}
                onChange={(e) => setSeciliSaat(e.target.value)}
                className="w-full min-w-[180px] px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
              >
                {gununSaatleri.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.baslangic_saat?.slice(0, 5)} – {s.bitis_saat?.slice(0, 5)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {gununSaatleri.length === 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bugünkü Ders Saati</label>
              <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-700 font-medium">
                {gununSaatleri[0].baslangic_saat?.slice(0, 5)} – {gununSaatleri[0].bitis_saat?.slice(0, 5)}
              </p>
            </div>
          )}

          {gununSaatleri.length === 0 && seciliSinif && !loading && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bugünkü Ders Saati</label>
              <p className="px-3 py-2 bg-yellow-50 rounded-lg text-yellow-700 text-sm">
                Bu sınıfın bugün ({GUNLER[bugunGunNo]}) programlı dersi yok, yine de genel yoklama alabilirsiniz.
              </p>
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-gray-400">Yükleniyor...</p>}

      {!loading && ogrenciler.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {ogrenciler.map((o) => {
              const geldi = yoklamaBugun[o.id] ?? true
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

      {/* KONU TAKİP PLANI — yoklama alırken, o an bu sınıfta işlenen/işlenmiş
          konuyu da tek ekrandan işaretleyebilsin diye. Öğretmen sadece kendi
          verdiği sınıflarda güncelleyebilir (bkz. RLS: sinif_konu_durumu). */}
      {!loading && seciliSinif && (
        <div className="mt-6">
          <h2 className="font-semibold text-gray-700 mb-3">Bu Derste İşlenen Konu</h2>
          <KonuTakipBolumu sinifId={seciliSinif} profile={profile} varsayilanDers={seciliSaatDersAdi} />
        </div>
      )}
    </div>
  )
}
