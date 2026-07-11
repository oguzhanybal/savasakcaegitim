import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { adSoyadDuzelt } from '../lib/adSoyadFormat'

const BRANSLAR = [
  'Matematik', 'Türkçe', 'Fen Bilimleri', 'Sosyal Bilgiler', 'İngilizce',
  'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya', 'Din Kültürü',
  'Beden Eğitimi', 'Müzik', 'Görsel Sanatlar', 'Bilişim Teknolojileri', 'Diğer',
]

export default function Ogretmenler() {
  const [ogretmenler, setOgretmenler] = useState([])
  const [loading, setLoading] = useState(true)
  const [duzenlenenId, setDuzenlenenId] = useState(null)
  const [duzenleAd, setDuzenleAd] = useState('')
  const [duzenleTelefon, setDuzenleTelefon] = useState('')
  const [duzenleBrans, setDuzenleBrans] = useState('')

  async function yukle() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('rol', 'ogretmen').order('ad_soyad')
    setOgretmenler(data || [])
    setLoading(false)
  }

  useEffect(() => {
    yukle()
  }, [])

  function duzenlemeyeBasla(o) {
    setDuzenlenenId(o.id)
    setDuzenleAd(o.ad_soyad)
    setDuzenleTelefon(o.telefon || '')
    setDuzenleBrans(o.brans || '')
  }

  function duzenlemeyiVazgec() {
    setDuzenlenenId(null)
  }

  async function duzenlemeyiKaydet(id) {
    if (!duzenleAd.trim()) return
    const { error } = await supabase
      .from('profiles')
      .update({ ad_soyad: adSoyadDuzelt(duzenleAd), telefon: duzenleTelefon.trim() || null, brans: duzenleBrans || null })
      .eq('id', id)
    if (!error) {
      setDuzenlenenId(null)
      yukle()
    } else {
      alert('Hata: ' + error.message)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">Öğretmenler</h1>

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4 text-sm text-yellow-800">
        Yeni bir öğretmen eklemek için önce Supabase Dashboard'dan Authentication kısmından giriş hesabını
        oluşturun, sonra SQL Editor'den profiles tablosuna rol = 'ogretmen' ile bir satır ekleyin. Hesap
        oluştuktan sonra branş ve iletişim bilgilerini bu sayfadan düzenleyebilirsiniz.
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="bg-navy text-white text-left">
              <th className="px-4 py-3 font-semibold">Ad Soyad</th>
              <th className="px-4 py-3 font-semibold">Branş</th>
              <th className="px-4 py-3 font-semibold">Telefon</th>
              <th className="px-4 py-3 font-semibold text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Yükleniyor...</td></tr>
            )}
            {!loading && ogretmenler.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Henüz öğretmen eklenmedi.</td></tr>
            )}
            {ogretmenler.map((o, i) => {
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
                      <select
                        value={duzenleBrans}
                        onChange={(e) => setDuzenleBrans(e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue"
                      >
                        <option value="">Seçiniz</option>
                        {BRANSLAR.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={duzenleTelefon}
                        onChange={(e) => setDuzenleTelefon(e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                        placeholder="905XXXXXXXXX"
                      />
                    </td>
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
                  <td className="px-4 py-3">
                    {o.brans ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                        {o.brans}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">Belirtilmemiş</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{o.telefon || '—'}</td>
                  <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                    <button onClick={() => duzenlemeyeBasla(o)} className="text-blue text-sm hover:underline">
                      Düzenle
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Branş bilgisi, "Sınıflar" sayfasında öğretmen ataması yaparken listede görünür.
      </p>
    </div>
  )
}
