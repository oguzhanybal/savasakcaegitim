import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { adSoyadDuzelt } from '../lib/adSoyadFormat'
import { telefonYerelGoster } from '../lib/telefonFormat'
import TelefonInput from '../components/TelefonInput'

const BRANSLAR = [
  'Matematik', 'Geometri', 'Türkçe', 'Türkçe/Edebiyat', 'Fen Bilimleri', 'Sosyal Bilgiler', 'İngilizce',
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
  const [silinenId, setSilinenId] = useState(null)
  const [silmeHatasi, setSilmeHatasi] = useState('')
  const [durumDegisenId, setDurumDegisenId] = useState(null)

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

  async function sil(o) {
    if (!confirm(`"${o.ad_soyad}" adlı öğretmeni silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return
    setSilmeHatasi('')
    setSilinenId(o.id)
    try {
      const yanit = await fetch('/api/kullanici-sil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: o.id }),
      })
      const veri = await yanit.json()
      if (!yanit.ok) {
        setSilmeHatasi(veri.error || 'Bilinmeyen bir hata oluştu.')
      } else {
        yukle()
      }
    } catch (err) {
      setSilmeHatasi('Bağlantı hatası: ' + err.message)
    }
    setSilinenId(null)
  }

  async function durumDegistir(o) {
    setDurumDegisenId(o.id)
    const { error } = await supabase.from('profiles').update({ aktif: !o.aktif }).eq('id', o.id)
    if (error) {
      alert('Hata: ' + error.message)
    } else {
      yukle()
    }
    setDurumDegisenId(null)
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
              <th className="px-4 py-3 font-semibold">Durum</th>
              <th className="px-4 py-3 font-semibold text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Yükleniyor...</td></tr>
            )}
            {!loading && ogretmenler.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Henüz öğretmen eklenmedi.</td></tr>
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
                      <TelefonInput
                        value={duzenleTelefon}
                        onChange={setDuzenleTelefon}
                        girdiSinifi="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
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

              const pasif = o.aktif === false

              return (
                <tr key={o.id} className={`${i % 2 ? 'bg-gray-50' : ''} ${pasif ? 'opacity-50' : ''}`}>
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
                  <td className="px-4 py-3 text-gray-500">{o.telefon ? telefonYerelGoster(o.telefon) : '—'}</td>
                  <td className="px-4 py-3">
                    {pasif ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Pasif</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Aktif</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                    <button onClick={() => duzenlemeyeBasla(o)} className="text-blue text-sm hover:underline">
                      Düzenle
                    </button>
                    <button
                      onClick={() => durumDegistir(o)}
                      disabled={durumDegisenId === o.id}
                      className="text-orange text-sm hover:underline disabled:opacity-50"
                    >
                      {durumDegisenId === o.id ? '...' : pasif ? 'Aktif Yap' : 'Pasif Yap'}
                    </button>
                    <button
                      onClick={() => sil(o)}
                      disabled={silinenId === o.id}
                      className="text-red-600 text-sm hover:underline disabled:opacity-50"
                    >
                      {silinenId === o.id ? 'Siliniyor...' : 'Sil'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {silmeHatasi && <p className="text-red-600 text-sm mt-3">{silmeHatasi}</p>}
      <p className="text-xs text-gray-400 mt-3">
        Branş bilgisi, "Sınıflar" sayfasında öğretmen ataması yaparken listede görünür. "Pasif Yap", öğretmeni
        silmeden geçmiş kayıtlarını (ders/ödeme/yoklama) korur, sadece o öğretmeni artık kullanmadığınızı işaretler.
      </p>
    </div>
  )
}
