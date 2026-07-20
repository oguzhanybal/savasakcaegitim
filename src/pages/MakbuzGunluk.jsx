import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { tutarYaziyla } from '../lib/sayiYaziyla'
import { gunAnahtari } from '../lib/ekstreHesap'

function paraFormat(n) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n || 0)
}

function MakbuzGovdesi({ nusha, odemeler, ogrenciAdi, tarihMetni, toplam, ogrenciSutunuGoster, adBul }) {
  return (
    <div className="makbuz-karti border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-navy text-white py-2.5 px-4 flex items-center gap-2.5">
        <div className="bg-white rounded-lg p-1 shrink-0">
          <img src="/logo.png" alt="Savaş Akça Eğitim" className="w-8 h-8 object-contain" />
        </div>
        <div>
          <p className="font-bold text-base tracking-wide leading-tight">SAVAŞ AKÇA EĞİTİM</p>
          <p className="text-xs text-white/80 leading-tight">TAHSİLAT MAKBUZU</p>
        </div>
      </div>
      <div className="p-4">
        <p className="text-xs text-gray-400 mb-2">Nüsha: {nusha}</p>

        <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden mb-2">
          <tbody>
            <tr className="bg-gray-50">
              <td className="px-3 py-1.5 font-semibold text-gray-600 w-1/3">Öğrenci</td>
              <td className="px-3 py-1.5 font-bold text-navy">{ogrenciAdi}</td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 font-semibold text-gray-600">Tarih</td>
              <td className="px-3 py-1.5">{tarihMetni}</td>
            </tr>
          </tbody>
        </table>

        <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-600">
              <th className="px-3 py-1.5 font-semibold">Kalem</th>
              {ogrenciSutunuGoster && <th className="px-3 py-1.5 font-semibold">Öğrenci</th>}
              <th className="px-3 py-1.5 font-semibold text-right">Tutar</th>
            </tr>
          </thead>
          <tbody>
            {odemeler.map((o) => (
              <tr key={o.id} className="border-t border-gray-100">
                <td className="px-3 py-1.5">{o.kalem || '—'}</td>
                {ogrenciSutunuGoster && <td className="px-3 py-1.5">{adBul(o.ogrenci_id)}</td>}
                <td className="px-3 py-1.5 text-right">{paraFormat(o.tutar)}</td>
              </tr>
            ))}
            <tr className="border-t border-gray-200 bg-orange/10">
              <td className="px-3 py-1.5 font-bold text-orange" colSpan={ogrenciSutunuGoster ? 2 : 1}>TOPLAM</td>
              <td className="px-3 py-1.5 font-bold text-orange text-right">{paraFormat(toplam)}</td>
            </tr>
          </tbody>
        </table>

        <p className="text-sm text-gray-600 mt-2">{tutarYaziyla(toplam)}</p>
        <p className="text-right text-sm text-gray-500 mt-3">Ad Soyad / İmza</p>
      </div>
    </div>
  )
}

export default function MakbuzGunluk() {
  const { ogrenciId, tarih } = useParams() // tarih: "YYYY-MM-DD"
  const [odemeler, setOdemeler] = useState([])
  const [ogrenciAdi, setOgrenciAdi] = useState('')
  // Fatura Ortağı (ör. ikiz kardeşler): topluca tek makbuzda tahsilat
  // yapılabilsin diye — bu öğrenci başka birine bağlıysa (ya da başka biri
  // buna bağlıysa) o günkü TÜM grubun ödemeleri TEK makbuzda toplanır, ve
  // "Öğrenci" başlığında ikisinin de adı görünür. Partneri olmayan bir
  // öğrenci için grup tek kişiliktir, yani davranış eskisiyle birebir aynı kalır.
  const [grupOgrencileri, setGrupOgrencileri] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('ogrenciler')
      .select('*')
      .eq('id', ogrenciId)
      .single()
      .then(({ data: kendisi }) => {
        if (!kendisi) {
          setLoading(false)
          return
        }
        const efektifId = kendisi.fatura_sahibi_id || kendisi.id
        supabase
          .from('ogrenciler')
          .select('id, ad_soyad')
          .or(`id.eq.${efektifId},fatura_sahibi_id.eq.${efektifId}`)
          .then(({ data: grup }) => {
            const grupListesi = grup || [kendisi]
            const grupIdleri = grupListesi.map((g) => g.id)
            supabase
              .from('odemeler')
              .select('*')
              .in('ogrenci_id', grupIdleri)
              .order('tarih')
              .then(({ data }) => {
                const gununOdemeleri = (data || []).filter((odm) => gunAnahtari(odm.tarih) === tarih)
                setOdemeler(gununOdemeleri)
                setGrupOgrencileri(grupListesi)
                setOgrenciAdi(grupListesi.map((g) => g.ad_soyad).join(' ve '))
                setLoading(false)
              })
          })
      })
  }, [ogrenciId, tarih])

  function adBul(id) {
    return grupOgrencileri.find((g) => g.id === id)?.ad_soyad || '—'
  }
  const ogrenciSutunuGoster = grupOgrencileri.length > 1

  if (loading) return <p className="p-6 text-gray-400">Yükleniyor...</p>
  if (odemeler.length === 0) return <p className="p-6 text-gray-400">Bu tarihte ödeme kaydı bulunamadı.</p>

  const toplam = odemeler.reduce((t, o) => t + Number(o.tutar), 0)
  const tarihMetni = new Date(`${tarih}T12:00:00`).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-cream py-8 px-4">
      <style>{`
        /* Bir nüsha kartı (öğrenci/kurum kopyası) sayfa sonuna denk gelirse
           yazdırırken/PDF'e kaydederken ORTASINDAN kesilip ikinci sayfaya
           taşmasın diye — sığmıyorsa kart BÜTÜN halde bir sonraki sayfaya geçer. */
        .makbuz-karti {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          /* Sayfa kenar boşluklarını daraltıyoruz ki iki nüsha da (öğrenci +
             kurum kopyası) TEK sayfaya sığsın — tarayıcının varsayılan ~2cm'lik
             boşluğu, kartlar tam sığacakken bile ikinci sayfaya taşmasına
             sebep olabiliyordu. */
          @page { margin: 8mm; }
        }
      `}</style>
      <div className="max-w-xl mx-auto">
        <div className="no-print flex items-center justify-between mb-4">
          <Link to="/muhasebe" className="text-sm text-blue hover:underline">← Muhasebe'ye Dön</Link>
          <button
            onClick={() => window.print()}
            className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            Yazdır / PDF Kaydet
          </button>
        </div>

        <div className="space-y-3">
          <MakbuzGovdesi nusha="ÖĞRENCİ KOPYASI" odemeler={odemeler} ogrenciAdi={ogrenciAdi} tarihMetni={tarihMetni} toplam={toplam} ogrenciSutunuGoster={ogrenciSutunuGoster} adBul={adBul} />
          <p className="text-center text-xs text-gray-400">--------------------------- KESİM ALANI ---------------------------</p>
          <MakbuzGovdesi nusha="KURUM KOPYASI" odemeler={odemeler} ogrenciAdi={ogrenciAdi} tarihMetni={tarihMetni} toplam={toplam} ogrenciSutunuGoster={ogrenciSutunuGoster} adBul={adBul} />
        </div>
      </div>
    </div>
  )
}
