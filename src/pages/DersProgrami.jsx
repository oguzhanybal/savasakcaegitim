import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const GUNLER_KISA = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const DERS_ONERILERI = [
  'Matematik', 'Türk Dili ve Edebiyatı', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya',
  'Felsefe', 'İngilizce', 'Din Kültürü ve Ahlak Bilgisi', 'Beden Eğitimi', 'Fen Bilimleri', 'Sosyal Bilgiler',
]

function saatKisalt(s) {
  return s ? s.slice(0, 5) : s
}

function araliklarCakisiyorMu(b1, s1, b2, s2) {
  return saatKisalt(b1) < saatKisalt(s2) && saatKisalt(b2) < saatKisalt(s1)
}

// Yeni eklenmek istenen ders saatinin, mevcut programla (aynı sınıf ya da aynı
// öğretmen üzerinden — öğretmen artık ders_programi satırından okunuyor) çakışıp
// çakışmadığını kontrol eder.
function cakismaBul({ sinifId, gun, baslangic, bitis, ogretmenId }, program) {
  if (!sinifId || !baslangic || !bitis) return null

  for (const p of program) {
    if (p.gun !== gun) continue
    const ayniSinif = p.sinif_id === sinifId
    const ayniOgretmen = !!ogretmenId && p.ogretmen_profile_id === ogretmenId
    if (!ayniSinif && !ayniOgretmen) continue
    if (!araliklarCakisiyorMu(baslangic, bitis, p.baslangic_saat, p.bitis_saat)) continue

    return {
      tur: ayniSinif ? 'sinif' : 'ogretmen',
      sinifAdi: p.sinif_adi,
      dersAdi: p.ders_adi,
      saat: `${saatKisalt(p.baslangic_saat)}–${saatKisalt(p.bitis_saat)}`,
      gun: GUNLER[p.gun],
    }
  }
  return null
}

function DersEkleForm({ siniflar, ogretmenler, program, onEklendi }) {
  const [sinifId, setSinifId] = useState('')
  const [dersAdi, setDersAdi] = useState('')
  const [ogretmenId, setOgretmenId] = useState('')
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

    const cakisma = cakismaBul({ sinifId, gun: Number(gun), baslangic, bitis, ogretmenId }, program)
    if (cakisma) {
      if (cakisma.tur === 'ogretmen') {
        setHata(
          `Çakışma var: bu öğretmen ${cakisma.gun} günü ${cakisma.saat} arasında zaten "${cakisma.dersAdi || cakisma.sinifAdi}" dersinde.`
        )
      } else {
        setHata(`Çakışma var: bu sınıfın ${cakisma.gun} günü ${cakisma.saat} arasında zaten "${cakisma.dersAdi || 'başka bir'}" dersi var.`)
      }
      return
    }

    setGonderiliyor(true)
    const { error } = await supabase.from('ders_programi').insert({
      sinif_id: sinifId,
      gun: Number(gun),
      baslangic_saat: baslangic,
      bitis_saat: bitis,
      ders_adi: dersAdi.trim() || null,
      ogretmen_profile_id: ogretmenId || null,
    })
    setGonderiliyor(false)
    if (error) {
      setHata('Hata: ' + error.message)
    } else {
      setBaslangic('')
      setBitis('')
      setDersAdi('')
      onEklendi()
    }
  }

  return (
    <form onSubmit={ekle} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
      <p className="font-semibold text-gray-700 mb-3">Yeni Ders Saati Ekle</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Sınıf</label>
          <select
            value={sinifId}
            onChange={(e) => setSinifId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            <option value="">Seçiniz...</option>
            {siniflar.map((s) => (
              <option key={s.id} value={s.id}>{s.ad}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Ders Adı</label>
          <input
            list="ders-onerileri-global"
            value={dersAdi}
            onChange={(e) => setDersAdi(e.target.value)}
            placeholder="örn. Matematik"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
          <datalist id="ders-onerileri-global">
            {DERS_ONERILERI.map((d) => <option key={d} value={d} />)}
          </datalist>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Öğretmen</label>
          <select
            value={ogretmenId}
            onChange={(e) => setOgretmenId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            <option value="">Seçiniz...</option>
            {ogretmenler.map((o) => (
              <option key={o.id} value={o.id}>{o.brans ? `${o.ad_soyad} — ${o.brans}` : o.ad_soyad}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[130px]">
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
  const [ogretmenler, setOgretmenler] = useState([])
  const [loading, setLoading] = useState(true)
  const [gorunum, setGorunum] = useState('tablo')

  function veriyiYenile() {
    setLoading(true)
    Promise.all([
      supabase
        .from('ders_programi')
        .select('*, siniflar(ad), profiles:ogretmen_profile_id(ad_soyad)')
        .order('gun')
        .order('baslangic_saat'),
      isYonetici ? supabase.from('siniflar').select('*').order('ad') : Promise.resolve({ data: [] }),
      isYonetici ? supabase.from('profiles').select('*').eq('rol', 'ogretmen').order('ad_soyad') : Promise.resolve({ data: [] }),
    ]).then(([p, s, og]) => {
      setProgram(
        (p.data || []).map((d) => ({
          ...d,
          sinif_adi: d.siniflar?.ad,
          ogretmen_adi: d.profiles?.ad_soyad,
        }))
      )
      setSiniflar(s.data || [])
      setOgretmenler(og.data || [])
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

  // Tablo görünümü için: programdaki tüm benzersiz başlangıç saatleri, sıralı satırlar olarak.
  const saatSatirlari = [...new Set(program.map((p) => saatKisalt(p.baslangic_saat)))].sort()

  function hucreDersleri(gun, saat) {
    return program.filter((p) => p.gun === gun && saatKisalt(p.baslangic_saat) === saat)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-navy">Ders Programı</h1>
        <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden text-sm">
          <button
            onClick={() => setGorunum('tablo')}
            className={`px-3 py-1.5 font-medium transition-colors ${gorunum === 'tablo' ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Tablo
          </button>
          <button
            onClick={() => setGorunum('liste')}
            className={`px-3 py-1.5 font-medium transition-colors ${gorunum === 'liste' ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Liste
          </button>
        </div>
      </div>

      {isYonetici && (
        <DersEkleForm siniflar={siniflar} ogretmenler={ogretmenler} program={program} onEklendi={veriyiYenile} />
      )}

      {loading && <p className="text-gray-400">Yükleniyor...</p>}

      {!loading && program.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-gray-400">Görüntülenecek ders programı bulunamadı.</p>
        </div>
      )}

      {!loading && program.length > 0 && gorunum === 'tablo' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="border-collapse text-sm min-w-[900px] w-full">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-navy text-white px-3 py-2.5 text-left font-semibold w-24">Saat</th>
                {GUNLER.slice(1).map((g, i) => (
                  <th key={i + 1} className="bg-navy text-white px-3 py-2.5 text-left font-semibold min-w-[150px] border-l border-white/10">
                    {GUNLER_KISA[i + 1]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {saatSatirlari.map((saat, ri) => (
                <tr key={saat} className={ri % 2 ? 'bg-gray-50/60' : ''}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 font-semibold text-gray-600 whitespace-nowrap border-t border-gray-100 text-xs">
                    {saat}
                  </td>
                  {GUNLER.slice(1).map((_, i) => {
                    const gun = i + 1
                    const dersler = hucreDersleri(gun, saat)
                    return (
                      <td key={gun} className="px-1.5 py-1.5 align-top border-t border-l border-gray-100">
                        <div className="space-y-1">
                          {dersler.map((d) => (
                            <div key={d.id} className="bg-blue-50 border border-blue-100 rounded-lg px-2 py-1 relative group">
                              <p className="font-semibold text-navy text-xs leading-tight">{d.ders_adi || d.sinif_adi}</p>
                              <p className="text-[11px] text-gray-500 leading-tight">{d.sinif_adi}</p>
                              {d.ogretmen_adi && <p className="text-[11px] text-gray-400 leading-tight">{d.ogretmen_adi}</p>}
                              <p className="text-[10px] text-gray-400 leading-tight">
                                {saatKisalt(d.baslangic_saat)}–{saatKisalt(d.bitis_saat)}
                              </p>
                              {isYonetici && (
                                <button
                                  onClick={() => sil(d.id)}
                                  className="absolute top-0.5 right-1 text-[10px] text-red-400 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  Sil
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && program.length > 0 && gorunum === 'liste' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {gunlereGore.map((dersler, i) =>
            dersler.length === 0 ? null : (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-navy text-white font-semibold">{GUNLER[i + 1]}</div>
                <div className="divide-y divide-gray-50">
                  {dersler.map((d) => (
                    <div key={d.id} className="px-4 py-3 flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-800">{d.ders_adi || d.sinif_adi}</p>
                        <p className="text-xs text-gray-400">
                          {d.sinif_adi}
                          {d.ogretmen_adi ? ` · ${d.ogretmen_adi}` : ''}
                        </p>
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
