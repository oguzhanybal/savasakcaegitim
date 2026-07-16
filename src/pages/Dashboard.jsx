import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { taksitPlaniOlustur, aylikBorcDurumHesapla } from '../lib/ekstreHesap'

function paraFormat(n) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n || 0)
}

function Card({ label, value, color = 'text-navy', to }) {
  const icerik = (
    <>
      <p className="text-sm text-gray-500 font-medium">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
    </>
  )
  if (to) {
    return (
      <Link
        to={to}
        className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-navy/20 transition-all cursor-pointer"
      >
        {icerik}
      </Link>
    )
  }
  return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">{icerik}</div>
}

export default function Dashboard() {
  const { profile } = useAuth()
  const [ogrenciSayisi, setOgrenciSayisi] = useState(null)
  const [sinifSayisi, setSinifSayisi] = useState(null)
  const [buAyTahsilat, setBuAyTahsilat] = useState(null)
  const [bugunDevamsizlik, setBugunDevamsizlik] = useState(null)
  const [ogretmenSayisi, setOgretmenSayisi] = useState(null)
  const [gecikenOdemeSayisi, setGecikenOdemeSayisi] = useState(null)
  const [gecikenOgrenciler, setGecikenOgrenciler] = useState([])
  const [yaklasanVadeSayisi, setYaklasanVadeSayisi] = useState(null)

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

    // Toplam öğretmen (pasif olarak işaretlenmemiş olanlar — Ogretmenler.jsx'teki
    // "aktif === false" ise pasif kuralıyla aynı)
    supabase
      .from('profiles')
      .select('aktif')
      .eq('rol', 'ogretmen')
      .then(({ data }) => {
        setOgretmenSayisi((data || []).filter((o) => o.aktif !== false).length)
      })

    // Geciken ödeme listesi + Yaklaşan vade (7 gün): TopluEkstre.jsx ile aynı
    // veriyi (tüm aktif öğrenciler, sözleşmeler, aylık borçlar, ödemeler) çekip
    // ekstreHesap.js'teki AYNI taksit/borç motorunu (taksitPlaniOlustur,
    // aylikBorcDurumHesapla) her öğrenci için ayrı ayrı çalıştırıyoruz — Ekstre
    // ve Muhasebe sayfalarındaki "gecikti/bekliyor/kısmi" durumlarıyla birebir
    // tutarlı olsun diye.
    //
    // "Geciken" tanımı: vadesi/ait olduğu ayı geçmiş VE tamamen kapanmamış her
    // kalem — durum 'gecikti' (hiç ödeme düşmemiş) OLABİLECEĞİ gibi, vadesi
    // geçtiği hâlde sadece KISMEN ödenmiş ('kismi' + vade/ay geçmiş) kalemler
    // de dahil. (taksitPlaniOlustur/aylikBorcDurumHesapla'daki 'kismi' durumu
    // tek başına vade kontrolü yapmıyor — önden kısmi ödeme yapılmış ama vadesi
    // henüz gelmemiş bir taksit de 'kismi' çıkabiliyor; bu yüzden vade/ay
    // kontrolünü burada ayrıca yapıyoruz.)
    Promise.all([
      supabase.from('ogrenciler').select('id, ad_soyad').or('durum.eq.aktif,durum.is.null'),
      supabase.from('sozlesmeler').select('*'),
      supabase.from('aylik_borclar').select('*'),
      supabase.from('odemeler').select('*'),
    ]).then(([{ data: aktifOgrenciler }, { data: sozlesmeler }, { data: aylikBorclar }, { data: odemeler }]) => {
      const yediGunSonra = new Date(simdi)
      yediGunSonra.setHours(0, 0, 0, 0)
      yediGunSonra.setDate(yediGunSonra.getDate() + 7)
      const bugunGunBasi = new Date(simdi)
      bugunGunBasi.setHours(0, 0, 0, 0)
      const buAyIndex = simdi.getFullYear() * 12 + simdi.getMonth()

      let yaklasanSayac = 0
      const gecikenListe = []

      for (const ogrenci of aktifOgrenciler || []) {
        const ogrenciId = ogrenci.id
        const sOgrenci = (sozlesmeler || []).filter((s) => s.ogrenci_id === ogrenciId)
        const aOgrenci = (aylikBorclar || []).filter((a) => a.ogrenci_id === ogrenciId)
        const oOgrenci = (odemeler || []).filter((o) => o.ogrenci_id === ogrenciId)

        let gecikenTutar = 0

        for (const s of sOgrenci) {
          for (const t of taksitPlaniOlustur(s, oOgrenci)) {
            const vadeGunBasi = new Date(t.vade)
            vadeGunBasi.setHours(0, 0, 0, 0)
            const vadeGecti = vadeGunBasi < bugunGunBasi
            if (t.durum === 'gecikti' || (t.durum === 'kismi' && vadeGecti)) {
              gecikenTutar += t.kalanTutar
            }
            if (t.durum === 'bekliyor' && vadeGunBasi >= bugunGunBasi && vadeGunBasi <= yediGunSonra) {
              yaklasanSayac++
            }
          }
        }
        for (const a of aOgrenci) {
          const d = new Date(a.donem)
          const borcAyIndex = d.getFullYear() * 12 + d.getMonth()
          const ayGecti = borcAyIndex < buAyIndex
          const sonuc = aylikBorcDurumHesapla(a, aOgrenci, oOgrenci)
          if (sonuc.durum === 'gecikti' || (sonuc.durum === 'kismi' && ayGecti)) {
            gecikenTutar += sonuc.kalanTutar
          }
        }

        if (gecikenTutar > 0.01) {
          gecikenListe.push({ id: ogrenciId, adSoyad: ogrenci.ad_soyad, tutar: gecikenTutar })
        }
      }

      gecikenListe.sort((a, b) => b.tutar - a.tutar)
      setGecikenOgrenciler(gecikenListe)
      setGecikenOdemeSayisi(gecikenListe.length)
      setYaklasanVadeSayisi(yaklasanSayac)
    })
  }, [profile])

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-1">Hoş geldiniz, {profile?.ad_soyad}</h1>
      <p className="text-gray-500 mb-6">Bugün {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

      {profile?.rol === 'yonetici' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card label="Aktif Öğrenci" value={ogrenciSayisi ?? '...'} to="/ogrenciler" />
          <Card label="Toplam Sınıf" value={sinifSayisi ?? '...'} to="/siniflar" />
          <Card
            label="Bu Ay Toplam Tahsilat"
            value={buAyTahsilat !== null ? paraFormat(buAyTahsilat) : '...'}
            color="text-green-600"
            to="/gelir-raporu"
          />
          <Card
            label="Bugünkü Devamsızlık"
            value={bugunDevamsizlik ?? '...'}
            color={bugunDevamsizlik > 0 ? 'text-red-500' : 'text-navy'}
            to="/yoklama-raporu"
          />
          <Card label="Toplam Öğretmen" value={ogretmenSayisi ?? '...'} to="/ogretmenler" />
          <Card
            label="Geciken Ödeme"
            value={gecikenOdemeSayisi ?? '...'}
            color={gecikenOdemeSayisi > 0 ? 'text-red-500' : 'text-navy'}
            to="/toplu-ekstre"
          />
          <Card
            label="Yaklaşan Vade (7 gün)"
            value={yaklasanVadeSayisi ?? '...'}
            color={yaklasanVadeSayisi > 0 ? 'text-orange-500' : 'text-navy'}
            to="/toplu-ekstre"
          />
        </div>
      )}

      {profile?.rol === 'yonetici' && gecikenOgrenciler.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-5 mt-4">
          <h3 className="font-semibold text-red-600 mb-3">Geciken Ödemesi Olanlar ({gecikenOgrenciler.length})</h3>
          <div className="divide-y divide-gray-100">
            {gecikenOgrenciler.map((o) => (
              <Link
                key={o.id}
                to={`/ekstre/${o.id}`}
                className="flex items-center justify-between py-2 px-2 -mx-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm text-gray-700">{o.adSoyad}</span>
                <span className="text-sm font-semibold text-red-500">{paraFormat(o.tutar)}</span>
              </Link>
            ))}
          </div>
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
