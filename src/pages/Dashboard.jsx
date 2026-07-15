import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

function paraFormat(n) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n || 0)
}

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
  const [buAyTahsilat, setBuAyTahsilat] = useState(null)
  const [bugunDevamsizlik, setBugunDevamsizlik] = useState(null)

  useEffect(() => {
    if (profile?.rol !== 'yonetici') return

    // Toplam aktif öğrenci
    supabase
      .from('ogrenciler')
      .select('id', { count: 'exact', head: true })
      .or('durum.eq.aktif,durum.is.null')
      .then(({ count }) => setOgrenciSayisi(count))

    // Toplam sınıf
    supabase.from('siniflar').select('id', { count: 'exact', head: true }).then(({ count }) => setSinifSayisi(count))

    // Bu ay toplam tahsilat
    const simdi = new Date()
    const ayBasi = new Date(simdi.getFullYear(), simdi.getMonth(), 1).toISOString()
    const ayGeleceki = new Date(simdi.getFullYear(), simdi.getMonth() + 1, 1).toISOString()
    supabase
      .from('odemeler')
      .select('tutar')
      .gte('tarih', ayBasi)
      .lt('tarih', ayGeleceki)
      .then(({ data }) => {
        const toplam = (data || []).reduce((t, o) => t + Number(o.tutar), 0)
        setBuAyTahsilat(toplam)
      })

    // Bugünkü devamsızlık: ÖĞRENCİ bazında sayılır, ders/saat bazında değil.
    // "yoklama" tablosunda her satır bir öğrencinin BİR ders saatine ait
    // kaydı olduğu için (aynı öğrenci bugün birden fazla derse giriyorsa
    // birden fazla satırı olabilir), sadece "gelmedi" satırlarını saymak
    // yanıltıcı olurdu — 3 dersine de girmeyen bir öğrenci 3 kez sayılırdı.
    // Bunun yerine: bir öğrenci bugün GİRDİĞİ derslerin herhangi birine
    // "Geldi" olarak işaretlenmişse, o gün okula gelmiş kabul edilir ve
    // devamsız sayılmaz — başka bir dersine girmemiş olsa bile. Sadece
    // bugüne ait TÜM kayıtları "Gelmedi" olan öğrenciler devamsız sayılır,
    // ve her öğrenci en fazla 1 kez sayılır.
    const bugun = simdi.toISOString().slice(0, 10)
    supabase
      .from('yoklama')
      .select('ogrenci_id, geldi')
      .eq('tarih', bugun)
      .then(({ data }) => {
        const ogrenciDurumu = {}
        ;(data || []).forEach((y) => {
          if (y.geldi === true) {
            // Herhangi bir derse "Geldi" denmişse, o öğrenci artık kesin
            // olarak "geldi" sayılır — daha önce başka bir dersinde
            // "Gelmedi" işaretlenmiş olsa bile bu durumu ezer.
            ogrenciDurumu[y.ogrenci_id] = true
          } else if (!(y.ogrenci_id in ogrenciDurumu)) {
            ogrenciDurumu[y.ogrenci_id] = false
          }
        })
        const devamsizSayisi = Object.values(ogrenciDurumu).filter((geldiMi) => geldiMi === false).length
        setBugunDevamsizlik(devamsizSayisi)
      })
  }, [profile])

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-1">Hoş geldiniz, {profile?.ad_soyad}</h1>
      <p className="text-gray-500 mb-6">Bugün {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

      {profile?.rol === 'yonetici' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card label="Aktif Öğrenci" value={ogrenciSayisi ?? '...'} />
          <Card label="Toplam Sınıf" value={sinifSayisi ?? '...'} />
          <Card
            label="Bu Ay Toplam Tahsilat"
            value={buAyTahsilat !== null ? paraFormat(buAyTahsilat) : '...'}
            color="text-green-600"
          />
          <Card
            label="Bugünkü Devamsızlık"
            value={bugunDevamsizlik ?? '...'}
            color={bugunDevamsizlik > 0 ? 'text-red-500' : 'text-navy'}
          />
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
