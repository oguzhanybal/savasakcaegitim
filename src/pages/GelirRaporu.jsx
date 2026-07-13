import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { paraFormat } from '../lib/ekstreHesap'

// Bilinen kalemler bu sırayla gösterilir; veride bunların dışında bir kalem
// çıkarsa (ör. eski/elle girilmiş farklı bir isim) sona, alfabetik sırayla eklenir.
const BILINEN_KALEM_SIRASI = ['Okul', 'Kurs', 'Kitap', 'Bire Bir', 'Yemek', 'Kantin']

function ayAnahtari(tarihStr) {
  const d = new Date(tarihStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function ayEtiketi(ay) {
  return new Date(ay + '-01').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
}

export default function GelirRaporu() {
  const [odemeler, setOdemeler] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('odemeler')
      .select('*')
      .order('tarih', { ascending: false })
      .then(({ data }) => {
        setOdemeler(data || [])
        setLoading(false)
      })
  }, [])

  const { aylar, kalemler, satirlar, kalemToplamlari, genelToplam } = useMemo(() => {
    const kalemSet = new Set()
    const ayMap = new Map() // "YYYY-MM" -> { [kalem]: tutar, __toplam }

    for (const o of odemeler) {
      if (!o.tarih) continue
      const ay = ayAnahtari(o.tarih)
      const kalem = o.kalem || 'Belirtilmemiş'
      kalemSet.add(kalem)
      if (!ayMap.has(ay)) ayMap.set(ay, { __toplam: 0 })
      const satir = ayMap.get(ay)
      satir[kalem] = (satir[kalem] || 0) + Number(o.tutar)
      satir.__toplam += Number(o.tutar)
    }

    const bilinenler = BILINEN_KALEM_SIRASI.filter((k) => kalemSet.has(k))
    const digerleri = [...kalemSet]
      .filter((k) => !BILINEN_KALEM_SIRASI.includes(k))
      .sort((a, b) => a.localeCompare(b, 'tr'))
    const kalemler = [...bilinenler, ...digerleri]

    // En yeni ay en üstte.
    const aylar = [...ayMap.keys()].sort((a, b) => (a < b ? 1 : -1))

    const kalemToplamlari = {}
    let genelToplam = 0
    for (const ay of aylar) {
      const satir = ayMap.get(ay)
      for (const k of kalemler) {
        kalemToplamlari[k] = (kalemToplamlari[k] || 0) + (satir[k] || 0)
      }
      genelToplam += satir.__toplam
    }

    return { aylar, kalemler, satirlar: ayMap, kalemToplamlari, genelToplam }
  }, [odemeler])

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-2">Gelir Raporu</h1>
      <p className="text-sm text-gray-500 mb-6">
        Her ay fiilen alınan (tahsil edilmiş) ödemelerin kalem bazında dökümü — bu, öğrencilerin borcu değil,
        gerçekten elinize geçen tutarları gösterir.
      </p>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6 inline-block">
        <p className="text-sm text-gray-500 font-medium">Toplam Alınan (Tüm Zamanlar)</p>
        <p className="text-2xl font-bold text-green-600 mt-1">{paraFormat(genelToplam)}</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="bg-navy text-white text-left">
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Ay</th>
              {kalemler.map((k) => (
                <th key={k} className="px-4 py-3 font-semibold text-right whitespace-nowrap">
                  {k}
                </th>
              ))}
              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Toplam</th>
            </tr>
          </thead>
          <tbody>
            {aylar.length === 0 && (
              <tr>
                <td colSpan={kalemler.length + 2} className="px-4 py-6 text-center text-gray-400">
                  Hiç ödeme kaydı yok.
                </td>
              </tr>
            )}
            {aylar.map((ay, i) => {
              const satir = satirlar.get(ay)
              return (
                <tr key={ay} className={i % 2 ? 'bg-gray-50' : ''}>
                  <td className="px-4 py-2 font-medium text-gray-800 capitalize whitespace-nowrap">{ayEtiketi(ay)}</td>
                  {kalemler.map((k) => (
                    <td key={k} className="px-4 py-2 text-right text-gray-600">
                      {satir[k] ? paraFormat(satir[k]) : '—'}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold text-navy">{paraFormat(satir.__toplam)}</td>
                </tr>
              )
            })}
          </tbody>
          {aylar.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                <td className="px-4 py-3 text-gray-800 whitespace-nowrap">Genel Toplam</td>
                {kalemler.map((k) => (
                  <td key={k} className="px-4 py-3 text-right text-gray-800">
                    {paraFormat(kalemToplamlari[k] || 0)}
                  </td>
                ))}
                <td className="px-4 py-3 text-right text-green-700">{paraFormat(genelToplam)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        "Dağıtılmamış" kalemi, veli henüz hangi kaleme gideceği belirlenmemiş genel bir ödeme bıraktığında
        oluşur — Muhasebe sayfasından kalemlere dağıtıldığında buradaki ilgili kaleme geçer.
      </p>
    </div>
  )
}
