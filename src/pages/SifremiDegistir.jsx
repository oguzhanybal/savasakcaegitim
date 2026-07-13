import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Giriş yapmış HERHANGİ bir kullanıcının (rol fark etmeksizin) kendi şifresini
// değiştirebildiği sayfa. Mevcut oturum zaten doğrulanmış olduğu için eski
// şifre tekrar sorulmuyor — supabase.auth.updateUser sadece aktif bir oturum
// ister. Bu, yöneticinin SifreSifirla.jsx sayfasından yaptığı sıfırlamadan
// tamamen BAĞIMSIZ çalışır: kullanıcı kendi şifresini istediği an değiştirebilir,
// yönetici de istediği an ayrıca sıfırlayabilir — ikisi çakışmaz.
export default function SifremiDegistir() {
  const [yeniSifre, setYeniSifre] = useState('')
  const [yeniSifreTekrar, setYeniSifreTekrar] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [mesaj, setMesaj] = useState(null) // { tur: 'basari' | 'hata', metin }

  async function degistir(e) {
    e.preventDefault()
    setMesaj(null)

    if (!yeniSifre || yeniSifre.length < 6) {
      setMesaj({ tur: 'hata', metin: 'Şifre en az 6 karakter olmalı.' })
      return
    }
    if (yeniSifre !== yeniSifreTekrar) {
      setMesaj({ tur: 'hata', metin: 'Girdiğiniz iki şifre birbiriyle uyuşmuyor.' })
      return
    }

    setGonderiliyor(true)
    const { error } = await supabase.auth.updateUser({ password: yeniSifre })
    setGonderiliyor(false)

    if (error) {
      setMesaj({ tur: 'hata', metin: 'Hata: ' + error.message })
    } else {
      setMesaj({ tur: 'basari', metin: '✓ Şifreniz değiştirildi. Bir sonraki girişte yeni şifrenizi kullanın.' })
      setYeniSifre('')
      setYeniSifreTekrar('')
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">Şifremi Değiştir</h1>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-md">
        <form onSubmit={degistir} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Yeni Şifre</label>
            <input
              type="password"
              value={yeniSifre}
              onChange={(e) => setYeniSifre(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              placeholder="En az 6 karakter"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Yeni Şifre (Tekrar)</label>
            <input
              type="password"
              value={yeniSifreTekrar}
              onChange={(e) => setYeniSifreTekrar(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              placeholder="Şifreyi tekrar yazın"
              autoComplete="new-password"
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
            {gonderiliyor ? 'Değiştiriliyor...' : 'Şifreyi Değiştir'}
          </button>
        </form>
      </div>
    </div>
  )
}
