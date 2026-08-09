import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { saatGoster } from '../lib/saatFormat'

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

// Geriye doğru kaç GÜN (takvim günü, ders günü değil) taranacağı.
const GUN_PENCERESI = 21

// ============================================================================
// GEÇMİŞ YOKLAMA — bir öğretmen (ya da yönetici) geçmişte unutulan/eksik
// kalan bir yoklamayı buradan tamamlayabilir. Üç aşamalı akış:
//   1) GÜN LİSTESİ — son GUN_PENCERESI gündeki, en az bir dersi olan günler.
//   2) O GÜNÜN DERSLERİ — seçilen güne ait ders saatleri, Alındı/Alınmadı.
//   3) YOKLAMA ALMA — seçilen dersin öğrenci Geldi/Gelmedi listesi.
// Aynı gün+saat için birden fazla satır üretilmesin diye (ör. ders saati
// sonradan düzenlenmiş/yeniden eklenmişse) saat bazında tekilleştirme
// yapılıyor; gerçekten yoklaması alınmış olan her zaman öncelikli gösterilir.
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
  const [gunListesi, setGunListesi] = useState([]) // [{tarih, dersler: [...]}]
  const [yukleniyorListe, setYukleniyorListe] = useState(true)
  const [seciliGun, setSeciliGun] = useState(null) // tarih string, null ise gün listesi görünümü
  // Bir günün derslerinden tıklanan öge — {tarih, ders} şeklinde, null ise
  // gün detay görünümü, doluysa o dersin yoklama alma ekranı gösterilir.
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

  // Sınıf değişince: son GUN_PENCERESI gündeki dersleri güne göre gruplayarak
  // üretir. Her gün için: o gün gerçekten yoklaması alınmış dersler (asla
  // filtrelenmez) + sınıfın şu anki aktif programına göre henüz yoklaması
  // alınmamış dersler — aynı saat için ikisi de varsa alınmış olan kazanır.
  useEffect(() => {
    if (!seciliSinif) return
    setSeciliGun(null)
    setSeciliOge(null)
    setYukleniyorListe(true)
    supabase
      .from('ders_programi')
      .select('*')
      .eq('sinif_id', seciliSinif)
      .then(async ({ data }) => {
        const satirlar = data || []
        const satirMap = new Map(satirlar.map((s) => [s.id, s]))
        const aktifSatirlar = satirlar.filter((s) => s.aktif !== false)
        const bugun = yerelTarih(new Date())
        const dEski = new Date(bugun + 'T12:00:00')
        dEski.setDate(dEski.getDate() - GUN_PENCERESI)
        const enEskiTarih = yerelTarih(dEski)
        const dDun = new Date(bugun + 'T12:00:00')
        dDun.setDate(dDun.getDate() - 1)
        const dun = yerelTarih(dDun)

        // GERÇEKTEN yoklaması alınmış dersler — doğrudan yoklama
        // tablosundan, ders_programi'nin aktif/pasif durumuna bakılmadan.
        const tumIdler = satirlar.map((s) => s.id)
        const { data: yoklamaSatirlari } = tumIdler.length
          ? await supabase
              .from('yoklama')
              .select('ders_programi_id, tarih')
              .in('ders_programi_id', tumIdler)
              .gte('tarih', enEskiTarih)
              .lte('tarih', dun)
          : { data: [] }
        const alinanByTarih = new Map() // tarih -> Map(saatAnahtari -> ders)
        for (const y of yoklamaSatirlari || []) {
          const ders = satirMap.get(y.ders_programi_id)
          if (!ders) continue
          if (!alinanByTarih.has(y.tarih)) alinanByTarih.set(y.tarih, new Map())
          const saatAnahtari = `${ders.baslangic_saat}-${ders.bitis_saat}`
          alinanByTarih.get(y.tarih).set(saatAnahtari, ders)
        }

        // Güne göre ders listesi üret.
        const gunler = []
        for (let i = 1; i <= GUN_PENCERESI; i++) {
          const d = new Date(bugun + 'T12:00:00')
          d.setDate(d.getDate() - i)
          const tarih = yerelTarih(d)
          const gunNo = gunNumarasi(tarih)
          const alinanSaatler = alinanByTarih.get(tarih) || new Map()
          const dersMap = new Map() // saatAnahtari -> {ders, alindiMi}

          // Önce gerçekten alınmış olanlar (öncelikli, asla ezilmez).
          for (const [saatAnahtari, ders] of alinanSaatler) {
            dersMap.set(saatAnahtari, { ders, alindiMi: true })
          }
          // Sonra şu anki aktif programa göre o gün olması gereken dersler —
          // aynı saatte zaten alınmış bir ders varsa eklenmez.
          for (const s of aktifSatirlar) {
            if (s.gun !== gunNo) continue
            if (s.baslangic_tarihi && s.baslangic_tarihi > tarih) continue
            const saatAnahtari = `${s.baslangic_saat}-${s.bitis_saat}`
            if (dersMap.has(saatAnahtari)) continue
            dersMap.set(saatAnahtari, { ders: s, alindiMi: false })
          }

          if (dersMap.size === 0) continue
          const dersler = [...dersMap.values()].sort((a, b) =>
            (a.ders.baslangic_saat || '').localeCompare(b.ders.baslangic_saat || '')
          )
          gunler.push({ tarih, gun: gunNo, dersler })
        }

        setGunListesi(gunler)
        setYukleniyorListe(false)
      })
  }, [seciliSinif])

  // Bir öge seçilince o dersin öğrencilerini + (varsa) o tarihe ait yoklama
  // kayıtlarını getirir.
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
    // Yeniden sorgu atmadan, gün listesindeki ilgili satırı hemen "Alındı" yap.
    setGunListesi((prev) =>
      prev.map((g) =>
        g.tarih !== seciliOge.tarih
          ? g
          : {
              ...g,
              dersler: g.dersler.map((d) => (d.ders.id === seciliOge.ders.id ? { ...d, alindiMi: true } : d)),
            }
      )
    )
    setSeciliOge(null)
  }

  const seciliGunVerisi = seciliGun ? gunListesi.find((g) => g.tarih === seciliGun) : null

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-1">Geçmiş Yoklama</h1>
      <p className="text-gray-500 mb-6">
        Son {GUN_PENCERESI} gündeki ders günleri aşağıda — bir günü seçip o günün derslerinden "Alınmadı" yazana
        tıklayarak yoklamayı sonradan girebilirsiniz.
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

      {/* 1) GÜN LİSTESİ */}
      {!seciliGun && (
        <>
          {yukleniyorListe && <p className="text-gray-400">Yükleniyor...</p>}
          {!yukleniyorListe && gunListesi.length === 0 && seciliSinif && (
            <p className="text-gray-400">Son {GUN_PENCERESI} günde bu sınıfın programlı bir ders günü bulunamadı.</p>
          )}
          {!yukleniyorListe && gunListesi.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {gunListesi.map((g, i) => {
                const alinanSayisi = g.dersler.filter((d) => d.alindiMi).length
                const tumuAlindi = alinanSayisi === g.dersler.length
                return (
                  <button
                    key={g.tarih}
                    type="button"
                    onClick={() => setSeciliGun(g.tarih)}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors ${
                      i % 2 ? 'bg-gray-50/60' : ''
                    } ${i !== 0 ? 'border-t border-gray-50' : ''}`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 truncate">
                        {tarihUzunFormat(g.tarih)} <span className="text-gray-400 font-normal">— {GUNLER[g.gun]}</span>
                      </p>
                      <p className="text-sm text-gray-500 truncate">{g.dersler.length} ders</p>
                    </div>
                    <span
                      className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        tumuAlindi ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                      }`}
                    >
                      {alinanSayisi}/{g.dersler.length} Alındı
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* 2) SEÇİLİ GÜNÜN DERSLERİ */}
      {seciliGun && !seciliOge && seciliGunVerisi && (
        <div>
          <button
            type="button"
            onClick={() => setSeciliGun(null)}
            className="text-sm text-blue hover:underline mb-3"
          >
            ← Günlere dön
          </button>
          <p className="font-semibold text-gray-800 mb-3">
            {tarihUzunFormat(seciliGunVerisi.tarih)}{' '}
            <span className="text-gray-400 font-normal">— {GUNLER[seciliGunVerisi.gun]}</span>
          </p>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {seciliGunVerisi.dersler.map((o, i) => (
              <button
                key={o.ders.id}
                type="button"
                onClick={() => setSeciliOge({ tarih: seciliGunVerisi.tarih, ders: o.ders })}
                className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors ${
                  i % 2 ? 'bg-gray-50/60' : ''
                } ${i !== 0 ? 'border-t border-gray-50' : ''}`}
              >
                <p className="font-medium text-gray-800 truncate">
                  {saatGoster(o.ders.baslangic_saat)}–{saatGoster(o.ders.bitis_saat)}
                  {o.ders.ders_adi ? ` — ${o.ders.ders_adi}` : ''}
                </p>
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
        </div>
      )}

      {/* 3) SEÇİLİ DERSİN YOKLAMA ALMA EKRANI */}
      {seciliOge && (
        <div>
          <button
            type="button"
            onClick={() => setSeciliOge(null)}
            className="text-sm text-blue hover:underline mb-3"
          >
            ← O günün derslerine dön
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
