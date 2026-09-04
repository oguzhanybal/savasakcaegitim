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
//   1) GÜN LİSTESİ — son GUN_PENCERESI gündeki, en az bir dersi olan günler
//      (varsayılan: TÜM sınıflar bir arada; istenirse tek sınıfa daraltılır).
//   2) O GÜNÜN DERSLERİ — seçilen güne ait ders saatleri, Alındı/Alınmadı.
//   3) YOKLAMA ALMA — seçilen dersin öğrenci Geldi/Gelmedi listesi.
// Aynı gün+saat+sınıf için birden fazla satır üretilmesin diye (ör. ders
// saati sonradan düzenlenmiş/yeniden eklenmişse) tekilleştirme yapılıyor;
// gerçekten yoklaması alınmış olan her zaman öncelikli gösterilir.
// Öğretmen sadece KENDİ derslerini görür (hem gereksiz kalabalık olmasın
// diye, hem de yoklama tablosunun RLS kuralı zaten başka öğretmenin
// kaydını göstermiyor — bu da yanlış "Alınmadı" görünümüne yol açıyordu).
//
// ÖNEMLİ DÜZELTME: bir ders saati SONRADAN düzenlenip pasif hale
// getirildiyse (aktif=false, pasif_tarihi=X), o satır eskiden SADECE "şu an
// aktif mi" diye kontrol edilip listeden tamamen ATLANIYORDU — bu da o
// derse ait eski günlerin (gerçek yoklama kaydı da yoksa) hiç listede
// görünmemesine, dolayısıyla "her gün 10 ders var ama bazı günler 7
// görünüyor" şikayetine yol açıyordu. Artık pasif bir satır da, pasif
// olduğu tarihten ÖNCEKİ günler için hâlâ "o günün programının parçası"
// sayılıyor (oTarihteAktifMi kontrolü).
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

// ÖNEMLİ DÜZELTME 5: Supabase tek seferlik sorgularda VARSAYILAN OLARAK 1000
// satırla sınırlıyor. "yoklama" tablosu ÖĞRENCİ BAŞINA bir satır olduğu
// için (21 gün × okulun tüm dersleri × öğrenci sayısı), bu sınır kolayca
// aşılıyor ve sorgu sessizce kesiliyor — bu da gerçekten alınmış
// yoklamaların "Alınmadı" görünmesine yol açıyordu (yönetici dahil, RLS'le
// ilgisi yoktu). `queryOlustur` her çağrıda YENİ bir sorgu nesnesi
// üretmeli (aynı builder tekrar kullanılamaz), 1000'er satır sayfalanarak
// hepsi çekilir.
async function sayfalayarakGetir(queryOlustur, sayfaBoyutu = 1000) {
  let tumSatirlar = []
  let sayfa = 0
  while (true) {
    const { data, error } = await queryOlustur().range(sayfa * sayfaBoyutu, sayfa * sayfaBoyutu + sayfaBoyutu - 1)
    if (error || !data) break
    tumSatirlar = tumSatirlar.concat(data)
    if (data.length < sayfaBoyutu) break
    sayfa++
  }
  return tumSatirlar
}

export default function GecmisYoklama() {
  const { profile } = useAuth()
  const isYonetici = profile?.rol === 'yonetici'
  const [siniflar, setSiniflar] = useState([])
  const [ogretmenler, setOgretmenler] = useState([])
  const [seciliSinif, setSeciliSinif] = useState('') // '' = Tümü
  const [gunListesi, setGunListesi] = useState([]) // [{tarih, gun, dersler: [...]}]
  const [yukleniyorListe, setYukleniyorListe] = useState(true)
  const [seciliGun, setSeciliGun] = useState(null) // tarih string, null ise gün listesi görünümü
  // Bir günün derslerinden tıklanan öge — {tarih, ders} şeklinde, null ise
  // gün detay görünümü, doluysa o dersin yoklama alma ekranı gösterilir.
  const [seciliOge, setSeciliOge] = useState(null)
  const [ogrenciler, setOgrenciler] = useState([])
  const [yoklamaKayitlari, setYoklamaKayitlari] = useState({})
  const [yukleniyorOgrenci, setYukleniyorOgrenci] = useState(false)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  // "Bu yoklamayı tamamen sil" için — bir öğretmen yanlış sınıfa/derse
  // yoklama aldığında (ör. yanlış tıklama), o dersin o güne ait TÜM
  // yoklama satırlarını kalıcı olarak kaldırmak için. Sadece yöneticiye
  // (isYonetici) gösterilir; kaydet() gibi ders_programi_id+tarih
  // eşleşmesine göre çalışır, tekil öğrenci satırı değil TÜM dersin o
  // günkü kaydını siler (kullanıcı isteğiyle: yanlış sınıfa alınan
  // yoklama admin panelinden düzeltilsin, Supabase'e SQL ile inmeye gerek
  // kalmasın).
  const [siliniyor, setSiliniyor] = useState(false)

  useEffect(() => {
    supabase.from('siniflar').select('*').then(({ data }) => setSiniflar(data || []))
    // Sınıf dersi hangi öğretmene ait, yönetici "Tümü" modunda listeye
    // bakınca görebilsin diye — öğretmen kendi derslerini zaten filtreyle
    // gördüğü için adını tekrar görmesine gerek yok, sadece yöneticiye gösterilir.
    supabase
      .from('profiles')
      .select('id, ad_soyad')
      .eq('rol', 'ogretmen')
      .then(({ data }) => setOgretmenler(data || []))
  }, [])

  function sinifAdi(sinifId) {
    return siniflar.find((s) => s.id === sinifId)?.ad || ''
  }

  function ogretmenAdi(ogretmenId) {
    return ogretmenler.find((o) => o.id === ogretmenId)?.ad_soyad || ''
  }

  // Sınıf seçimi (ya da "Tümü") değişince: son GUN_PENCERESI gündeki dersleri
  // güne göre gruplayarak üretir. Her gün için: o gün gerçekten yoklaması
  // alınmış dersler (asla filtrelenmez) + o TARİHTE geçerli olan programa
  // göre henüz yoklaması alınmamış dersler — aynı saat+sınıf için ikisi de
  // varsa alınmış olan kazanır.
  useEffect(() => {
    setSeciliGun(null)
    setSeciliOge(null)
    setYukleniyorListe(true)
    ;(async () => {
      // ders_programi de zamanla (sık değişen dersler yüzünden) 1000 satırı
      // geçebileceğinden aynı sayfalama burada da uygulanıyor.
      const tumSatirlar = await sayfalayarakGetir(() => {
        let sorgu = supabase.from('ders_programi').select('*')
        if (seciliSinif) sorgu = sorgu.eq('sinif_id', seciliSinif)
        return sorgu
      })
      const bugun = yerelTarih(new Date())
      const dEski = new Date(bugun + 'T12:00:00')
      dEski.setDate(dEski.getDate() - GUN_PENCERESI)
      const enEskiTarih = yerelTarih(dEski)
      const dDun = new Date(bugun + 'T12:00:00')
      dDun.setDate(dDun.getDate() - 1)
      const dun = yerelTarih(dDun)

      // GERÇEKTEN yoklaması alınmış dersler — doğrudan yoklama tablosundan.
      //
      // ÖNEMLİ DÜZELTME 2 (ve DÜZELTME 3 — ilk denemedeki hatayı giderir):
      // bir ders saati başka bir öğretmene DEVREDİLDİYSE (aynı sınıf+gün+saat
      // için eski satır pasif yapılıp yeni bir satır/yeni ders_programi_id
      // oluşturulduysa), o günkü yoklama kaydı ESKİ satırın id'sine bağlı
      // kalır. Bunu tanımak için "alınmış mı" kontrolü aşağıda, HER GÜN İÇİN
      // SADECE O GÜN GERÇEKTEN KENDİSİNE AİT OLAN dersler (satirlar +
      // tarih/aktiflik kontrolünden geçmiş adaylar) üzerinden, aynı
      // sınıf+GÜN+saat kombinasyonuyla eşleşen TÜM ders_programi id'lerine
      // (hangi öğretmene ait olursa olsun) bakılarak yapılır — bu sayede hem
      // "benim devraldığım dersin geçmişi" doğru görünür, hem de HİÇBİR
      // ZAMAN kendi adaylarımın dışına (başka güne/saate/asla sahip
      // olmadığım bir derse) taşmaz. (İlk denemede "gun" eşleşmesi ve
      // tarih/aktiflik kontrolü unutulmuştu — bu da bir öğretmenin, GEÇMİŞTE
      // herhangi bir tarihte kısaca sahip olduğu her sınıf+saat için, o
      // saatteki BAŞKA GÜNLERİN/BAŞKA ÖĞRETMENLERİN yoklamalarını da
      // görebilmesi gibi ciddi bir gizlilik açığına yol açmıştı; ayrıca
      // pasif olmuş eski derslerin de "hâlâ benim dersim" sayılıp gerçek
      // olmayan "Alındı" satırları üretmesine sebep olmuştu.)
      const tumSatirMap = new Map(tumSatirlar.map((s) => [s.id, s]))
      const tumIdler = tumSatirlar.map((s) => s.id)
      const yoklamaSatirlari = tumIdler.length
        ? await sayfalayarakGetir(() =>
            supabase
              .from('yoklama')
              .select('ders_programi_id, tarih')
              .in('ders_programi_id', tumIdler)
              .gte('tarih', enEskiTarih)
              .lte('tarih', dun)
          )
        : []
      // tarih -> Map(sinif_id|gun|saat -> ders) — anahtara GÜN de dahil,
      // aksi halde farklı günlerin aynı saatteki dersleri birbirine karışır.
      const alinanByTarih = new Map()
      for (const y of yoklamaSatirlari || []) {
        const ders = tumSatirMap.get(y.ders_programi_id)
        if (!ders) continue
        const anahtar = `${ders.sinif_id}|${ders.gun}|${ders.baslangic_saat}-${ders.bitis_saat}`
        if (!alinanByTarih.has(y.tarih)) alinanByTarih.set(y.tarih, new Map())
        alinanByTarih.get(y.tarih).set(anahtar, ders)
      }

      // Slot (sınıf+gün+saat) bazında gruplama — bir slotu zaman içinde farklı
      // öğretmenler devralmış olabilir. "O tarihte GERÇEKTEN kimin dersiydi"
      // sorusunu doğru cevaplamak için, aynı slotu paylaşan TÜM satırlar
      // (hangi öğretmene ait olursa olsun) birlikte değerlendirilir.
      const slotGruplari = new Map() // temelAnahtar -> satır dizisi
      for (const s of tumSatirlar) {
        const anahtar = `${s.sinif_id}|${s.gun}|${s.baslangic_saat}-${s.bitis_saat}`
        if (!slotGruplari.has(anahtar)) slotGruplari.set(anahtar, [])
        slotGruplari.get(anahtar).push(s)
      }

      // Güne göre ders listesi üret.
      const gunler = []
      for (let i = 1; i <= GUN_PENCERESI; i++) {
        const d = new Date(bugun + 'T12:00:00')
        d.setDate(d.getDate() - i)
        const tarih = yerelTarih(d)
        const gunNo = gunNumarasi(tarih)
        const alinanAnahtarlar = alinanByTarih.get(tarih) || new Map()
        const dersMap = new Map() // anahtar -> {ders, alindiMi}

        // ÖNEMLİ DÜZELTME 4: bir slot (sınıf+gün+saat) devredildiğinde, admin
        // genelde önce YENİ öğretmen için yeni satırı ekliyor, ESKİ satırı
        // ("pasif_tarihi") ise günler sonra, başka bir değişiklik yaparken
        // siliyor. Bu yüzden "eski" satırın pasif_tarihi'ne bakarak
        // "o tarihte aktif miydi" diye sormak yanıltıcı olabiliyor — eski
        // satır teknik olarak hâlâ "aktif" görünse bile, o slot o tarihte
        // ARTIK BAŞKA BİR ÖĞRETMENE aitti. Doğru soru: "bu slotu paylaşan
        // satırlar arasında, bu tarihten önce/bu tarihte başlamış olanların
        // EN YENİSİ hangisi" — cevap o tarihteki GERÇEK sahibi verir (yeni
        // bir satırın oluşturulması, o slotun artık yeni sahibine geçtiğinin
        // en güvenilir işaretidir; eski satırın ne zaman silindiği önemsiz).
        for (const [temelAnahtar, satirGrubu] of slotGruplari) {
          if (satirGrubu[0].gun !== gunNo) continue

          let enYeni = null
          let enYeniBaslangic = null
          for (const s of satirGrubu) {
            const gecerliBaslangic = s.baslangic_tarihi || (s.created_at ? s.created_at.slice(0, 10) : null)
            if (!gecerliBaslangic || gecerliBaslangic > tarih) continue
            const karsilastirmaAnahtari = `${gecerliBaslangic}T${s.created_at || ''}`
            const enYeniKarsilastirma = enYeniBaslangic ? `${enYeniBaslangic}T${enYeni.created_at || ''}` : null
            if (!enYeni || karsilastirmaAnahtari > enYeniKarsilastirma) {
              enYeni = s
              enYeniBaslangic = gecerliBaslangic
            }
          }
          if (!enYeni) continue // bu tarihte bu slot henüz hiç oluşturulmamış

          const oTarihteAktifMi = enYeni.aktif !== false || (enYeni.pasif_tarihi && enYeni.pasif_tarihi > tarih)
          if (!oTarihteAktifMi) continue // o tarihte slot tamamen kaldırılmış, kimseye ait değil

          // Öğretmen sadece O TARİHTE GERÇEKTEN kendisine ait olan slotları
          // görür — "en yeni satır"ın sahibi kendisi değilse, bu slot o gün
          // için ona ait değildir (devredilmiş).
          if (profile?.rol === 'ogretmen' && enYeni.ogretmen_profile_id !== profile.id) continue

          // GERÇEKTEN alınmış mı — aynı slotta (hangi ders_programi_id/
          // öğretmen olursa olsun) o tarihe ait yoklama kaydı var mı.
          const alinanKaydi = alinanAnahtarlar.get(temelAnahtar)
          dersMap.set(temelAnahtar, { ders: alinanKaydi || enYeni, alindiMi: !!alinanKaydi })
        }

        if (dersMap.size === 0) continue
        const dersler = [...dersMap.values()].sort((a, b) =>
          (a.ders.baslangic_saat || '').localeCompare(b.ders.baslangic_saat || '')
        )
        gunler.push({ tarih, gun: gunNo, dersler })
      }

      setGunListesi(gunler)
      setYukleniyorListe(false)
    })()
  }, [seciliSinif, profile?.id, profile?.rol])

  // Bir öge seçilince o dersin öğrencilerini + (varsa) o tarihe ait yoklama
  // kayıtlarını getirir. Sınıf, seçili filtreden değil DOĞRUDAN dersin
  // kendisinden (ders.sinif_id) alınır — "Tümü" modunda farklı sınıfların
  // dersleri aynı listede görünebildiği için bu önemli.
  useEffect(() => {
    if (!seciliOge) {
      setOgrenciler([])
      setYoklamaKayitlari({})
      return
    }
    setYukleniyorOgrenci(true)
    Promise.all([
      // ÖNEMLİ: burada "sinif_ogrenciler" (ŞU ANKİ liste) DEĞİL,
      // "sinif_ogrenciler_gecmisi" kullanılıyor — o SEÇİLİ TARİHTE
      // (seciliOge.tarih) gerçekten bu sınıfta kayıtlı olan öğrencileri
      // getirir. Aksi halde: sonradan eklenen bir öğrenci aylar önceki bir
      // güne de "varmış" gibi görünüyordu, sınıfı değiştiren bir öğrenci ise
      // eski sınıfının geçmiş tarihlerinde hiç görünmüyordu (kullanıcı
      // isteğiyle düzeltildi). baslangic_tarihi/bitis_tarihi NULL ise sınır
      // yok demektir (bu tablo eklenmeden ÖNCEki eski kayıtlar için).
      supabase
        .from('sinif_ogrenciler_gecmisi')
        .select('ogrenciler(id, ad_soyad)')
        .eq('sinif_id', seciliOge.ders.sinif_id)
        .or(`baslangic_tarihi.is.null,baslangic_tarihi.lte.${seciliOge.tarih}`)
        .or(`bitis_tarihi.is.null,bitis_tarihi.gte.${seciliOge.tarih}`),
      supabase.from('yoklama').select('*').eq('ders_programi_id', seciliOge.ders.id).eq('tarih', seciliOge.tarih),
    ]).then(([so, y]) => {
      // Aynı öğrenci için (nadiren) birden fazla geçmiş satırı eşleşirse
      // (ör. sınıftan çıkıp aynı gün tekrar eklenmişse) tekilleştir.
      const gorulen = new Set()
      const liste = (so.data || [])
        .map((r) => r.ogrenciler)
        .filter((o) => o && !gorulen.has(o.id) && gorulen.add(o.id))
      setOgrenciler(liste)
      const mevcut = {}
      ;(y.data || []).forEach((k) => {
        mevcut[k.ogrenci_id] = k.geldi
      })
      setYoklamaKayitlari(mevcut)
      setYukleniyorOgrenci(false)
    })
  }, [seciliOge])

  function isaretle(ogrenciId, geldi) {
    setYoklamaKayitlari((prev) => ({ ...prev, [ogrenciId]: geldi }))
  }

  // Yoklama.jsx'teki AYNI bildirim mekanizması — yöneticiye e-posta gider,
  // tarih zaten ayrıca belirtildiği için geçmişe dönük olduğunu ekstra
  // etiketlemeye gerek yok. Bu isteğin başarısız olması yoklama kaydını asla
  // etkilemez.
  function bildirimGonder(kayitlar) {
    const saatMetni = `${seciliOge.ders.baslangic_saat?.slice(0, 5)}–${seciliOge.ders.bitis_saat?.slice(0, 5)}`
    const gelmeyenIsimler = ogrenciler.filter((o) => !kayitlar.find((k) => k.ogrenci_id === o.id)?.geldi).map((o) => o.ad_soyad)
    fetch('/api/yoklama-bildirim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sinifAdi: sinifAdi(seciliOge.ders.sinif_id),
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
      sinif_id: seciliOge.ders.sinif_id,
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

  // Yanlışlıkla alınmış bir yoklamayı (yanlış sınıf/ders seçilmiş vs.)
  // kalıcı olarak kaldırır — bu dersin bu güne ait TÜM öğrenci satırlarını
  // siler. Sadece yöneticiye gösterilir, geri alınamaz, bu yüzden onay
  // penceresinde tarih/sınıf/ders/öğrenci sayısı açıkça gösteriliyor.
  async function sil() {
    if (!seciliOge) return
    const ogrenciSayisi = Object.keys(yoklamaKayitlari).length
    const onay = confirm(
      `${tarihUzunFormat(seciliOge.tarih)} tarihli, ${sinifAdi(seciliOge.ders.sinif_id)} sınıfının ` +
        `${seciliOge.ders.ders_adi || 'bu'} dersi yoklamasını SİLMEK istediğinize emin misiniz?\n\n` +
        `${ogrenciSayisi} öğrencinin bu derse ait kaydı KALICI OLARAK kaldırılacak. Bu işlem geri alınamaz.`
    )
    if (!onay) return
    setSiliniyor(true)
    const { error } = await supabase
      .from('yoklama')
      .delete()
      .eq('ders_programi_id', seciliOge.ders.id)
      .eq('tarih', seciliOge.tarih)
    setSiliniyor(false)
    if (error) {
      alert('Hata: ' + error.message)
      return
    }
    alert('Yoklama silindi.')
    setYoklamaKayitlari({})
    // Gün listesindeki ilgili satırı hemen "Alınmadı" yap (kaydet()'teki
    // AYNI yerel-güncelleme deseni).
    setGunListesi((prev) =>
      prev.map((g) =>
        g.tarih !== seciliOge.tarih
          ? g
          : {
              ...g,
              dersler: g.dersler.map((d) => (d.ders.id === seciliOge.ders.id ? { ...d, alindiMi: false } : d)),
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
            <option value="">Tümü</option>
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
          {!yukleniyorListe && gunListesi.length === 0 && (
            <p className="text-gray-400">Son {GUN_PENCERESI} günde programlı bir ders günü bulunamadı.</p>
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
                  {' — '}
                  <span className="text-gray-500">{sinifAdi(o.ders.sinif_id)}</span>
                  {profile?.rol !== 'ogretmen' && ogretmenAdi(o.ders.ogretmen_profile_id) && (
                    <span className="text-gray-400"> — {ogretmenAdi(o.ders.ogretmen_profile_id)}</span>
                  )}
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
              {' — '}
              {sinifAdi(seciliOge.ders.sinif_id)}
              {profile?.rol !== 'ogretmen' && ogretmenAdi(seciliOge.ders.ogretmen_profile_id) && (
                <> — {ogretmenAdi(seciliOge.ders.ogretmen_profile_id)}</>
              )}
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
              <div className="px-4 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <button
                  onClick={kaydet}
                  disabled={kaydediliyor}
                  className="bg-navy text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-blue transition-colors disabled:opacity-50"
                >
                  {kaydediliyor ? 'Kaydediliyor...' : 'Yoklamayı Kaydet'}
                </button>
                {isYonetici && Object.keys(yoklamaKayitlari).length > 0 && (
                  <button
                    onClick={sil}
                    disabled={siliniyor}
                    className="text-red-600 text-sm font-medium hover:underline disabled:opacity-50"
                  >
                    {siliniyor ? 'Siliniyor...' : 'Bu yoklamayı tamamen sil (yanlış alındıysa)'}
                  </button>
                )}
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
