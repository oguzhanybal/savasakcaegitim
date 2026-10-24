import { useEffect, useMemo, useState } from 'react'
import { supabase, tumSatirlariGetir } from '../lib/supabase'
import { paraFormat, taksitPlaniOlustur, bireBirBorclariOlustur, kantinBorclariOlustur } from '../lib/ekstreHesap'

// Bilinen kalemler bu sırayla gösterilir; veride bunların dışında bir kalem
// çıkarsa (ör. eski/elle girilmiş farklı bir isim) sona, alfabetik sırayla eklenir.
const BILINEN_KALEM_SIRASI = ['Okul', 'Kurs', 'Kitap', 'Deneme Kulübü', 'Bire Bir', 'Yemek', 'Kantin']

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
  // Aşağıdaki dördü SADECE "Beklenen" (normalde o ay tahsil edilmesi gereken
  // tutar) hesabı için gerekiyor — "Alınan" taraf zaten tek başına odemeler'den
  // çıkıyor. Bkz. aşağıdaki useMemo içindeki "BEKLENEN" bölümü.
  const [sozlesmeler, setSozlesmeler] = useState([])
  const [aylikBorclarHam, setAylikBorclarHam] = useState([])
  const [bireBirAtamalari, setBireBirAtamalari] = useState([])
  const [bireBirYoklama, setBireBirYoklama] = useState([])
  const [kantinAlislari, setKantinAlislari] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // ÖNEMLİ (bkz. supabase.js → tumSatirlariGetir yorumu): bu rapor TÜM
    // ZAMANLARI ay ay listelediği için her tablonun TAMAMI gerekiyor — 1000
    // satırı geçtiğinde filtresiz sorgu sessizce kesilip EN ESKİ aylar (ya da
    // en eski sözleşmeler/yoklamalar) kaybolabiliyordu. Sayfalanarak tüm veri
    // çekiliyor (hem gerçekleşen hem de normalde gerekli olan taraf için).
    Promise.all([
      tumSatirlariGetir(() => supabase.from('odemeler').select('*').order('tarih', { ascending: false })),
      tumSatirlariGetir(() => supabase.from('giderler').select('*').order('tarih', { ascending: false })),
      tumSatirlariGetir(() => supabase.from('sozlesmeler').select('*')),
      tumSatirlariGetir(() => supabase.from('aylik_borclar').select('*')),
      tumSatirlariGetir(() => supabase.from('bire_bir_atamalari').select('*')),
      tumSatirlariGetir(() => supabase.from('bire_bir_yoklama').select('*')),
      tumSatirlariGetir(() => supabase.from('kantin_alislar').select('*')),
    ]).then(([o, g, s, ab, bba, bby, ka]) => {
      setOdemeler(o.data || [])
      setGiderler(g.data || [])
      setSozlesmeler(s.data || [])
      setAylikBorclarHam(ab.data || [])
      setBireBirAtamalari(bba.data || [])
      setBireBirYoklama(bby.data || [])
      setKantinAlislari(ka.data || [])
      setLoading(false)
    })
  }, [])

  const {
    aylar,
    kalemler,
    satirlar,
    beklenenSatirlar,
    giderAylik,
    kalemToplamlari,
    beklenenKalemToplamlari,
    genelToplamGelir,
    genelToplamGider,
    genelToplamBeklenen,
  } = useMemo(() => {
    const kalemSet = new Set()
    const ayMap = new Map() // "YYYY-MM" -> { [kalem]: tutar, __toplam }  (ALINAN — fiilen tahsil edilmiş)

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

    // ========================================================================
    // BEKLENEN — "normalde o ay ne kadar almamız gerekiyordu" (fiilen alınan
    // değil, o ay vadesi/dönemi gelen borç). İki ayrı kaynaktan geliyor:
    //   1) Okul/Kurs/Kitap/Deneme Kulübü gibi TAKSİTLİ kalemler: her
    //      sözleşmenin taksit planı (taksitPlaniOlustur) çıkarılıp her
    //      taksitin VADE AYINA göre toplanıyor. odemeler parametresi boş
    //      geçiliyor çünkü sadece taksitin kendi tutarı/vadesi lazım (durum/
    //      ödenen alanlarıyla ilgilenmiyoruz, onu zaten "Alınan" tarafı
    //      odemeler'den ayrıca hesaplıyor).
    //   2) Bire Bir/Yemek/Kantin gibi taksitsiz, AYLIK KALEM borçları: elle
    //      girilmiş aylik_borclar satırları + yoklamadan otomatik türeyen
    //      Bire Bir borçları + kantin alışlarından türeyen Kantin borçları,
    //      hepsi kendi "donem" alanına göre toplanıyor — Muhasebe.jsx'teki
    //      per-öğrenci borç hesabıyla AYNI motor (bireBirBorclariOlustur /
    //      kantinBorclariOlustur), burada sadece TÜM öğrenciler için.
    // ========================================================================
    const beklenenAyMap = new Map() // "YYYY-MM" -> { [kalem]: tutar, __toplam }

    function beklenenEkle(ay, kalem, tutar) {
      if (!ay || !tutar) return
      kalemSet.add(kalem)
      if (!beklenenAyMap.has(ay)) beklenenAyMap.set(ay, { __toplam: 0 })
      const satir = beklenenAyMap.get(ay)
      satir[kalem] = (satir[kalem] || 0) + tutar
      satir.__toplam += tutar
    }

    for (const s of sozlesmeler) {
      const taksitler = taksitPlaniOlustur(s, [])
      for (const t of taksitler) {
        beklenenEkle(ayAnahtari(t.vade), s.kalem || 'Belirtilmemiş', t.tutar)
      }
    }

    const bireBirBorclar = bireBirBorclariOlustur(bireBirAtamalari, bireBirYoklama)
    const kantinBorclar = kantinBorclariOlustur(kantinAlislari)
    for (const b of [...aylikBorclarHam, ...bireBirBorclar, ...kantinBorclar]) {
      if (!b.donem) continue
      beklenenEkle(ayAnahtari(b.donem), b.kalem || 'Belirtilmemiş', Number(b.tutar) || 0)
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

    // Sadece gelir kaydı olan değil, sadece gider ya da sadece beklenen
    // (ör. henüz vadesi gelmemiş/ödenmemiş gelecek bir ay taksiti) kaydı olan
    // aylar da listeye girsin diye üç tarafın ay anahtarlarının birleşimi alınıyor.
    const tumAylar = new Set([...ayMap.keys(), ...giderAylik.keys(), ...beklenenAyMap.keys()])
    const aylar = [...tumAylar].sort((a, b) => (a < b ? 1 : -1))

    const kalemToplamlari = {}
    const beklenenKalemToplamlari = {}
    let genelToplamGelir = 0
    let genelToplamGider = 0
    let genelToplamBeklenen = 0
    for (const ay of aylar) {
      const satir = ayMap.get(ay) || { __toplam: 0 }
      const beklenenSatir = beklenenAyMap.get(ay) || { __toplam: 0 }
      for (const k of kalemler) {
        kalemToplamlari[k] = (kalemToplamlari[k] || 0) + (satir[k] || 0)
        beklenenKalemToplamlari[k] = (beklenenKalemToplamlari[k] || 0) + (beklenenSatir[k] || 0)
      }
      genelToplamGelir += satir.__toplam
      genelToplamGider += giderAylik.get(ay) || 0
      genelToplamBeklenen += beklenenSatir.__toplam
    }

    return {
      aylar,
      kalemler,
      satirlar: ayMap,
      beklenenSatirlar: beklenenAyMap,
      giderAylik,
      kalemToplamlari,
      beklenenKalemToplamlari,
      genelToplamGelir,
      genelToplamGider,
      genelToplamBeklenen,
    }
  }, [odemeler, giderler, sozlesmeler, aylikBorclarHam, bireBirAtamalari, bireBirYoklama, kantinAlislari])

  const netKarZarar = genelToplamGelir - genelToplamGider
  const tahsilatOrani = genelToplamBeklenen > 0 ? (genelToplamGelir / genelToplamBeklenen) * 100 : null

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-2">Gelir-Gider Raporu</h1>
      <p className="text-sm text-gray-500 mb-6">
        Her ay kalem bazında "Beklenen" (o ay vadesi/dönemi gelen taksit ve aylık borçların toplamı — normalde
        almamız gereken) ile "Alınan" (fiilen tahsil edilmiş) tutarların karşılaştırması, o ayın toplam gideri
        ve aradaki net kâr/zarar farkı.
      </p>

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 font-medium">Beklenen (Tüm Zamanlar)</p>
          <p className="text-2xl font-bold text-navy mt-1">{paraFormat(genelToplamBeklenen)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 font-medium">Alınan (Tüm Zamanlar)</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{paraFormat(genelToplamGelir)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 font-medium">Tahsilat Oranı</p>
          <p className="text-2xl font-bold text-blue mt-1">{tahsilatOrani == null ? '—' : `%${tahsilatOrani.toFixed(0)}`}</p>
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

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto" style={{ touchAction: 'pan-x pan-y' }}>
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="bg-navy text-white text-left">
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Ay</th>
              {kalemler.map((k) => (
                <th key={k} className="px-4 py-3 font-semibold text-right whitespace-nowrap">
                  {k}
                  <span className="block text-[10px] font-normal text-white/60">Beklenen / Alınan</span>
                </th>
              ))}
              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Beklenen Toplam</th>
              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Alınan Toplam</th>
              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Gider</th>
              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Net Kâr/Zarar</th>
            </tr>
          </thead>
          <tbody>
            {aylar.length === 0 && (
              <tr>
                <td colSpan={kalemler.length + 5} className="px-4 py-6 text-center text-gray-400">
                  Hiç gelir/gider kaydı yok.
                </td>
              </tr>
            )}
            {aylar.map((ay, i) => {
              const satir = satirlar.get(ay) || { __toplam: 0 }
              const beklenenSatir = beklenenSatirlar.get(ay) || { __toplam: 0 }
              const gider = giderAylik.get(ay) || 0
              const net = satir.__toplam - gider
              return (
                <tr key={ay} className={i % 2 ? 'bg-gray-50' : ''}>
                  <td className="px-4 py-2 font-medium text-gray-800 capitalize whitespace-nowrap">{ayEtiketi(ay)}</td>
                  {kalemler.map((k) => (
                    <td key={k} className="px-4 py-2 text-right whitespace-nowrap">
                      <div className="text-gray-400 text-xs">{beklenenSatir[k] ? paraFormat(beklenenSatir[k]) : '—'}</div>
                      <div className="text-gray-700 font-medium">{satir[k] ? paraFormat(satir[k]) : '—'}</div>
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold text-gray-500">{paraFormat(beklenenSatir.__toplam)}</td>
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
                  <td key={k} className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="text-gray-400 text-xs font-normal">{paraFormat(beklenenKalemToplamlari[k] || 0)}</div>
                    <div className="text-gray-800">{paraFormat(kalemToplamlari[k] || 0)}</div>
                  </td>
                ))}
                <td className="px-4 py-3 text-right text-gray-600">{paraFormat(genelToplamBeklenen)}</td>
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
        Her kalem hücresinde üstteki küçük gri rakam o ay normalde tahsil edilmesi gereken ("Beklenen" — taksit
        vadesi ya da Bire Bir/Yemek/Kantin borcunun ait olduğu dönem), alttaki koyu rakam ise fiilen o ay
        tahsil edilmiş ("Alınan") tutardır. "Dağıtılmamış" kalemi, veli henüz hangi kaleme gideceği
        belirlenmemiş genel bir ödeme bıraktığında oluşur — Muhasebe sayfasından kalemlere dağıtıldığında
        buradaki ilgili kaleme geçer. Gider detaylarını (kategori, açıklama) görmek ve yeni gider eklemek için
        Giderler sayfasını kullanabilirsiniz.
      </p>
    </div>
  )
}
