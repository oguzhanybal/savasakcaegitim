import { useState } from 'react'
import { adSoyadDuzelt } from '../lib/adSoyadFormat'

const ROLLER = [
  { value: 'veli', label: 'Veli' },
  { value: 'ogrenci', label: 'Öğrenci' },
  { value: 'ogretmen', label: 'Öğretmen' },
  { value: 'yonetici', label: 'Yönetici' },
]

export default function KullaniciOlustur() {
  const [adSoyad, setAdSoyad] = useState('')
  const [kullaniciAdi, setKullaniciAdi] = useState('')
  const [sifre, setSifre] = useState('')
  const [rol, setRol] = useState('veli')
  const [telefon, setTelefon] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [mesaj, setMesaj] = useState(null) // { tur: 'basari' | 'hata', metin }

  async function olustur(e) {
    e.preventDefault()
    setMesaj(null)

    if (!adSoyad.trim() || !kullaniciAdi.trim() || !sifre) {
      setMesaj({ tur: 'hata', metin: 'Lütfen ad soyad, kullanıcı adı ve şifreyi doldurun.' })
      return
    }
    if (sifre.length < 6) {
      setMesaj({ tur: 'hata', metin: 'Şifre en az 6 karakter olmalı.' })
      return
    }

    setGonderiliyor(true)
    try {
      const yanit = await fetch('/api/kullanici-olustur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adSoyad, kullaniciAdi, sifre, rol, telefon }),
      })
      const veri = await yanit.json()
      if (!yanit.ok) {
        setMesaj({ tur: 'hata', metin: veri.error || 'Bilinmeyen bir hata oluştu.' })
      } else {
        setMesaj({
          tur: 'basari',
          metin: `Hesap oluşturuldu — ${adSoyadDuzelt(adSoyad)}, giriş adı: "${kullaniciAdi}", şifre: "${sifre}". Bu bilgileri kullanıcıyla paylaşın.`,
        })
        setAdSoyad('')
        setKullaniciAdi('')
        setSifre('')
        setTelefon('')
      }
    } catch (err) {
      setMesaj({ tur: 'hata', metin: 'Bağlantı hatası: ' + err.message })
    }
    setGonderiliyor(false)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">Kullanıcı Oluştur</h1>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-lg">
        <form onSubmit={olustur} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ad Soyad</label>
            <input
              value={adSoyad}
              onChange={(e) => setAdSoyad(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              placeholder="Ad Soyad"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
            <select
              value={rol}
              onChange={(e) => setRol(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue"
            >
              {ROLLER.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kullanıcı Adı</label>
            <input
              value={kullaniciAdi}
              onChange={(e) => setKullaniciAdi(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              placeholder="örn. ayseyilmaz"
              autoCapitalize="none"
              autoCorrect="off"
            />
            <p className="text-xs text-gray-400 mt-1">
              Kullanıcı giriş ekranında bu adı yazacak (e-posta değil). Yönetici hesabı için gerçek e-posta da girebilirsiniz.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
            <input
              type="text"
              value={sifre}
              onChange={(e) => setSifre(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              placeholder="En az 6 karakter"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefon (opsiyonel)</label>
            <input
              value={telefon}
              onChange={(e) => setTelefon(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              placeholder="905XXXXXXXXX"
            />
          </div>

          {mesaj && (
            <p className={`text-sm ${mesaj.tur === 'basari' ? 'text-green-600' : 'text-red-600'}`}>{mesaj.metin}</p>
          )}

          <button
            type="submit"
            disabled={gonderiliyor}
            className="w-full bg-orange text-white font-semibold py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {gonderiliyor ? 'Oluşturuluyor...' : 'Hesap Oluştur'}
          </button>
        </form>
      </div>

      <p className="text-xs text-gray-400 mt-4 max-w-lg">
        Veli hesabı oluşturduktan sonra Öğrenciler sayfasından "Veli Bağla" ile bu hesabı ilgili öğrenciyle
        eşleştirmeyi unutmayın — aksi halde veli hiçbir öğrenci verisi göremez.
      </p>
    </div>
  )
}
