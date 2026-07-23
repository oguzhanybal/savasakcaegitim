import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { paraFormat } from '../lib/ekstreHesap'

// Sabit bir kategori listesi öneriliyor ama serbest metin de girilebiliyor
// (kullanıcı isterse listede olmayan bir kategori de yazabilsin) — bu yüzden
// input, SinifDetay.jsx'teki "Ders Adı" alanıyla birebir aynı desende:
// <input list="..."> + <datalist>, kısıtlayıcı bir <select> DEĞİL.
const KATEGORI_ONERILERI = [
  'Kira', 'Elektrik', 'Su', 'Doğalgaz', 'İnternet/Telefon', 'Personel Maaşı',
  'SGK/Vergi', 'Kırtasiye', 'Temizlik', 'Bakım/Onarım', 'Kantin', 'Pazarlama/Reklam', 'Ulaşım', 'Diğer',
]

function bugunTarihi() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

function ayAnahtari(tarihStr) {
  const d = new Date(tarihStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function ayEtiketi(ay) {
  return new Date(ay + '-01').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
}

export default function Giderler() {
  const { profile } = useAuth()
  const [giderler, setGiderler] = useState([])
  const [loading, setLoading] = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const [tarih, setTarih] = useState(bugunTarihi())
  const [kategori, setKategori] = useState('')
  const [tutar, setTutar] = useState('')
  const [aciklama, setAciklama] = useState('')

  const [seciliAy, setSeciliAy] = useState('tumu')

  function yukle() {
    setLoading(true)
    supabase
      .from('giderler')
      .select('*')
      .order('tarih', { ascending: false })
      .then(({ data }) => {
        setGiderler(data || [])
        setLoading(false)
      })
  }

  useEffect(() => {
    yukle()
  }, [])

  async function giderEkle(e) {
    e.preventDefault()
    if (!tarih || !kategori.trim() || !tutar) return
    setKaydediliyor(true)
    const { error } = await supabase.from('giderler').insert({
      tarih,
      kategori: kategori.trim(),
      tutar: Number(tutar),
      aciklama: aciklama.trim() || null,
      ekleyen_profile_id: profile?.id || null,
    })
    setKaydediliyor(false)
    if (error) {
      alert('Hata: ' + error.message)
      return
    }
    setKategori('')
    setTutar('')
    setAciklama('')
    setTarih(bugunTarihi())
    yukle()
  }

  async function giderSil(id) {
    if (!confirm('Bu gider kaydını silmek istediğinize emin misiniz?')) return
    const { error } = await supabase.from('giderler').delete().eq('id', id)
    if (error) {
      alert('Hata: ' + error.message)
      return
    }
    setGiderler((prev) => prev.filter((g) => g.id !== id))
  }

  const aylar = useMemo(() => {
    const s = new Set(giderler.map((g) => ayAnahtari(g.tarih)))
    return [...s].sort((a, b) => (a < b ? 1 : -1))
  }, [giderler])

  const gosterilecekGiderler = useMemo(() => {
    if (seciliAy === 'tumu') return giderler
    return giderler.filter((g) => ayAnahtari(g.tarih) === seciliAy)
  }, [giderler, seciliAy])

  const buAyToplami = useMemo(() => {
    const buAy = ayAnahtari(bugunTarihi())
    return giderler
      .filter((g) => ayAnahtari(g.tarih) === buAy)
      .reduce((t, g) => t + Number(g.tutar), 0)
  }, [giderler])

  const genelToplam = useMemo(() => giderler.reduce((t, g) => t + Number(g.tutar), 0), [giderler])
  const listeToplami = useMemo(
    () => gosterilecekGiderler.reduce((t, g) => t + Number(g.tutar), 0),
    [gosterilecekGiderler]
  )

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-2">Giderler</h1>
      <p className="text-sm text-gray-500 mb-6">Kurumun tüm giderlerinin (kira, fatura, maaş vb.) kaydı.</p>

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 font-medium">Bu Ayki Toplam Gider</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{paraFormat(buAyToplami)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 font-medium">Toplam Gider (Tüm Zamanlar)</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{paraFormat(genelToplam)}</p>
        </div>
      </div>

      <form
        onSubmit={giderEkle}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6 space-y-3"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tarih</label>
            <input
              type="date"
              value={tarih}
              onChange={(e) => setTarih(e.target.value)}
              className="w-full px-2 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Kategori</label>
            <input
              list="gider-kategorileri"
              value={kategori}
              onChange={(e) => setKategori(e.target.value)}
              placeholder="örn. Kira"
              className="w-full px-2 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue text-sm"
            />
            <datalist id="gider-kategorileri">
              {KATEGORI_ONERILERI.map((k) => <option key={k} value={k} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tutar (₺)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={tutar}
              onChange={(e) => setTutar(e.target.value)}
              placeholder="0"
              className="w-full px-2 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Açıklama</label>
            <input
              type="text"
              value={aciklama}
              onChange={(e) => setAciklama(e.target.value)}
              placeholder="isteğe bağlı"
              className="w-full px-2 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue text-sm"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={kaydediliyor || !tarih || !kategori.trim() || !tutar}
          className="bg-navy text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-blue transition-colors disabled:opacity-50"
        >
          {kaydediliyor ? 'Ekleniyor...' : 'Gider Ekle'}
        </button>
      </form>

      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSeciliAy('tumu')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              seciliAy === 'tumu' ? 'bg-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Tümü
          </button>
          {aylar.map((ay) => (
            <button
              key={ay}
              type="button"
              onClick={() => setSeciliAy(ay)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                seciliAy === ay ? 'bg-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {ayEtiketi(ay)}
            </button>
          ))}
        </div>
        {gosterilecekGiderler.length > 0 && (
          <span className="text-xs text-gray-500 whitespace-nowrap">
            Listelenen toplam: <span className="font-semibold text-red-700">{paraFormat(listeToplami)}</span>
          </span>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="bg-navy text-white text-left">
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Tarih</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Kategori</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Açıklama</th>
              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Tutar</th>
              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap"></th>
            </tr>
          </thead>
          <tbody>
            {gosterilecekGiderler.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  Hiç gider kaydı yok.
                </td>
              </tr>
            )}
            {gosterilecekGiderler.map((g, i) => (
              <tr key={g.id} className={i % 2 ? 'bg-gray-50' : ''}>
                <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                  {new Date(g.tarih).toLocaleDateString('tr-TR')}
                </td>
                <td className="px-4 py-2 font-medium text-gray-800 whitespace-nowrap">{g.kategori}</td>
                <td className="px-4 py-2 text-gray-500">{g.aciklama || '—'}</td>
                <td className="px-4 py-2 text-right font-semibold text-red-700 whitespace-nowrap">
                  {paraFormat(g.tutar)}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => giderSil(g.id)}
                    className="text-gray-400 hover:text-red-600 text-xs font-medium hover:underline"
                  >
                    Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
