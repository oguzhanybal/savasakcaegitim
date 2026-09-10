import { useMemo, useState } from 'react'
import { DERS_PERIYOTLARI } from '../lib/dersPeriyotlari'
import { saatGoster } from '../lib/saatFormat'

// DersProgrami.jsx'in "Yönetici" bölümüne eklenen YENİ, EK bir görünüm —
// kullanıcı isteğiyle: "Günlük Müsaitlik" tablosu satırda ÖĞRETMEN, hücrede
// SINIF gösteriyor ("hangi öğretmen ne zaman dolu" sorusuna cevap veriyor).
// Bu bileşen bunun TAM TERSİNİ gösteriyor — satırda SINIF, hücrede ÖĞRETMEN
// ("bu sınıfın bu saatte dersi kim veriyor / hiç dersi var mı" sorusuna
// cevap). Günlük Müsaitlik'e HİÇ DOKUNULMADI, o olduğu gibi duruyor — bu
// sadece ayrı, salt-okunur (tıklanamaz, ders eklenemez/silinemez) bir
// GÖRÜNTÜLEME aracı, aynı "Ders Ekleme Aracı" sekmesindeki gibi ayrı bir
// sekme olarak eklendi (bkz. DersProgrami.jsx'teki yonetimGorunum='sinif').
//
// Veri kaynağı: programTum (ders_programi'nin TÜM satırları — aktif VE pasif/
// devredilmiş, bkz. DersProgrami.jsx'teki veriyiYenile). Sadece SINIF
// dersleri var burada — bire bir/soru çözümü ders_programi tablosunda hiç
// tutulmuyor, bu yüzden onlarla ilgilenmeye gerek yok.

function saatKisalt(s) {
  return s ? s.slice(0, 5) : s
}

function araliklarCakisiyorMu(b1, s1, b2, s2) {
  return saatKisalt(b1) < saatKisalt(s2) && saatKisalt(b2) < saatKisalt(s1)
}

function tarihStrYerel(isoStr) {
  if (!isoStr) return null
  const d = new Date(isoStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function yerelBugunTarihi() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
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

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

// HaftalikProgramGoruntule.jsx / DersProgrami.jsx'teki musaitlikIcinProgram
// ile BİREBİR AYNI mantık (kod tekrarı bilerek yapıldı, bkz. o dosyalardaki
// uzun açıklama — dosyalar birbirinden bağımsız tutuluyor): seçilen TARİHTE,
// her slot (sınıf+gün+saat) için GERÇEKTEN geçerli olan ders_programi
// satırını (eski/yeni öğretmen devri gözetilerek en yenisini) seçer.
function tarihIcinAktifProgram(programTum, tarih) {
  const bugun = yerelBugunTarihi()
  const gruplar = new Map()
  for (const d of programTum || []) {
    const anahtar = `${d.sinif_id || d.id}|${d.gun}|${d.baslangic_saat}-${d.bitis_saat}`
    if (!gruplar.has(anahtar)) gruplar.set(anahtar, [])
    gruplar.get(anahtar).push(d)
  }
  const sonuc = []
  for (const satirlar of gruplar.values()) {
    let enYeni = null
    let enYeniEsasTarih = null
    for (const d of satirlar) {
      const esasTarih = d.baslangic_tarihi || tarihStrYerel(d.created_at)
      if (esasTarih && esasTarih > tarih) continue
      if (d.aktif === false) {
        if (!d.pasif_tarihi || tarih > d.pasif_tarihi) continue
        if (tarih === d.pasif_tarihi && tarih === bugun) continue
      }
      const karsilastirma = `${esasTarih || ''}T${d.created_at || ''}`
      const enYeniKarsilastirma =
        enYeniEsasTarih !== null ? `${enYeniEsasTarih || ''}T${enYeni.created_at || ''}` : null
      if (!enYeni || karsilastirma > enYeniKarsilastirma) {
        enYeni = d
        enYeniEsasTarih = esasTarih
      }
    }
    if (enYeni) sonuc.push(enYeni)
  }
  return sonuc
}

const SAAT_DILIMLERI = DERS_PERIYOTLARI

export default function SinifBazliProgramTablosu({ programTum, siniflar }) {
  const [tarih, setTarih] = useState(yerelBugunTarihi())
  const gun = gunNumaraTarihten(tarih)

  // Seçili tarihte GERÇEKTEN geçerli olan (eski/yeni öğretmen devri dahil)
  // sınıf dersleri, o günün gününe göre süzülmüş.
  const gununDersleri = useMemo(() => {
    return tarihIcinAktifProgram(programTum, tarih).filter((d) => d.gun === gun)
  }, [programTum, tarih, gun])

  // Her sınıf için, o günkü tüm ders saatlerini tek listede topluyoruz.
  const sinifMesguliyetleri = useMemo(() => {
    const harita = new Map()
    for (const s of siniflar || []) harita.set(s.id, [])
    for (const d of gununDersleri) {
      if (!harita.has(d.sinif_id)) continue
      harita.get(d.sinif_id).push({
        baslangic: d.baslangic_saat,
        bitis: d.bitis_saat,
        // Bu tablonun asıl amacı "bu saatte kim ders veriyor" sorusuna cevap
        // vermek — o yüzden birincil bilgi öğretmen adı. Ders adı, öğretmenin
        // branşından farklı/ekstra bir bilgi taşıyorsa (ör. "AYT Matematik")
        // altında küçük ikinci bir satır olarak gösteriliyor.
        ogretmenAdi: d.ogretmen_adi || 'Öğretmen atanmamış',
        dersAdi: d.ders_adi && d.ders_adi !== d.ogretmen_brans ? d.ders_adi : null,
        id: d.id,
      })
    }
    return harita
  }, [siniflar, gununDersleri])

  function hucreDurumu(sinifId, dilim) {
    const mesguliyetler = sinifMesguliyetleri.get(sinifId) || []
    return mesguliyetler.find((m) => araliklarCakisiyorMu(dilim.baslangic, dilim.bitis, m.baslangic, m.bitis))
  }

  // Aynı ders birden fazla 45dk+10dk sütununu kaplıyorsa (ör. art arda iki
  // periyot), ardışık sütunları TEK hücrede birleştiriyoruz (colSpan) — bkz.
  // MusaitlikTablosu.jsx'teki aynı isimli fonksiyon, birebir aynı mantık.
  function satirHucreleriniOlustur(sinifId) {
    const hucreler = []
    let i = 0
    while (i < SAAT_DILIMLERI.length) {
      const dilim = SAAT_DILIMLERI[i]
      const dolu = hucreDurumu(sinifId, dilim)
      let span = 1
      if (dolu) {
        while (i + span < SAAT_DILIMLERI.length && hucreDurumu(sinifId, SAAT_DILIMLERI[i + span]) === dolu) {
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
          <h2 className="font-semibold text-gray-700">Sınıf Bazlı Program</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Hangi sınıfın hangi saatte dersi var, kim veriyor — Günlük Müsaitlik'in tam tersi (satırda sınıf, hücrede öğretmen).
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
      <div className="overflow-x-auto" style={{ touchAction: 'pan-x pan-y' }}>
        <table className="border-collapse text-xs w-full">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-navy text-white px-3 py-2 text-left font-semibold min-w-[150px]">Sınıf</th>
              {SAAT_DILIMLERI.map((d) => (
                <th key={d.baslangic} className="bg-navy text-white px-1 py-2 font-medium border-l border-white/10 min-w-[46px]">
                  <span className="block">{saatGoster(d.baslangic)}</span>
                  <span className="block text-[9px] font-normal opacity-70">{saatGoster(d.bitis)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(siniflar || []).map((s, i) => {
              const hucreler = satirHucreleriniOlustur(s.id)
              return (
                <tr key={s.id} className={i % 2 ? 'bg-gray-50/60' : ''}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-semibold text-gray-700 border-t border-gray-100 whitespace-nowrap">
                    {s.ad}
                  </td>
                  {hucreler.map((h) => (
                    <td
                      key={h.baslangic}
                      colSpan={h.span}
                      title={h.dolu ? `${h.dolu.ogretmenAdi} (${saatGoster(h.dolu.baslangic)}–${saatGoster(h.dolu.bitis)})` : 'Boş'}
                      className={`border-t border-l border-gray-100 text-center align-middle py-1 ${
                        h.dolu ? 'bg-blue-200 text-blue-900 border-l-4 border-l-blue-600' : 'bg-green-50 h-8'
                      }`}
                    >
                      {h.dolu && (
                        <span className="leading-none block px-0.5">
                          <span className="block font-semibold truncate max-w-[120px] mx-auto">{h.dolu.ogretmenAdi}</span>
                          {h.dolu.dersAdi && <span className="block text-[9px] font-normal opacity-70 truncate max-w-[120px] mx-auto">{h.dolu.dersAdi}</span>}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
            {(siniflar || []).length === 0 && (
              <tr>
                <td colSpan={SAAT_DILIMLERI.length + 1} className="text-center text-gray-400 py-6">
                  Henüz sınıf eklenmemiş.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex items-center gap-4 flex-wrap text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-50 border border-green-200 inline-block"></span> Boş
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-blue-200 border-l-4 border-l-blue-600 inline-block"></span> Ders (öğretmen adı hücrede)
        </span>
      </div>
    </div>
  )
}
