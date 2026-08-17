import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

function bugunTarihi() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

export default function Hatirlatmalar() {
  const { profile } = useAuth()
  const [liste, setListe] = useState([])
  const [loading, setLoading] = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const [baslik, setBaslik] = useState('')
  const [tarih, setTarih] = useState(bugunTarihi())
  const [aciklama, setAciklama] = useState('')

  // "Düzenle"ye basılınca bu, düzenlenen kaydın id'sine ayarlanır — form o
  // zaman "ekleme" değil "güncelleme" moduna geçer (Giderler.jsx'teki desenin
  // aynısı). Boşsa (null) form normal "ekle" modunda çalışır.
  const [duzenlenenId, setDuzenlenenId] = useState(null)

  const [filtre, setFiltre] = useState('bekleyen')

  function yukle() {
    setLoading(true)
    supabase
      .from('hatirlatmalar')
      .select('*')
      .order('tarih', { ascending: true })
      .then(({ data }) => {
        setListe(data || [])
        setLoading(false)
      })
  }

  useEffect(() => {
    yukle()
  }, [])

  async function ekle(e) {
    e.preventDefault()
    if (!baslik.trim() || !tarih) return
    setKaydediliyor(true)
    const veri = {
      baslik: baslik.trim(),
      tarih,
      aciklama: aciklama.trim() || null,
    }
    const { error } = duzenlenenId
      ? await supabase.from('hatirlatmalar').update(veri).eq('id', duzenlenenId)
      : await supabase.from('hatirlatmalar').insert({ ...veri, ekleyen_profile_id: profile?.id || null })
    setKaydediliyor(false)
    if (error) {
      alert('Hata: ' + error.message)
      return
    }
    setDuzenlenenId(null)
    setBaslik('')
    setAciklama('')
    setTarih(bugunTarihi())
    yukle()
  }

  function duzenle(h) {
    setDuzenlenenId(h.id)
    setBaslik(h.baslik || '')
    setTarih(h.tarih)
    setAciklama(h.aciklama || '')
    requestAnimationFrame(() => {
      document.getElementById('hatirlatma-formu')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function duzenlemeyiIptalEt() {
    setDuzenlenenId(null)
    setBaslik('')
    setAciklama('')
    setTarih(bugunTarihi())
  }

  async function durumDegistir(h) {
    const { error } = await supabase
      .from('hatirlatmalar')
      .update({ tamamlandi: !h.tamamlandi })
      .eq('id', h.id)
    if (error) {
      alert('Hata: ' + error.message)
      return
    }
    setListe((prev) => prev.map((x) => (x.id === h.id ? { ...x, tamamlandi: !h.tamamlandi } : x)))
  }

  async function sil(id) {
    if (!confirm('Bu hatırlatmayı silmek istediğinize emin misiniz?')) return
    const { error } = await supabase.from('hatirlatmalar').delete().eq('id', id)
    if (error) {
      alert('Hata: ' + error.message)
      return
    }
    if (duzenlenenId === id) duzenlemeyiIptalEt()
    setListe((prev) => prev.filter((x) => x.id !== id))
  }

  const bugun = bugunTarihi()

  // "Bekleyen" = henüz tamamlanmamış olan HER şey (tarihi geçmiş olsun ya da
  // olmasın) — Layout.jsx'teki kırmızı rozet de aynı tanımı kullanıyor, o
  // yüzden burada gösterilen sayı ile menüdeki rozet birebir eşleşiyor.
  const bekleyenler = useMemo(
    () => liste.filter((h) => !h.tamamlandi).sort((a, b) => (a.tarih < b.tarih ? -1 : 1)),
    [liste]
  )
  const tamamlananlar = useMemo(() => liste.filter((h) => h.tamamlandi), [liste])

  const gosterilecek = useMemo(() => {
    if (filtre === 'bekleyen') return bekleyenler
    if (filtre === 'tamamlanan') return tamamlananlar
    return liste
  }, [filtre, bekleyenler, tamamlananlar, liste])

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-2">Hatırlatmalar</h1>
      <p className="text-sm text-gray-500 mb-6">
        İleri tarihli ya da henüz sisteme işleyemediğiniz işler için not bırakın — tarihi gelince sol
        menüdeki rozette görünür.
      </p>

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 font-medium">Bekleyen Hatırlatma</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{bekleyenler.length}</p>
        </div>
      </div>

      <form
        id="hatirlatma-formu"
        onSubmit={ekle}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6 space-y-3"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Başlık</label>
            <input
              type="text"
              value={baslik}
              onChange={(e) => setBaslik(e.target.value)}
              placeholder="örn. Ahmet'in sözleşmesini işle"
              className="w-full px-2 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue text-sm"
            />
          </div>
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
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={kaydediliyor || !baslik.trim() || !tarih}
            className={`text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 ${
              duzenlenenId ? 'bg-orange hover:opacity-90' : 'bg-navy hover:bg-blue'
            }`}
          >
            {kaydediliyor
              ? duzenlenenId
                ? 'Güncelleniyor...'
                : 'Ekleniyor...'
              : duzenlenenId
              ? 'Güncelle'
              : 'Hatırlatma Ekle'}
          </button>
          {duzenlenenId && (
            <button
              type="button"
              onClick={duzenlemeyiIptalEt}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100"
            >
              Vazgeç
            </button>
          )}
        </div>
      </form>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {[
          ['bekleyen', `Bekleyen (${bekleyenler.length})`],
          ['tamamlanan', `Tamamlanan (${tamamlananlar.length})`],
          ['tumu', 'Tümü'],
        ].map(([anahtar, etiket]) => (
          <button
            key={anahtar}
            type="button"
            onClick={() => setFiltre(anahtar)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filtre === anahtar ? 'bg-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {etiket}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto" style={{ touchAction: 'pan-x pan-y' }}>
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="bg-navy text-white text-left">
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Tarih</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Başlık</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Açıklama</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Durum</th>
              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap"></th>
            </tr>
          </thead>
          <tbody>
            {gosterilecek.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  Hiç hatırlatma yok.
                </td>
              </tr>
            )}
            {gosterilecek.map((h, i) => {
              const gecmis = !h.tamamlandi && h.tarih <= bugun
              return (
                <tr key={h.id} className={i % 2 ? 'bg-gray-50' : ''}>
                  <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                    {new Date(h.tarih).toLocaleDateString('tr-TR')}
                  </td>
                  <td className="px-4 py-2 font-medium text-gray-800">{h.baslik}</td>
                  <td className="px-4 py-2 text-gray-500">{h.aciklama || '—'}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {h.tamamlandi ? (
                      <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-full">
                        Tamamlandı
                      </span>
                    ) : gecmis ? (
                      <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-1 rounded-full">
                        Bekliyor
                      </span>
                    ) : (
                      <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                        Yaklaşıyor
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap space-x-3">
                    <button
                      type="button"
                      onClick={() => durumDegistir(h)}
                      className="text-gray-400 hover:text-green-600 text-xs font-medium hover:underline"
                    >
                      {h.tamamlandi ? 'Bekliyor Yap' : 'Tamamlandı'}
                    </button>
                    <button
                      type="button"
                      onClick={() => duzenle(h)}
                      className="text-gray-400 hover:text-navy text-xs font-medium hover:underline"
                    >
                      Düzenle
                    </button>
                    <button
                      type="button"
                      onClick={() => sil(h.id)}
                      className="text-gray-400 hover:text-red-600 text-xs font-medium hover:underline"
                    >
                      Sil
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
