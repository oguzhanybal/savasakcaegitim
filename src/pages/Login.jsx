import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'

const SAHTE_DOMAIN = 'savasakcaegitim.giris'

function girisEmailineDonustur(deger) {
  const temiz = deger.trim()
  if (temiz.includes('@')) return temiz // zaten e-posta (yönetici için)
  return `${temiz.toLowerCase()}@${SAHTE_DOMAIN}` // kullanıcı adı -> sahte e-posta
}

export default function Login() {
  const { signIn } = useAuth()
  const [girisAdi, setGirisAdi] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const email = girisEmailineDonustur(girisAdi)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) setError('Kullanıcı adı/e-posta veya şifre hatalı.')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Savaş Akça Eğitim" className="w-28 h-28 mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold text-navy">Savaş Akça Eğitim</h1>
          <p className="text-gray-500 text-sm mt-1">Sisteme giriş yapın</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kullanıcı Adı</label>
            <input
              type="text"
              required
              value={girisAdi}
              onChange={(e) => setGirisAdi(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              placeholder="kullaniciadi"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-navy text-white font-semibold py-2.5 rounded-lg hover:bg-blue transition-colors disabled:opacity-50"
          >
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Hesabınız yoksa yöneticinizden davet bekleyin.
        </p>
      </div>
    </div>
  )
}
