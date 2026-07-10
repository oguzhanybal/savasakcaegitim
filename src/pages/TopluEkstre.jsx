import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { paraFormat, ogrenciSatirlariHesapla, whatsappLinkOlustur, bireBirBorclariOlustur } from '../lib/ekstreHesap'

export default function TopluEkstre() {
  const [ogrenciler, setOgrenciler] = useState([])
  const [sozlesmeler, setSozlesmeler] = useState([])
  const [aylikBorclar, setAylikBorclar] = useState([])
  const [odemeler, setOdemeler] = useState([])
  const [seciliAy, setSeciliAy] = useState(() => new Date().toISOString().slice(0, 7))
  const [arama, setArama] = useState('')
  const [sadeceBorclu, setSadeceBorclu] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('ogrenciler').select('*').order('ad_soyad'),
      supabase.from('sozlesmeler').select('*'),
      supabase.from('aylik_borclar').select('*'),
      supabase.from('odemeler').select('*'),
      supabase.from('bire_bir_atamalari').select('*'),
      supabase.from('bire_bir_yoklama').select('*'),
    ]).then(([o, s, a, od, bba, bby]) => {
      setOgrenciler(o.data || [])
      setSozlesmeler(s.data || [])
      setAylikBorclar([...(a.data || []), ...bireBirBorclariOlustur(bba.data || [], bby.data || [])])
      setOdemeler(od.data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>

  const satirlar = ogrenciler
    .map((o) => {
      const oSozlesmeler = sozlesmeler.filter((s) => s.ogrenci_id === o.id)
      const oAylikBorclar = aylikBorclar.filter((a) => a.ogrenci_id === o.id)
      const oOdemeler = odemeler.filter((od) => od.ogrenci_id === o.id)
      const kalemler = ogrenciSatirlariHesapla(oSozlesmeler, oAylikBorclar, oOdemeler, seciliAy)
      const buAyToplam = kalemler.reduce((t, x) => t + x.buAyTutar, 0)
      const kalanToplam = kalemler.reduce((t, x) => t + x.toplamOdenecek, 0)
      const gecmisBorc = kalemler.reduce((t, x) => t + x.gecmisBorc, 0)
      return {
        ogrenci: o,
        buAyToplam,
        kalanToplam,
        gecmisBorc,
        borcluMu: kalanToplam > 0,
        whatsappLink: whatsappLinkOlustur(o, seciliAy, buAyToplam, kalanToplam),
      }
    })
    .filter((r) => r.ogrenci.ad_soyad.toLowerCase().includes(arama.toLowerCase()))
    .filter((r) => !sadeceBorclu || r.borcluMu)

  const genelToplamBorc = satirlar.reduce((t, r) => t + r.kalanToplam, 0)
  const borcluSayisi = satirlar.filter((r) => r.borcluMu).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-navy">Toplu Ekstre</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600">Dönem:</label>
          <input
            type="month"
            value={seciliAy}
            onChange={(e) => setSeciliAy(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 font-medium">Borçlu Öğrenci Sayısı</p>
          <p className="text-2xl font-bold text-navy mt-1">{borcluSayisi} / {ogrenciler.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 font-medium">Toplam Ödenmesi Gereken (Filtrelenmiş Liste)</p>
          <p className="text-2xl font-bold text-orange mt-1">{paraFormat(genelToplamBorc)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Öğrenci ara..."
          className="px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue min-w-[200px]"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 select-none">
          <input
            type="checkbox"
            checked={sadeceBorclu}
            onChange={(e) => setSadeceBorclu(e.target.checked)}
          />
          Sadece borçlu olanları göster
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-gray-500 bg-gray-50">
              <th className="px-4 py-2 font-medium">Öğrenci</th>
              <th className="px-4 py-2 font-medium text-right">Bu Ay Toplam</th>
              <th className="px-4 py-2 font-medium text-right">Kalan Toplam</th>
              <th className="px-4 py-2 font-medium">Durum</th>
              <th className="px-4 py-2 font-medium text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {satirlar.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Kayıt bulunamadı.</td></tr>
            )}
            {satirlar.map((r) => (
              <tr key={r.ogrenci.id} className={`border-t border-gray-50 ${r.gecmisBorc > 0 ? 'bg-red-50/50' : ''}`}>
                <td className="px-4 py-2 font-medium text-gray-800">{r.ogrenci.ad_soyad}</td>
                <td className="px-4 py-2 text-right">{paraFormat(r.buAyToplam)}</td>
                <td className={`px-4 py-2 text-right font-semibold ${r.borcluMu ? 'text-red-700' : 'text-green-600'}`}>
                  {paraFormat(r.kalanToplam)}
                </td>
                <td className="px-4 py-2">
                  {r.borcluMu ? (
                    <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-1 rounded-full">Borçlu</span>
                  ) : (
                    <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-full">Ödeme Tamamlandı</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <Link to={`/ekstre/${r.ogrenci.id}`} target="_blank" className="text-blue text-sm hover:underline mr-3">
                    Ekstre
                  </Link>
                  {r.whatsappLink ? (
                    <a
                      href={r.whatsappLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-green-600 text-sm font-medium hover:underline"
                    >
                      WhatsApp Gönder
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400">Telefon Girilmemiş</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
