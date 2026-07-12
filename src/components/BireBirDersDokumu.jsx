import { useMemo, useState } from 'react'
import { paraFormat, haftaBaslangici, haftaEtiketi, ayBaslangici, ayEtiketi } from '../lib/ekstreHesap'

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

function gunNumaraTarihten(tarihStr) {
  const g = new Date(tarihStr + 'T12:00:00').getDay()
  return g === 0 ? 7 : g
}

// Bugünün tarihini "YYYY-MM-DD" olarak YEREL saate göre üretir (toISOString
// KULLANMIYORUZ — Türkiye UTC+3 gece yarısına yakın saatlerde bir gün geriye kayabiliyor).
function yerelBugunTarihi() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// Bir kişinin (öğrenci ya da öğretmen) tüm bire bir derslerini haftalık ya da
// aylık gruplar halinde, yazdırılabilir/PDF alınabilir bir tablo olarak
// gösterir. Hem Ekstre.jsx (öğrenci ekstresi) hem OgretmenEkstre.jsx (öğretmen
// ekstresi) bu bileşeni ortak kullanıyor — aynı mantık, sadece "karşı taraf"ın
// kim olduğu (öğretmen mi öğrenci mi) değişiyor.
//
// dersler: [{ id, tarih, baslangicSaat, bitisSaat, karsiTarafAdi, tutar }]
export default function BireBirDersDokumu({ dersler, karsiTarafBasligi, baslangicPeriyot = 'ay' }) {
  const [periyot, setPeriyot] = useState(baslangicPeriyot) // 'hafta' | 'ay'
  const [gosterilenSayisi, setGosterilenSayisi] = useState(6)

  // İçinde bulunduğumuz haftanın/ayın anahtarını döner — AMA sadece o dönemde
  // gerçekten ders varsa (yoksa boş döner, en yeni dönemlerden sayfalanmış
  // listeye düşülür). Sayfa ilk açıldığında ve Haftalık/Aylık geçişte bu dönem
  // otomatik seçili gelsin diye.
  function icindeBulunulanDonem(periyotDegeri) {
    const anahtarUret = periyotDegeri === 'ay' ? ayBaslangici : haftaBaslangici
    const hedef = anahtarUret(yerelBugunTarihi())
    return dersler.some((d) => anahtarUret(d.tarih) === hedef) ? hedef : ''
  }

  // Boşsa en yeni dönemlerden sayfalanmış liste; doluysa (içinde bulunulan
  // dönem ya da elle seçilen) sadece o tek dönem gösterilir.
  const [seciliDonem, setSeciliDonem] = useState(() => icindeBulunulanDonem(baslangicPeriyot))

  const tumGruplar = useMemo(() => {
    const anahtarUret = periyot === 'ay' ? ayBaslangici : haftaBaslangici
    const gruplar = dersler.reduce((acc, d) => {
      const anahtar = anahtarUret(d.tarih)
      if (!acc[anahtar]) acc[anahtar] = []
      acc[anahtar].push(d)
      return acc
    }, {})
    return Object.entries(gruplar).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [dersler, periyot])

  const gosterilenGruplar = seciliDonem
    ? tumGruplar.filter(([anahtar]) => anahtar === seciliDonem)
    : tumGruplar.slice(0, gosterilenSayisi)
  const etiketUret = periyot === 'ay' ? ayEtiketi : haftaEtiketi

  if (dersler.length === 0) {
    return <p className="text-sm text-gray-400">Kayıtlı ders bulunamadı.</p>
  }

  return (
    <div>
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
      </div>

      {gosterilenGruplar.map(([anahtar, grupDersleri]) => {
        const grupToplami = grupDersleri.reduce((t, d) => t + d.tutar, 0)
        // Belirli bir HAFTA seçiliyse, o haftayı tek tabloda değil gün gün
        // (Pazartesi, Salı...) ayrı ayrı gösteriyoruz.
        const gunGunMu = periyot === 'hafta' && seciliDonem === anahtar
        const gunGruplari = gunGunMu
          ? Object.entries(
              grupDersleri.reduce((acc, d) => {
                if (!acc[d.tarih]) acc[d.tarih] = []
                acc[d.tarih].push(d)
                return acc
              }, {})
            ).sort((a, b) => (a[0] < b[0] ? -1 : 1))
          : null

        const tabloYaz = (dersListesi, toplam) => (
          <table className="w-full text-xs sm:text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-navy text-white text-left">
                <th className="px-2 sm:px-3 py-2 font-semibold">Tarih</th>
                <th className="px-2 sm:px-3 py-2 font-semibold">Saat</th>
                <th className="px-2 sm:px-3 py-2 font-semibold">{karsiTarafBasligi}</th>
                <th className="px-2 sm:px-3 py-2 font-semibold text-right">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {dersListesi.map((d, i) => (
                <tr key={d.id} className={i % 2 ? 'bg-gray-50' : ''}>
                  <td className="px-2 sm:px-3 py-2">{new Date(d.tarih + 'T12:00:00').toLocaleDateString('tr-TR')}</td>
                  <td className="px-2 sm:px-3 py-2 text-gray-500">
                    {d.baslangicSaat ? `${d.baslangicSaat.slice(0, 5)}${d.bitisSaat ? '–' + d.bitisSaat.slice(0, 5) : ''}` : '—'}
                  </td>
                  <td className="px-2 sm:px-3 py-2">{d.karsiTarafAdi || '—'}</td>
                  <td className="px-2 sm:px-3 py-2 text-right font-medium">{paraFormat(d.tutar)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={3} className="px-2 sm:px-3 py-2 text-right">Toplam</td>
                <td className="px-2 sm:px-3 py-2 text-right">{paraFormat(toplam)}</td>
              </tr>
            </tfoot>
          </table>
        )

        return (
          <div key={anahtar} className="mb-4">
            <div className="flex justify-between items-center mb-1">
              <p className="font-semibold text-navy text-sm capitalize">{etiketUret(anahtar)}</p>
              <p className="text-xs text-gray-500">{grupDersleri.length} ders</p>
            </div>
            {gunGunMu ? (
              gunGruplari.map(([tarih, gunDersleri]) => (
                <div key={tarih} className="mb-3 last:mb-0">
                  <p className="text-sm font-bold text-white bg-navy rounded-lg px-3 py-1.5 mb-2 tracking-wide">
                    {GUNLER[gunNumaraTarihten(tarih)]} — {new Date(tarih + 'T12:00:00').toLocaleDateString('tr-TR')}
                  </p>
                  {tabloYaz(gunDersleri, gunDersleri.reduce((t, d) => t + d.tutar, 0))}
                </div>
              ))
            ) : (
              tabloYaz(grupDersleri, grupToplami)
            )}
          </div>
        )
      })}

      {seciliDonem && (
        <button
          type="button"
          onClick={() => setSeciliDonem('')}
          className="no-print text-navy text-sm font-semibold underline hover:no-underline"
        >
          ← Tüm {periyot === 'ay' ? 'ayları' : 'haftaları'} listele
        </button>
      )}
      {!seciliDonem && gosterilenGruplar.length < tumGruplar.length && (
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
