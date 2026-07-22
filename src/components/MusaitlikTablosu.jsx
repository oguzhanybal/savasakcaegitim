import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { DERS_PERIYOTLARI } from '../lib/dersPeriyotlari'

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

// Taslak Modu açıkken Hızlı Ekle ile oluşturulan taslakların BİRBİRİYLE
// çakışıp çakışmadığını kontrol eder (DersProgrami.jsx/BireBir.jsx'teki
// taslagaKaydet()'lerle aynı amaç) — 'sinif'/'bire_bir_haftalik' taslakları
// haftanın GÜNÜNE göre tekrar eder (veri.gun), 'bire_bir_tekil'/'soru_cozumu'
// ise belirli bir TARİHE bağlıdır (veri.tarih). Çakışma varsa açıklama metni,
// yoksa null döner.
function taslakCakismasiAciklamasi(taslaklar, { ogretmenId, sinifId, ogrenciId, gun, tarih, baslangic, bitis }) {
  for (const t of taslaklar || []) {
    const v = t.veri || {}
    if (!v.baslangic_saat || !v.bitis_saat) continue
    const gunEslesiyor = t.tur === 'sinif' || t.tur === 'bire_bir_haftalik' ? v.gun === gun : v.tarih === tarih
    if (!gunEslesiyor) continue
    if (!araliklarCakisiyorMu(baslangic, bitis, v.baslangic_saat, v.bitis_saat)) continue
    if (ogretmenId && v.ogretmen_profile_id === ogretmenId) {
      const turAdi = t.tur === 'sinif' ? 'sınıf dersi' : t.tur === 'soru_cozumu' ? 'soru çözümü' : 'bire bir ders'
      return `Bu öğretmenin bu saatte zaten bekleyen bir taslağı var (${turAdi}).`
    }
    if (sinifId && t.tur === 'sinif' && v.sinif_id === sinifId) {
      return 'Bu sınıfın bu saatte zaten bekleyen bir taslağı var.'
    }
    if (ogrenciId && (t.tur === 'bire_bir_haftalik' || t.tur === 'bire_bir_tekil') && v.ogrenci_id === ogrenciId) {
      return 'Bu öğrencinin bu saatte zaten bekleyen bir taslağı var.'
    }
  }
  return null
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

function yerelBugunTarihi() {
  const simdi = new Date()
  return `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, '0')}-${String(simdi.getDate()).padStart(2, '0')}`
}

function yerelSuankiSaatDakika() {
  const simdi = new Date()
  return `${String(simdi.getHours()).padStart(2, '0')}:${String(simdi.getMinutes()).padStart(2, '0')}`
}

// Sütun başlıkları artık serbest 30dk dilimler DEĞİL, okulun gerçek sabit
// ders periyotları (45dk ders + 10dk teneffüs, bkz. dersPeriyotlari.js).
const SAAT_DILIMLERI = DERS_PERIYOTLARI

export default function MusaitlikTablosu({
  ogretmenler,
  dersProgrami,
  atamalar,
  yoklamalar,
  ogrenciAdMap,
  onHucreTikla,
  secili,
  // Aşağıdaki 3 prop OPSİYONEL — sadece Ders Programı sayfasındaki "Ders Ekleme
  // Aracı" bu şekilde kullanır (Bire Bir sayfası bunları hiç geçmez, oradaki
  // davranış eskisi gibi aynen kalır). true ise, boş bir hücreye tıklandığında
  // ESKİ davranışa (onHucreTikla ile aşağıdaki forma yönlendirme) EK OLARAK,
  // hücrenin üzerinde küçük bir "hızlı ekle" kutusu açılır: öğrenci ya da sınıf
  // adı yazılıp listeden seçilince (serbest yazılan, eşleşmeyen bir isim kabul
  // edilmez) direkt o saate ders eklenir.
  ogrenciler = [],
  siniflar = [],
  hizliEkleEtkin = false,
  onHizliEklendi,
  // Taslak Modu — sayfa üstündeki aç/kapa anahtarı açıkken (hem taslakModuAcik
  // hem aktifPlanAdi doluyken) "Hızlı Ekle" ile eklenen HER ders (soru çözümü,
  // sınıf, öğrenci) canlı tabloya değil, taslaklar tablosuna, aktifPlanAdi ile
  // isimlendirilmiş TEK bir plana kaydedilir. taslaklar propu, bekleyen diğer
  // taslaklarla da çakışma kontrolü yapabilmek için veriliyor (opsiyonel —
  // sadece Ders Programı sayfası bunu geçer, bkz. dosya başındaki genel not).
  taslakModuAcik = false,
  aktifPlanAdi = '',
  taslaklar = [],
}) {
  const { profile } = useAuth()
  const [tarih, setTarih] = useState(() => new Date().toISOString().slice(0, 10))
  const gun = gunNumaraTarihten(tarih)

  // "Hızlı Ekle" kutusu — bkz. yukarıdaki hizliEkleEtkin açıklaması.
  const [hizliPopup, setHizliPopup] = useState(null)
  const [aramaMetni, setAramaMetni] = useState('')
  const [secilen, setSecilen] = useState(null) // { tur: 'ogrenci'|'sinif', id, ad }
  const [ucret, setUcret] = useState('')
  const [hpHata, setHpHata] = useState('')
  const [hpGonderiliyor, setHpGonderiliyor] = useState(false)

  function hizliPopupKapat() {
    setHizliPopup(null)
    setAramaMetni('')
    setSecilen(null)
    setUcret('')
    setHpHata('')
  }

  // Yazılan metne göre öğrenci + sınıf önerileri (en fazla 6'şar tane).
  const oneriler = useMemo(() => {
    const q = aramaMetni.trim().toLocaleLowerCase('tr')
    if (!q) return []
    const sinifSonuc = (siniflar || [])
      .filter((s) => s.ad?.toLocaleLowerCase('tr').includes(q))
      .slice(0, 6)
      .map((s) => ({ tur: 'sinif', id: s.id, ad: s.ad }))
    const ogrenciSonuc = (ogrenciler || [])
      .filter((o) => o.ad_soyad?.toLocaleLowerCase('tr').includes(q))
      .slice(0, 6)
      .map((o) => ({ tur: 'ogrenci', id: o.id, ad: o.ad_soyad }))
    return [...sinifSonuc, ...ogrenciSonuc]
  }, [aramaMetni, ogrenciler, siniflar])

  // Bu öğrenci-öğretmen ikilisi için daha önce kullanılmış bir ücret varsa
  // (önce haftalık atamalara, yoksa geçmiş tek seferlik derslere bakarak) önerir.
  function ucretOner(ogrenciId, ogretmenId) {
    const atamaEslesen = (atamalar || []).find((a) => a.ogrenci_id === ogrenciId && a.ogretmen_profile_id === ogretmenId)
    if (atamaEslesen) return atamaEslesen.ders_ucreti
    const gecmis = (yoklamalar || [])
      .filter((y) => !y.atama_id && y.ogrenci_id === ogrenciId && y.ogretmen_profile_id === ogretmenId && y.tutar != null)
      .sort((a, b) => (a.tarih < b.tarih ? 1 : a.tarih > b.tarih ? -1 : 0))
    return gecmis.length > 0 ? gecmis[0].tutar : null
  }

  function oneriSecildi(op) {
    setSecilen(op)
    setAramaMetni(op.ad)
    setHpHata('')
    if (op.tur === 'ogrenci') {
      const oner = ucretOner(op.id, hizliPopup.ogretmenId)
      setUcret(oner != null ? String(oner) : '')
    }
  }

  async function hizliKaydet() {
    if (!hizliPopup || !secilen) return
    setHpHata('')

    // Taslak Modu anahtarı AÇIKKEN plan adı boş bırakılırsa, eskiden burada
    // sessizce CANLI tabloya yazılıyordu (kullanıcı anahtarın açık göründüğünü
    // görüp taslağa gittiğini sanıyor, oysa direkt yayınlanıyordu) — bu artık
    // KESİN olarak engelleniyor: anahtar açıkken plan adı yoksa hiçbir şey
    // eklenmez, açık ve net bir hata gösterilir. Anahtar açıkken TEK yol,
    // canlıya ya da taslağa gitmek değil, önce bir plan adı yazmaktır.
    if (taslakModuAcik && !aktifPlanAdi) {
      setHpHata('Taslak Modu açık — devam etmeden önce sayfanın üstündeki kutuya bir plan adı yazın (yoksa hiçbir yere eklenmez).')
      return
    }

    // Taslak Modu: sayfa üstündeki anahtar açık VE bir plan adı girilmişse,
    // aşağıdaki 3 dalın hiçbiri canlı tabloya yazmaz — hepsi taslaklar
    // tablosuna, aynı plan_adi ile kaydedilir (bkz. dosya başındaki not).
    const taslakModuEtkin = taslakModuAcik && !!aktifPlanAdi

    if (secilen.tur === 'soru_cozumu') {
      // Soru Çözümü: öğrenciye bağlı değil, fiyatlandırılmaz — sadece öğretmen +
      // tarih + saat kaydedilir. Öğretmenin ekstresinde görünsün diye
      // bire_bir_yoklama'ya "tur: soru_cozumu" ile, ücretsiz bir satır olarak
      // eklenir (bkz. ekstreHesap.js bireBirBorclariOlustur — bu tur asla
      // borç oluşturmaz).
      if (taslakModuEtkin) {
        const cakisma = taslakCakismasiAciklamasi(taslaklar, {
          ogretmenId: hizliPopup.ogretmenId,
          gun: hizliPopup.gun,
          tarih: hizliPopup.tarih,
          baslangic: hizliPopup.baslangic,
          bitis: hizliPopup.bitis,
        })
        if (cakisma) {
          setHpHata(cakisma)
          return
        }
        setHpGonderiliyor(true)
        const { error } = await supabase.from('taslaklar').insert({
          tur: 'soru_cozumu',
          veri: {
            ogretmen_profile_id: hizliPopup.ogretmenId,
            tarih: hizliPopup.tarih,
            baslangic_saat: hizliPopup.baslangic,
            bitis_saat: hizliPopup.bitis,
          },
          olusturan_profile_id: profile?.id,
          plan_adi: aktifPlanAdi || null,
        })
        setHpGonderiliyor(false)
        if (error) {
          setHpHata('Hata: ' + error.message)
          return
        }
      } else {
        setHpGonderiliyor(true)
        const { error } = await supabase.from('bire_bir_yoklama').insert({
          ogretmen_profile_id: hizliPopup.ogretmenId,
          tur: 'soru_cozumu',
          tutar: 0,
          tarih: hizliPopup.tarih,
          durum: 'geldi',
          baslangic_saat: hizliPopup.baslangic,
          bitis_saat: hizliPopup.bitis,
        })
        setHpGonderiliyor(false)
        if (error) {
          setHpHata('Hata: ' + error.message)
          return
        }
      }
    } else if (secilen.tur === 'sinif') {
      // Bu sınıfın bu gün/saatte (farklı bir öğretmenle bile olsa) başka dersi
      // var mı? Bu kontrol taslak modunda da anlamlı (canlı program hâlâ
      // canlı program), o yüzden HER İKİ modda da çalışır.
      const cakisan = (dersProgrami || []).find(
        (d) =>
          d.sinif_id === secilen.id &&
          d.gun === hizliPopup.gun &&
          araliklarCakisiyorMu(hizliPopup.baslangic, hizliPopup.bitis, d.baslangic_saat, d.bitis_saat)
      )
      if (cakisan) {
        setHpHata(`Bu sınıfın bu saatte zaten "${cakisan.ders_adi || cakisan.sinif_adi || 'bir'}" dersi var.`)
        return
      }
      if (taslakModuEtkin) {
        const taslakCakisma = taslakCakismasiAciklamasi(taslaklar, {
          ogretmenId: hizliPopup.ogretmenId,
          sinifId: secilen.id,
          gun: hizliPopup.gun,
          tarih: hizliPopup.tarih,
          baslangic: hizliPopup.baslangic,
          bitis: hizliPopup.bitis,
        })
        if (taslakCakisma) {
          setHpHata(taslakCakisma)
          return
        }
        setHpGonderiliyor(true)
        const { error } = await supabase.from('taslaklar').insert({
          tur: 'sinif',
          veri: {
            sinif_id: secilen.id,
            ders_adi: null,
            ogretmen_profile_id: hizliPopup.ogretmenId,
            gun: hizliPopup.gun,
            baslangic_saat: hizliPopup.baslangic,
            bitis_saat: hizliPopup.bitis,
          },
          olusturan_profile_id: profile?.id,
          plan_adi: aktifPlanAdi || null,
        })
        setHpGonderiliyor(false)
        if (error) {
          setHpHata('Hata: ' + error.message)
          return
        }
      } else {
        setHpGonderiliyor(true)
        const { error } = await supabase.from('ders_programi').insert({
          sinif_id: secilen.id,
          ders_adi: null,
          ogretmen_profile_id: hizliPopup.ogretmenId,
          gun: hizliPopup.gun,
          baslangic_saat: hizliPopup.baslangic,
          bitis_saat: hizliPopup.bitis,
        })
        setHpGonderiliyor(false)
        if (error) {
          setHpHata('Hata: ' + error.message)
          return
        }
      }
    } else {
      if (!ucret || Number(ucret) <= 0) {
        setHpHata('Lütfen geçerli bir ücret girin.')
        return
      }
      // Bu öğrencinin bu saatte (haftalık atama ya da tek seferlik) başka dersi
      // var mı? Canlı verilere karşı kontrol her iki modda da çalışır.
      const atamaCakisan = (atamalar || []).find(
        (a) =>
          a.ogrenci_id === secilen.id &&
          a.aktif &&
          a.gun === hizliPopup.gun &&
          araliklarCakisiyorMu(hizliPopup.baslangic, hizliPopup.bitis, a.baslangic_saat, a.bitis_saat)
      )
      const tekSeferlikCakisan = (yoklamalar || []).find(
        (y) =>
          y.ogrenci_id === secilen.id &&
          y.tarih === hizliPopup.tarih &&
          y.baslangic_saat &&
          y.bitis_saat &&
          araliklarCakisiyorMu(hizliPopup.baslangic, hizliPopup.bitis, y.baslangic_saat, y.bitis_saat)
      )
      if (atamaCakisan || tekSeferlikCakisan) {
        setHpHata('Bu öğrencinin bu saatte başka bir dersi var.')
        return
      }
      if (taslakModuEtkin) {
        const taslakCakisma = taslakCakismasiAciklamasi(taslaklar, {
          ogretmenId: hizliPopup.ogretmenId,
          ogrenciId: secilen.id,
          gun: hizliPopup.gun,
          tarih: hizliPopup.tarih,
          baslangic: hizliPopup.baslangic,
          bitis: hizliPopup.bitis,
        })
        if (taslakCakisma) {
          setHpHata(taslakCakisma)
          return
        }
        setHpGonderiliyor(true)
        // Hızlı Ekle her zaman belirli bir TARİHE bağlı olduğu için (haftalık
        // tekrar eden bir atama değil), taslak her zaman 'bire_bir_tekil'
        // türünde kaydedilir — BireBir.jsx'teki "Hayır, sadece bu sefer"
        // taslağıyla AYNI veri şekli (ogrenci_id, ogretmen_profile_id, tutar,
        // tarih, baslangic_saat, bitis_saat).
        const { error } = await supabase.from('taslaklar').insert({
          tur: 'bire_bir_tekil',
          veri: {
            ogrenci_id: secilen.id,
            ogretmen_profile_id: hizliPopup.ogretmenId,
            tutar: Number(ucret),
            tarih: hizliPopup.tarih,
            baslangic_saat: hizliPopup.baslangic,
            bitis_saat: hizliPopup.bitis,
          },
          olusturan_profile_id: profile?.id,
          plan_adi: aktifPlanAdi || null,
        })
        setHpGonderiliyor(false)
        if (error) {
          setHpHata('Hata: ' + error.message)
          return
        }
      } else {
        const ileriTarihli =
          hizliPopup.tarih > yerelBugunTarihi() ||
          (hizliPopup.tarih === yerelBugunTarihi() && hizliPopup.baslangic > yerelSuankiSaatDakika())
        setHpGonderiliyor(true)
        const { error } = await supabase.from('bire_bir_yoklama').insert({
          ogrenci_id: secilen.id,
          ogretmen_profile_id: hizliPopup.ogretmenId,
          tutar: Number(ucret),
          tarih: hizliPopup.tarih,
          durum: ileriTarihli ? 'bekliyor' : 'geldi',
          baslangic_saat: hizliPopup.baslangic,
          bitis_saat: hizliPopup.bitis,
        })
        setHpGonderiliyor(false)
        if (error) {
          setHpHata('Hata: ' + error.message)
          return
        }
      }
    }

    hizliPopupKapat()
    onHizliEklendi && onHizliEklendi()
  }

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
        // Öğretmen adı zaten satırda göründüğü için hangi dersi/branşı olduğu
        // belli oluyor — burada asıl bilinmek istenen HANGİ SINIFA girdiği,
        // o yüzden önce sınıf adı, o yoksa (bire bir ya da isimsiz kayıt) ders
        // adı gösteriliyor.
        etiket: d.sinif_adi || d.ders_adi || 'Sınıf dersi',
        renk: 'bg-blue-200 text-blue-900 border-l-4 border-l-blue-600',
      })
    }
    for (const a of atamalar || []) {
      if (!a.aktif || a.gun !== gun || !harita.has(a.ogretmen_profile_id)) continue
      harita.get(a.ogretmen_profile_id).push({
        baslangic: a.baslangic_saat,
        bitis: a.bitis_saat,
        etiket: a.ogrenci_adi || 'Bire bir',
        renk: 'bg-orange-200 text-orange-900 border-l-4 border-l-orange-600',
      })
    }
    for (const y of yoklamalar || []) {
      if (y.atama_id || y.tarih !== tarih || !y.baslangic_saat || !y.bitis_saat) continue
      if (y.durum === 'gelmedi') continue // öğrenci gelmediyse o saat artık boş sayılır
      if (!harita.has(y.ogretmen_profile_id)) continue
      // Soru Çözümü: öğrenciye bağlı olmadığı için ogrenciAdMap'te karşılığı
      // yok — eskiden bu yüzden genel "Bire bir" etiketine düşüyordu, kafa
      // karıştırıyordu. Ayrı bir etiket ve renk (mor, Hızlı Ekle'deki 🧠
      // butonuyla aynı ton) ile gerçek bire bir derslerden ayırıyoruz.
      const soruCozumuMu = y.tur === 'soru_cozumu'
      harita.get(y.ogretmen_profile_id).push({
        baslangic: y.baslangic_saat,
        bitis: y.bitis_saat,
        etiket: soruCozumuMu ? 'Soru Çözümü' : (ogrenciAdMap && ogrenciAdMap.get(y.ogrenci_id)) || 'Bire bir',
        renk: soruCozumuMu
          ? 'bg-purple-200 text-purple-900 border-l-4 border-l-purple-600'
          : 'bg-orange-200 text-orange-900 border-l-4 border-l-orange-600',
      })
    }
    // Bekleyen TASLAKLAR — "taslağa ekleyince o saat hala boş görünüyor, aynı
    // saate bir daha eklemek isteyebilirim ama unutabilirim" karışıklığını
    // önlemek için, henüz yayınlanmamış taslaklar da (ayrı, "taslak" rengiyle)
    // dolu sayılıyor. 'sinif'/'bire_bir_haftalik' taslakları haftanın GÜNÜNE
    // göre (v.gun), 'bire_bir_tekil'/'soru_cozumu' ise belirli bir TARİHE göre
    // (v.tarih) bu günle eşleşip eşleşmediği kontrol edilir.
    for (const t of taslaklar || []) {
      const v = t.veri || {}
      if (!v.baslangic_saat || !v.bitis_saat || !v.ogretmen_profile_id) continue
      const gunEslesiyor = t.tur === 'sinif' || t.tur === 'bire_bir_haftalik' ? v.gun === gun : v.tarih === tarih
      if (!gunEslesiyor || !harita.has(v.ogretmen_profile_id)) continue
      let etiket
      if (t.tur === 'sinif') {
        const sinifAdi = (siniflar || []).find((s) => s.id === v.sinif_id)?.ad
        etiket = `Taslak: ${v.ders_adi || sinifAdi || 'Sınıf'}`
      } else if (t.tur === 'soru_cozumu') {
        etiket = 'Taslak: Soru Çözümü'
      } else {
        const ogrenciAdi = (ogrenciler || []).find((o) => o.id === v.ogrenci_id)?.ad_soyad
        etiket = `Taslak: ${ogrenciAdi || 'Bire bir'}`
      }
      harita.get(v.ogretmen_profile_id).push({
        baslangic: v.baslangic_saat,
        bitis: v.bitis_saat,
        etiket,
        renk: 'bg-amber-100 text-amber-900 border-l-4 border-l-amber-500 border-dashed',
      })
    }
    return harita
  }, [ogretmenler, dersProgrami, atamalar, yoklamalar, gun, tarih, ogrenciAdMap, taslaklar, siniflar, ogrenciler])

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
            {onHucreTikla && ' Boş bir hücreye tıklayarak o saate direkt ders ekleyebilirsiniz'}
            {hizliEkleEtkin ? ' — açılan kutuya öğrenci ya da sınıf adı yazıp seçebilir, ya da aşağıdaki formu kullanabilirsiniz.' : onHucreTikla ? '.' : ''}
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
                  <span className="block">{d.baslangic}</span>
                  <span className="block text-[9px] font-normal opacity-70">{d.bitis}</span>
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
                    const hizliPopupBuradaMi =
                      hizliEkleEtkin &&
                      hizliPopup &&
                      hizliPopup.ogretmenId === o.id &&
                      hizliPopup.tarih === tarih &&
                      hizliPopup.baslangic === h.baslangic
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
                            ? () => {
                                onHucreTikla({ ogretmenId: o.id, ogretmenAdi: o.ad_soyad, tarih, gun, baslangic: h.baslangic, bitis: h.bitis })
                                if (hizliEkleEtkin) {
                                  setHizliPopup({ ogretmenId: o.id, ogretmenAdi: o.ad_soyad, tarih, gun, baslangic: h.baslangic, bitis: h.bitis })
                                  setAramaMetni('')
                                  setSecilen(null)
                                  setUcret('')
                                  setHpHata('')
                                }
                              }
                            : undefined
                        }
                        className={`relative border-t border-l border-gray-100 text-center align-middle py-1 ${
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
                            <span className="block truncate text-[11px] font-semibold">{h.dolu.etiket}</span>
                            {/* Saat, sütun başlığındaki periyotla (h.baslangic/h.bitis) BİREBİR
                                aynıysa tekrar yazmıyoruz — zaten sütun başlığında görünüyor.
                                Farklıysa (ör. ders manuel olarak periyot dışı bir saate girildiyse,
                                ya da ders birden fazla periyotu kaplayıp gerçek bitişi ilk periyodun
                                bitişinden farklıysa) fark fark edilsin diye saat burada da gösterilir. */}
                            {(saatKisalt(h.dolu.baslangic) !== h.baslangic || saatKisalt(h.dolu.bitis) !== h.bitis) && (
                              <span className="block text-[9px] opacity-70 whitespace-nowrap">
                                {saatKisalt(h.dolu.baslangic)}–{saatKisalt(h.dolu.bitis)}
                              </span>
                            )}
                          </span>
                        ) : seciliMi ? (
                          <span className="text-[9px] font-semibold">●</span>
                        ) : (
                          ''
                        )}

                        {hizliPopupBuradaMi && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute z-30 top-full left-1/2 -translate-x-1/2 mt-1 w-60 bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-left cursor-default normal-case text-gray-700"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[11px] font-semibold text-gray-500">
                                Hızlı Ekle · {saatKisalt(hizliPopup.baslangic)}–{saatKisalt(hizliPopup.bitis)}
                              </span>
                              <button type="button" onClick={hizliPopupKapat} className="text-gray-300 hover:text-gray-500 text-sm leading-none">
                                ✕
                              </button>
                            </div>
                            {taslakModuAcik && aktifPlanAdi && (
                              <p className="text-[10px] font-medium text-orange-600 bg-orange-50 border border-orange-100 rounded px-1.5 py-1 mb-1.5">
                                📋 Taslak Modu açık — "{aktifPlanAdi}" planına eklenecek
                              </p>
                            )}
                            {taslakModuAcik && !aktifPlanAdi && (
                              <p className="text-[10px] font-medium text-red-600 bg-red-50 border border-red-100 rounded px-1.5 py-1 mb-1.5">
                                ⚠ Taslak Modu açık ama plan adı boş — önce sayfanın üstüne bir plan adı yazın, yoksa ekleyemezsiniz.
                              </p>
                            )}
                            {!secilen ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => oneriSecildi({ tur: 'soru_cozumu', id: null, ad: 'Soru Çözümü' })}
                                  className="w-full text-left px-2 py-1.5 mb-1.5 rounded-lg text-xs font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-100"
                                >
                                  🧠 Soru Çözümü olarak ekle
                                </button>
                                <input
                                  autoFocus
                                  type="text"
                                  value={aramaMetni}
                                  onChange={(e) => {
                                    setAramaMetni(e.target.value)
                                    setHpHata('')
                                  }}
                                  placeholder="Öğrenci ya da sınıf adı yazın..."
                                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs mb-1 font-normal"
                                />
                                {aramaMetni.trim().length > 0 && (
                                  <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                                    {oneriler.length === 0 && <p className="px-2 py-1.5 text-[11px] text-gray-400 font-normal">Eşleşme yok.</p>}
                                    {oneriler.map((op) => (
                                      <button
                                        key={`${op.tur}-${op.id}`}
                                        type="button"
                                        onClick={() => oneriSecildi(op)}
                                        className="w-full text-left px-2 py-1.5 text-xs font-normal hover:bg-gray-50"
                                      >
                                        {op.tur === 'ogrenci' ? '🎓 ' : '🏫 '}
                                        {op.ad}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                <p className="text-xs font-medium text-gray-700 mb-1.5">
                                  {secilen.tur === 'ogrenci' ? '🎓 ' : secilen.tur === 'sinif' ? '🏫 ' : '🧠 '}
                                  {secilen.ad}
                                </p>
                                {secilen.tur === 'ogrenci' && (
                                  <input
                                    type="number"
                                    value={ucret}
                                    onChange={(e) => setUcret(e.target.value)}
                                    placeholder="Ders ücreti"
                                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs mb-1.5 font-normal"
                                  />
                                )}
                                {hpHata && <p className="text-[11px] text-red-500 mb-1.5 font-normal">{hpHata}</p>}
                                <div className="flex gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSecilen(null)
                                      setAramaMetni('')
                                    }}
                                    className="flex-1 px-2 py-1.5 rounded-lg text-xs text-gray-500 bg-gray-50 hover:bg-gray-100"
                                  >
                                    Geri
                                  </button>
                                  <button
                                    type="button"
                                    disabled={hpGonderiliyor || (secilen.tur === 'ogrenci' && !ucret)}
                                    onClick={hizliKaydet}
                                    className="flex-1 px-2 py-1.5 rounded-lg text-xs text-white bg-navy hover:bg-navy/90 disabled:opacity-50"
                                  >
                                    {hpGonderiliyor ? 'Ekleniyor...' : taslakModuAcik && aktifPlanAdi ? 'Plana Ekle' : 'Ekle'}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
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
          <span className="w-3 h-3 rounded bg-blue-200 border-l-4 border-l-blue-600 inline-block"></span> Sınıf dersi
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-orange-200 border-l-4 border-l-orange-600 inline-block"></span> Bire bir
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-purple-200 border-l-4 border-l-purple-600 inline-block"></span> Soru Çözümü
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-100 border-l-4 border-l-amber-500 border border-dashed inline-block"></span> Taslak (henüz yayınlanmadı)
        </span>
      </div>
    </div>
  )
}
