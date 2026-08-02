import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { saatGoster } from '../lib/saatFormat'

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

function saatKisalt(s) {
  return s ? s.slice(0, 5) : s
}

// Bugünün tarihini "YYYY-MM-DD" olarak YEREL saate göre üretir — diğer
// sayfalardaki (DersProgrami.jsx, BireBirDersDokumu.jsx vb.) aynı desen,
// toISOString KULLANMIYORUZ çünkü UTC+3'te gece yarısına yakın saatlerde bir
// gün geriye kayabiliyor.
function yerelTarih(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function gunNumaraTarihten(tarihStr) {
  const g = new Date(tarihStr + 'T12:00:00').getDay()
  return g === 0 ? 7 : g
}

// Bir zaman damgasını (created_at gibi) YEREL tarihe çevirir — DersProgrami.jsx
// içindeki musaitlikIcinProgram ile aynı mantık: bir ders satırı, geçmişte
// (o satır henüz OLUŞTURULMADAN önceki) bir tarih için "varmış" gibi
// sayılmamalı.
function tarihStrYerel(ts) {
  return yerelTarih(new Date(ts))
}

// Belirli bir GÜN için (varsayılan bugün, ama artık ◀/▶ ile başka güne de
// bakılabiliyor): her sınıfın programlı ders saatini, o saat için öğretmenin
// yoklama alıp almadığını (Yoklama Al sayfasından "Yoklamayı Kaydet"e
// basıldıysa o ders saatine ait satırlar oluşuyor) ve alındıysa kimlerin
// "Gelmedi" işaretlendiğini TEK bakışta gösteren bölüm. Yönetici bunu tüm
// sınıflar için görür ("hangi öğretmen yoklama almış, hangisi almamış,
// alanlarda kim gelmemiş"); öğretmen girerse sadece kendi derslerini görür.
// ÖNCEDEN sadece "bugün"e bakıyordu — kullanıcı isteğiyle geçmiş/gelecek
// günlere de gidebilme eklendi (ör. "Cumartesi günü Gülem hocanın 1 tane
// fazla yoklaması var" gibi bir şeyi kontrol edebilmek için).
function BugunkuYoklamaDurumu({ isYonetici, ogretmenProfileId }) {
  const bugunTarih = yerelTarih(new Date())
  const [secilenTarih, setSecilenTarih] = useState(bugunTarih)
  const [dersSaatleri, setDersSaatleri] = useState([])
  const [yoklamalar, setYoklamalar] = useState([])
  const [loading, setLoading] = useState(true)
  const secilenGunNo = gunNumaraTarihten(secilenTarih)

  function gunKaydir(fark) {
    const d = new Date(secilenTarih + 'T12:00:00')
    d.setDate(d.getDate() + fark)
    setSecilenTarih(yerelTarih(d))
  }

  useEffect(() => {
    setLoading(true)
    let sorgu = supabase
      .from('ders_programi')
      .select('*, siniflar(ad), profiles:ogretmen_profile_id(ad_soyad, brans)')
      .eq('gun', secilenGunNo)
      // ÖNEMLİ: sadece aktif=true DEĞİL — bir ders TAM O GÜN silinirse
      // (aktif=false yapılırsa), o günün özeti hâlâ o dersi göstermeli (belki
      // yoklaması zaten alınmıştı). "aktif=true VEYA o gün ya da sonrasında
      // silindi (pasif_tarihi >= secilenTarih)" — Yoklama.jsx'teki aynı kural.
      // NOT: aşağıdaki BugunkuYoklamaDurumu bileşeninin DIŞINDAKİ geçmiş
      // sınıf raporu sorgusuna (yoklama tablosunu ders_programi'ye join eden)
      // BİLEREK bu filtre eklenmiyor — geçmiş kayıtlar pasif olsa bile ders
      // adını göstermeye devam etmeli.
      .or(`aktif.eq.true,pasif_tarihi.gte.${secilenTarih}`)
    if (!isYonetici && ogretmenProfileId) sorgu = sorgu.eq('ogretmen_profile_id', ogretmenProfileId)

    Promise.all([
      sorgu,
      supabase
        .from('yoklama')
        .select('ders_programi_id, ogrenci_id, geldi, ogrenciler(ad_soyad)')
        .eq('tarih', secilenTarih),
    ]).then(([dp, y]) => {
      const yoklamaVeri = y.data || []
      // Seçilen gün pasif yapılan (silinen) bir ders saati, sadece o saat
      // için GERÇEKTEN kayıtlı bir yoklama varsa listede kalsın — yoklaması
      // hiç alınmamış, aynı gün içinde silinmiş bir kayıt burada göstermek
      // sadece kafa karıştırıyor (bkz. Yoklama.jsx'teki aynı düzeltme).
      const yoklamasiOlanIdler = new Set(yoklamaVeri.map((y) => y.ders_programi_id))
      // "baslangic_tarihi" elle girilmiş ve seçilen günden ilerideyse (bkz.
      // DersProgrami.jsx/SinifDetay.jsx'teki opsiyonel alan, Yoklama.jsx'teki
      // aynı düzeltme), bu ders o gün henüz başlamamış demektir — özete hiç
      // girmemeli.
      const filtreli = (dp.data || []).filter((d) => {
        if (d.baslangic_tarihi && d.baslangic_tarihi > secilenTarih) return false
        if (d.aktif === false) return yoklamasiOlanIdler.has(d.id)
        // AKTİF bir satır bile, seçilen günden SONRA oluşturulmuşsa o günün
        // programında sayılmamalı — yoksa bir ders saati bugün yeniden
        // düzenlendiğinde (eski satır pasif + yeni satır eklendiğinde), yeni
        // (henüz yoklamasız) satır geçmiş bir tarihte de "varmış" gibi
        // görünüp eski (gerçek yoklamalı) satırla birlikte iki kez listelenir.
        return tarihStrYerel(d.created_at) <= secilenTarih
      })
      const sirali = filtreli.sort((a, b) => {
        const s = (a.baslangic_saat || '').localeCompare(b.baslangic_saat || '')
        if (s !== 0) return s
        return (a.siniflar?.ad || '').localeCompare(b.siniflar?.ad || '', 'tr')
      })
      setDersSaatleri(sirali)
      setYoklamalar(yoklamaVeri)
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYonetici, ogretmenProfileId, secilenTarih, secilenGunNo])

  const ozet = dersSaatleri.map((ders) => {
    const kayitlar = yoklamalar.filter((y) => y.ders_programi_id === ders.id)
    const alindiMi = kayitlar.length > 0
    const gelmeyenler = kayitlar.filter((y) => !y.geldi).map((y) => y.ogrenciler?.ad_soyad).filter(Boolean)
    return { ders, alindiMi, gelmeyenler }
  })
  const alinanSayisi = ozet.filter((o) => o.alindiMi).length
  const alinmayanSayisi = ozet.length - alinanSayisi

  const secilenBugunMu = secilenTarih === bugunTarih

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h2 className="font-semibold text-gray-700">
          {isYonetici ? 'Yoklama Durumu (Tüm Sınıflar)' : 'Yoklama Durumum'}
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => gunKaydir(-1)}
            className="px-2 py-1 rounded-lg text-sm bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            title="Önceki gün"
          >
            ◀
          </button>
          <input
            type="date"
            value={secilenTarih}
            onChange={(e) => setSecilenTarih(e.target.value)}
            className="px-2 py-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          />
          <button
            type="button"
            onClick={() => gunKaydir(1)}
            className="px-2 py-1 rounded-lg text-sm bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            title="Sonraki gün"
          >
            ▶
          </button>
          {!secilenBugunMu && (
            <button
              type="button"
              onClick={() => setSecilenTarih(bugunTarih)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-navy/5 text-navy hover:bg-navy/10"
            >
              Bugün
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        {secilenBugunMu ? 'Bugün' : new Date(secilenTarih + 'T12:00:00').toLocaleDateString('tr-TR')} {GUNLER[secilenGunNo]} — hangi ders saati için yoklama alınmış, hangisi için henüz alınmamış ve alınanlarda kim gelmemiş burada görünür.
      </p>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading && <p className="p-4 text-gray-400 text-sm">Yükleniyor...</p>}
        {!loading && ozet.length === 0 && (
          <p className="p-4 text-gray-400 text-sm">
            {secilenBugunMu ? 'Bugün' : new Date(secilenTarih + 'T12:00:00').toLocaleDateString('tr-TR')} ({GUNLER[secilenGunNo]}) programlı ders saati yok.
          </p>
        )}
        {!loading && ozet.length > 0 && (
          <>
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-3 text-xs">
              <span className="font-semibold text-gray-600">
                Toplam {ozet.length} ders saati
              </span>
              <span className="font-semibold text-green-600">{alinanSayisi} alındı</span>
              {alinmayanSayisi > 0 && (
                <span className="font-semibold text-orange-600">{alinmayanSayisi} henüz alınmadı</span>
              )}
            </div>
            {/* touch-pan-x + overscroll-x-contain: mobil tarayıcılarda bu
                tablonun YATAY kaydırılabilir olduğunu tarayıcıya açıkça
                belirtiyoruz (Ders Programı tablosunda da aynı çözüm
                kullanılıyor) — aksi halde bazı mobil tarayıcılarda metin
                kesilip/sarılıp tablo hiç kaymıyor. */}
            <div className="overflow-x-auto overscroll-x-contain" style={{ touchAction: 'pan-x pan-y' }}>
              <table className="text-sm min-w-[640px] w-full">
                <thead>
                  <tr className="bg-navy text-white text-left">
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">Saat</th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">Sınıf</th>
                    <th className="px-4 py-3 font-semibold">Ders / Öğretmen</th>
                    <th className="px-4 py-3 font-semibold text-center whitespace-nowrap">Durum</th>
                    <th className="px-4 py-3 font-semibold">Gelmeyenler</th>
                  </tr>
                </thead>
                <tbody>
                  {ozet.map((o, i) => (
                    <tr key={o.ders.id} className={i % 2 ? 'bg-gray-50' : ''}>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {saatGoster(o.ders.baslangic_saat)}–{saatGoster(o.ders.bitis_saat)}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{o.ders.siniflar?.ad || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {o.ders.ders_adi || '—'}
                        {o.ders.profiles?.ad_soyad && (
                          <span className="text-gray-400"> — {o.ders.profiles.ad_soyad}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {o.alindiMi ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                            Alındı
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
                            Henüz Alınmadı
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {!o.alindiMi ? (
                          <span className="text-gray-300">—</span>
                        ) : o.gelmeyenler.length === 0 ? (
                          <span className="text-green-600 text-xs font-medium">Herkes geldi</span>
                        ) : (
                          <span className="text-red-500 text-xs">{o.gelmeyenler.join(', ')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function YoklamaRaporu() {
  const { profile } = useAuth()
  const isYonetici = profile?.rol === 'yonetici'
  const [siniflar, setSiniflar] = useState([])
  const [seciliSinif, setSeciliSinif] = useState('')
  const [kayitlar, setKayitlar] = useState([])
  const [loading, setLoading] = useState(true)
  // Bir sınıfta genelde birden fazla öğretmen ders veriyor (her ders saatinin
  // kendi öğretmeni var). "Tümü" yerine tek bir öğretmen seçilince, o
  // öğretmenin verdiği ders saatlerine ait yoklama kayıtlarına daraltıyoruz —
  // "öğrenci X, öğretmen Y'nin kaç dersinden kaçına gelmiş" sorusuna cevap
  // versin diye.
  const [seciliOgretmen, setSeciliOgretmen] = useState('')

  useEffect(() => {
    supabase.from('siniflar').select('*').then(({ data }) => {
      setSiniflar(data || [])
      if (data && data.length > 0) setSeciliSinif(data[0].id)
      else setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!seciliSinif) return
    setLoading(true)
    setSeciliOgretmen('')
    supabase
      .from('yoklama')
      .select('*, ogrenciler(ad_soyad), ders_programi(id, ders_adi, ogretmen_profile_id, profiles:ogretmen_profile_id(ad_soyad, brans))')
      .eq('sinif_id', seciliSinif)
      .order('tarih', { ascending: false })
      .then(({ data }) => {
        setKayitlar(data || [])
        setLoading(false)
      })
  }, [seciliSinif])

  // Bu sınıfta en az bir yoklama kaydına sahip, birbirinden farklı öğretmenler
  // — dropdown'da "Tümü"nün altında listelensin diye.
  const ogretmenlerMap = new Map()
  kayitlar.forEach((k) => {
    const oid = k.ders_programi?.ogretmen_profile_id
    const oad = k.ders_programi?.profiles?.ad_soyad
    if (oid && oad && !ogretmenlerMap.has(oid)) ogretmenlerMap.set(oid, oad)
  })
  const ogretmenler = [...ogretmenlerMap.entries()].sort((a, b) => a[1].localeCompare(b[1], 'tr'))

  const kayitlarGosterilen = seciliOgretmen
    ? kayitlar.filter((k) => k.ders_programi?.ogretmen_profile_id === seciliOgretmen)
    : kayitlar

  const ozet = {}
  kayitlarGosterilen.forEach((k) => {
    const ad = k.ogrenciler?.ad_soyad || 'Bilinmeyen'
    if (!ozet[ad]) ozet[ad] = { geldi: 0, gelmedi: 0 }
    if (k.geldi) ozet[ad].geldi += 1
    else ozet[ad].gelmedi += 1
  })
  const ozetListesi = Object.entries(ozet).sort((a, b) => a[0].localeCompare(b[0], 'tr'))

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">Yoklama Raporu</h1>

      <BugunkuYoklamaDurumu isYonetici={isYonetici} ogretmenProfileId={profile?.id} />

      {siniflar.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sınıf</label>
            <select
              value={seciliSinif}
              onChange={(e) => setSeciliSinif(e.target.value)}
              className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
            >
              {siniflar.map((s) => (
                <option key={s.id} value={s.id}>{s.ad}</option>
              ))}
            </select>
          </div>
          {ogretmenler.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Öğretmen</label>
              <select
                value={seciliOgretmen}
                onChange={(e) => setSeciliOgretmen(e.target.value)}
                className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
              >
                <option value="">Tümü</option>
                {ogretmenler.map(([id, ad]) => (
                  <option key={id} value={id}>{ad}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-gray-400">Yükleniyor...</p>}

      {!loading && kayitlar.length === 0 && (
        <p className="text-gray-400">Bu sınıf için henüz yoklama kaydı yok.</p>
      )}

      {!loading && kayitlar.length > 0 && (
        <>
          <h2 className="font-semibold text-gray-700 mb-3">
            Öğrenci Bazlı Özet
            {seciliOgretmen && (
              <span className="font-normal text-gray-400"> — {ogretmenlerMap.get(seciliOgretmen)}</span>
            )}
          </h2>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto overscroll-x-contain mb-8" style={{ touchAction: 'pan-x pan-y' }}>
            <table className="text-sm min-w-[480px] w-full">
              <thead>
                <tr className="bg-navy text-white text-left">
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Öğrenci</th>
                  <th className="px-4 py-3 font-semibold text-center whitespace-nowrap">Geldi</th>
                  <th className="px-4 py-3 font-semibold text-center whitespace-nowrap">Gelmedi</th>
                  <th className="px-4 py-3 font-semibold text-center whitespace-nowrap">Devamsızlık Oranı</th>
                </tr>
              </thead>
              <tbody>
                {ozetListesi.map(([ad, s], i) => {
                  const toplam = s.geldi + s.gelmedi
                  const oran = toplam > 0 ? Math.round((s.gelmedi / toplam) * 100) : 0
                  return (
                    <tr key={ad} className={i % 2 ? 'bg-gray-50' : ''}>
                      <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{ad}</td>
                      <td className="px-4 py-3 text-center text-green-600 font-semibold whitespace-nowrap">{s.geldi}</td>
                      <td className="px-4 py-3 text-center text-red-500 font-semibold whitespace-nowrap">{s.gelmedi}</td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className={`font-semibold ${oran > 20 ? 'text-red-500' : 'text-gray-600'}`}>%{oran}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <h2 className="font-semibold text-gray-700 mb-3">Detaylı Geçmiş (Son Kayıtlar)</h2>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto overscroll-x-contain" style={{ touchAction: 'pan-x pan-y' }}>
            <table className="text-sm min-w-[640px] w-full">
              <thead>
                <tr className="bg-navy text-white text-left">
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Tarih</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Öğrenci</th>
                  {!seciliOgretmen && <th className="px-4 py-3 font-semibold">Ders / Öğretmen</th>}
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Durum</th>
                </tr>
              </thead>
              <tbody>
                {kayitlarGosterilen.slice(0, 100).map((k, i) => {
                  const d = new Date(k.tarih)
                  const gunAdi = GUNLER[((d.getDay() + 6) % 7) + 1]
                  return (
                    <tr key={k.id} className={i % 2 ? 'bg-gray-50' : ''}>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {d.toLocaleDateString('tr-TR')} <span className="text-gray-400">({gunAdi})</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{k.ogrenciler?.ad_soyad}</td>
                      {!seciliOgretmen && (
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {k.ders_programi?.ders_adi || '—'}
                          {k.ders_programi?.profiles?.ad_soyad && (
                            <span className="text-gray-400"> — {k.ders_programi.profiles.ad_soyad}</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          k.geldi ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {k.geldi ? 'Geldi' : 'Gelmedi'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
