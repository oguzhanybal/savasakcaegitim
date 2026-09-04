import { useEffect, useState, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { saatGoster } from '../lib/saatFormat'

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

// Ders Programı'nda "Bu bir sınav" işaretlenmiş ders saatleri (TYT/AYT Deneme,
// Konu Analiz vb.) — bunlara ait yoklama kayıtları normal devamsızlık
// istatistiklerine KARIŞMASIN diye ayrı tutulur, aşağıda kendi "Sınav
// Katılımı" özetinde gösterilir (kullanıcı isteğiyle eklendi).
const SINAV_TURU_ETIKET = {
  tyt_deneme: 'TYT Deneme Sınavı',
  ayt_deneme: 'AYT Deneme Sınavı',
  konu_analiz: 'Konu Analiz Sınavı',
  diger: 'Diğer Sınav',
}

function saatKisalt(s) {
  return s ? s.slice(0, 5) : s
}

// Supabase (PostgREST) tek istekte EN FAZLA 1000 satır döndürür — bunun
// üzerine .range() ile sayfalama yapılmazsa fazlası sessizce kesilir (hata
// vermez, sadece eksik veri döner). Büyüyen sınıflarda (ör. TM-1: 9 öğrenci
// × ~137 kayıt = 1132, 1000'i aşıyor) bu yüzden "Öğrenci Bazlı Özet"
// tablosu gerçek sayının altında kalıyordu — veritabanında kayıp yoktu,
// sorun buradaki sorgunun sayfalama yapmamasıydı (kullanıcıyla birlikte
// TM-1 üzerinden tespit edildi). Bu yardımcı fonksiyon 1000'erlik
// sayfalar halinde TÜM satırları çekene kadar devam eder.
async function tumSatirlariGetir(sorguOlustur) {
  const SAYFA_BOYUTU = 1000
  let tumVeri = []
  let basla = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await sorguOlustur().range(basla, basla + SAYFA_BOYUTU - 1)
    if (error) return { data: null, error }
    tumVeri = tumVeri.concat(data || [])
    if (!data || data.length < SAYFA_BOYUTU) break
    basla += SAYFA_BOYUTU
  }
  return { data: tumVeri, error: null }
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

  // Öğrenci bazlı arama — sınıf sınıf gezmek yerine bir öğrencinin adını
  // yazıp SINIF FİLTRESİNDEN BAĞIMSIZ (tüm sınıflardaki) yoklama geçmişini
  // tek yerde görebilmek için eklendi (kullanıcı isteğiyle — "çok karışık"
  // geri bildirimi üzerine). Bir öğrenci bazı derslerde eski bir sınıfa
  // kayıtlı kalmış olabilir; bu arama o kayıtları da gösterir.
  const [aramaMetni, setAramaMetni] = useState('')
  const [aramaSonuclari, setAramaSonuclari] = useState([])
  const [seciliOgrenci, setSeciliOgrenci] = useState(null) // { id, ad_soyad } | null
  const [ogrenciKayitlari, setOgrenciKayitlari] = useState([])
  const [ogrenciLoading, setOgrenciLoading] = useState(false)
  // Öğrencinin ŞU AN kayıtlı olduğu sınıf(lar) — sinif_ogrenciler tablosundan.
  // Bir öğrenci sınıf değiştirdiyse eski yoklamaları hâlâ eski sinif_id'yle
  // kayıtlı kalır (bu doğru — o an gerçekten o dersteydi); ama özet ekranda
  // bunları ayrı ayrı göstermek yerine "şu an hangi sınıftaysa orada"
  // TEK toplam altında birleştiriyoruz (kullanıcı isteğiyle — sınıf
  // değişikliğinde yoklamaların "saçmalamaması" için).
  const [guncelSiniflar, setGuncelSiniflar] = useState([])
  // "Gelmedi" sayısına tıklanınca hangi satırın (öğrenci adı ya da sınıf adı)
  // detayı açık — kullanıcı isteğiyle: "3 gelmedi görünüyor, tıklayınca
  // gelmediği saatler çıksın".
  const [genisletilenSatir, setGenisletilenSatir] = useState(null)
  // "Detaylı Geçmiş" tablosu çok uzayabildiği için (yüzlerce satır)
  // kullanıcı isteğiyle varsayılan KAPALI geliyor — "Detaya Ulaş" ile açılır.
  const [detayGoster, setDetayGoster] = useState(false)

  useEffect(() => {
    supabase.from('siniflar').select('*').then(({ data }) => {
      setSiniflar(data || [])
      if (data && data.length > 0) setSeciliSinif(data[0].id)
      else setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (seciliOgrenci || aramaMetni.trim().length < 2) {
      setAramaSonuclari([])
      return
    }
    let iptal = false
    const zamanlayici = setTimeout(() => {
      supabase
        .from('ogrenciler')
        .select('id, ad_soyad')
        .ilike('ad_soyad', `%${aramaMetni.trim()}%`)
        .order('ad_soyad')
        .limit(10)
        .then(({ data }) => {
          if (!iptal) setAramaSonuclari(data || [])
        })
    }, 250)
    return () => {
      iptal = true
      clearTimeout(zamanlayici)
    }
  }, [aramaMetni, seciliOgrenci])

  useEffect(() => {
    if (!seciliOgrenci) {
      setGuncelSiniflar([])
      return
    }
    supabase
      .from('sinif_ogrenciler')
      .select('siniflar(ad)')
      .eq('ogrenci_id', seciliOgrenci.id)
      .then(({ data }) => {
        setGuncelSiniflar((data || []).map((d) => d.siniflar?.ad).filter(Boolean))
      })
  }, [seciliOgrenci])

  useEffect(() => {
    if (!seciliOgrenci) {
      setOgrenciKayitlari([])
      return
    }
    setOgrenciLoading(true)
    tumSatirlariGetir(() =>
      supabase
        .from('yoklama')
        .select('*, siniflar(ad), ders_programi(id, ders_adi, ogretmen_profile_id, sinav_mi, sinav_turu, profiles:ogretmen_profile_id(ad_soyad, brans))')
        .eq('ogrenci_id', seciliOgrenci.id)
        .order('tarih', { ascending: false })
    )
      .then(({ data }) => {
        setOgrenciKayitlari(data || [])
        setOgrenciLoading(false)
      })
  }, [seciliOgrenci])

  // Sınıf, öğretmen ya da öğrenci filtresi değiştiğinde açık kalan "gelmedi"
  // detayı yanlış satıra ait kalmasın diye kapatılıyor.
  useEffect(() => {
    setGenisletilenSatir(null)
  }, [seciliSinif, seciliOgretmen, seciliOgrenci])

  useEffect(() => {
    if (!seciliSinif) return
    setLoading(true)
    setSeciliOgretmen('')
    tumSatirlariGetir(() =>
      supabase
        .from('yoklama')
        .select('*, ogrenciler(ad_soyad), ders_programi(id, ders_adi, ogretmen_profile_id, sinav_mi, sinav_turu, profiles:ogretmen_profile_id(ad_soyad, brans))')
        .eq('sinif_id', seciliSinif)
        .order('tarih', { ascending: false })
    )
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

  // "Bu bir sınav" işaretli ders saatlerine ait kayıtlar normal devamsızlık
  // özetine (Öğrenci Bazlı Özet) KARIŞMASIN — TYT/AYT Deneme, Konu Analiz gibi
  // sınav günleri ayrı bir "Sınav Katılımı" özetinde gösterilir (aşağıda).
  const normalKayitlar = kayitlarGosterilen.filter((k) => !k.ders_programi?.sinav_mi)
  const sinavKayitlari = kayitlarGosterilen.filter((k) => k.ders_programi?.sinav_mi)

  const ozet = {}
  normalKayitlar.forEach((k) => {
    const ad = k.ogrenciler?.ad_soyad || 'Bilinmeyen'
    if (!ozet[ad]) ozet[ad] = { geldi: 0, gelmedi: 0 }
    if (k.geldi) ozet[ad].geldi += 1
    else ozet[ad].gelmedi += 1
  })
  const ozetListesi = Object.entries(ozet).sort((a, b) => a[0].localeCompare(b[0], 'tr'))

  // Sınav Katılımı özeti — öğrenci × sınav türü bazında kaç sınava girmiş
  // (Geldi) / girmemiş (Gelmedi). Bir öğrencinin girdiği sınav türleri
  // sütun sütun ayrı ayrı gösterilir.
  const sinavTurleri = [...new Set(sinavKayitlari.map((k) => k.ders_programi?.sinav_turu).filter(Boolean))]
  const sinavOzet = {}
  sinavKayitlari.forEach((k) => {
    const ad = k.ogrenciler?.ad_soyad || 'Bilinmeyen'
    const tur = k.ders_programi?.sinav_turu || 'diger'
    if (!sinavOzet[ad]) sinavOzet[ad] = {}
    if (!sinavOzet[ad][tur]) sinavOzet[ad][tur] = { girdi: 0, girmedi: 0 }
    if (k.geldi) sinavOzet[ad][tur].girdi += 1
    else sinavOzet[ad][tur].girmedi += 1
  })
  const sinavOzetListesi = Object.entries(sinavOzet).sort((a, b) => a[0].localeCompare(b[0], 'tr'))

  // Öğrenci arama modu: seçilen sınıftan bağımsız, o öğrencinin TÜM
  // kayıtları TEK bir toplamda birleşiyor (kullanıcı isteğiyle — eskiden
  // sınıf sınıf ayrı gösteriliyordu, bir öğrenci sınıf değiştirdiğinde
  // "saçma" görünüyordu). Hangi dersin hangi sınıfta geçtiği bilgisi
  // kaybolmuyor — aşağıdaki "Detaylı Geçmiş" tablosunda Sınıf sütununda
  // duruyor — ama özet artık tek satır.
  const ogrenciNormalKayitlar = ogrenciKayitlari.filter((k) => !k.ders_programi?.sinav_mi)
  const ogrenciToplamGeldi = ogrenciNormalKayitlar.filter((k) => k.geldi).length
  const ogrenciToplamGelmedi = ogrenciNormalKayitlar.length - ogrenciToplamGeldi
  const ogrenciGecmisSiniflar = [...new Set(ogrenciNormalKayitlar.map((k) => k.siniflar?.ad).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'))
  const gelmedigunleriToplam = genisletilenSatir === '__ogrenci_toplam__'
    ? ogrenciNormalKayitlar.filter((k) => !k.geldi).sort((a, b) => b.tarih.localeCompare(a.tarih))
    : []

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">Yoklama Raporu</h1>

      <BugunkuYoklamaDurumu isYonetici={isYonetici} ogretmenProfileId={profile?.id} />

      <div className="mb-6 flex flex-wrap gap-4 items-start">
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">Öğrenci Ara</label>
          <input
            type="text"
            value={seciliOgrenci ? seciliOgrenci.ad_soyad : aramaMetni}
            onChange={(e) => {
              setSeciliOgrenci(null)
              setAramaMetni(e.target.value)
            }}
            placeholder="İsim yazın (tüm sınıflarda arar)..."
            className="w-full max-w-sm px-3 py-2 pr-8 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          />
          {seciliOgrenci && (
            <button
              type="button"
              onClick={() => { setSeciliOgrenci(null); setAramaMetni('') }}
              className="absolute right-2 top-[34px] text-gray-400 hover:text-gray-600"
              title="Aramayı temizle, sınıf görünümüne dön"
            >
              ✕
            </button>
          )}
          {!seciliOgrenci && aramaSonuclari.length > 0 && (
            <div className="absolute z-10 mt-1 w-full max-w-sm bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {aramaSonuclari.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { setSeciliOgrenci(o); setAramaMetni('') }}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                >
                  {o.ad_soyad}
                </button>
              ))}
            </div>
          )}
        </div>

        {!seciliOgrenci && siniflar.length > 0 && (
          <>
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
          </>
        )}
      </div>

      {!seciliOgrenci && loading && <p className="text-gray-400">Yükleniyor...</p>}

      {!seciliOgrenci && !loading && kayitlar.length === 0 && (
        <p className="text-gray-400">Bu sınıf için henüz yoklama kaydı yok.</p>
      )}

      {!seciliOgrenci && !loading && kayitlar.length > 0 && (
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
                  const acik = genisletilenSatir === ad
                  // Gelmediği saatler — "3 gelmedi" yazısına tıklayınca hangi
                  // tarih/derste gelmediğini göstermek için (kullanıcı isteğiyle).
                  const gelmedigunleri = acik
                    ? normalKayitlar
                        .filter((k) => !k.geldi && (k.ogrenciler?.ad_soyad || 'Bilinmeyen') === ad)
                        .sort((a, b) => b.tarih.localeCompare(a.tarih))
                    : []
                  return (
                    <Fragment key={ad}>
                      <tr className={acik ? 'bg-red-50/60' : i % 2 ? 'bg-gray-50' : ''}>
                        <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{ad}</td>
                        <td className="px-4 py-3 text-center text-green-600 font-semibold whitespace-nowrap">{s.geldi}</td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {s.gelmedi > 0 ? (
                            <button
                              type="button"
                              onClick={() => setGenisletilenSatir(acik ? null : ad)}
                              className="text-red-500 font-semibold underline decoration-dotted underline-offset-2 hover:text-red-600"
                              title="Gelmediği saatleri göster"
                            >
                              {s.gelmedi}
                            </button>
                          ) : (
                            <span className="text-gray-400 font-semibold">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span className={`font-semibold ${oran > 20 ? 'text-red-500' : 'text-gray-600'}`}>%{oran}</span>
                        </td>
                      </tr>
                      {acik && (
                        <tr>
                          <td colSpan={4} className="px-4 py-3 bg-red-50 border-t border-b border-red-100">
                            <p className="text-xs font-semibold text-gray-600 mb-1.5">{ad} — gelmediği dersler:</p>
                            <ul className="text-xs text-gray-600 space-y-1">
                              {gelmedigunleri.map((k) => {
                                const d = new Date(k.tarih)
                                return (
                                  <li key={k.id}>
                                    {d.toLocaleDateString('tr-TR')} <span className="text-gray-400">({GUNLER[((d.getDay() + 6) % 7) + 1]})</span>
                                    {' — '}
                                    {k.ders_programi?.ders_adi || 'Ders'}
                                    {k.ders_programi?.profiles?.ad_soyad && ` (${k.ders_programi.profiles.ad_soyad})`}
                                  </li>
                                )
                              })}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {sinavOzetListesi.length > 0 && (
            <>
              <h2 className="font-semibold text-gray-700 mb-3">
                Sınav Katılımı
                <span className="font-normal text-gray-400"> — normal devamsızlıktan bağımsız, ayrı sayılır</span>
              </h2>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto overscroll-x-contain mb-8" style={{ touchAction: 'pan-x pan-y' }}>
                <table className="text-sm min-w-[480px] w-full">
                  <thead>
                    <tr className="bg-navy text-white text-left">
                      <th className="px-4 py-3 font-semibold whitespace-nowrap">Öğrenci</th>
                      {sinavTurleri.map((tur) => (
                        <th key={tur} className="px-4 py-3 font-semibold text-center whitespace-nowrap">
                          {SINAV_TURU_ETIKET[tur] || 'Sınav'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sinavOzetListesi.map(([ad, turler], i) => (
                      <tr key={ad} className={i % 2 ? 'bg-gray-50' : ''}>
                        <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{ad}</td>
                        {sinavTurleri.map((tur) => {
                          const s = turler[tur]
                          const toplam = s ? s.girdi + s.girmedi : 0
                          return (
                            <td key={tur} className="px-4 py-3 text-center whitespace-nowrap">
                              {s ? (
                                <span className={`font-semibold ${s.girmedi > 0 ? 'text-red-500' : 'text-green-600'}`}>
                                  {s.girdi}/{toplam}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700">Detaylı Geçmiş (Son Kayıtlar)</h2>
            <button
              type="button"
              onClick={() => setDetayGoster((v) => !v)}
              className="text-sm text-blue font-medium hover:underline"
            >
              {detayGoster ? 'Gizle' : 'Detaya Ulaş'}
            </button>
          </div>
          {detayGoster && (
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
                            {k.ders_programi?.sinav_mi && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-700">
                                {SINAV_TURU_ETIKET[k.ders_programi.sinav_turu] || 'Sınav'}
                              </span>
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
          )}
        </>
      )}

      {seciliOgrenci && ogrenciLoading && <p className="text-gray-400">Yükleniyor...</p>}

      {seciliOgrenci && !ogrenciLoading && ogrenciKayitlari.length === 0 && (
        <p className="text-gray-400">{seciliOgrenci.ad_soyad} için henüz yoklama kaydı yok.</p>
      )}

      {seciliOgrenci && !ogrenciLoading && ogrenciKayitlari.length > 0 && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-8">
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-700">{seciliOgrenci.ad_soyad}</span>
              {guncelSiniflar.length > 0 && (
                <span className="text-gray-400"> — şu an {guncelSiniflar.join(', ')} sınıfında</span>
              )}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Toplam {ogrenciNormalKayitlar.length} ders kaydı,{' '}
              <span className="text-green-600 font-semibold">{ogrenciToplamGeldi} geldi</span>,{' '}
              {ogrenciToplamGelmedi > 0 ? (
                <button
                  type="button"
                  onClick={() => setGenisletilenSatir(genisletilenSatir === '__ogrenci_toplam__' ? null : '__ogrenci_toplam__')}
                  className="text-red-500 font-semibold underline decoration-dotted underline-offset-2 hover:text-red-600"
                  title="Gelmediği saatleri göster"
                >
                  {ogrenciToplamGelmedi} gelmedi
                </button>
              ) : (
                <span className="text-gray-400 font-semibold">0 gelmedi</span>
              )}
              {ogrenciGecmisSiniflar.length > 1 && (
                <span className="text-gray-400"> — sınıf değiştirmiş olabilir, eski kayıtları da bu toplama dahil ({ogrenciGecmisSiniflar.join(', ')})</span>
              )}
            </p>
            {genisletilenSatir === '__ogrenci_toplam__' && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-600 mb-1.5">Gelmediği dersler:</p>
                <ul className="text-xs text-gray-600 space-y-1">
                  {gelmedigunleriToplam.map((k) => {
                    const d = new Date(k.tarih)
                    return (
                      <li key={k.id}>
                        {d.toLocaleDateString('tr-TR')} <span className="text-gray-400">({GUNLER[((d.getDay() + 6) % 7) + 1]})</span>
                        {' — '}
                        {k.siniflar?.ad && <span className="font-medium">{k.siniflar.ad}</span>}
                        {k.siniflar?.ad && ' · '}
                        {k.ders_programi?.ders_adi || 'Ders'}
                        {k.ders_programi?.profiles?.ad_soyad && ` (${k.ders_programi.profiles.ad_soyad})`}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700">Detaylı Geçmiş (Son Kayıtlar)</h2>
            <button
              type="button"
              onClick={() => setDetayGoster((v) => !v)}
              className="text-sm text-blue font-medium hover:underline"
            >
              {detayGoster ? 'Gizle' : 'Detaya Ulaş'}
            </button>
          </div>
          {detayGoster && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto overscroll-x-contain" style={{ touchAction: 'pan-x pan-y' }}>
              <table className="text-sm min-w-[640px] w-full">
                <thead>
                  <tr className="bg-navy text-white text-left">
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">Tarih</th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">Sınıf</th>
                    <th className="px-4 py-3 font-semibold">Ders / Öğretmen</th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {ogrenciKayitlari.slice(0, 100).map((k, i) => {
                    const d = new Date(k.tarih)
                    const gunAdi = GUNLER[((d.getDay() + 6) % 7) + 1]
                    return (
                      <tr key={k.id} className={i % 2 ? 'bg-gray-50' : ''}>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {d.toLocaleDateString('tr-TR')} <span className="text-gray-400">({gunAdi})</span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{k.siniflar?.ad || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {k.ders_programi?.ders_adi || '—'}
                          {k.ders_programi?.profiles?.ad_soyad && (
                            <span className="text-gray-400"> — {k.ders_programi.profiles.ad_soyad}</span>
                          )}
                          {k.ders_programi?.sinav_mi && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-700">
                              {SINAV_TURU_ETIKET[k.ders_programi.sinav_turu] || 'Sınav'}
                            </span>
                          )}
                        </td>
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
          )}
        </>
      )}
    </div>
  )
}
