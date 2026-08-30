import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import KonuTakipBolumu from './KonuTakipBolumu'

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

// Bugünün tarihini "YYYY-MM-DD" olarak YEREL saate göre üretir (toISOString
// KULLANMIYORUZ — Türkiye UTC+3 gece yarısına yakın saatlerde bir gün geriye
// kayabiliyor). DersProgrami.jsx/BireBir.jsx'teki aynı isimli fonksiyonla
// birebir aynı desen.
function yerelBugunTarihi() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// Bir "YYYY-MM-DD" tarihinin haftanın hangi gününe denk geldiğini, uygulamanın
// GENELİNDE kullanılan 1=Pazartesi...7=Pazar numaralandırmasıyla döndürür
// (DersProgrami.jsx'teki gunNumaraTarihten ile birebir aynı mantık). BÜYÜK
// HATA DÜZELTMESİ: bu modal önceden tarih kutusuna girilen tarihi hiç
// doğrulamıyordu — öğretmen "max" (bugün) sınırı içindeki HERHANGİ bir geçmiş
// tarihi seçip, o dersin GERÇEKTEN o gün var olup olmadığına bakılmaksızın
// yoklama alabiliyordu (ör. dersin sadece Çarşamba yapıldığı bir sınıfta bir
// Salı günü seçilip yoklama kaydedilebiliyordu). Artık seçilen tarihin gün
// numarası, bu ders saatinin programlandığı günle (gun prop'u) uyuşmuyorsa
// hem tarih değişikliği hem kaydetme reddediliyor.
function gunNumarasi(tarihStr) {
  if (!tarihStr) return null
  const g = new Date(tarihStr + 'T12:00:00').getDay()
  return g === 0 ? 7 : g
}

// Ders Programı'nda öğretmenin kendi dersinin yanındaki "Yoklama / Konu"
// butonuna tıklanınca açılan popup — o dersin yoklamasını almak VE o sınıfta
// o an işlenen konuyu işaretlemek TEK ekrandan yapılabilsin diye (ayrıca
// Yoklama Al sayfasına gitmeye gerek kalmadan).
//
// BÜYÜK DÜZELTME: burada eskiden serbestçe değiştirilebilen bir "Tarih"
// kutusu vardı — öğretmen istediği GEÇMİŞ tarihi seçip buradan yoklama
// alabiliyordu (o gün dersin gerçekten olup olmadığına bakılmaksızın, sadece
// hafta içindeki hangi güne denk geldiğine bakan bir kontrolle). Kullanıcı
// isteğiyle: bu popup ARTIK SADECE BUGÜNÜN yoklamasını almak için var, tarih
// kutusu tamamen kaldırıldı. Geçmişe dönük eksik/unutulan bir yoklamayı
// tamamlamak için öğretmen zaten ayrı "Geçmiş Yoklama" sayfasını kullanıyor
// — o akışa hiç dokunulmadı, oradan devam edilebiliyor. Eğer tıklanan ders
// saati bugünün gününe denk gelmiyorsa (ör. hafta programında başka bir
// günün dersine tıklandıysa), burada yoklama alma formu hiç gösterilmiyor,
// bunun yerine kullanıcı Geçmiş Yoklama'ya yönlendiriliyor.
export default function YoklamaKonuModal({ dersProgramiId, sinifId, sinifAdi, dersAdi, gun, profile, onClose }) {
  const [ogrenciler, setOgrenciler] = useState([])
  const [yoklamaDurumu, setYoklamaDurumu] = useState({})
  const [loading, setLoading] = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [kaydedildi, setKaydedildi] = useState(false)

  const bugun = yerelBugunTarihi()
  const gunUygunMu = !gun || gunNumarasi(bugun) === gun

  useEffect(() => {
    if (!sinifId || !gunUygunMu) {
      setLoading(false)
      return
    }
    setLoading(true)
    setKaydedildi(false)
    Promise.all([
      supabase.from('sinif_ogrenciler').select('ogrenciler(id, ad_soyad)').eq('sinif_id', sinifId),
      supabase.from('yoklama').select('*').eq('ders_programi_id', dersProgramiId).eq('tarih', bugun),
    ]).then(([so, y]) => {
      setOgrenciler((so.data || []).map((r) => r.ogrenciler).filter(Boolean))
      const mevcut = {}
      ;(y.data || []).forEach((k) => {
        mevcut[k.ogrenci_id] = k.geldi
      })
      setYoklamaDurumu(mevcut)
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinifId, dersProgramiId, gunUygunMu])

  function isaretle(ogrenciId, geldi) {
    setYoklamaDurumu((prev) => ({ ...prev, [ogrenciId]: geldi }))
  }

  // Yoklama kaydedilince yöneticiye e-posta bildirimi gönderir (bkz.
  // api/yoklama-bildirim.js) — Yoklama.jsx'teki AYNI bildirim, çünkü buradaki
  // kaydet() de ayrı bir yoklama kaydetme yolu (Ders Programı'ndaki derse
  // tıklayıp açılan bu popup üzerinden). Başarısız olması yoklama kaydını
  // asla etkilemez (ateşle-ve-unut, hata sessizce yutulur).
  function bildirimGonder(kayitlar) {
    const gelmeyenIsimler = ogrenciler.filter((o) => !kayitlar.find((k) => k.ogrenci_id === o.id)?.geldi).map((o) => o.ad_soyad)
    fetch('/api/yoklama-bildirim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sinifAdi,
        saatMetni: dersAdi,
        tarih: bugun,
        ogretmenAdi: profile?.ad_soyad,
        gelenSayisi: kayitlar.length - gelmeyenIsimler.length,
        gelmeyenSayisi: gelmeyenIsimler.length,
        gelmeyenIsimler,
      }),
    }).catch(() => {})
  }

  async function kaydet() {
    // Tarih artık her zaman bugün (kutu kaldırıldı) — yine de bu ders bugünün
    // gününe denk gelmiyorsa (gunUygunMu false) son bir güvenlik olarak
    // kaydetmeyi reddediyoruz; normalde bu durumda zaten form hiç
    // gösterilmiyor.
    if (!gunUygunMu) {
      alert(`Bu ders sadece ${GUNLER[gun]} günleri yapılıyor, bugün yoklaması alınamaz.`)
      return
    }
    setKaydediliyor(true)
    const kayitlar = ogrenciler.map((o) => ({
      sinif_id: sinifId,
      ders_programi_id: dersProgramiId,
      ogrenci_id: o.id,
      tarih: bugun,
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
      bildirimGonder(kayitlar)
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
            <h3 className="font-semibold text-gray-700 mb-2 text-sm">Yoklama</h3>
            {!gunUygunMu ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
                Bu ders sadece <strong>{GUNLER[gun]}</strong> günleri yapılıyor, bugün değil. Buradan sadece bugünün
                yoklaması alınabilir — geçmiş bir tarihe ait eksik/unutulan yoklamayı tamamlamak için{' '}
                <strong>Geçmiş Yoklama</strong> sayfasını kullanabilirsiniz.
              </p>
            ) : loading ? (
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
