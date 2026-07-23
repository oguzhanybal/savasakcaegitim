import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import KonuTakipBolumu from './KonuTakipBolumu'

// Ders Programı'nda öğretmenin kendi dersinin yanındaki "Yoklama / Konu"
// butonuna tıklanınca açılan popup — o dersin yoklamasını almak VE o sınıfta
// o an işlenen konuyu işaretlemek TEK ekrandan yapılabilsin diye (ayrıca
// Yoklama Al sayfasına gitmeye gerek kalmadan). "tarih" prop'u varsayılan
// olarak o dersin haftanın hangi gününe denk geldiğine göre en yakın (bugün
// ya da bugünden önceki en yakın) tarih olarak hesaplanıp geliyor (bkz.
// DersProgrami.jsx: enYakinGunTarihi) — kullanıcı burada isterse değiştirebilir.
export default function YoklamaKonuModal({ dersProgramiId, sinifId, sinifAdi, dersAdi, tarih, profile, onClose }) {
  const [ogrenciler, setOgrenciler] = useState([])
  const [yoklamaDurumu, setYoklamaDurumu] = useState({})
  const [loading, setLoading] = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [kaydedildi, setKaydedildi] = useState(false)
  const [seciliTarih, setSeciliTarih] = useState(tarih)

  useEffect(() => {
    if (!sinifId) return
    setLoading(true)
    setKaydedildi(false)
    Promise.all([
      supabase.from('sinif_ogrenciler').select('ogrenciler(id, ad_soyad)').eq('sinif_id', sinifId),
      supabase.from('yoklama').select('*').eq('ders_programi_id', dersProgramiId).eq('tarih', seciliTarih),
    ]).then(([so, y]) => {
      setOgrenciler((so.data || []).map((r) => r.ogrenciler).filter(Boolean))
      const mevcut = {}
      ;(y.data || []).forEach((k) => {
        mevcut[k.ogrenci_id] = k.geldi
      })
      setYoklamaDurumu(mevcut)
      setLoading(false)
    })
  }, [sinifId, dersProgramiId, seciliTarih])

  function isaretle(ogrenciId, geldi) {
    setYoklamaDurumu((prev) => ({ ...prev, [ogrenciId]: geldi }))
  }

  async function kaydet() {
    setKaydediliyor(true)
    const kayitlar = ogrenciler.map((o) => ({
      sinif_id: sinifId,
      ders_programi_id: dersProgramiId,
      ogrenci_id: o.id,
      tarih: seciliTarih,
      geldi: yoklamaDurumu[o.id] ?? true,
    }))
    const { error } = await supabase
      .from('yoklama')
      .upsert(kayitlar, { onConflict: 'ders_programi_id,ogrenci_id,tarih' })
    setKaydediliyor(false)
    if (error) {
      alert('Hata: ' + error.message)
    } else {
      setKaydedildi(true)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-gray-50 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 bg-navy text-white rounded-t-2xl flex items-start justify-between sticky top-0 z-10">
          <div>
            <p className="font-semibold leading-tight">{dersAdi || 'Ders'}{sinifAdi ? ` — ${sinifAdi}` : ''}</p>
            <p className="text-xs text-white/70 mt-0.5">Yoklama ve Konu İşaretleme</p>
          </div>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none px-1 -mt-1">
            ×
          </button>
        </div>

        <div className="p-4 space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tarih</label>
            <input
              type="date"
              value={seciliTarih}
              onChange={(e) => setSeciliTarih(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue"
            />
          </div>

          <div>
            <h3 className="font-semibold text-gray-700 mb-2 text-sm">Yoklama</h3>
            {loading ? (
              <p className="text-gray-400 text-sm">Yükleniyor...</p>
            ) : ogrenciler.length === 0 ? (
              <p className="text-gray-400 text-sm">Bu sınıfa henüz öğrenci eklenmemiş.</p>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="divide-y divide-gray-50">
                  {ogrenciler.map((o) => {
                    const geldi = yoklamaDurumu[o.id] ?? true
                    return (
                      <div key={o.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                        <p className="font-medium text-gray-800 text-sm">{o.ad_soyad}</p>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => isaretle(o.id, true)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                              geldi ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            Geldi
                          </button>
                          <button
                            type="button"
                            onClick={() => isaretle(o.id, false)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                              !geldi ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            Gelmedi
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={kaydet}
                    disabled={kaydediliyor}
                    className="bg-navy text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-blue transition-colors disabled:opacity-50"
                  >
                    {kaydediliyor ? 'Kaydediliyor...' : 'Yoklamayı Kaydet'}
                  </button>
                  {kaydedildi && <span className="text-xs text-green-600 font-medium">Kaydedildi ✓</span>}
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="font-semibold text-gray-700 mb-2 text-sm">İşlenen Konu</h3>
            <KonuTakipBolumu sinifId={sinifId} profile={profile} varsayilanDers={dersAdi} />
          </div>
        </div>
      </div>
    </div>
  )
}
