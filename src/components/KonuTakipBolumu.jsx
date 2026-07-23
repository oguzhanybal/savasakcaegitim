import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { KONU_DERSLERI, konuDersleriniFiltrele } from '../lib/konuDersleri'

// Konu Takip Planı'nın paylaşılan bölümü — hem SinifDetay.jsx (yönetici,
// sınıf sayfasında serbestçe göz atıp işaretleme) hem de Yoklama.jsx /
// YoklamaKonuModal.jsx (öğretmen, yoklama alırken o an işlediği konuyu
// işaretleme) tarafından kullanılıyor. "sinifId" hangi sınıfın konu durumunu
// göstereceğini, "profile" işaretleyen kişiyi (guncelleyen_profile_id) ve
// AYNI ZAMANDA görülecek ders sekmelerini belirler: öğretmen SADECE kendi
// branşıyla ilgili dersleri görür (ör. Fizik öğretmeni Türkçe/Tarih görmez),
// yönetici (ya da branşı eşleşmiyorsa) TÜM dersleri görür — bkz.
// konuDersleriniFiltrele. "varsayilanDers" verilirse (ve görünecek dersler
// arasında birebir eşleşiyorsa) açılışta o ders sekmesi seçili gelir —
// Yoklama.jsx, o anki ders saatinin ders_adi'sını buraya verip otomatik
// seçim öneriyor.
export default function KonuTakipBolumu({ sinifId, profile, varsayilanDers }) {
  const [konular, setKonular] = useState([])
  const [konuDurumlari, setKonuDurumlari] = useState([])
  const [konuGuncelleniyorId, setKonuGuncelleniyorId] = useState(null)
  const [loading, setLoading] = useState(true)

  const gorunecekDersler =
    profile?.rol === 'ogretmen' ? konuDersleriniFiltrele(profile?.brans) : KONU_DERSLERI

  const [seciliKonuDersi, setSeciliKonuDersi] = useState(
    varsayilanDers && gorunecekDersler.includes(varsayilanDers) ? varsayilanDers : gorunecekDersler[0]
  )

  useEffect(() => {
    if (varsayilanDers && gorunecekDersler.includes(varsayilanDers)) {
      setSeciliKonuDersi(varsayilanDers)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [varsayilanDers])

  // Seçili sekme, görünecek dersler listesinde artık yoksa (ör. farklı bir
  // branştaki öğretmen için bileşen yeniden kullanıldıysa) ilk uygun sekmeye
  // düşülür — aksi halde boş/yanlış bir sekme seçili takılı kalabilirdi.
  useEffect(() => {
    if (!gorunecekDersler.includes(seciliKonuDersi)) {
      setSeciliKonuDersi(gorunecekDersler[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.rol, profile?.brans])

  useEffect(() => {
    if (!sinifId) return
    setLoading(true)
    Promise.all([
      supabase.from('konular').select('*').order('ders_adi').order('sira'),
      supabase.from('sinif_konu_durumu').select('*').eq('sinif_id', sinifId),
    ]).then(([k, skd]) => {
      setKonular(k.data || [])
      setKonuDurumlari(skd.data || [])
      setLoading(false)
    })
  }, [sinifId])

  async function konuDurumuGuncelle(konuId, yeniDurum) {
    setKonuGuncelleniyorId(konuId)
    const { data, error } = await supabase
      .from('sinif_konu_durumu')
      .upsert(
        {
          sinif_id: sinifId,
          konu_id: konuId,
          durum: yeniDurum,
          guncelleyen_profile_id: profile?.id || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'sinif_id,konu_id' }
      )
      .select()
      .single()
    if (!error) {
      setKonuDurumlari((prev) => [...prev.filter((d) => d.konu_id !== konuId), data])
    } else {
      alert('Hata: ' + error.message)
    }
    setKonuGuncelleniyorId(null)
  }

  if (!sinifId) return null

  const seciliDersKonulari = konular.filter((k) => k.ders_adi === seciliKonuDersi)
  const konuDurumMap = new Map(konuDurumlari.map((d) => [d.konu_id, d.durum]))
  const islenenKonuSayisi = seciliDersKonulari.filter((k) => konuDurumMap.get(k.id) === 'islendi').length

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      {loading ? (
        <p className="text-center text-gray-400 text-sm py-6">Yükleniyor...</p>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="flex flex-wrap gap-1.5">
              {gorunecekDersler.map((ders) => (
                <button
                  key={ders}
                  type="button"
                  onClick={() => setSeciliKonuDersi(ders)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    seciliKonuDersi === ders ? 'bg-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {ders}
                </button>
              ))}
            </div>
            {seciliDersKonulari.length > 0 && (
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {islenenKonuSayisi}/{seciliDersKonulari.length} konu işlendi
              </span>
            )}
          </div>
          {seciliDersKonulari.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-6">Bu ders için henüz konu listesi yok.</p>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[28rem] overflow-y-auto">
              {seciliDersKonulari.map((k) => {
                const durum = konuDurumMap.get(k.id) || 'islenmedi'
                const guncelleniyor = konuGuncelleniyorId === k.id
                // Durum rozeti — hangi 3 durumdan hangisinde olduğu, buton
                // renklerine bakmadan da tek bakışta net anlaşılsın diye.
                // Butonlar SADECE aktif oldukları durumda renkleniyor (bkz.
                // aşağıdaki bg-gray-100 varsayılanı) — önceden pasif haldeyken
                // de açık renkli oldukları için her satır "işlendi" gibi
                // görünüyordu, bu karışıklığı gidermek için düzeltildi.
                const durumRozeti =
                  durum === 'islendi'
                    ? { metin: 'İşlendi', className: 'bg-green-100 text-green-700' }
                    : durum === 'isleniyor'
                    ? { metin: 'İşleniyor', className: 'bg-orange-100 text-orange-700' }
                    : { metin: 'İşlenmedi', className: 'bg-gray-100 text-gray-500' }
                return (
                  <div key={k.id} className="flex items-center justify-between gap-3 py-2 flex-wrap">
                    <span className="text-sm text-gray-700">
                      <span className="text-gray-300 mr-2">{k.sira}.</span>
                      {k.konu_adi}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${durumRozeti.className}`}>
                        {durumRozeti.metin}
                      </span>
                      <button
                        type="button"
                        disabled={guncelleniyor}
                        onClick={() => konuDurumuGuncelle(k.id, 'isleniyor')}
                        className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                          durum === 'isleniyor' ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        İşleniyor
                      </button>
                      <button
                        type="button"
                        disabled={guncelleniyor}
                        onClick={() => konuDurumuGuncelle(k.id, 'islendi')}
                        className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                          durum === 'islendi' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        İşlendi
                      </button>
                      {durum !== 'islenmedi' && (
                        <button
                          type="button"
                          disabled={guncelleniyor}
                          onClick={() => konuDurumuGuncelle(k.id, 'islenmedi')}
                          title="İşlenmedi durumuna geri al"
                          className="text-gray-400 text-xs hover:underline disabled:opacity-50"
                        >
                          Geri al
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
