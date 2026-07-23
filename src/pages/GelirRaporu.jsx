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
  const [giderler, setGiderler] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('odemeler').select('*').order('tarih', { ascending: false }),
      supabase.from('giderler').select('*').order('tarih', { ascending: false }),
    ]).then(([o, g]) => {
      setOdemeler(o.data || [])
      setGiderler(g.data || [])
      setLoading(false)
    })
  }, [])

  const { aylar, kalemler, satirlar, giderAylik, kalemToplamlari, genelToplamGelir, genelToplamGider } =
    useMemo(() => {
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

      // Gider toplamları ay bazında ayrı bir haritada tutuluyor — giderlerin
      // kalemi (kategorisi) burada satır bazında ayrıştırılmıyor, sadece o
      // ayın TOPLAM gideri gösteriliyor (kategori bazlı döküm Giderler.jsx'te).
      const giderAylik = new Map() // "YYYY-MM" -> toplam
      for (const g of giderler) {
        if (!g.tarih) continue
        const ay = ayAnahtari(g.tarih)
        giderAylik.set(ay, (giderAylik.get(ay) || 0) + Number(g.tutar))
      }

      const bilinenler = BILINEN_KALEM_SIRASI.filter((k) => kalemSet.has(k))
      const digerleri = [...kalemSet]
        .filter((k) => !BILINEN_KALEM_SIRASI.includes(k))
        .sort((a, b) => a.localeCompare(b, 'tr'))
      const kalemler = [...bilinenler, ...digerleri]

      // Sadece gelir kaydı olan değil, sadece gider kaydı olan aylar da
      // listeye girsin diye iki tarafın ay anahtarlarının birleşimi alınıyor.
      const tumAylar = new Set([...ayMap.keys(), ...giderAylik.keys()])
      const aylar = [...tumAylar].sort((a, b) => (a < b ? 1 : -1))

      const kalemToplamlari = {}
      let genelToplamGelir = 0
      let genelToplamGider = 0
      for (const ay of aylar) {
        const satir = ayMap.get(ay) || { __toplam: 0 }
        for (const k of kalemler) {
          kalemToplamlari[k] = (kalemToplamlari[k] || 0) + (satir[k] || 0)
        }
        genelToplamGelir += satir.__toplam
        genelToplamGider += giderAylik.get(ay) || 0
      }

      return {
        aylar,
        kalemler,
        satirlar: ayMap,
        giderAylik,
        kalemToplamlari,
        genelToplamGelir,
        genelToplamGider,
      }
    }, [odemeler, giderler])

  const netKarZarar = genelToplamGelir - genelToplamGider

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-2">Gelir-Gider Raporu</h1>
      <p className="text-sm text-gray-500 mb-6">
        Her ay fiilen alınan (tahsil edilmiş) ödemelerin kalem bazında dökümü, o ayın toplam gideri ve aradaki
        net kâr/zarar farkı — bu, öğrencilerin borcu değil, gerçekten elinize geçen ve elden çıkan tutarları gösterir.
      </p>

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 font-medium">Toplam Alınan (Tüm Zamanlar)</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{paraFormat(genelToplamGelir)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 font-medium">Toplam Gider (Tüm Zamanlar)</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{paraFormat(genelToplamGider)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 font-medium">Net Kâr/Zarar (Tüm Zamanlar)</p>
          <p className={`text-2xl font-bold mt-1 ${netKarZarar >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {paraFormat(netKarZarar)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-navy text-white text-left">
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Ay</th>
              {kalemler.map((k) => (
                <th key={k} className="px-4 py-3 font-semibold text-right whitespace-nowrap">
                  {k}
                </th>
              ))}
              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Gelir Toplamı</th>
              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Gider</th>
              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Net Kâr/Zarar</th>
            </tr>
          </thead>
          <tbody>
            {aylar.length === 0 && (
              <tr>
                <td colSpan={kalemler.length + 4} className="px-4 py-6 text-center text-gray-400">
                  Hiç gelir/gider kaydı yok.
                </td>
              </tr>
            )}
            {aylar.map((ay, i) => {
              const satir = satirlar.get(ay) || { __toplam: 0 }
              const gider = giderAylik.get(ay) || 0
              const net = satir.__toplam - gider
              return (
                <tr key={ay} className={i % 2 ? 'bg-gray-50' : ''}>
                  <td className="px-4 py-2 font-medium text-gray-800 capitalize whitespace-nowrap">{ayEtiketi(ay)}</td>
                  {kalemler.map((k) => (
                    <td key={k} className="px-4 py-2 text-right text-gray-600">
                      {satir[k] ? paraFormat(satir[k]) : '—'}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold text-navy">{paraFormat(satir.__toplam)}</td>
                  <td className="px-4 py-2 text-right font-semibold text-red-700">{gider ? paraFormat(gider) : '—'}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {paraFormat(net)}
                  </td>
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
                <td className="px-4 py-3 text-right text-green-700">{paraFormat(genelToplamGelir)}</td>
                <td className="px-4 py-3 text-right text-red-700">{paraFormat(genelToplamGider)}</td>
                <td className={`px-4 py-3 text-right ${netKarZarar >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {paraFormat(netKarZarar)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        "Dağıtılmamış" kalemi, veli henüz hangi kaleme gideceği belirlenmemiş genel bir ödeme bıraktığında
        oluşur — Muhasebe sayfasından kalemlere dağıtıldığında buradaki ilgili kaleme geçer. Gider detaylarını
        (kategori, açıklama) görmek ve yeni gider eklemek için Giderler sayfasını kullanabilirsiniz.
      </p>
    </div>
  )
}
