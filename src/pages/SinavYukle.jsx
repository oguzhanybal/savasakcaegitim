import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { sinavSonucPdfIndenTumOgrencileriCikar } from '../lib/sinavPdfParse'
import { ilkHarfleriBuyukYap } from '../lib/adSoyadFormat'

// Bir sınavı giren TÜM öğrencilerin sonuç PDF'lerini TEK SEFERDE yükleyip
// otomatik ayrıştırmayı sağlayan sayfa. Okulun tarama/analiz yazılımı "tüm
// sınıfın" sonuçlarını TEK PDF olarak dışa aktarınca, her öğrencinin 2
// sayfalık karnesi ART ARDA birleştirilmiş oluyor (22 sayfalık dosya = 11
// öğrenci gibi) — bu yüzden burada seçilen HER dosya, içindeki TÜM
// öğrencilere ayrıştırılıyor (sinavSonucPdfIndenTumOgrencileriCikar), tek
// dosyadan birden fazla satır (öğrenci) çıkabiliyor. Sistem her öğrenciyi
// isimden eşleştirmeye çalışır — siz eşleşmeyi kontrol edip onayladıktan
// sonra sonuçlar kaydedilir.
// Sayfadan çıkıp geri dönüldüğünde (ör. "Hata Kitapçığı Oluştur" yeni
// sekmede açılınca, ya da yanlışlıkla başka bir menüye tıklanınca) henüz
// "Kaydet"e basılmamış satırların TAMAMEN kaybolup PDF'lerin en baştan
// yüklenmesi gerekmesin diye, ayrıştırma sonuçları localStorage'a da
// yazılıyor. Kaydedilen (veritabanına yazılmış) satırlar zaten kalıcı; bu
// sadece "henüz kaydedilmemiş ama ayrıştırılmış" satırlar için bir güvenlik ağı.
const SATIRLAR_ANAHTARI = 'sinavYukleSatirlari'
const SINAV_ANAHTARI = 'sinavYukleSeciliSinavId'

// Ders bazında sonuçlar HANGİ SIRAYLA görünsün — sinav_ders_sonuclari tablosu
// kendi başına bir sıra garanti etmediğinden, gerçek bir TYT/AYT karnesindeki
// sırayla aynı, sabit bir öncelik listesiyle diziyoruz (bkz. Karnem.jsx'teki
// aynı mantık).
const DERS_SIRASI = [
  'Türkçe', 'Matematik', 'Geometri',
  'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü',
  'Fizik', 'Kimya', 'Biyoloji',
  'Sosyal Bilimler', 'Fen Bilimleri',
]
function dersSiraPuani(dersAdi) {
  const i = DERS_SIRASI.indexOf(dersAdi)
  return i === -1 ? 999 : i
}

export default function SinavYukle() {
  const [sinavlar, setSinavlar] = useState([])
  const [seciliSinavId, setSeciliSinavId] = useState(() => {
    try {
      return localStorage.getItem(SINAV_ANAHTARI) || ''
    } catch {
      return ''
    }
  })
  const [ogrenciler, setOgrenciler] = useState([])
  // "+ Yeni sınav ekle" seçildiğinde kullanılan alanlar — artık kitapçık
  // yüklenmeden ÖNCE de sonuç PDF'leri yüklenip yeni bir sınav
  // oluşturulabiliyor (kitapçık sonradan "Sınav Kitapçıkları" sayfasından
  // AYNI sınava eklenebilir).
  const [yeniSinavAdi, setYeniSinavAdi] = useState('')
  const [yeniSinavTarihi, setYeniSinavTarihi] = useState('')
  // "+ Yeni sınav ekle" ile bir toplu kaydetme sırasında (hepsiniKaydet)
  // sınav SADECE BİR KEZ oluşturulsun diye — satirKaydet her satır için ayrı
  // ayrı çağrıldığında React'in "stale closure" davranışı yüzünden
  // seciliSinavId state'i loop içinde hemen güncellenmiş gibi GÖRÜNMEYEBİLİR,
  // bu yüzden gerçek oluşturma işlemini bu ref üzerinden TEK SEFERLİK
  // (paylaşılan bir Promise ile) yapıyoruz.
  const yeniSinavOlusturmaRef = useRef(null)
  const [satirlar, setSatirlar] = useState(() => {
    try {
      const kayitli = localStorage.getItem(SATIRLAR_ANAHTARI)
      return kayitli ? JSON.parse(kayitli) : []
    } catch {
      return []
    }
  }) // her biri bir yüklenen PDF'in durumu
  const [ayikliyor, setAyikliyor] = useState(false)
  const [genelHata, setGenelHata] = useState('')

  // Seçili sınav için VERİTABANINDA zaten kayıtlı olan sonuçlar — yukarıdaki
  // "Yüklenen Dosyalar" listesinin aksine bu, tarayıcı hafızasına/localStorage'a
  // değil doğrudan veritabanına bakar. Admin "kaydete basmıştım ama nerede o"
  // diye endişelendiğinde (ör. sayfa/tarayıcı state'i bir şekilde sıfırlansa
  // BİLE) kaydedilmiş bir sonucun kaybolmadığını buradan görebilir, ayrıca
  // buradan da doğrudan Hata Kitapçığı oluşturabilir.
  const [kayitliSonuclar, setKayitliSonuclar] = useState([])
  const [kayitliSonuclarYukleniyor, setKayitliSonuclarYukleniyor] = useState(false)
  const [silinenSonucId, setSilinenSonucId] = useState(null)
  const [karnePdfIndiriliyorId, setKarnePdfIndiriliyorId] = useState(null)

  useEffect(() => {
    supabase.from('sinavlar').select('*').order('sinav_tarihi', { ascending: false }).then(({ data }) => setSinavlar(data || []))
    supabase.from('ogrenciler').select('id, ad_soyad').order('ad_soyad').then(({ data }) => setOgrenciler(data || []))
  }, [])

  async function kayitliSonuclariYukle(sinavId) {
    if (!sinavId || sinavId === '__yeni__') {
      setKayitliSonuclar([])
      return
    }
    setKayitliSonuclarYukleniyor(true)
    const { data } = await supabase
      .from('ogrenci_sinav_sonuclari')
      .select(
        'id, kitapcik, toplam_net, toplam_dogru, toplam_yanlis, toplam_bos, created_at, karne_pdf_yolu, ogrenciler(ad_soyad)'
      )
      .eq('sinav_id', sinavId)
      .order('created_at', { ascending: false })
    const liste = data || []
    // Genel toplamın yanında DERS DERS (Türkçe, Matematik, ...) doğru/yanlış/
    // boş/net dökümü de gösterilsin diye sinav_ders_sonuclari'nı da çekip
    // sonuc_id'ye göre gruplayıp her satıra ekliyoruz.
    const sonucIdleri = liste.map((s) => s.id)
    const { data: dersVerileri } =
      sonucIdleri.length > 0
        ? await supabase.from('sinav_ders_sonuclari').select('*').in('sonuc_id', sonucIdleri)
        : { data: [] }
    const dersMap = new Map()
    for (const d of dersVerileri || []) {
      if (!dersMap.has(d.sonuc_id)) dersMap.set(d.sonuc_id, [])
      dersMap.get(d.sonuc_id).push(d)
    }
    // Karnedeki "PUAN VE SIRALAMALAR" tablosu — üniversite yerleştirmesinde
    // asıl belirleyici bilgi bu olduğu için ders dökümünün yanında ayrıca
    // gösteriyoruz.
    const { data: puanVerileri } =
      sonucIdleri.length > 0
        ? await supabase.from('sinav_puan_sonuclari').select('*').in('sonuc_id', sonucIdleri)
        : { data: [] }
    const puanMap = new Map()
    for (const p of puanVerileri || []) {
      if (!puanMap.has(p.sonuc_id)) puanMap.set(p.sonuc_id, [])
      puanMap.get(p.sonuc_id).push(p)
    }
    setKayitliSonuclar(
      liste.map((s) => ({
        ...s,
        dersler: (dersMap.get(s.id) || []).slice().sort((a, b) => dersSiraPuani(a.ders_adi) - dersSiraPuani(b.ders_adi)),
        puanlar: puanMap.get(s.id) || [],
      }))
    )
    setKayitliSonuclarYukleniyor(false)
  }

  useEffect(() => {
    kayitliSonuclariYukle(seciliSinavId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seciliSinavId])

  // PDF'ten çıkan sınav adını (veri.sinavAdi — parser bunu sayfa 1'in üst
  // bilgisinden zaten çıkarıyor) mevcut sınavlar listesiyle eşleştirmeye
  // çalışır. SADECE TAM eşleşme varsa otomatik seçiyoruz — admin'in "Sınav
  // Kitapçıkları"nda kitapçığa verdiği kısa isim (ör. "2") ile PDF'teki uzun
  // resmi isim çoğu zaman BİREBİR aynı olmayacağı için, emin olamadığımızda
  // YANLIŞ bir sınavla eşleştirip Hata Kitapçığı bağlantısını (kitapçık↔sonuç
  // sinav_id'si) bozmak yerine elle seçime bırakıyoruz. Eşleşme yoksa, en
  // azından "+ Yeni sınav ekle" seçilirse admin hiç yazmasın diye PDF'teki
  // ismi "Yeni Sınav Adı" alanına hazır dolduruyoruz (yine de admin'in elle
  // seçim/onay yapması gerekiyor, sessizce bir sınav OLUŞTURMUYORUZ).
  useEffect(() => {
    const aday = satirlar.find((s) => s.durum !== 'ayikliyor' && s.veri?.sinavAdi)
    if (!aday) return
    // Henüz hiçbir seçim yapılmamışsa (admin elle "+ Yeni sınav ekle"yi
    // seçmediyse) tam eşleşme dener.
    if (!seciliSinavId) {
      const normalize = (s) => (s || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim()
      const hedef = normalize(aday.veri.sinavAdi)
      const eslesen = sinavlar.find((sn) => normalize(sn.sinav_adi) === hedef)
      if (eslesen) {
        setSeciliSinavId(eslesen.id)
        return
      }
    }
    // "+ Yeni sınav ekle" seçili ama isim alanı hâlâ boşsa (elle seçilmiş ya
    // da localStorage'dan geri gelmiş olabilir) PDF'teki adla dolduruyoruz.
    if (seciliSinavId === '__yeni__' && !yeniSinavAdi.trim()) {
      setYeniSinavAdi(aday.veri.sinavAdi)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satirlar, sinavlar, seciliSinavId])

  // "+ Yeni sınav ekle" seçiliyken gerçek sinav_id'yi çözer: daha önce
  // oluşturulduysa (bu oturumda) onu, değilse yeni bir sınav satırı ekleyip
  // onu döner. yeniSinavOlusturmaRef ile bu işlemin TOPLU KAYDETME sırasında
  // (hepsiniKaydet → her satır için satirKaydet) sadece BİR KEZ çalışmasını
  // garanti ediyoruz — aksi halde React'in "stale closure" davranışı yüzünden
  // her satır ayrı bir sınav oluşturabilirdi.
  async function sinavIdCozumle() {
    if (seciliSinavId && seciliSinavId !== '__yeni__') return seciliSinavId
    if (yeniSinavOlusturmaRef.current) return yeniSinavOlusturmaRef.current
    const p = (async () => {
      const temizAd = ilkHarfleriBuyukYap(yeniSinavAdi.trim())
      const { data, error } = await supabase
        .from('sinavlar')
        .insert({ sinav_adi: temizAd, sinav_tarihi: yeniSinavTarihi || null })
        .select()
        .single()
      let sinavRow = data
      if (error && error.code === '23505') {
        // Bu isimde bir sınav zaten var — hata vermek yerine var olanı bulup ONA kaydediyoruz.
        const { data: mevcutSinav, error: bulmaHatasi } = await supabase
          .from('sinavlar')
          .select('*')
          .eq('sinav_adi', temizAd)
          .single()
        if (bulmaHatasi || !mevcutSinav) throw error
        sinavRow = mevcutSinav
      } else if (error) {
        throw error
      }
      setSeciliSinavId(sinavRow.id)
      setSinavlar((liste) => (liste.some((s) => s.id === sinavRow.id) ? liste : [sinavRow, ...liste]))
      return sinavRow.id
    })()
    yeniSinavOlusturmaRef.current = p
    return p
  }

  // Kaydedilmiş bir sonucu (ör. deneme/test amaçlı yüklenmiş, yanlış öğrenciye
  // bağlanmış vb.) kalıcı olarak siler — önce ona bağlı ders/soru detaylarını,
  // sonra sonuç satırının kendisini kaldırır.
  async function sonucSil(k) {
    if (
      !confirm(
        `"${k.ogrenciler?.ad_soyad || 'Bu öğrenci'}" için bu sınavın sonucunu kalıcı olarak silmek istediğinize ` +
          `emin misiniz? Bu işlem GERİ ALINAMAZ.`
      )
    )
      return
    setSilinenSonucId(k.id)
    try {
      await supabase.from('sinav_ders_sonuclari').delete().eq('sonuc_id', k.id)
      await supabase.from('sinav_soru_sonuclari').delete().eq('sonuc_id', k.id)
      const { error } = await supabase.from('ogrenci_sinav_sonuclari').delete().eq('id', k.id)
      if (error) throw error
      setKayitliSonuclar((liste) => liste.filter((s) => s.id !== k.id))
    } catch (e) {
      alert('Silme hatası: ' + e.message)
    } finally {
      setSilinenSonucId(null)
    }
  }

  // Öğrencinin orijinal "Konu Analizli Karne" PDF'ini indirir — Storage
  // bucket'ı private olduğu için önce kısa ömürlü (60 sn) imzalı bir bağlantı
  // istiyoruz, sonra onu yeni sekmede açıyoruz.
  async function karnePdfIndir(k) {
    if (!k.karne_pdf_yolu) return
    setKarnePdfIndiriliyorId(k.id)
    try {
      const { data, error } = await supabase.storage
        .from('sinav-sonuc-pdfleri')
        .createSignedUrl(k.karne_pdf_yolu, 60)
      if (error) throw error
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (e) {
      alert('PDF indirilemedi: ' + e.message)
    } finally {
      setKarnePdfIndiriliyorId(null)
    }
  }

  // satirlar/seciliSinavId her değiştiğinde localStorage'a yaz — böylece
  // sayfadan çıkıp geri dönüldüğünde (hatta sekme kapatılıp yeniden
  // açıldığında) liste olduğu gibi durur.
  useEffect(() => {
    try {
      // veri.karnePdfBlob bir Blob nesnesi — JSON'a düzgün yazılamaz (ve zaten
      // gerek yok, sadece "Kaydet" anında Storage'a yüklenip hemen atılıyor).
      // localStorage'a yazmadan önce her satırdan çıkarıyoruz.
      const temizlenmis = satirlar.map((s) =>
        s.veri?.karnePdfBlob ? { ...s, veri: { ...s.veri, karnePdfBlob: undefined } } : s
      )
      localStorage.setItem(SATIRLAR_ANAHTARI, JSON.stringify(temizlenmis))
    } catch {
      // localStorage dolu/erişilemez olsa bile uygulama çalışmaya devam etsin
    }
  }, [satirlar])

  useEffect(() => {
    try {
      localStorage.setItem(SINAV_ANAHTARI, seciliSinavId || '')
    } catch {
      // yok say
    }
  }, [seciliSinavId])

  // PDF'ten çıkan ismi mevcut öğrenci listesiyle eşleştirmeye çalışır —
  // önce tam eşleşme, olmazsa "içeriyor" bazlı yaklaşık eşleşme dener.
  // Hiçbiri kesin değilse boş döner, admin elle seçer.
  function ogrenciEslestir(pdfAdSoyad) {
    if (!pdfAdSoyad) return ''
    const normalize = (s) => s.toLocaleLowerCase('tr-TR').trim()
    const hedef = normalize(pdfAdSoyad)
    const tamEslesme = ogrenciler.find((o) => normalize(o.ad_soyad) === hedef)
    if (tamEslesme) return tamEslesme.id
    const yaklasik = ogrenciler.filter((o) => normalize(o.ad_soyad).includes(hedef) || hedef.includes(normalize(o.ad_soyad)))
    if (yaklasik.length === 1) return yaklasik[0].id
    return ''
  }

  async function dosyalariAyikla(dosyaListesi) {
    if (!dosyaListesi || dosyaListesi.length === 0) return
    setGenelHata('')
    setAyikliyor(true)

    for (const dosya of Array.from(dosyaListesi)) {
      // Dosya seçilir seçilmez, o dosya için TEK bir "ayrıştırılıyor" satırı
      // gösteriyoruz — içinde kaç öğrenci olduğunu henüz bilmiyoruz. Sonuçlar
      // gelince bu tek satırı, bulunan öğrenci sayısı kadar gerçek satıra
      // bölüyoruz (aşağıda geciciId ile değiştiriliyor).
      const geciciId = `${dosya.name}-${Date.now()}-${Math.random()}`
      setSatirlar((liste) => [
        ...liste,
        { id: geciciId, dosyaAdi: dosya.name, durum: 'ayikliyor', hata: '', veri: null, ogrenciId: '', kaydedildi: false },
      ])

      try {
        const sonuclar = await sinavSonucPdfIndenTumOgrencileriCikar(dosya)
        const cokluMu = sonuclar.length > 1
        const yeniSatirlar = sonuclar.map((s) => {
          const id = `${dosya.name}-s${s.baslangicSayfa}-${Date.now()}-${Math.random()}`
          const dosyaAdi = cokluMu ? `${dosya.name} — sayfa ${s.baslangicSayfa}-${s.baslangicSayfa + 1}` : dosya.name
          if (!s.basariliMi) {
            return { id, dosyaAdi, durum: 'hata', hata: s.hata, veri: null, ogrenciId: '', kaydedildi: false }
          }
          return {
            id,
            dosyaAdi,
            durum: 'hazir',
            hata: '',
            veri: s.veri,
            ogrenciId: ogrenciEslestir(s.veri.ogrenciAdSoyad),
            kaydedildi: false,
          }
        })
        setSatirlar((liste) => [...liste.filter((s) => s.id !== geciciId), ...yeniSatirlar])
      } catch (e) {
        setSatirlar((liste) => liste.map((s) => (s.id === geciciId ? { ...s, durum: 'hata', hata: e.message } : s)))
      }
    }
    setAyikliyor(false)
  }

  function satirGuncelle(id, alanlar) {
    setSatirlar((liste) => liste.map((s) => (s.id === id ? { ...s, ...alanlar } : s)))
  }

  function satirKaldir(id) {
    setSatirlar((liste) => liste.filter((s) => s.id !== id))
  }

  async function satirKaydet(satir) {
    if (!seciliSinavId) {
      satirGuncelle(satir.id, { durum: 'hata', hata: 'Önce üstten bu sonuçların ait olduğu sınavı seçin.' })
      return
    }
    if (seciliSinavId === '__yeni__' && !yeniSinavAdi.trim()) {
      satirGuncelle(satir.id, { durum: 'hata', hata: 'Yeni sınavın adını girin.' })
      return
    }
    if (!satir.ogrenciId) {
      satirGuncelle(satir.id, { durum: 'hata', hata: 'Bu PDF için bir öğrenci seçilmedi.' })
      return
    }
    satirGuncelle(satir.id, { durum: 'kaydediliyor', hata: '' })
    try {
      const sinavId = await sinavIdCozumle()
      const veri = satir.veri

      // Orijinal "Konu Analizli Karne" PDF'i (2 sayfa, ayrıştırma sırasında
      // önceden kesilmişti — bkz. sinavPdfParse.js) varsa Storage'a yükle.
      // Yol kuralı "{ogrenci_id}/{sinav_id}.pdf" — aynı öğrenci/sınav için
      // tekrar kaydedilirse (upsert:true) eskisinin üzerine yazılır.
      let karnePdfYolu = null
      if (veri.karnePdfBlob) {
        karnePdfYolu = `${satir.ogrenciId}/${sinavId}.pdf`
        const { error: pdfHatasi } = await supabase.storage
          .from('sinav-sonuc-pdfleri')
          .upload(karnePdfYolu, veri.karnePdfBlob, { contentType: 'application/pdf', upsert: true })
        if (pdfHatasi) {
          // PDF yüklenemese bile (ör. bağlantı sorunu) asıl sonuç verisinin
          // kaydedilmesini ENGELLEMEsin — sadece "PDF İndir" o satır için
          // eksik kalır, admin isterse tekrar dener.
          console.error('Karne PDF\'i yüklenemedi:', pdfHatasi.message)
          karnePdfYolu = null
        }
      }

      const { data: sonucVerisi, error: sonucHatasi } = await supabase
        .from('ogrenci_sinav_sonuclari')
        .upsert(
          {
            ogrenci_id: satir.ogrenciId,
            sinav_id: sinavId,
            kitapcik: veri.kitapcik || null,
            toplam_soru: veri.ozet.toplamSoru,
            toplam_dogru: veri.ozet.toplamDogru,
            toplam_yanlis: veri.ozet.toplamYanlis,
            toplam_bos: veri.ozet.toplamBos,
            toplam_net: veri.ozet.toplamNet,
            yuklenen_pdf_adi: satir.dosyaAdi,
            // Sadece bu seferde başarıyla yeni bir PDF yüklendiyse gönderiyoruz
            // — yoksa (ör. bu satır localStorage'dan geri geldi, blob elde
            // yok) daha önce kaydedilmiş yol varsa onun ÜZERİNE YAZMIYORUZ.
            ...(karnePdfYolu ? { karne_pdf_yolu: karnePdfYolu } : {}),
          },
          { onConflict: 'ogrenci_id,sinav_id' }
        )
        .select()
        .single()
      if (sonucHatasi) throw sonucHatasi

      // Bu öğrenci bu sınav için daha önce kaydedilmişse (ör. PDF yanlışlıkla
      // iki kere yüklendi), eski ders/soru/puan satırlarını silip yeniden yazıyoruz.
      await supabase.from('sinav_ders_sonuclari').delete().eq('sonuc_id', sonucVerisi.id)
      await supabase.from('sinav_soru_sonuclari').delete().eq('sonuc_id', sonucVerisi.id)
      await supabase.from('sinav_puan_sonuclari').delete().eq('sonuc_id', sonucVerisi.id)

      if (veri.dersSonuclari.length > 0) {
        const { error } = await supabase.from('sinav_ders_sonuclari').insert(
          veri.dersSonuclari.map((d) => ({
            sonuc_id: sonucVerisi.id,
            ders_adi: d.ders_adi,
            soru_sayisi: d.soru_sayisi,
            dogru: d.dogru,
            yanlis: d.yanlis,
            bos: d.bos,
            net: d.net,
          }))
        )
        if (error) throw error
      }

      if (veri.soruSonuclari.length > 0) {
        const { error } = await supabase.from('sinav_soru_sonuclari').insert(
          veri.soruSonuclari.map((s) => ({
            sonuc_id: sonucVerisi.id,
            ders_adi: s.ders_adi,
            soru_no: s.soru_no,
            konu: s.konu,
            dogru_cevap: s.dogru_cevap,
            ogrenci_cevap: s.ogrenci_cevap,
            sonuc: s.sonuc,
          }))
        )
        if (error) throw error
      }

      if (veri.puanSonuclari && veri.puanSonuclari.length > 0) {
        const { error } = await supabase.from('sinav_puan_sonuclari').insert(
          veri.puanSonuclari.map((p) => ({
            sonuc_id: sonucVerisi.id,
            puan_turu: p.puan_turu,
            puan: p.puan,
            genel_siralama: p.genel_siralama,
            kurum_siralama: p.kurum_siralama,
            sube_siralama: p.sube_siralama,
            sinif_siralama: p.sinif_siralama,
          }))
        )
        if (error) throw error
      }

      satirGuncelle(satir.id, { durum: 'kaydedildi', kaydedildi: true, sonucId: sonucVerisi.id })
      kayitliSonuclariYukle(sinavId)
    } catch (e) {
      satirGuncelle(satir.id, { durum: 'hata', hata: 'Kayıt hatası: ' + e.message })
    }
  }

  async function hepsiniKaydet() {
    const kaydedilecekler = satirlar.filter((s) => s.durum === 'hazir' && s.ogrenciId)
    for (const satir of kaydedilecekler) {
      await satirKaydet(satir)
    }
  }

  // Listeyi tamamen temizler (ör. bambaşka bir sınavın dosyalarını yüklemeye
  // başlamadan önce eski listeyi silmek için). Zaten "Kaydet"e basılmış
  // satırlar veritabanında güvende kalır, sadece bu ekrandaki liste temizlenir.
  function listeyiTemizle() {
    if (satirlar.length === 0) return
    const kaydedilmemis = satirlar.filter((s) => s.durum !== 'kaydedildi').length
    if (
      kaydedilmemis > 0 &&
      !confirm(
        `Listede henüz kaydedilmemiş ${kaydedilmemis} satır var — temizlerseniz bunlar için PDF'i tekrar ` +
          `yüklemeniz gerekir. Kaydedilmiş olanlar zaten güvende. Yine de listeyi temizlemek istiyor musunuz?`
      )
    ) {
      return
    }
    setSatirlar([])
  }

  const hazirSayisi = satirlar.filter((s) => s.durum === 'hazir' && s.ogrenciId).length

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-2">Sınav Sonucu Yükle</h1>
      <p className="text-sm text-gray-500 mb-6">
        Bir sınavı giren öğrencilerin bireysel sonuç PDF'lerini (karne raporlarını) buradan aynı anda yükleyin.
        Sistem her PDF'i otomatik ayrıştırır, öğrenciyi isimden eşleştirmeye çalışır — siz eşleşmeyi kontrol edip
        onayladıktan sonra sonuçlar kaydedilir.
      </p>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Bu sonuçlar hangi sınava ait?</label>
            <select
              value={seciliSinavId}
              onChange={(e) => {
                const deger = e.target.value
                // "+ Yeni sınav ekle" ELLE yeniden seçilirse, önceki bir
                // toplu kaydetmeden kalmış olabilecek (farklı bir sınava ait)
                // önbelleği sıfırlıyoruz — yoksa yanlışlıkla ESKİ sınava kaydedebilir.
                if (deger === '__yeni__') yeniSinavOlusturmaRef.current = null
                setSeciliSinavId(deger)
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
            >
              <option value="">Seçiniz...</option>
              <option value="__yeni__">+ Yeni sınav ekle</option>
              {sinavlar.map((s) => (
                <option key={s.id} value={s.id}>{s.sinav_adi}</option>
              ))}
            </select>
            {sinavlar.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Henüz kayıtlı sınav yok — "+ Yeni sınav ekle"yi seçip sonuçları kaydedebilirsiniz, kitapçığı daha
                sonra "Sınav Kitapçıkları" sayfasından AYNI sınava ekleyebilirsiniz.
              </p>
            )}
            {seciliSinavId === '__yeni__' && (
              <div className="flex flex-wrap gap-3 items-end mt-2 bg-gray-50 border border-gray-100 rounded-lg p-3">
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Yeni Sınav Adı</label>
                  <input
                    value={yeniSinavAdi}
                    onChange={(e) => setYeniSinavAdi(e.target.value)}
                    placeholder="örn. 2. TYT Denemesi"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                  />
                </div>
                <div className="min-w-[140px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Tarih (opsiyonel)</label>
                  <input
                    type="date"
                    value={yeniSinavTarihi}
                    onChange={(e) => setYeniSinavTarihi(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-[240px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sonuç PDF'leri (birden fazla seçilebilir)</label>
            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={(e) => dosyalariAyikla(e.target.files)}
              className="w-full text-sm"
            />
          </div>
        </div>
        {ayikliyor && <p className="text-sm text-blue">PDF'ler okunuyor...</p>}
        {genelHata && <p className="text-sm text-red-600">{genelHata}</p>}
      </div>

      {/* Bu, YUKARIDAKİ "Yüklenen Dosyalar" listesinden FARKLI — o liste
          tarayıcı hafızasında/localStorage'da tutulan, henüz bu oturumda
          yüklenmiş dosyaların durumu. Bu bölüm ise doğrudan veritabanına
          bakıyor: "Kaydet"e basılmış her sonuç burada KALICI olarak görünür,
          tarayıcı/sekme durumu ne olursa olsun kaybolmaz. Admin "kaydettim
          ama nerede" diye endişelenirse buradan kontrol edip, gerekirse
          doğrudan Hata Kitapçığı da oluşturabilir. */}
      {seciliSinavId && seciliSinavId !== '__yeni__' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-gray-700">
              Bu Sınav İçin Daha Önce Kaydedilmiş Sonuçlar ({kayitliSonuclar.length})
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Bu liste veritabanından geliyor — "Kaydet"e bastığınız her sonuç burada kalıcı olarak durur, sayfadan
              çıkıp geri dönseniz de kaybolmaz.
            </p>
          </div>
          {kayitliSonuclarYukleniyor ? (
            <p className="text-sm text-gray-400 p-4">Yükleniyor...</p>
          ) : kayitliSonuclar.length === 0 ? (
            <p className="text-sm text-gray-400 p-4">Bu sınav için henüz kaydedilmiş bir sonuç yok.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {kayitliSonuclar.map((k) => (
                <div key={k.id} className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {k.ogrenciler?.ad_soyad || 'Bilinmeyen öğrenci'}
                        {k.kitapcik && <span className="text-gray-400 font-normal"> · Kitapçık {k.kitapcik}</span>}
                      </p>
                      <p className="text-xs text-gray-500">
                        Genel — Doğru: <b className="text-green-700">{k.toplam_dogru}</b> · Yanlış:{' '}
                        <b className="text-red-700">{k.toplam_yanlis}</b> · Boş: <b className="text-gray-500">{k.toplam_bos}</b> ·
                        Net: <b className="text-navy">{k.toplam_net}</b>
                      </p>
                      {k.puanlar && k.puanlar.length > 0 && (
                        <p className="text-xs text-orange font-medium mt-0.5">
                          {k.puanlar
                            .map(
                              (p) =>
                                `${p.puan_turu} Puan: ${p.puan ?? '-'}` +
                                (p.genel_siralama != null ? ` · Genel Sıralama: ${p.genel_siralama.toLocaleString('tr-TR')}` : '') +
                                (p.kurum_siralama != null ? ` · Kurum: ${p.kurum_siralama}` : '') +
                                (p.sube_siralama != null ? ` · Şube: ${p.sube_siralama}` : '') +
                                (p.sinif_siralama != null ? ` · Sınıf: ${p.sinif_siralama}` : '')
                            )
                            .join('  |  ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {k.karne_pdf_yolu && (
                        <button
                          type="button"
                          onClick={() => karnePdfIndir(k)}
                          disabled={karnePdfIndiriliyorId === k.id}
                          className="text-xs font-semibold text-navy border border-navy/20 px-3 py-1.5 rounded-full hover:bg-navy/5 disabled:opacity-40"
                        >
                          {karnePdfIndiriliyorId === k.id ? 'Açılıyor...' : 'Karne PDF İndir'}
                        </button>
                      )}
                      <Link
                        to={`/hata-kitapcigi/${k.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold bg-orange text-white px-3 py-1.5 rounded-full hover:opacity-90"
                      >
                        Hata Kitapçığı Oluştur
                      </Link>
                      <button
                        type="button"
                        onClick={() => sonucSil(k)}
                        disabled={silinenSonucId === k.id}
                        className="text-xs font-semibold text-red-600 border border-red-200 px-3 py-1.5 rounded-full hover:bg-red-50 disabled:opacity-40"
                      >
                        {silinenSonucId === k.id ? 'Siliniyor...' : 'Sil'}
                      </button>
                    </div>
                  </div>
                  {k.dersler && k.dersler.length > 0 && (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="text-gray-400 border-b border-gray-100">
                            <th className="text-left font-medium py-1 pr-2">Ders</th>
                            <th className="text-right font-medium py-1 px-2">Soru</th>
                            <th className="text-right font-medium py-1 px-2">Doğru</th>
                            <th className="text-right font-medium py-1 px-2">Yanlış</th>
                            <th className="text-right font-medium py-1 px-2">Boş</th>
                            <th className="text-right font-medium py-1 pl-2">Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {k.dersler.map((d) => (
                            <tr key={d.id} className="border-b border-gray-50 last:border-0">
                              <td className="text-left py-1 pr-2 text-gray-700 font-medium whitespace-nowrap">
                                {d.ders_adi}
                              </td>
                              <td className="text-right py-1 px-2 text-gray-500">
                                {(d.dogru || 0) + (d.yanlis || 0) + (d.bos || 0)}
                              </td>
                              <td className="text-right py-1 px-2 text-green-700">{d.dogru}</td>
                              <td className="text-right py-1 px-2 text-red-700">{d.yanlis}</td>
                              <td className="text-right py-1 px-2 text-gray-500">{d.bos}</td>
                              <td className="text-right py-1 pl-2 text-navy font-semibold">{d.net}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {satirlar.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold text-gray-700">Yüklenen Dosyalar ({satirlar.length})</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={listeyiTemizle}
                className="text-xs text-gray-400 font-semibold hover:text-gray-600 hover:underline px-2"
              >
                Listeyi Temizle
              </button>
              {hazirSayisi > 0 && (
                <button
                  type="button"
                  onClick={hepsiniKaydet}
                  className="bg-orange text-white font-semibold px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity"
                >
                  Hazır Olan {hazirSayisi} Sonucu Kaydet
                </button>
              )}
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {satirlar.map((s) => (
              <div key={s.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[200px]">
                    <p className="text-sm font-medium text-gray-800">{s.dosyaAdi}</p>
                    {s.veri && (
                      <p className="text-xs text-gray-400">
                        PDF'te yazan isim: <span className="font-medium text-gray-600">{s.veri.ogrenciAdSoyad}</span>
                        {s.veri.kitapcik && ` · Kitapçık ${s.veri.kitapcik}`}
                      </p>
                    )}
                  </div>

                  {s.durum === 'ayikliyor' && <span className="text-xs font-semibold text-blue">Ayrıştırılıyor...</span>}
                  {s.durum === 'hata' && (
                    <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-1 rounded-full">{s.hata}</span>
                  )}
                  {s.durum === 'kaydediliyor' && <span className="text-xs font-semibold text-blue">Kaydediliyor...</span>}
                  {s.durum === 'kaydedildi' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-full">✓ Kaydedildi</span>
                      {s.sonucId && (
                        <Link
                          to={`/hata-kitapcigi/${s.sonucId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold bg-orange text-white px-2 py-1 rounded-full hover:opacity-90"
                        >
                          Hata Kitapçığı Oluştur
                        </Link>
                      )}
                    </div>
                  )}
                </div>

                {s.veri && s.durum !== 'kaydedildi' && (
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <div className="min-w-[220px]">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Öğrenci</label>
                      <select
                        value={s.ogrenciId}
                        onChange={(e) => satirGuncelle(s.id, { ogrenciId: e.target.value })}
                        className={`w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue bg-white ${
                          s.ogrenciId ? 'border-gray-200' : 'border-yellow-300 bg-yellow-50'
                        }`}
                      >
                        <option value="">Öğrenci seçin...</option>
                        {ogrenciler.map((o) => (
                          <option key={o.id} value={o.id}>{o.ad_soyad}</option>
                        ))}
                      </select>
                      {!s.ogrenciId && (
                        <p className="text-xs text-yellow-700 mt-1">
                          Otomatik eşleşme bulunamadı (PDF'teki isim "{s.veri.ogrenciAdSoyad}" listedeki hiçbir
                          öğrenciyle birebir uyuşmuyor) — doğru öğrenciyi elle seçin. Buradaki soru/doğru/yanlış
                          verileri PDF'ten geldiği için değişmez, bu kutu sadece o veriyi HANGİ öğrenci kaydına
                          bağlayacağınızı belirler.
                        </p>
                      )}
                    </div>

                    <div className="text-xs text-gray-500 flex gap-3 flex-wrap">
                      <span>Soru: <b className="text-gray-700">{s.veri.ozet.toplamSoru}</b></span>
                      <span>Doğru: <b className="text-green-700">{s.veri.ozet.toplamDogru}</b></span>
                      <span>Yanlış: <b className="text-red-700">{s.veri.ozet.toplamYanlis}</b></span>
                      <span>Boş: <b className="text-gray-500">{s.veri.ozet.toplamBos}</b></span>
                      <span>Net: <b className="text-navy">{s.veri.ozet.toplamNet}</b></span>
                    </div>

                    <div className="flex gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={() => satirKaydet(s)}
                        disabled={!s.ogrenciId || !seciliSinavId || (seciliSinavId === '__yeni__' && !yeniSinavAdi.trim())}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-navy text-white hover:opacity-90 disabled:opacity-40"
                      >
                        Kaydet
                      </button>
                      <button
                        type="button"
                        onClick={() => satirKaldir(s.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50"
                      >
                        Kaldır
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
