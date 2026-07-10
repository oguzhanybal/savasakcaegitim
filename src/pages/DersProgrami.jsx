import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

function saatKisalt(s) {
  return s ? s.slice(0, 5) : s
}

// İki zaman aralığı çakışıyor mu? (aynı gün için, "HH:MM" formatında)
function araliklarCakisiyorMu(b1, s1, b2, s2) {
  return saatKisalt(b1) < saatKisalt(s2) && saatKisalt(b2) < saatKisalt(s1)
}

// Yeni eklenmek istenen ders saatinin, mevcut programla (aynı sınıf ya da aynı öğretmen
// üzerinden) çakışıp çakışmadığını kontrol eder.
function cakismaBul({ sinifId, gun, baslangic, bitis }, program, siniflar) {
  const yeniSinif = siniflar.find((s) => s.id === sinifId)
  if (!yeniSinif || !baslangic || !bitis) return null
  const ogretmenId = yeniSinif.ogretmen_profile_id

  for (const p of program) {
    if (p.gun !== gun) continue
    const pSinif = siniflar.find((s) => s.id === p.sinif_id)
    if (!pSinif) continue

    const ayniSinif = p.sinif_id === sinifId
    const ayniOgretmen = !!ogretmenId && pSinif.ogretmen_profile_id === ogretmenId

    if (!ayniSinif && !ayniOgretmen) continue
    if (!araliklarCakisiyorMu(baslangic, bitis, p.baslangic_saat, p.bitis_saat)) continue

    return {
      tur: ayniSinif ? 'sinif' : 'ogretmen',
      sinifAdi: pSinif.ad,
      ogretmenAdi: pSinif.ogretmen_adi,
      saat: `${saatKisalt(p.baslangic_saat)}–${saatKisalt(p.bitis_saat)}`,
      gun: GUNLER[p.gun],
    }
  }
  return null
}

function DersEkleForm({ siniflar, program, onEklendi }) {
  const [sinifId, setSinifId] = useState('')
  const [gun, setGun] = useState(1)
  const [baslangic, setBaslangic] = useState('')
  const [bitis, setBitis] = useState('')
  const [hata, setHata] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)

  async function ekle(e) {
    e.preventDefault()
    setHata('')
    if (!sinifId || !baslangic || !bitis) {
      setHata('Lütfen sınıf, gün ve saat aralığını doldurun.')
      return
    }
    if (baslangic >= bitis) {
      setHata('Başlangıç saati bitiş saatinden önce olmalı.')
      return
    }

    const cakisma = cakismaBul({ sinifId, gun: Number(gun), baslangic, bitis }, program, siniflar)
    if (cakisma) {
      if (cakisma.tur === 'ogretmen') {
        setHata(
          `Çakışma var: bu öğretmen ${cakisma.gun} günü ${cakisma.saat} arasında zaten "${cakisma.sinifAdi}" dersinde.`
        )
      } else {
        setHata(`Çakışma var: bu sınıfın ${cakisma.gun} günü ${cakisma.saat} arasında zaten başka bir dersi var.`)
      }
      return
    }

    setGonderiliyor(true)
    const { error } = await supabase.from('ders_programi').insert({
      sinif_id: sinifId,
      gun: Number(gun),
      baslangic_saat: baslangic,
      bitis_saat: bitis,
    })
    setGonderiliyor(false)
    if (error) {
      setHata('Hata: ' + error.message)
    } else {
      setBaslangic('')
      setBitis('')
      onEklendi()
    }
  }

  return (
    <form onSubmit={ekle} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
      <p className="font-semibold text-gray-700 mb-3">Yeni Ders Saati Ekle</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Sınıf (Öğretmen)</label>
          <select
            value={sinifId}
            onChange={(e) => setSinifId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            <option value="">Seçiniz...</option>
            {siniflar.map((s) => (
              <option key={s.id} value={s.id}>
                {s.ad} {s.ogretmen_adi ? `— ${s.ogretmen_adi}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[130px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Gün</label>
          <select
            value={gun}
            onChange={(e) => setGun(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            {GUNLER.slice(1).map((g, i) => (
              <option key={i + 1} value={i + 1}>{g}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[110px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Başlangıç</label>
          <input
            type="time"
            value={baslangic}
            onChange={(e) => setBaslangic(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
        <div className="min-w-[110px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Bitiş</label>
          <input
            type="time"
            value={bitis}
            onChange={(e) => setBitis(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
        <button
          type="submit"
          disabled={gonderiliyor}
          className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {gonderiliyor ? 'Ekleniyor...' : 'Ekle'}
        </button>
      </div>
      {hata && <p className="text-red-600 text-sm mt-3">{hata}</p>}
    </form>
  )
}

export default function DersProgrami() {
  const { profile } = useAuth()
  const isYonetici = profile?.rol === 'yonetici'

  const [program, setProgram] = useState([])
  const [siniflar, setSiniflar] = useState([])
  const [loading, setLoading] = useState(true)

  function veriyiYenile() {
    setLoading(true)
    Promise.all([
      supabase
        .from('ders_programi')
        .select('*, siniflar(ad, ogretmen_profile_id, profiles:ogretmen_profile_id(ad_soyad))')
        .order('gun')
        .order('baslangic_saat'),
      isYonetici
        ? supabase.from('siniflar').select('*, profiles:ogretmen_profile_id(ad_soyad)').order('ad')
        : Promise.resolve({ data: [] }),
    ]).then(([p, s]) => {
      setProgram(
        (p.data || []).map((d) => ({
          ...d,
          sinif_adi: d.siniflar?.ad,
          ogretmen_adi: d.siniflar?.profiles?.ad_soyad,
        }))
      )
      setSiniflar(
        (s.data || []).map((sn) => ({ ...sn, ogretmen_adi: sn.profiles?.ad_soyad }))
      )
      setLoading(false)
    })
  }

  useEffect(() => {
    veriyiYenile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function sil(id) {
    if (!confirm('Bu ders saatini silmek istediğinize emin misiniz?')) return
    const { error } = await supabase.from('ders_programi').delete().eq('id', id)
    if (error) alert('Hata: ' + error.message)
    else veriyiYenile()
  }

  const gunlereGore = GUNLER.map((_, gun) => program.filter((p) => p.gun === gun)).slice(1)

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">Ders Programı</h1>

      {isYonetici && (
        <DersEkleForm siniflar={siniflar} program={program} onEklendi={veriyiYenile} />
      )}

      {loading && <p className="text-gray-400">Yükleniyor...</p>}

      {!loading && program.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-gray-400">Görüntülenecek ders programı bulunamadı.</p>
        </div>
      )}

      {!loading && program.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {gunlereGore.map((dersler, i) =>
            dersler.length === 0 ? null : (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-navy text-white font-semibold">{GUNLER[i + 1]}</div>
                <div className="divide-y divide-gray-50">
                  {dersler.map((d) => (
                    <div key={d.id} className="px-4 py-3 flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-800">{d.sinif_adi}</p>
                        {d.ogretmen_adi && <p className="text-xs text-gray-400">{d.ogretmen_adi}</p>}
                        <p className="text-sm text-gray-500">
                          {saatKisalt(d.baslangic_saat)} – {saatKisalt(d.bitis_saat)}
                        </p>
                      </div>
                      {isYonetici && (
                        <button
                          onClick={() => sil(d.id)}
                          className="text-xs text-red-500 hover:text-red-700 hover:underline shrink-0"
                        >
                          Sil
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
