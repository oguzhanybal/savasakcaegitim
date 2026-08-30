import { useMemo, useState } from 'react'
import { saatGoster } from '../lib/saatFormat'

// DersProgrami.jsx'in "Yönetici" bölümüne eklenen yeni sekme — kullanıcı
// isteğiyle: "Günlük Müsaitlik" (bir günde tüm öğretmenlerin durumu) tek
// başına yeterli değildi, bir SINIFIN ya da bir ÖĞRETMENİN bütün haftalık
// programını TEK YERDE (gün gün tıklamadan) görebilmek isteniyordu. Bu
// bileşen, sınıf veya öğretmen seçilince o kişinin/sınıfın Pazartesi-
// Cumartesi arası tüm ders saatlerini saat satırı × gün sütunu şeklinde
// gösteren salt-okunur bir tablo. Günlük Müsaitlik'e (hücreye tıklayıp ders
// ekleme) DOKUNULMADI, o olduğu gibi duruyor — bu sadece ayrı, ek bir
// GÖRÜNTÜLEME aracı.

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

function saatKisalt(s) {
  return s ? s.slice(0, 5) : s
}

export default function HaftalikProgramGoruntule({ program, siniflar, ogretmenler }) {
  const [tip, setTip] = useState('sinif') // 'sinif' | 'ogretmen'
  const [seciliId, setSeciliId] = useState('')

  const filtreliDersler = useMemo(() => {
    if (!seciliId) return []
    return (program || []).filter((d) =>
      tip === 'sinif' ? d.sinif_id === seciliId : d.ogretmen_profile_id === seciliId
    )
  }, [program, tip, seciliId])

  const gunlereGore = useMemo(
    () =>
      GUNLER.map((_, gun) =>
        filtreliDersler
          .filter((d) => d.gun === gun)
          .sort((a, b) => (a.baslangic_saat || '').localeCompare(b.baslangic_saat || ''))
      ).slice(1),
    [filtreliDersler]
  )

  const saatSatirlari = useMemo(
    () => [...new Set(filtreliDersler.map((d) => saatKisalt(d.baslangic_saat)))].sort(),
    [filtreliDersler]
  )

  const secilenAd =
    tip === 'sinif'
      ? siniflar.find((s) => s.id === seciliId)?.ad
      : ogretmenler.find((o) => o.id === seciliId)?.ad_soyad

  function hucreDersleri(gun, saat) {
    return (gunlereGore[gun - 1] || []).filter((d) => saatKisalt(d.baslangic_saat) === saat)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
      <p className="font-semibold text-gray-700 mb-1">Haftalık Program Görüntüle</p>
      <p className="text-xs text-gray-500 mb-3">
        Bir sınıf ya da öğretmen seçin, o sınıfın/öğretmenin bütün haftalık ders programını tek tabloda görün.
      </p>
      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div className="flex bg-gray-50 border border-gray-200 rounded-lg overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => {
              setTip('sinif')
              setSeciliId('')
            }}
            className={`px-3 py-1.5 font-medium transition-colors ${
              tip === 'sinif' ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Sınıf
          </button>
          <button
            type="button"
            onClick={() => {
              setTip('ogretmen')
              setSeciliId('')
            }}
            className={`px-3 py-1.5 font-medium transition-colors ${
              tip === 'ogretmen' ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Öğretmen
          </button>
        </div>
        <div className="min-w-[220px]">
          <select
            value={seciliId}
            onChange={(e) => setSeciliId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            <option value="">{tip === 'sinif' ? 'Sınıf seçiniz...' : 'Öğretmen seçiniz...'}</option>
            {tip === 'sinif'
              ? siniflar.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.ad}
                  </option>
                ))
              : ogretmenler.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.brans ? `${o.ad_soyad} — ${o.brans}` : o.ad_soyad}
                  </option>
                ))}
          </select>
        </div>
      </div>

      {!seciliId && <p className="text-gray-400 text-sm">Yukarıdan bir {tip === 'sinif' ? 'sınıf' : 'öğretmen'} seçin.</p>}

      {seciliId && filtreliDersler.length === 0 && (
        <p className="text-gray-400 text-sm">{secilenAd || 'Seçilen'} için programlanmış ders bulunamadı.</p>
      )}

      {seciliId && filtreliDersler.length > 0 && (
        <div className="overflow-x-auto touch-pan-x touch-pan-y">
          <table className="w-full text-sm border-collapse min-w-[720px]">
            <thead>
              <tr>
                <th className="text-left px-2 py-2 border-b border-gray-100 text-gray-500 font-medium whitespace-nowrap">Saat</th>
                {GUNLER.slice(1, 7).map((g) => (
                  <th key={g} className="text-left px-2 py-2 border-b border-gray-100 text-gray-500 font-medium">
                    {g}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {saatSatirlari.map((saat) => (
                <tr key={saat} className="border-b border-gray-50">
                  <td className="px-2 py-2 text-gray-400 whitespace-nowrap align-top">{saatGoster(saat)}</td>
                  {[1, 2, 3, 4, 5, 6].map((gun) => {
                    const dersler = hucreDersleri(gun, saat)
                    return (
                      <td key={gun} className="px-2 py-2 align-top">
                        {dersler.length === 0 ? (
                          <span className="text-gray-200">—</span>
                        ) : (
                          dersler.map((d) => (
                            <div key={d.id} className="mb-1.5 last:mb-0">
                              <p className="font-medium text-gray-800 leading-tight">{d.ders_adi || 'Ders'}</p>
                              <p className="text-xs text-gray-400 leading-tight">
                                {tip === 'sinif' ? d.ogretmen_adi : d.sinif_adi}
                              </p>
                            </div>
                          ))
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
