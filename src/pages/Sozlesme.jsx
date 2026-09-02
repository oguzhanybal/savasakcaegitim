import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { sozlesmeVerisiHazirla, tarihFormat } from '../lib/sozlesmeHesapla'
import SozlesmeSayfalari from '../components/SozlesmeSayfalari'

function paraFormat(n) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n || 0)
}

export default function Sozlesme() {
  const { sozlesmeId } = useParams()
  const [sozlesme, setSozlesme] = useState(null)
  const [ogrenci, setOgrenci] = useState(null)
  const [sinifAdi, setSinifAdi] = useState('')
  const [bireBirVarMi, setBireBirVarMi] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hata, setHata] = useState('')
  const [veliSecimi, setVeliSecimi] = useState('baba') // hem anne hem baba varsa hangisi gösterilsin

  // Aynı öğrencinin AYRI bir "Kitap" sözleşmesi varsa (Muhasebe'de zaten
  // eskiden beri desteklenen normal bir kalem), Kurs/Okul sözleşmesi
  // görüntülenirken bu belgeye tarihe uygun şekilde dahil edilip
  // edilmeyeceği sorulur — kitapSozlesme dolu ve kalem Kurs/Okul'sa, aşağıda
  // no-print bir soru gösterilir. kitapDahilMi: null = henüz sorulmadı/karar
  // verilmedi, true/false = admin cevapladı.
  const [kitapSozlesme, setKitapSozlesme] = useState(null)
  const [kitapDahilMi, setKitapDahilMi] = useState(null)

  useEffect(() => {
    async function yukle() {
      const { data: s, error: sHata } = await supabase.from('sozlesmeler').select('*').eq('id', sozlesmeId).single()
      if (sHata || !s) {
        setHata('Sözleşme bulunamadı.')
        setLoading(false)
        return
      }
      setSozlesme(s)

      const [og, so, bba, kitapS] = await Promise.all([
        supabase.from('ogrenciler').select('*, veli:veli_profile_id(ad_soyad, telefon)').eq('id', s.ogrenci_id).single(),
        supabase.from('sinif_ogrenciler').select('siniflar(ad)').eq('ogrenci_id', s.ogrenci_id).limit(1),
        supabase.from('bire_bir_atamalari').select('id').eq('ogrenci_id', s.ogrenci_id).limit(1),
        (s.kalem === 'Kurs' || s.kalem === 'Okul')
          ? supabase
              .from('sozlesmeler')
              .select('*')
              .eq('ogrenci_id', s.ogrenci_id)
              .eq('kalem', 'Kitap')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      setOgrenci(og.data || null)
      setSinifAdi(so.data?.[0]?.siniflar?.ad || '')
      setBireBirVarMi((bba.data || []).length > 0)
      setKitapSozlesme(kitapS.data || null)
      setLoading(false)
    }
    yukle()
  }, [sozlesmeId])

  useEffect(() => {
    if (!ogrenci) return
    document.title = `${ogrenci.ad_soyad} Sözleşmesi`
    return () => { document.title = 'Savaş Akça Eğitim Portalı' }
  }, [ogrenci])

  if (loading) return <p className="p-6 text-gray-400">Yükleniyor...</p>
  if (hata || !sozlesme || !ogrenci) return <p className="p-6 text-gray-400">{hata || 'Kayıt bulunamadı.'}</p>

  // Türetilmiş TÜM değerler (finalSinif, veliAdSoyad, taksitler, tutarlar...)
  // artık sozlesmeHesapla.js'te — Muhasebe.jsx'teki "WhatsApp'tan Gönder" de
  // AYNI fonksiyonu çağırıyor, mantık iki yerde ayrı ayrı yazılmıyor.
  const {
    ikiVeliVar,
    veliAdSoyad,
    iletisim,
    finalSinif,
    sozlesmeTarihiMetni,
    egitimDonemi,
    kitapDahil,
    taksitler,
    yayinBedeli,
    egitimBedeli,
    genelToplam,
  } = sozlesmeVerisiHazirla({ sozlesme, ogrenci, sinifAdi, bireBirVarMi, kitapSozlesme, kitapDahilMi, veliSecimi })

  return (
    <div className="min-h-screen bg-cream py-8 px-4 print:bg-white print:py-0">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .sozlesme-sayfa { page-break-after: always; }
          .sozlesme-sayfa:last-child { page-break-after: auto; }
          .sozlesme-maddeler {
            font-size: 8.8px;
            line-height: 1.22;
          }
          .sozlesme-maddeler h3 {
            margin-top: 5px;
            margin-bottom: 1.3px;
            font-size: 9.3px;
          }
          .sozlesme-maddeler p {
            margin-bottom: 2px;
          }
          .sozlesme-imza { margin-top: 11px !important; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto">
        <div className="no-print flex items-center justify-between mb-4">
          <Link to="/muhasebe" className="text-sm text-blue hover:underline">← Muhasebe'ye Dön</Link>
          <button
            onClick={() => window.print()}
            className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            Yazdır / PDF Kaydet
          </button>
        </div>

        {(!ogrenci.tc_kimlik_no || !ogrenci.adres || !veliAdSoyad) && (
          <div className="no-print bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4 text-sm text-yellow-800">
            Eksik bilgiler var, sözleşmede ilgili alanlar boş görünecek:{' '}
            {!veliAdSoyad && 'veli bağlantısı, '}
            {!ogrenci.tc_kimlik_no && 'TC Kimlik No, '}
            {!ogrenci.adres && 'Adres, '}
            bunları Öğrenciler sayfasından tamamlayabilirsiniz.
          </div>
        )}

        {ikiVeliVar && (
          <div className="no-print bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-800 flex flex-wrap items-center gap-3">
            <span>Bu öğrencinin hem anne hem baba bilgisi kayıtlı. Sözleşmede hangisi görünsün?</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVeliSecimi('baba')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${veliSecimi === 'baba' ? 'bg-blue text-white' : 'bg-white border border-blue-200 text-blue-800'}`}
              >
                Baba: {ogrenci.baba_adi_soyadi}
              </button>
              <button
                type="button"
                onClick={() => setVeliSecimi('anne')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${veliSecimi === 'anne' ? 'bg-blue text-white' : 'bg-white border border-blue-200 text-blue-800'}`}
              >
                Anne: {ogrenci.anne_adi_soyadi}
              </button>
            </div>
          </div>
        )}

        {/* Aynı öğrencinin ayrı bir "Kitap" sözleşmesi bulunduğunda, bu Kurs/
            Okul sözleşmesine dahil edilip edilmeyeceği burada sorulur. Henüz
            cevaplanmadıysa (kitapDahilMi === null) soru gösterilir; cevap
            verildikten sonra durum + "değiştir" linki gösterilir. */}
        {kitapSozlesme && kitapDahilMi === null && (
          <div className="no-print bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-800 flex flex-wrap items-center gap-3">
            <span>
              Bu öğrencinin ayrı bir <b>Kitap</b> sözleşmesi var: {paraFormat(kitapSozlesme.toplam_tutar)} (
              {kitapSozlesme.taksit_sayisi} taksit, ilk taksit {tarihFormat(kitapSozlesme.ilk_taksit_tarihi)}). Bu
              sözleşmeye (tarihe uygun şekilde) dahil edilsin mi?
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setKitapDahilMi(true)}
                className="px-3 py-1.5 rounded-lg font-medium bg-blue text-white hover:opacity-90 transition-opacity"
              >
                Evet, Dahil Et
              </button>
              <button
                type="button"
                onClick={() => setKitapDahilMi(false)}
                className="px-3 py-1.5 rounded-lg font-medium bg-white border border-blue-200 text-blue-800 hover:bg-blue-100"
              >
                Hayır, Ayrı Kalsın
              </button>
            </div>
          </div>
        )}
        {kitapSozlesme && kitapDahilMi !== null && (
          <div className="no-print bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4 text-sm text-gray-600 flex flex-wrap items-center gap-2">
            <span>
              Kitap sözleşmesi ({paraFormat(kitapSozlesme.toplam_tutar)}){' '}
              {kitapDahilMi ? 'bu sözleşmeye dahil edildi.' : 'bu sözleşmeye dahil edilmedi.'}
            </span>
            <button type="button" onClick={() => setKitapDahilMi(null)} className="text-blue hover:underline">
              Değiştir
            </button>
          </div>
        )}

        <SozlesmeSayfalari
          sozlesme={sozlesme}
          ogrenci={ogrenci}
          veliAdSoyad={veliAdSoyad}
          iletisim={iletisim}
          finalSinif={finalSinif}
          sozlesmeTarihiMetni={sozlesmeTarihiMetni}
          egitimDonemi={egitimDonemi}
          taksitler={taksitler}
          kitapDahil={kitapDahil}
          genelToplam={genelToplam}
          yayinBedeli={yayinBedeli}
          egitimBedeli={egitimBedeli}
        />
      </div>
    </div>
  )
}
