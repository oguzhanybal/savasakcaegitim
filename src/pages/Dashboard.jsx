import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

function Card({ label, value, color = 'text-navy' }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-sm text-gray-500 font-medium">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  )
}

export default function Dashboard() {
  const { profile } = useAuth()
  const [ogrenciSayisi, setOgrenciSayisi] = useState(null)
  const [sinifSayisi, setSinifSayisi] = useState(null)

  useEffect(() => {
    if (profile?.rol === 'yonetici') {
      supabase.from('ogrenciler').select('id', { count: 'exact', head: true }).then(({ count }) => setOgrenciSayisi(count))
      supabase.from('siniflar').select('id', { count: 'exact', head: true }).then(({ count }) => setSinifSayisi(count))
    }
  }, [profile])

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-1">Hoş geldiniz, {profile?.ad_soyad}</h1>
      <p className="text-gray-500 mb-6">Bugün {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

      {profile?.rol === 'yonetici' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card label="Toplam Öğrenci" value={ogrenciSayisi ?? '...'} />
          <Card label="Toplam Sınıf" value={sinifSayisi ?? '...'} />
          <Card label="Bugünün Tarihi" value={new Date().toLocaleDateString('tr-TR')} />
        </div>
      )}

      {profile?.rol === 'ogretmen' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-gray-600">Sol menüden "Ders Programım" ile haftalık programınızı, "Yoklama Al" ile bugünkü yoklamayı görebilirsiniz.</p>
        </div>
      )}

      {(profile?.rol === 'veli' || profile?.rol === 'ogrenci') && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-gray-600">Sol menüden ilgili sayfalara ulaşabilirsiniz.</p>
        </div>
      )}
    </div>
  )
}
