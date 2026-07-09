import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

export default function SinifDetay() {
  const { sinifId } = useParams()
  const [sinif, setSinif] = useState(null)
  const [kayitliOgrenciler, setKayitliOgrenciler] = useState([])
  const [tumOgrenciler, setTumOgrenciler] = useState([])
  const [program, setProgram] = useState([])
  const [seciliOgrenci, setSeciliOgrenci] = useState('')
  const [gun, setGun] = useState('1')
  const [baslangic, setBaslangic] = useState('09:00')
  const [bitis, setBitis] = useState('10:00')
  const [loading, setLoading] = useState(true)

  async function yukle() {
    setLoading(true)
    const [s, so, o, p] = await Promise.all([
      supabase.from('siniflar').select('*').eq('id', sinifId).single(),
      supabase.from('sinif_ogrenciler').select('ogrenciler(id, ad_soyad)').eq('sinif_id', sinifId),
      supabase.from('ogrenciler').select('*').order('ad_soyad'),
      supabase.from('ders_programi').select('*').eq('sinif_id', sinifId).order('gun').order('baslangic_saat'),
    ])
    setSinif(s.data)
    setKayitliOgrenciler((so.data || []).map((r) => r.ogrenciler).filter(Boolean))
    setTumOgrenciler(o.data || [])
    setProgram(p.data || [])
    setLoading(false)
  }

  useEffect(() => {
    yukle()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinifId])

  const kayitliIdler = new Set(kayitliOgrenciler.map((o) => o.id))
  const eklenebilirOgrenciler = tumOgrenciler.filter((o) => !kayitliIdler.has(o.id))

  async function ogrenciEkle(e) {
    e.preventDefault()
    if (!seciliOgrenci) return
    const { error } = await supabase.from('sinif_ogrenciler').insert({ sinif_id: sinifId, ogrenci_id: seciliOgrenci })
    if (!error) {
      setSeciliOgrenci('')
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

  async function dersSaatiEkle(e) {
    e.preventDefault()
    const { error } = await supabase.from('ders_programi').insert({
      sinif_id: sinifId,
      gun: Number(gun),
      baslangic_saat: baslangic,
      bitis_saat: bitis,
    })
    if (!error) {
      yukle()
    } else {
      alert('Hata: ' + error.message)
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

          <form onSubmit={ogrenciEkle} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 flex gap-2">
            <select
              value={seciliOgrenci}
              onChange={(e) => setSeciliOgrenci(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
            >
              <option value="">Öğrenci seçin...</option>
              {eklenebilirOgrenciler.map((o) => (
                <option key={o.id} value={o.id}>{o.ad_soyad}</option>
              ))}
            </select>
            <button type="submit" className="bg-orange text-white font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap">
              Ekle
            </button>
          </form>

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
            <div className="grid grid-cols-3 gap-2">
              <select
                value={gun}
                onChange={(e) => setGun(e.target.value)}
                className="px-2 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white text-sm"
              >
                {GUNLER.slice(1).map((g, i) => (
                  <option key={i + 1} value={i + 1}>{g}</option>
                ))}
              </select>
              <input
                type="time"
                value={baslangic}
                onChange={(e) => setBaslangic(e.target.value)}
                className="px-2 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue text-sm"
              />
              <input
                type="time"
                value={bitis}
                onChange={(e) => setBitis(e.target.value)}
                className="px-2 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue text-sm"
              />
            </div>
            <button type="submit" className="w-full bg-navy text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue transition-colors">
              Ders Saati Ekle
            </button>
          </form>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {program.length === 0 && (
              <p className="px-4 py-6 text-center text-gray-400 text-sm">Henüz ders saati belirlenmedi.</p>
            )}
            {program.map((p, i) => (
              <div key={p.id} className={`px-4 py-3 flex items-center justify-between ${i % 2 ? 'bg-gray-50' : ''}`}>
                <span className="font-medium text-gray-800">
                  {GUNLER[p.gun]} · {p.baslangic_saat?.slice(0, 5)} – {p.bitis_saat?.slice(0, 5)}
                </span>
                <button onClick={() => dersSaatiSil(p.id)} className="text-red-500 text-sm hover:underline">
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
