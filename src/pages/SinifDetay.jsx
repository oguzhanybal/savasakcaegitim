import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ilkHarfleriBuyukYap } from '../lib/adSoyadFormat'

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const GUNLER_KISA = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const DERS_ONERILERI = [
  'Matematik', 'Geometri', 'Türkçe/Edebiyat', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya',
  'Felsefe', 'İngilizce', 'Din Kültürü ve Ahlak Bilgisi', 'Beden Eğitimi', 'Fen Bilimleri', 'Sosyal Bilgiler',
]

function saatKisalt(s) {
  return s ? s.slice(0, 5) : s
}

function araliklarCakisiyorMu(b1, s1, b2, s2) {
  return saatKisalt(b1) < saatKisalt(s2) && saatKisalt(b2) < saatKisalt(s1)
}

export default function SinifDetay() {
  const { sinifId } = useParams()
  const [sinif, setSinif] = useState(null)
  const [kayitliOgrenciler, setKayitliOgrenciler] = useState([])
  const [tumOgrenciler, setTumOgrenciler] = useState([])
  const [program, setProgram] = useState([])
  const [tumProgram, setTumProgram] = useState([]) // çakışma kontrolü için tüm sınıfların programı
  const [bireBirAtamalari, setBireBirAtamalari] = useState([]) // çakışma kontrolü için haftalık bire bir dersleri
  const [ogretmenler, setOgretmenler] = useState([])
  const [seciliOgrenciler, setSeciliOgrenciler] = useState([])
  const [ogrenciArama, setOgrenciArama] = useState('')
  const [ogrenciEkleniyor, setOgrenciEkleniyor] = useState(false)
  const [seciliGunler, setSeciliGunler] = useState([])
  const [baslangic, setBaslangic] = useState('09:00')
  const [bitis, setBitis] = useState('10:00')
  const [dersAdi, setDersAdi] = useState('')
  const [dersOgretmen, setDersOgretmen] = useState('')
  const [hata, setHata] = useState('')
  const [ekleniyor, setEkleniyor] = useState(false)
  const [loading, setLoading] = useState(true)

  async function yukle() {
    setLoading(true)
    const [s, so, o, p, tp, og, bb] = await Promise.all([
      supabase.from('siniflar').select('*').eq('id', sinifId).single(),
      supabase.from('sinif_ogrenciler').select('ogrenciler(id, ad_soyad)').eq('sinif_id', sinifId),
      supabase.from('ogrenciler').select('*').order('ad_soyad'),
      supabase
        .from('ders_programi')
        .select('*, profiles:ogretmen_profile_id(ad_soyad)')
        .eq('sinif_id', sinifId)
        .order('gun')
        .order('baslangic_saat'),
      supabase.from('ders_programi').select('*').order('gun'),
      supabase.from('profiles').select('*').eq('rol', 'ogretmen').order('ad_soyad'),
      // Ders saati eklerken öğretmenin haftalık bire bir dersleriyle de çakışma
      // kontrolü yapılabilsin diye (aksi halde bir öğretmene, zaten bire bir dersi
      // olan bir saatte sınıf dersi de atanabiliyordu).
      supabase.from('bire_bir_atamalari').select('*, ogrenciler(ad_soyad)'),
    ])
    setSinif(s.data)
    setKayitliOgrenciler((so.data || []).map((r) => r.ogrenciler).filter(Boolean))
    setTumOgrenciler(o.data || [])
    setProgram(p.data || [])
    setTumProgram(tp.data || [])
    setOgretmenler(og.data || [])
    setBireBirAtamalari(
      (bb.data || []).map((a) => ({ ...a, ogrenci_adi: a.ogrenciler?.ad_soyad }))
    )
    setLoading(false)
  }

  useEffect(() => {
    yukle()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinifId])

  const kayitliIdler = new Set(kayitliOgrenciler.map((o) => o.id))
  const eklenebilirOgrenciler = tumOgrenciler.filter(
    (o) => !kayitliIdler.has(o.id) && (o.durum || 'aktif') === 'aktif'
  )
  const filtreliEklenebilirOgrenciler = eklenebilirOgrenciler.filter((o) =>
    o.ad_soyad.toLocaleLowerCase('tr-TR').includes(ogrenciArama.toLocaleLowerCase('tr-TR'))
  )

  function ogrenciSecimiDegistir(id) {
    setSeciliOgrenciler((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function ogrenciTumunuSecFiltrelenen() {
    setSeciliOgrenciler((prev) => Array.from(new Set([...prev, ...filtreliEklenebilirOgrenciler.map((o) => o.id)])))
  }

  function ogrenciSeciminiTemizle() {
    setSeciliOgrenciler([])
  }

  async function ogrencileriEkle() {
    if (seciliOgrenciler.length === 0) return
    setOgrenciEkleniyor(true)
    const kayitlar = seciliOgrenciler.map((id) => ({ sinif_id: sinifId, ogrenci_id: id }))
    const { error } = await supabase.from('sinif_ogrenciler').insert(kayitlar)
    setOgrenciEkleniyor(false)
    if (!error) {
      setSeciliOgrenciler([])
      setOgrenciArama('')
      yukle()
    } else {
      alert('Hata: ' + error.message)
    }
  }

  async function ogrenciCikar(ogrenciId) {
    if (!confirm('Bu öğrenciyi sınıftan çıkarmak istediğinize emin misiniz?')) return
    const { error } = await supabase.from('sinif_ogrenciler').delete().eq('sinif_id', sinifId).eq('ogrenci_id', ogrenciId)
    if (!error) yukle()
    else alert('Hata: ' + error.message)
  }

  function gunSecToggle(g) {
    setSeciliGunler((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))
  }

  // Seçilen her gün için: aynı sınıfta, aynı öğretmende BAŞKA bir sınıf dersinde
  // ya da öğretmenin haftalık bire bir dersinde çakışma var mı?
  function cakismaBul(gun) {
    for (const p of tumProgram) {
      if (p.gun !== gun) continue
      const ayniSinif = p.sinif_id === sinifId
      const ayniOgretmen = !!dersOgretmen && p.ogretmen_profile_id === dersOgretmen
      if (!ayniSinif && !ayniOgretmen) continue
      if (!araliklarCakisiyorMu(baslangic, bitis, p.baslangic_saat, p.bitis_saat)) continue
      return { tur: ayniSinif ? 'sinif' : 'ogretmen', gun }
    }
    if (dersOgretmen) {
      for (const a of bireBirAtamalari) {
        if (!a.aktif || a.gun !== gun || a.ogretmen_profile_id !== dersOgretmen) continue
        if (!araliklarCakisiyorMu(baslangic, bitis, a.baslangic_saat, a.bitis_saat)) continue
        return { tur: 'birebir', gun, ogrenciAdi: a.ogrenci_adi }
      }
    }
    return null
  }

  async function dersSaatiEkle(e) {
    e.preventDefault()
    setHata('')
    if (seciliGunler.length === 0) {
      setHata('Lütfen en az bir gün seçin.')
      return
    }
    if (baslangic >= bitis) {
      setHata('Başlangıç saati bitiş saatinden önce olmalı.')
      return
    }

    for (const g of seciliGunler) {
      const cakisma = cakismaBul(g)
      if (cakisma) {
        setHata(
          cakisma.tur === 'ogretmen'
            ? `Çakışma var: bu öğretmenin ${GUNLER[g]} günü ${saatKisalt(baslangic)}–${saatKisalt(bitis)} arasında zaten başka bir dersi var.`
            : cakisma.tur === 'birebir'
            ? `Çakışma var: bu öğretmenin ${GUNLER[g]} günü ${saatKisalt(baslangic)}–${saatKisalt(bitis)} arasında "${cakisma.ogrenciAdi || 'bir öğrenci'}" ile haftalık bire bir dersi var.`
            : `Çakışma var: bu sınıfın ${GUNLER[g]} günü ${saatKisalt(baslangic)}–${saatKisalt(bitis)} arasında zaten başka bir dersi var.`
        )
        return
      }
    }

    setEkleniyor(true)
    const kayitlar = seciliGunler.map((g) => ({
      sinif_id: sinifId,
      gun: g,
      baslangic_saat: baslangic,
      bitis_saat: bitis,
      ders_adi: dersAdi.trim() ? ilkHarfleriBuyukYap(dersAdi.trim()) : null,
      ogretmen_profile_id: dersOgretmen || null,
    }))
    const { error } = await supabase.from('ders_programi').insert(kayitlar)
    setEkleniyor(false)
    if (!error) {
      setSeciliGunler([])
      yukle()
    } else {
      setHata('Hata: ' + error.message)
    }
  }

  async function dersSaatiSil(id) {
    const { error } = await supabase.from('ders_programi').delete().eq('id', id)
    if (!error) yukle()
    else alert('Hata: ' + error.message)
  }

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>
  if (!sinif) return <p className="text-gray-400">Sınıf bulunamadı.</p>

  return (
    <div>
      <Link to="/siniflar" className="text-sm text-blue hover:underline mb-3 inline-block">← Sınıflara Dön</Link>
      <h1 className="text-2xl font-bold text-navy mb-1">{sinif.ad}</h1>
      <p className="text-gray-500 mb-6">{sinif.egitim_yili}</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ÖĞRENCİLER */}
        <div>
          <h2 className="font-semibold text-gray-700 mb-3">Öğrenciler ({kayitliOgrenciler.length})</h2>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
            <input
              type="text"
              value={ogrenciArama}
              onChange={(e) => setOgrenciArama(e.target.value)}
              placeholder="Öğrenci ara..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue text-sm mb-2"
            />
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={ogrenciTumunuSecFiltrelenen} className="text-xs text-blue hover:underline">
                Filtredekilerin Tümünü Seç
              </button>
              {seciliOgrenciler.length > 0 && (
                <button type="button" onClick={ogrenciSeciminiTemizle} className="text-xs text-gray-400 hover:underline">
                  Seçimi Temizle
                </button>
              )}
            </div>
            <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100 mb-3">
              {filtreliEklenebilirOgrenciler.length === 0 && (
                <p className="px-3 py-4 text-center text-gray-400 text-sm">Eklenebilecek öğrenci bulunamadı.</p>
              )}
              {filtreliEklenebilirOgrenciler.map((o) => (
                <label key={o.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={seciliOgrenciler.includes(o.id)}
                    onChange={() => ogrenciSecimiDegistir(o.id)}
                  />
                  <span className="text-gray-800">{o.ad_soyad}</span>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={ogrencileriEkle}
              disabled={seciliOgrenciler.length === 0 || ogrenciEkleniyor}
              className="w-full bg-orange text-white font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {ogrenciEkleniyor
                ? 'Ekleniyor...'
                : seciliOgrenciler.length > 1
                ? `${seciliOgrenciler.length} Öğrenciyi Ekle`
                : 'Seçileni Ekle'}
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {kayitliOgrenciler.length === 0 && (
              <p className="px-4 py-6 text-center text-gray-400 text-sm">Bu sınıfa henüz öğrenci eklenmedi.</p>
            )}
            {kayitliOgrenciler.map((o, i) => (
              <div key={o.id} className={`px-4 py-3 flex items-center justify-between ${i % 2 ? 'bg-gray-50' : ''}`}>
                <span className="font-medium text-gray-800">{o.ad_soyad}</span>
                <button onClick={() => ogrenciCikar(o.id)} className="text-red-500 text-sm hover:underline">
                  Çıkar
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* DERS PROGRAMI */}
        <div>
          <h2 className="font-semibold text-gray-700 mb-3">Ders Saatleri</h2>

          <form onSubmit={dersSaatiEkle} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Ders Adı</label>
                <input
                  list="ders-onerileri"
                  value={dersAdi}
                  onChange={(e) => setDersAdi(e.target.value)}
                  placeholder="örn. Matematik"
                  className="w-full px-2 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue text-sm"
                />
                <datalist id="ders-onerileri">
                  {DERS_ONERILERI.map((d) => <option key={d} value={d} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Öğretmen</label>
                <select
                  value={dersOgretmen}
                  onChange={(e) => setDersOgretmen(e.target.value)}
                  className="w-full px-2 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue text-sm"
                >
                  <option value="">Seçiniz...</option>
                  {ogretmenler.map((o) => (
                    <option key={o.id} value={o.id}>{o.brans ? `${o.ad_soyad} — ${o.brans}` : o.ad_soyad}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Günler (birden fazla seçebilirsiniz)</label>
              <div className="flex flex-wrap gap-2">
                {GUNLER.slice(1).map((g, i) => {
                  const gunNo = i + 1
                  const secili = seciliGunler.includes(gunNo)
                  return (
                    <button
                      key={gunNo}
                      type="button"
                      onClick={() => gunSecToggle(gunNo)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        secili
                          ? 'bg-navy text-white border-navy'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-navy'
                      }`}
                    >
                      {GUNLER_KISA[gunNo]}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Başlangıç</label>
                <input
                  type="time"
                  value={baslangic}
                  onChange={(e) => setBaslangic(e.target.value)}
                  className="w-full px-2 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Bitiş</label>
                <input
                  type="time"
                  value={bitis}
                  onChange={(e) => setBitis(e.target.value)}
                  className="w-full px-2 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue text-sm"
                />
              </div>
            </div>
            {hata && <p className="text-red-600 text-sm">{hata}</p>}
            <button
              type="submit"
              disabled={ekleniyor}
              className="w-full bg-navy text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue transition-colors disabled:opacity-50"
            >
              {ekleniyor
                ? 'Ekleniyor...'
                : seciliGunler.length > 1
                ? `${seciliGunler.length} Güne Birden Ekle`
                : 'Ders Saati Ekle'}
            </button>
          </form>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {program.length === 0 && (
              <p className="px-4 py-6 text-center text-gray-400 text-sm">Henüz ders saati belirlenmedi.</p>
            )}
            {program.map((p, i) => (
              <div key={p.id} className={`px-4 py-3 flex items-center justify-between ${i % 2 ? 'bg-gray-50' : ''}`}>
                <div>
                  <p className="font-medium text-gray-800">
                    {p.ders_adi || 'Ders'} <span className="font-normal text-gray-400">— {GUNLER[p.gun]} · {saatKisalt(p.baslangic_saat)}–{saatKisalt(p.bitis_saat)}</span>
                  </p>
                  {p.profiles?.ad_soyad && <p className="text-xs text-gray-400">{p.profiles.ad_soyad}</p>}
                </div>
                <button onClick={() => dersSaatiSil(p.id)} className="text-red-500 text-sm hover:underline shrink-0">
                  Sil
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
