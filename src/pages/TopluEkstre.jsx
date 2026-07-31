import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  paraFormat,
  ogrenciSatirlariHesapla,
  telefonNormallestir,
  whatsappMesajiOlustur,
  ekstreVerisiGetir,
  bireBirBorclariOlustur,
  kantinBorclariOlustur,
} from '../lib/ekstreHesap'
import { ekstrePdfOlustur } from '../lib/pdfOlustur'

export default function TopluEkstre() {
  const [ogrenciler, setOgrenciler] = useState([])
  const [sozlesmeler, setSozlesmeler] = useState([])
  const [aylikBorclar, setAylikBorclar] = useState([])
  const [odemeler, setOdemeler] = useState([])
  const [seciliAy, setSeciliAy] = useState(() => new Date().toISOString().slice(0, 7))
  const [arama, setArama] = useState('')
  const [sadeceBorclu, setSadeceBorclu] = useState(false)
  const [loading, setLoading] = useState(true)
  // Bir satırda "Anneye Gönder"/"Babaya Gönder" tıklandığında PDF hazırlanıp
  // Supabase Storage'a yüklenene kadar geçen süre için — `${ogrenciId}-anne`
  // ya da `${ogrenciId}-baba` şeklinde, o an işlemde olan tek anahtarı tutar.
  const [gonderiliyor, setGonderiliyor] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('ogrenciler').select('*').order('ad_soyad'),
      supabase.from('sozlesmeler').select('*'),
      supabase.from('aylik_borclar').select('*'),
      supabase.from('odemeler').select('*'),
      supabase.from('bire_bir_atamalari').select('*'),
      supabase.from('bire_bir_yoklama').select('*'),
      supabase.from('kantin_alislar').select('*'),
    ]).then(([o, s, a, od, bba, bby, kantin]) => {
      setOgrenciler(o.data || [])
      setSozlesmeler(s.data || [])
      setAylikBorclar([
        ...(a.data || []),
        ...bireBirBorclariOlustur(bba.data || [], bby.data || []),
        ...kantinBorclariOlustur(kantin.data || []),
      ])
      setOdemeler(od.data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>

  const satirlar = ogrenciler
    .map((o) => {
      // Fatura Ortağı (ör. ikiz kardeşler): bu öğrencinin borç/ödeme rakamlarını
      // TEK BAŞINA değil, bağlı olduğu grupla birlikte hesaplıyoruz — Muhasebe
      // ve Ekstre sayfalarındaki mantığın aynısı. Partneri olmayan öğrenci için
      // grup=[o.id] olur, yani hesap eskisiyle birebir aynı kalır.
      const efektifId = o.fatura_sahibi_id || o.id
      const grup = [...new Set([efektifId, ...ogrenciler.filter((x) => x.fatura_sahibi_id === efektifId).map((x) => x.id)])]
      const faturaOrtaklari = ogrenciler.filter((x) => x.id !== o.id && grup.includes(x.id))
      const oSozlesmeler = sozlesmeler.filter((s) => grup.includes(s.ogrenci_id))
      const oAylikBorclar = aylikBorclar.filter((a) => grup.includes(a.ogrenci_id))
      const oOdemeler = odemeler.filter((od) => grup.includes(od.ogrenci_id))
      const kalemler = ogrenciSatirlariHesapla(oSozlesmeler, oAylikBorclar, oOdemeler, seciliAy)
      const buAyToplam = kalemler.reduce((t, x) => t + x.buAyTutar, 0)
      const kalanToplam = kalemler.reduce((t, x) => t + x.toplamOdenecek, 0)
      const gecmisBorc = kalemler.reduce((t, x) => t + x.gecmisBorc, 0)
      return {
        ogrenci: o,
        faturaOrtaklari,
        buAyToplam,
        kalanToplam,
        gecmisBorc,
        borcluMu: kalanToplam > 0,
        anneTelefonVarMi: !!telefonNormallestir(o.anne_telefon),
        babaTelefonVarMi: !!telefonNormallestir(o.baba_telefon),
      }
    })
    .filter((r) => r.ogrenci.ad_soyad.toLowerCase().includes(arama.toLowerCase()))
    .filter((r) => !sadeceBorclu || r.borcluMu)

  const genelToplamBorc = satirlar.reduce((t, r) => t + r.kalanToplam, 0)
  const borcluSayisi = satirlar.filter((r) => r.borcluMu).length

  // "Anneye Gönder"/"Babaya Gönder" tıklanınca: önce bu öğrencinin TAM ekstre
  // verisini (bire bir dökümü, kantin dökümü, ödeme geçmişi dahil) çeker,
  // gerçek bir PDF dosyasına çevirir, Supabase Storage'a yükler ve imzalı
  // (60 gün geçerli) bir link üretir — WhatsApp mesajına artık siteye giden
  // bir sayfa linki değil, doğrudan açılan bu PDF linki gider.
  async function pdfIleGonder(ogrenci, taraf) {
    const telefon = taraf === 'anne' ? ogrenci.anne_telefon : ogrenci.baba_telefon
    const t = telefonNormallestir(telefon)
    if (!t) {
      alert(`${taraf === 'anne' ? 'Anne' : 'Baba'} telefonu kayıtlı değil.`)
      return
    }
    const anahtar = `${ogrenci.id}-${taraf}`
    setGonderiliyor(anahtar)
    try {
      const veri = await ekstreVerisiGetir(supabase, ogrenci.id, seciliAy)
      if (!veri) throw new Error('Öğrenci verisi bulunamadı.')
      const pdfBlob = await ekstrePdfOlustur(veri)
      const dosyaYolu = `${ogrenci.id}/${seciliAy}.pdf`
      const { error: yuklemeHatasi } = await supabase.storage
        .from('ekstre-pdf')
        .upload(dosyaYolu, pdfBlob, { upsert: true, contentType: 'application/pdf' })
      if (yuklemeHatasi) throw yuklemeHatasi
      const { data: linkVerisi, error: linkHatasi } = await supabase.storage
        .from('ekstre-pdf')
        .createSignedUrl(dosyaYolu, 60 * 24 * 60 * 60) // 60 gün geçerli
      if (linkHatasi) throw linkHatasi
      const ayYil = new Date(seciliAy + '-01').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
      const kalanToplamBuOgrenci = veri.satirlar.reduce((t2, x) => t2 + x.toplamOdenecek, 0)
      const mesaj = whatsappMesajiOlustur({
        ogrenciAdi: ogrenci.ad_soyad,
        ayYil,
        buAyTutar: veri.buAyToplam,
        kalanTutar: kalanToplamBuOgrenci,
        pdfLink: linkVerisi.signedUrl,
      })
      window.open(`https://wa.me/${t}?text=${encodeURIComponent(mesaj)}`, '_blank')
    } catch (err) {
      alert(
        'PDF oluşturulurken/gönderilirken bir hata oluştu: ' +
          (err.message || String(err)) +
          '\n\nEğer "ekstre-pdf" bucket bulunamadı gibi bir hata görüyorsanız, bu özelliğin ilk kurulumu için verilen SQL dosyasını Supabase\'te çalıştırmanız gerekiyor.'
      )
    } finally {
      setGonderiliyor(null)
    }
  }

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
        <table className="w-full text-sm min-w-[860px]">
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
                <td className="px-4 py-2 font-medium text-gray-800">
                  {r.ogrenci.ad_soyad}
                  {r.faturaOrtaklari.length > 0 && (
                    <span className="block text-xs font-normal text-purple-600">
                      + {r.faturaOrtaklari.map((x) => x.ad_soyad).join(', ')} (birleşik)
                    </span>
                  )}
                </td>
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
                  {r.anneTelefonVarMi ? (
                    <button
                      type="button"
                      disabled={gonderiliyor === `${r.ogrenci.id}-anne`}
                      onClick={() => pdfIleGonder(r.ogrenci, 'anne')}
                      className="text-green-600 text-sm font-medium hover:underline mr-3 disabled:opacity-50 disabled:no-underline disabled:cursor-wait"
                    >
                      {gonderiliyor === `${r.ogrenci.id}-anne` ? 'PDF Hazırlanıyor...' : 'Anneye Gönder'}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400 mr-3">Anne Telefonu Yok</span>
                  )}
                  {r.babaTelefonVarMi ? (
                    <button
                      type="button"
                      disabled={gonderiliyor === `${r.ogrenci.id}-baba`}
                      onClick={() => pdfIleGonder(r.ogrenci, 'baba')}
                      className="text-green-600 text-sm font-medium hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-wait"
                    >
                      {gonderiliyor === `${r.ogrenci.id}-baba` ? 'PDF Hazırlanıyor...' : 'Babaya Gönder'}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">Baba Telefonu Yok</span>
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
