import { useEffect, useMemo, useState } from 'react'
import { paraFormat, haftaBaslangici, haftaEtiketi, ayBaslangici, ayEtiketi } from '../lib/ekstreHesap'

// Bir öğrencinin TÜM kantin alışlarını (hangi ürün, kaç adet, ne zaman, ne
// tutar) haftalık/aylık/tüm zamanlar olarak gruplanmış, yazdırılabilir/PDF
// alınabilir bir tablo olarak gösterir. BireBirDersDokumu.jsx ile AYNI
// desen (dönem sekmeleri, dönem seçici, "daha eski göster") — sadece "gün
// gün" alt gruplama burada yok, kantin alışlarında buna gerek görülmedi.
//
// alislar: [{ id, tarih, urunAdi, adet, birimFiyat, tutar }]
// hedefDonem (opsiyonel): "YYYY-MM-01" — verilirse (ör. Ekstre.jsx'teki
// üstteki "Dönem" seçicisiyle senkron kalsın diye) bu bileşen İLK AÇILIŞTA
// ve hedefDonem her değiştiğinde otomatik o aya atlar.
export default function KantinAlisDokumu({ alislar, hedefDonem = null }) {
  const [periyot, setPeriyot] = useState(hedefDonem ? 'ay' : 'ay') // 'hafta' | 'ay' | 'hepsi'
  const [gosterilenSayisi, setGosterilenSayisi] = useState(6)

  function icindeBulunulanDonem(periyotDegeri) {
    const anahtarUret = periyotDegeri === 'ay' ? ayBaslangici : haftaBaslangici
    const n = new Date()
    const bugun = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
    const hedef = anahtarUret(bugun)
    return alislar.some((a) => anahtarUret(a.tarih) === hedef) ? hedef : ''
  }

  const [seciliDonem, setSeciliDonem] = useState(() => {
    if (hedefDonem) return alislar.some((a) => ayBaslangici(a.tarih) === hedefDonem) ? hedefDonem : ''
    return icindeBulunulanDonem('ay')
  })

  useEffect(() => {
    if (!hedefDonem) return
    setPeriyot('ay')
    setGosterilenSayisi(6)
    setSeciliDonem(alislar.some((a) => ayBaslangici(a.tarih) === hedefDonem) ? hedefDonem : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hedefDonem])

  const tumGruplar = useMemo(() => {
    if (periyot === 'hepsi') {
      return alislar.length > 0 ? [['tumu', alislar]] : []
    }
    const anahtarUret = periyot === 'ay' ? ayBaslangici : haftaBaslangici
    const gruplar = alislar.reduce((acc, a) => {
      const anahtar = anahtarUret(a.tarih)
      if (!acc[anahtar]) acc[anahtar] = []
      acc[anahtar].push(a)
      return acc
    }, {})
    return Object.entries(gruplar).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [alislar, periyot])

  const gosterilenGruplar = seciliDonem
    ? tumGruplar.filter(([anahtar]) => anahtar === seciliDonem)
    : tumGruplar.slice(0, gosterilenSayisi)
  const etiketUret = periyot === 'ay' ? ayEtiketi : periyot === 'hepsi' ? () => 'Tüm Zamanlar' : haftaEtiketi

  if (alislar.length === 0) {
    return <p className="text-sm text-gray-400">Kayıtlı kantin alışı bulunamadı.</p>
  }

  return (
    <div>
      <style>{`
        @media print {
          .kantin-donem-blok, .kantin-donem-blok table, tr { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
      <div className="no-print flex gap-1.5 mb-3 items-center flex-wrap">
        <button
          type="button"
          onClick={() => { setPeriyot('hafta'); setGosterilenSayisi(6); setSeciliDonem(icindeBulunulanDonem('hafta')) }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            periyot === 'hafta' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
          }`}
        >
          Haftalık
        </button>
        <button
          type="button"
          onClick={() => { setPeriyot('ay'); setGosterilenSayisi(6); setSeciliDonem(icindeBulunulanDonem('ay')) }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            periyot === 'ay' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
          }`}
        >
          Aylık
        </button>
        <button
          type="button"
          onClick={() => { setPeriyot('hepsi'); setGosterilenSayisi(6); setSeciliDonem('tumu') }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            periyot === 'hepsi' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
          }`}
        >
          Tüm Zamanlar
        </button>
        {periyot !== 'hepsi' && (
          <select
            value={seciliDonem}
            onChange={(e) => setSeciliDonem(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue"
          >
            <option value="">{periyot === 'ay' ? 'Bir ay seç...' : 'Bir hafta seç...'}</option>
            {tumGruplar.map(([anahtar]) => (
              <option key={anahtar} value={anahtar}>{etiketUret(anahtar)}</option>
            ))}
          </select>
        )}
      </div>

      {gosterilenGruplar.map(([anahtar, grupAlislari]) => {
        const grupToplami = grupAlislari.reduce((t, a) => t + a.tutar, 0)
        return (
          <div key={anahtar} className="mb-4 kantin-donem-blok">
            <div className="flex justify-between items-center mb-1">
              <p className="font-semibold text-navy text-sm capitalize">{etiketUret(anahtar)}</p>
              <p className="text-xs text-gray-500">{grupAlislari.length} alış</p>
            </div>
            <table className="w-full text-xs sm:text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-navy text-white text-left">
                  <th className="px-2 sm:px-3 py-2 font-semibold">Tarih</th>
                  <th className="px-2 sm:px-3 py-2 font-semibold">Ürün</th>
                  <th className="px-2 sm:px-3 py-2 font-semibold text-right">Adet</th>
                  <th className="px-2 sm:px-3 py-2 font-semibold text-right">Birim Fiyat</th>
                  <th className="px-2 sm:px-3 py-2 font-semibold text-right">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {grupAlislari.map((a, i) => (
                  <tr key={a.id} className={i % 2 ? 'bg-gray-50' : ''}>
                    <td className="px-2 sm:px-3 py-2">{new Date(a.tarih + 'T12:00:00').toLocaleDateString('tr-TR')}</td>
                    <td className="px-2 sm:px-3 py-2">{a.urunAdi || '—'}</td>
                    <td className="px-2 sm:px-3 py-2 text-right">{a.adet}</td>
                    <td className="px-2 sm:px-3 py-2 text-right text-gray-500">{paraFormat(a.birimFiyat)}</td>
                    <td className="px-2 sm:px-3 py-2 text-right font-medium">{paraFormat(a.tutar)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={4} className="px-2 sm:px-3 py-2 text-right">Toplam</td>
                  <td className="px-2 sm:px-3 py-2 text-right">{paraFormat(grupToplami)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      })}

      {periyot !== 'hepsi' && seciliDonem && (
        <button
          type="button"
          onClick={() => setSeciliDonem('')}
          className="no-print text-navy text-sm font-semibold underline hover:no-underline"
        >
          ← Tüm {periyot === 'ay' ? 'ayları' : 'haftaları'} listele
        </button>
      )}
      {periyot !== 'hepsi' && !seciliDonem && gosterilenGruplar.length < tumGruplar.length && (
        <button
          type="button"
          onClick={() => setGosterilenSayisi((n) => n + 6)}
          className="no-print text-navy text-sm font-semibold underline hover:no-underline"
        >
          Daha eski {periyot === 'ay' ? 'ayları' : 'haftaları'} göster ({tumGruplar.length - gosterilenGruplar.length} tane daha)
        </button>
      )}
    </div>
  )
}
