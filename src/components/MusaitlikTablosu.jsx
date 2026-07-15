import { useMemo, useState } from 'react'

// Hem Bire Bir sayfasında hem Ders Programı sayfasında kullanılan ortak bileşen:
// seçilen bir tarih için, tüm öğretmenlerin o gün hangi saatlerde dolu/boş
// olduğunu tek tabloda gösterir. Hem sınıf derslerini (ders_programi), hem
// haftalık bire bir dersleri (bire_bir_atamalari), hem de tek seferlik bire bir
// dersleri (bire_bir_yoklama, atama_id boş) birleştirir.
//
// onHucreTikla verilirse (opsiyonel), BOŞ hücreler tıklanabilir olur — üstteki
// sayfaya { ogretmenId, ogretmenAdi, tarih, gun, baslangic, bitis } bilgisini
// iletir. Dolu hücrelere tıklama hiçbir zaman bir şey yapmaz (yanlışlıkla
// üzerine yazmayı önlemek için).
//
// secili verilirse (opsiyonel, { ogretmenId, tarih, baslangic }), o hücre koyu
// renkle işaretlenir — kullanıcı tıkladıktan sonra "hangi saate ekliyordum"
// sorusuna cevap versin diye. Üstteki sayfa, ders eklenene/taslağa kaydedilene
// kadar bu bilgiyi tutar.

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

function saatKisalt(s) {
  return s ? s.slice(0, 5) : s
}

function araliklarCakisiyorMu(b1, s1, b2, s2) {
  return saatKisalt(b1) < saatKisalt(s2) && saatKisalt(b2) < saatKisalt(s1)
}

function gunNumaraTarihten(tarihStr) {
  if (!tarihStr) return null
  const g = new Date(tarihStr + 'T12:00:00').getDay()
  return g === 0 ? 7 : g
}

function gunEkle(tarihStr, gunSayisi) {
  const t = new Date(tarihStr + 'T12:00:00')
  t.setDate(t.getDate() + gunSayisi)
  return t.toISOString().slice(0, 10)
}

// 08:00'dan 22:00'a kadar, 30 dakikalık dilimler halinde sütun başlıkları.
const SAAT_DILIMLERI = (() => {
  const dilimler = []
  for (let dk = 8 * 60; dk < 22 * 60; dk += 30) {
    const bDk = dk
    const bitDk = dk + 30
    const yaz = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`
    dilimler.push({ baslangic: yaz(bDk), bitis: yaz(bitDk) })
  }
  return dilimler
})()

export default function MusaitlikTablosu({ ogretmenler, dersProgrami, atamalar, yoklamalar, ogrenciAdMap, onHucreTikla, secili }) {
  const [tarih, setTarih] = useState(() => new Date().toISOString().slice(0, 10))
  const gun = gunNumaraTarihten(tarih)

  // Her öğretmen için, seçilen tarihteki tüm dolu aralıkları (kaynağı ne olursa
  // olsun) tek listede topluyoruz.
  const ogretmenMesguliyetleri = useMemo(() => {
    const harita = new Map()
    for (const o of ogretmenler) harita.set(o.id, [])

    for (const d of dersProgrami) {
      if (d.gun !== gun || !harita.has(d.ogretmen_profile_id)) continue
      harita.get(d.ogretmen_profile_id).push({
        baslangic: d.baslangic_saat,
        bitis: d.bitis_saat,
        etiket: d.ders_adi || d.sinif_adi || 'Sınıf dersi',
        renk: 'bg-blue-100 text-blue-800',
      })
    }
    for (const a of atamalar || []) {
      if (!a.aktif || a.gun !== gun || !harita.has(a.ogretmen_profile_id)) continue
      harita.get(a.ogretmen_profile_id).push({
        baslangic: a.baslangic_saat,
        bitis: a.bitis_saat,
        etiket: a.ogrenci_adi || 'Bire bir',
        renk: 'bg-orange-100 text-orange-800',
      })
    }
    for (const y of yoklamalar || []) {
      if (y.atama_id || y.tarih !== tarih || !y.baslangic_saat || !y.bitis_saat) continue
      if (y.durum === 'gelmedi') continue // öğrenci gelmediyse o saat artık boş sayılır
      if (!harita.has(y.ogretmen_profile_id)) continue
      harita.get(y.ogretmen_profile_id).push({
        baslangic: y.baslangic_saat,
        bitis: y.bitis_saat,
        etiket: (ogrenciAdMap && ogrenciAdMap.get(y.ogrenci_id)) || 'Bire bir',
        renk: 'bg-orange-100 text-orange-800',
      })
    }
    return harita
  }, [ogretmenler, dersProgrami, atamalar, yoklamalar, gun, tarih, ogrenciAdMap])

  function hucreDurumu(ogretmenId, dilim) {
    const mesguliyetler = ogretmenMesguliyetleri.get(ogretmenId) || []
    return mesguliyetler.find((m) => araliklarCakisiyorMu(dilim.baslangic, dilim.bitis, m.baslangic, m.bitis))
  }

  // Aynı ders/atama, 30 dakikalık birden fazla sütuna yayılıyorsa (ör. 2 saatlik
  // bire bir ders 4 sütunü kaplıyorsa), her sütunda ismi tekrar tekrar basmak
  // yerine ardışık sütunları TEK hücrede birleştiriyoruz (colSpan) ve o hücrede
  // dersin gerçek başlangıç-bitiş saatini yazıyoruz. Böylece bir ders 45 dakika
  // sürüp bir sonraki 30'luk süturu tam doldurmasa bile, gerçek bitiş saati
  // hücrenin içinde açıkça görünür.
  function satirHucreleriniOlustur(ogretmenId) {
    const hucreler = []
    let i = 0
    while (i < SAAT_DILIMLERI.length) {
      const dilim = SAAT_DILIMLERI[i]
      const dolu = hucreDurumu(ogretmenId, dilim)
      let span = 1
      if (dolu) {
        while (
          i + span < SAAT_DILIMLERI.length &&
          hucreDurumu(ogretmenId, SAAT_DILIMLERI[i + span]) === dolu
        ) {
          span++
        }
      }
      hucreler.push({ baslangic: dilim.baslangic, bitis: dilim.bitis, span, dolu })
      i += span
    }
    return hucreler
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-gray-700">Günlük Müsaitlik</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Hangi öğretmenin hangi saatte dersi var, hangisi boş — tek bakışta.
            {onHucreTikla && ' Boş bir hücreye tıklayarak o saate direkt ders ekleyebilirsiniz.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setTarih((t) => gunEkle(t, -1))} className="px-2 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100">
            ◀
          </button>
          <input
            type="date"
            value={tarih}
            onChange={(e) => setTarih(e.target.value)}
            className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
          />
          <button type="button" onClick={() => setTarih((t) => gunEkle(t, 1))} className="px-2 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100">
            ▶
          </button>
          <span className="text-xs text-gray-400 whitespace-nowrap">{GUNLER[gun]}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs w-full">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-navy text-white px-3 py-2 text-left font-semibold min-w-[150px]">
                Öğretmen
              </th>
              {SAAT_DILIMLERI.map((d) => (
                <th key={d.baslangic} className="bg-navy text-white px-1 py-2 font-medium border-l border-white/10 min-w-[46px]">
                  {d.baslangic}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ogretmenler.map((o, i) => {
              const hucreler = satirHucreleriniOlustur(o.id)
              return (
                <tr key={o.id} className={i % 2 ? 'bg-gray-50/60' : ''}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-semibold text-gray-700 border-t border-gray-100 whitespace-nowrap">
                    {o.ad_soyad}
                  </td>
                  {hucreler.map((h) => {
                    const tiklanabilir = !h.dolu && !!onHucreTikla
                    const seciliMi =
                      !h.dolu &&
                      secili &&
                      secili.ogretmenId === o.id &&
                      secili.tarih === tarih &&
                      secili.baslangic === h.baslangic
                    return (
                      <td
                        key={h.baslangic}
                        colSpan={h.span}
                        title={
                          h.dolu
                            ? `${h.dolu.etiket} (${saatKisalt(h.dolu.baslangic)}–${saatKisalt(h.dolu.bitis)})`
                            : seciliMi
                            ? 'Şu an bunu ekliyorsunuz'
                            : tiklanabilir
                            ? 'Boş — tıklayarak ders ekle'
                            : 'Boş'
                        }
                        onClick={
                          tiklanabilir
                            ? () => onHucreTikla({ ogretmenId: o.id, ogretmenAdi: o.ad_soyad, tarih, gun, baslangic: h.baslangic, bitis: h.bitis })
                            : undefined
                        }
                        className={`border-t border-l border-gray-100 text-center align-middle py-1 ${
                          h.dolu
                            ? h.dolu.renk
                            : seciliMi
                            ? 'bg-navy text-white h-8 cursor-pointer ring-2 ring-inset ring-orange-400'
                            : tiklanabilir
                            ? 'bg-green-50 h-8 cursor-pointer hover:bg-green-200 transition-colors'
                            : 'bg-green-50 h-8'
                        }`}
                      >
                        {h.dolu ? (
                          <span className="leading-none block px-0.5">
                            <span className="block truncate text-[9px] font-medium">{h.dolu.etiket}</span>
                            <span className="block text-[8px] opacity-70 whitespace-nowrap">
                              {saatKisalt(h.dolu.baslangic)}–{saatKisalt(h.dolu.bitis)}
                            </span>
                          </span>
                        ) : seciliMi ? (
                          <span className="text-[9px] font-semibold">●</span>
                        ) : (
                          ''
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {ogretmenler.length === 0 && (
              <tr>
                <td colSpan={SAAT_DILIMLERI.length + 1} className="px-4 py-4 text-center text-gray-400">
                  Öğretmen bulunamadı.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4 text-[11px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-50 border border-green-200 inline-block"></span> Boş
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-100 inline-block"></span> Sınıf dersi
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-orange-100 inline-block"></span> Bire bir
        </span>
      </div>
    </div>
  )
}
