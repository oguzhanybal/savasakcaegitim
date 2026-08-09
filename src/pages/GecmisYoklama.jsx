import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { saatGoster } from '../lib/saatFormat'

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

// Geriye doğru kaç GÜN (takvim günü, ders günü değil) taranacağı — "geçmiş
// dersler" listesi bu pencere içindeki, sınıfın programına göre gerçekten
// olması gereken ders saatlerini gösterir.
const GUN_PENCERESI = 21

// ============================================================================
// GEÇMİŞ YOKLAMA — bir öğretmen (ya da yönetici) geçmişte unutulan/eksik
// kalan bir yoklamayı buradan tamamlayabilir. Yoklama.jsx'in "sadece bugün"
// kısıtlaması burada bilerek yok. Kullanıcı isteğiyle, tarih/saat elle
// seçilen bir form yerine artık DOĞRUDAN bir liste gösteriliyor: sınıfın son
// birkaç haftadaki her ders saati, "Alındı"/"Alınmadı" etiketiyle listelenir,
// tıklanınca o dersin yoklaması açılır.
// ============================================================================

function yerelTarih(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function gunNumarasi(tarihStr) {
  return ((new Date(tarihStr + 'T12:00:00').getDay() + 6) % 7) + 1
}

function tarihUzunFormat(tarihStr) {
  return new Date(tarihStr + 'T12:00:00').toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export default function GecmisYoklama() {
  const { profile } = useAuth()
  const [siniflar, setSiniflar] = useState([])
  const [seciliSinif, setSeciliSinif] = useState('')
  const [gecmisListe, setGecmisListe] = useState([])
  const [yukleniyorListe, setYukleniyorListe] = useState(true)
  // Listeden tıklanan öge — {tarih, ders} şeklinde, null ise liste görünümü,
  // doluysa o dersin yoklama alma ekranı gösterilir.
  const [seciliOge, setSeciliOge] = useState(null)
  const [ogrenciler, setOgrenciler] = useState([])
  const [yoklamaKayitlari, setYoklamaKayitlari] = useState({})
  const [yukleniyorOgrenci, setYukleniyorOgrenci] = useState(false)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  useEffect(() => {
    supabase.from('siniflar').select('*').then(({ data }) => {
      setSiniflar(data || [])
      if (data && data.length > 0) setSeciliSinif(data[0].id)
      else setYukleniyorListe(false)
    })
  }, [])

  // Sınıf değişince: son GUN_PENCERESI gündeki, sınıfın programına göre
  // GERÇEKTEN olması gereken ders saatlerini üretir, sonra hangilerinin
  // yoklaması zaten alınmış olduğunu tek seferde sorgular.
  useEffect(() => {
    if (!seciliSinif) return
    setSeciliOge(null)
    setYukleniyorListe(true)
    supabase
      .from('ders_programi')
      .select('*')
      .eq('sinif_id', seciliSinif)
      .then(async ({ data }) => {
        const satirlar = data || []
        const satirMap = new Map(satirlar.map((s) => [s.id, s]))
        const bugun = yerelTarih(new Date())
        const dEski = new Date(bugun + 'T12:00:00')
        dEski.setDate(dEski.getDate() - GUN_PENCERESI)
        const enEskiTarih = yerelTarih(dEski)
        const dDun = new Date(bugun + 'T12:00:00')
        dDun.setDate(dDun.getDate() - 1)
        const dun = yerelTarih(dDun)

        // 1) GERÇEKTEN yoklaması alınmış dersler — doğrudan yoklama
        //    tablosundan, ders_programi'nin o an aktif/pasif durumuna hiç
        //    bakılmadan çekilir. Bir sınıfın aynı saatte BİRDEN FAZLA farklı
        //    dersi (paralel grup) olabildiği görüldü — bu yüzden artık aynı
        //    saatteki satırlar "tek ders" sanılıp birleştirilmiyor; gerçekten
        //    alınmış bir yoklama ASLA filtrelenip listeden düşmüyor.
        const { data: yoklamaSatirlari } = await supabase
          .from('yoklama')
          .select('ders_programi_id, tarih')
          .eq('sinif_id', seciliSinif)
          .gte('tarih', enEskiTarih)
          .lte('tarih', dun)
        const alinanAnahtarlar = new Set(
          (yoklamaSatirlari || []).map((y) => `${y.ders_programi_id}|${y.tarih}`)
        )
        const alinanOlaylar = []
        for (const anahtar of alinanAnahtarlar) {
          const [id, tarih] = anahtar.split('|')
          const ders = satirMap.get(id)
          if (!ders) continue
          alinanOlaylar.push({ tarih, ders, alindiMi: true })
        }

        // 2) Henüz yoklaması alınmamış, ama programa göre olması gereken
        //    dersler — ders_programi'nin haftalık desenine göre üretilir.
        //    Yukarıda zaten "alındı" olarak bulunanlar tekrar üretilmez.
        const adaylar = []
        for (let i = 1; i <= GUN_PENCERESI; i++) {
          const d = new Date(bugun + 'T12:00:00')
          d.setDate(d.getDate() - i)
          const tarih = yerelTarih(d)
          const gunNo = gunNumarasi(tarih)
          for (const s of satirlar) {
            if (s.gun !== gunNo) continue
            if (alinanAnahtarlar.has(`${s.id}|${tarih}`)) continue
            // Elle girilmiş "Başlangıç Tarihi" varsa ve o tarihten önceyse,
            // bu ders o gün henüz yoktu. Elle girilmemişse, satırın gerçekten
            // OLUŞTURULDUĞU tarihi (created_at) alt sınır olarak kullan.
            const gecerliBaslangic = s.baslangic_tarihi || (s.created_at ? s.created_at.slice(0, 10) : null)
            if (gecerliBaslangic && gecerliBaslangic > tarih) continue
            // Pasife alınmış (silinmiş/düzenlenmiş) bir satırsa, sadece
            // pasife alınmadan ÖNCEKİ günler için geçerli sayılır.
            if (s.aktif === false && (!s.pasif_tarihi || s.pasif_tarihi < tarih)) continue
            adaylar.push({ tarih, ders: s, alindiMi: false })
          }
        }
        // Bir ders saati sonradan düzenlenip eski satırı pasife alınmış
        // olabilir — henüz yoklaması OLMAYAN adaylar arasında aynı
        // tarih+saat için birden fazla satır üretilmesin diye tek satıra
        // indiriliyor (gerçekten alınmış olanlara bu dedup UYGULANMIYOR,
        // çünkü onlar zaten kendi ders_programi_id'siyle benzersiz).
        const adayGrup = new Map()
        for (const a of adaylar) {
          const anahtar = `${a.tarih}|${a.ders.baslangic_saat}|${a.ders.bitis_saat}`
          const mevcut = adayGrup.get(anahtar)
          if (!mevcut || (a.ders.aktif !== false && mevcut.ders.aktif === false)) {
            adayGrup.set(anahtar, a)
          }
        }

        const tumOlaylar = [...alinanOlaylar, ...adayGrup.values()].sort((a, b) => {
          if (a.tarih !== b.tarih) return a.tarih < b.tarih ? 1 : -1
          return (a.ders.baslangic_saat || '').localeCompare(b.ders.baslangic_saat || '')
        })
        setGecmisListe(tumOlaylar)
        setYukleniyorListe(false)
      })
  }, [seciliSinif])

  // Listeden bir öge seçilince o dersin öğrencilerini + (varsa) o tarihe ait
  // yoklama kayıtlarını getirir.
  useEffect(() => {
    if (!seciliOge) {
      setOgrenciler([])
      setYoklamaKayitlari({})
      return
    }
    setYukleniyorOgrenci(true)
    Promise.all([
      supabase.from('sinif_ogrenciler').select('ogrenciler(id, ad_soyad)').eq('sinif_id', seciliSinif),
      supabase.from('yoklama').select('*').eq('ders_programi_id', seciliOge.ders.id).eq('tarih', seciliOge.tarih),
    ]).then(([so, y]) => {
      const liste = (so.data || []).map((r) => r.ogrenciler).filter(Boolean)
      setOgrenciler(liste)
      const mevcut = {}
      ;(y.data || []).forEach((k) => {
        mevcut[k.ogrenci_id] = k.geldi
      })
      setYoklamaKayitlari(mevcut)
      setYukleniyorOgrenci(false)
    })
  }, [seciliOge, seciliSinif])

  function isaretle(ogrenciId, geldi) {
    setYoklamaKayitlari((prev) => ({ ...prev, [ogrenciId]: geldi }))
  }

  // Yoklama.jsx'teki AYNI bildirim mekanizması — yöneticiye e-posta gider,
  // tarih zaten ayrıca belirtildiği için geçmişe dönük olduğunu ekstra
  // etiketlemeye gerek yok. Bu isteğin başarısız olması yoklama kaydını asla
  // etkilemez.
  function bildirimGonder(kayitlar) {
    const sinifAdi = siniflar.find((s) => s.id === seciliSinif)?.ad
    const saatMetni = `${seciliOge.ders.baslangic_saat?.slice(0, 5)}–${seciliOge.ders.bitis_saat?.slice(0, 5)}`
    const gelmeyenIsimler = ogrenciler.filter((o) => !kayitlar.find((k) => k.ogrenci_id === o.id)?.geldi).map((o) => o.ad_soyad)
    fetch('/api/yoklama-bildirim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sinifAdi,
        saatMetni,
        tarih: seciliOge.tarih,
        ogretmenAdi: profile?.ad_soyad,
        gelenSayisi: kayitlar.length - gelmeyenIsimler.length,
        gelmeyenSayisi: gelmeyenIsimler.length,
        gelmeyenIsimler,
      }),
    }).catch(() => {})
  }

  async function kaydet() {
    if (!seciliOge) return
    setKaydediliyor(true)
    const kayitlar = ogrenciler.map((o) => ({
      sinif_id: seciliSinif,
      ders_programi_id: seciliOge.ders.id,
      ogrenci_id: o.id,
      tarih: seciliOge.tarih,
      geldi: yoklamaKayitlari[o.id] ?? true,
    }))
    const { error } = await supabase
      .from('yoklama')
      .upsert(kayitlar, { onConflict: 'ders_programi_id,ogrenci_id,tarih' })
    setKaydediliyor(false)
    if (error) {
      alert('Hata: ' + error.message)
      return
    }
    alert('Yoklama kaydedildi.')
    bildirimGonder(kayitlar)
    // Yeniden sorgu atmadan, listedeki ilgili satırı hemen "Alındı" yap.
    setGecmisListe((prev) =>
      prev.map((o) => (o.tarih === seciliOge.tarih && o.ders.id === seciliOge.ders.id ? { ...o, alindiMi: true } : o))
    )
    setSeciliOge(null)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-1">Geçmiş Yoklama</h1>
      <p className="text-gray-500 mb-6">
        Son {GUN_PENCERESI} gündeki ders saatleri aşağıda — "Alınmadı" yazanlara tıklayıp o günün yoklamasını
        sonradan girebilirsiniz.
      </p>

      {siniflar.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Sınıf</label>
          <select
            value={seciliSinif}
            onChange={(e) => setSeciliSinif(e.target.value)}
            className="w-full max-w-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            {siniflar.map((s) => (
              <option key={s.id} value={s.id}>{s.ad}</option>
            ))}
          </select>
        </div>
      )}

      {/* LİSTE GÖRÜNÜMÜ */}
      {!seciliOge && (
        <>
          {yukleniyorListe && <p className="text-gray-400">Yükleniyor...</p>}
          {!yukleniyorListe && gecmisListe.length === 0 && seciliSinif && (
            <p className="text-gray-400">Son {GUN_PENCERESI} günde bu sınıfın programlı bir ders saati bulunamadı.</p>
          )}
          {!yukleniyorListe && gecmisListe.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {gecmisListe.map((o, i) => (
                <button
                  key={`${o.ders.id}-${o.tarih}`}
                  type="button"
                  onClick={() => setSeciliOge(o)}
                  className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors ${
                    i % 2 ? 'bg-gray-50/60' : ''
                  } ${i !== 0 ? 'border-t border-gray-50' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 truncate">
                      {tarihUzunFormat(o.tarih)} <span className="text-gray-400 font-normal">— {GUNLER[o.ders.gun]}</span>
                    </p>
                    <p className="text-sm text-gray-500 truncate">
                      {saatGoster(o.ders.baslangic_saat)}–{saatGoster(o.ders.bitis_saat)}
                      {o.ders.ders_adi ? ` — ${o.ders.ders_adi}` : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      o.alindiMi ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    }`}
                  >
                    {o.alindiMi ? 'Alındı' : 'Alınmadı'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* SEÇİLİ DERSİN YOKLAMA ALMA EKRANI */}
      {seciliOge && (
        <div>
          <button
            type="button"
            onClick={() => setSeciliOge(null)}
            className="text-sm text-blue hover:underline mb-3"
          >
            ← Listeye dön
          </button>
          <div className="mb-3">
            <p className="font-semibold text-gray-800">
              {tarihUzunFormat(seciliOge.tarih)} <span className="text-gray-400 font-normal">— {GUNLER[seciliOge.ders.gun]}</span>
            </p>
            <p className="text-sm text-gray-500">
              {saatGoster(seciliOge.ders.baslangic_saat)}–{saatGoster(seciliOge.ders.bitis_saat)}
              {seciliOge.ders.ders_adi ? ` — ${seciliOge.ders.ders_adi}` : ''}
            </p>
          </div>

          {yukleniyorOgrenci && <p className="text-gray-400">Yükleniyor...</p>}

          {!yukleniyorOgrenci && ogrenciler.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="divide-y divide-gray-50">
                {ogrenciler.map((o) => {
                  const geldi = yoklamaKayitlari[o.id] ?? true
                  return (
                    <div key={o.id} className="px-4 py-3 flex items-center justify-between">
                      <p className="font-medium text-gray-800">{o.ad_soyad}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => isaretle(o.id, true)}
                          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            geldi ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          Geldi
                        </button>
                        <button
                          onClick={() => isaretle(o.id, false)}
                          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
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
              <div className="px-4 py-4 bg-gray-50 border-t border-gray-100">
                <button
                  onClick={kaydet}
                  disabled={kaydediliyor}
                  className="bg-navy text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-blue transition-colors disabled:opacity-50"
                >
                  {kaydediliyor ? 'Kaydediliyor...' : 'Yoklamayı Kaydet'}
                </button>
              </div>
            </div>
          )}

          {!yukleniyorOgrenci && ogrenciler.length === 0 && (
            <p className="text-gray-400">Bu sınıfa henüz öğrenci eklenmemiş.</p>
          )}
        </div>
      )}
    </div>
  )
}
