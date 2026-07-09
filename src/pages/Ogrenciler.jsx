import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Ogrenciler() {
  const [ogrenciler, setOgrenciler] = useState([])
  const [loading, setLoading] = useState(true)
  const [yeniAd, setYeniAd] = useState('')
  const [yeniTelefon, setYeniTelefon] = useState('')
  const [ekleniyor, setEkleniyor] = useState(false)
  const [filtre, setFiltre] = useState('aktif') // aktif | pasif | tumu
  const [duzenlenenId, setDuzenlenenId] = useState(null)
  const [duzenleAd, setDuzenleAd] = useState('')
  const [duzenleTelefon, setDuzenleTelefon] = useState('')

  async function yukle() {
    setLoading(true)
    const { data } = await supabase.from('ogrenciler').select('*').order('ad_soyad')
    setOgrenciler(data || [])
    setLoading(false)
  }

  useEffect(() => {
    yukle()
  }, [])

  async function ogrenciEkle(e) {
    e.preventDefault()
    if (!yeniAd.trim()) return
    setEkleniyor(true)
    const { error } = await supabase.from('ogrenciler').insert({ ad_soyad: yeniAd.trim(), telefon: yeniTelefon.trim() || null })
    setEkleniyor(false)
    if (!error) {
      setYeniAd('')
      setYeniTelefon('')
      yukle()
    } else {
      alert('Hata: ' + error.message)
    }
  }

  async function durumDegistir(ogrenciId, yeniDurum) {
    const { error } = await supabase.from('ogrenciler').update({ durum: yeniDurum }).eq('id', ogrenciId)
    if (!error) yukle()
    else alert('Hata: ' + error.message)
  }

  function duzenlemeyeBasla(o) {
    setDuzenlenenId(o.id)
    setDuzenleAd(o.ad_soyad)
    setDuzenleTelefon(o.telefon || '')
  }

  function duzenlemeyiVazgec() {
    setDuzenlenenId(null)
  }

  async function duzenlemeyiKaydet(ogrenciId) {
    if (!duzenleAd.trim()) return
    const { error } = await supabase
      .from('ogrenciler')
      .update({ ad_soyad: duzenleAd.trim(), telefon: duzenleTelefon.trim() || null })
      .eq('id', ogrenciId)
    if (!error) {
      setDuzenlenenId(null)
      yukle()
    } else {
      alert('Hata: ' + error.message)
    }
  }

  async function ogrenciSil(o) {
    const onay = confirm(
      `"${o.ad_soyad}" öğrencisini KALICI OLARAK silmek istediğinize emin misiniz?\n\n` +
      `DİKKAT: Bu işlem, bu öğrenciye ait TÜM ödeme geçmişini, sözleşmelerini, sınıf kayıtlarını ve ` +
      `yoklama kayıtlarını da kalıcı olarak silecektir. Bu işlem GERİ ALINAMAZ.\n\n` +
      `Emin değilseniz, silmek yerine "Pasif Yap" seçeneğini kullanmanızı öneririz.`
    )
    if (!onay) return
    const { error } = await supabase.from('ogrenciler').delete().eq('id', o.id)
    if (!error) yukle()
    else alert('Hata: ' + error.message)
  }

  const gosterilecekler = ogrenciler.filter((o) => {
    if (filtre === 'tumu') return true
    return (o.durum || 'aktif') === filtre
  })

  const aktifSayisi = ogrenciler.filter((o) => (o.durum || 'aktif') === 'aktif').length
  const pasifSayisi = ogrenciler.filter((o) => o.durum === 'pasif').length

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">Öğrenciler</h1>

      <form onSubmit={ogrenciEkle} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Öğrenci Adı Soyadı</label>
          <input
            value={yeniAd}
            onChange={(e) => setYeniAd(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
            placeholder="Ad Soyad"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Telefon (opsiyonel)</label>
          <input
            value={yeniTelefon}
            onChange={(e) => setYeniTelefon(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
            placeholder="905XXXXXXXXX"
          />
        </div>
        <button
          type="submit"
          disabled={ekleniyor}
          className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {ekleniyor ? 'Ekleniyor...' : 'Öğrenci Ekle'}
        </button>
      </form>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFiltre('aktif')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filtre === 'aktif' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          Aktif ({aktifSayisi})
        </button>
        <button
          onClick={() => setFiltre('pasif')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filtre === 'pasif' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          Pasif ({pasifSayisi})
        </button>
        <button
          onClick={() => setFiltre('tumu')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filtre === 'tumu' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          Tümü ({ogrenciler.length})
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy text-white text-left">
              <th className="px-4 py-3 font-semibold">Ad Soyad</th>
              <th className="px-4 py-3 font-semibold">Telefon</th>
              <th className="px-4 py-3 font-semibold">Durum</th>
              <th className="px-4 py-3 font-semibold text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Yükleniyor...</td></tr>
            )}
            {!loading && gosterilecekler.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Bu filtrede öğrenci bulunamadı.</td></tr>
            )}
            {gosterilecekler.map((o, i) => {
              const durum = o.durum || 'aktif'
              const duzenleniyor = duzenlenenId === o.id

              if (duzenleniyor) {
                return (
                  <tr key={o.id} className="bg-blue-50">
                    <td className="px-4 py-2">
                      <input
                        value={duzenleAd}
                        onChange={(e) => setDuzenleAd(e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={duzenleTelefon}
                        onChange={(e) => setDuzenleTelefon(e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                        placeholder="905XXXXXXXXX"
                      />
                    </td>
                    <td className="px-4 py-2 text-gray-400 text-xs">—</td>
                    <td className="px-4 py-2 text-right space-x-3 whitespace-nowrap">
                      <button onClick={() => duzenlemeyiKaydet(o.id)} className="text-green-600 text-sm font-semibold hover:underline">
                        Kaydet
                      </button>
                      <button onClick={duzenlemeyiVazgec} className="text-gray-500 text-sm hover:underline">
                        Vazgeç
                      </button>
                    </td>
                  </tr>
                )
              }

              return (
                <tr key={o.id} className={i % 2 ? 'bg-gray-50' : ''}>
                  <td className="px-4 py-3 font-medium text-gray-800">{o.ad_soyad}</td>
                  <td className="px-4 py-3 text-gray-500">{o.telefon || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      durum === 'aktif' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {durum === 'aktif' ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                    <button onClick={() => duzenlemeyeBasla(o)} className="text-blue text-sm hover:underline">
                      Düzenle
                    </button>
                    {durum === 'aktif' ? (
                      <button onClick={() => durumDegistir(o.id, 'pasif')} className="text-gray-500 text-sm hover:underline">
                        Pasif Yap
                      </button>
                    ) : (
                      <button onClick={() => durumDegistir(o.id, 'aktif')} className="text-green-600 text-sm hover:underline">
                        Aktif Yap
                      </button>
                    )}
                    <button onClick={() => ogrenciSil(o)} className="text-red-500 text-sm hover:underline">
                      Sil
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        "Sil" işlemi geri alınamaz ve öğrencinin tüm ödeme/sözleşme/yoklama geçmişini de siler. Geçmiş yıldan
        sadece ödeme takibi kalan öğrenciler için "Sil" yerine "Pasif Yap" kullanmanızı öneririz.
      </p>
    </div>
  )
}
