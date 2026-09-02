// Ekstre / Toplu Ekstre hesaplama motoru — Excel'deki "_HESAP_EKSTRE" ve
// "TOPLU EKSTRE" sayfalarındaki formüllerin JavaScript karşılığı.
// Hem Ekstre.jsx hem de TopluEkstre.jsx bu dosyayı kullanır (tek yerden yönetilsin diye).

import { saatGoster } from './saatFormat'

export function paraFormat(n) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n || 0)
}

// ---- Ay yardımcıları ("YYYY-MM" string'i ile {yil, ay} arasında dönüşüm) ----
export function ayCoz(ayStr) {
  const [yil, ay] = ayStr.split('-').map(Number)
  return { yil, ay }
}

export function ayEkle(ayStr, adet) {
  const { yil, ay } = ayCoz(ayStr)
  const toplam = yil * 12 + (ay - 1) + adet
  return { yil: Math.floor(toplam / 12), ay: (toplam % 12) + 1 }
}

export function ayIndexOf(ay) {
  return ay.yil * 12 + ay.ay
}

export function ayFarki(hedef, ilk) {
  return ayIndexOf(hedef) - ayIndexOf(ilk)
}


function tarihStr(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Bir ödemenin "kalem" alanı tam eşleşme değilse de (ör. "Okul - Devreden Ödeme")
// ilgili kalemle başlıyorsa sayılır — devreden (eski sistemden gelen) ödemeler de
// borç hesabına dahil edilsin diye.
export function odemeToplamKalem(odemeler, kalemAdi, hedefAy) {
  const hedefIndex = ayIndexOf(hedefAy)
  return odemeler
    .filter((o) => o.kalem && o.kalem.startsWith(kalemAdi))
    .filter((o) => {
      const t = new Date(o.tarih)
      return ayIndexOf({ yil: t.getFullYear(), ay: t.getMonth() + 1 }) <= hedefIndex
    })
    .reduce((t, o) => t + Number(o.tutar), 0)
}

// ============================================================================
// SÖZLEŞME KALEMLERİ (Okul / Kurs / Kitap) — Excel'deki _HESAP_EKSTRE mantığı:
// Her ay için "o aya kadar vadesi gelmiş TOPLAM borç" ile "o aya kadar ÖDENMİŞ
// TOPLAM" karşılaştırılır (tek bir ayın taksiti değil, kümülatif bakiye).
// Böylece ödenmeyen taksit otomatik olarak bir sonraki aya da taşınır.
// ============================================================================
export function sozlesmeKalemHesapla(sozlesme, odemeler, seciliAy) {
  // ÖZEL PLAN — veli, standart "toplamı taksit sayısına eşit böl" yerine ayı
  // ayına (hatta güne) farklı tutar ödemek isterse (ör. 15 Ekim 500, 20 Kasım
  // 300), sözleşmede ozel_plan_mi=true olur ve ozel_taksitler
  // ([{tarih:'YYYY-MM-DD', tutar}, ...]) kullanılır — taksitTutari sabit
  // değil, her taksitin kendi tutarı VE kendi vade günü vardır.
  const ozelPlanMi =
    !!sozlesme.ozel_plan_mi && Array.isArray(sozlesme.ozel_taksitler) && sozlesme.ozel_taksitler.length > 0

  let plan // kronolojik sıralı [{ayIndex, tutar, tarih}]
  let taksitSayisi
  if (ozelPlanMi) {
    plan = sozlesme.ozel_taksitler
      .map((k) => {
        // Geriye dönük uyumluluk: eski kayıtlarda sadece {ay:'YYYY-MM'}
        // olabilir (gün seçimi eklenmeden önce), o zaman ayın 1'i kullanılır.
        const tarih = k.tarih || (k.ay ? `${k.ay}-01` : null)
        const ayStr = tarih ? tarih.slice(0, 7) : k.ay
        return { ayIndex: ayIndexOf(ayCoz(ayStr)), tutar: Number(k.tutar) || 0, tarih }
      })
      .filter((k) => k.tarih)
      .sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : 0))
    taksitSayisi = plan.length
    if (taksitSayisi === 0) return null
  } else {
    taksitSayisi = Number(sozlesme.taksit_sayisi) || 0
    const toplamTutar = Number(sozlesme.toplam_tutar) || 0
    if (!sozlesme.ilk_taksit_tarihi || taksitSayisi <= 0) return null
    const ilkTarih0 = new Date(sozlesme.ilk_taksit_tarihi)
    const ilkIndex0 = ayIndexOf({ yil: ilkTarih0.getFullYear(), ay: ilkTarih0.getMonth() + 1 })
    const taksitTutari = toplamTutar / taksitSayisi
    plan = Array.from({ length: taksitSayisi }, (_, i) => ({ ayIndex: ilkIndex0 + i, tutar: taksitTutari }))
  }

  const { yil: seciliYil, ay: seciliAyNo } = ayCoz(seciliAy)
  const seciliIndex = ayIndexOf({ yil: seciliYil, ay: seciliAyNo })

  // Bugün, YEREL tarihe göre "YYYY-MM-DD" string (uygulamanın diğer
  // yerlerindeki yerelBugunTarihi() ile aynı desen) — Date nesnesi yerine
  // string karşılaştırması kullanmak saat dilimi kaynaklı kaymaları önlüyor.
  const n = new Date()
  const bugunStr = tarihStr(n.getFullYear(), n.getMonth() + 1, n.getDate())
  const bugunAyStr = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`

  // Seçili ayın GERÇEK son günü — new Date(yil, ay, 0) JS'in kendi ay
  // aritmetiğiyle 30/31 farkını ve Şubat'ın (yıla göre) 28/29 gününü otomatik
  // doğru hesaplıyor, elle tablo tutmaya gerek yok.
  const sonGun = new Date(seciliYil, seciliAyNo, 0)
  const ayinSonGunuStr = tarihStr(sonGun.getFullYear(), sonGun.getMonth() + 1, sonGun.getDate())

  // "Ay bitti mi?" — ekstreler her ayın SON GÜNÜNDE veliye gönderiliyor, o
  // gün bir sonraki ayın taksiti de otomatik eklenip "yaşlandırılıyor" (ör.
  // 20 Ağustos vadeli taksit ödenmeden 31 Ağustos'a gelinirse, o gün Eylül
  // taksiti de borca eklenir). Seçili ay bugünün ayı DEĞİLSE (geçmiş bir ayın
  // ekstresine bakılıyorsa) her zaman "bitmiş" sayılır — geçmiş bir ayın
  // ekstresi hep o ayın kapanış hâlini (bir sonraki ayın önizlemesiyle
  // birlikte) göstermeye devam etsin diye. Bugünün ayıysa, sadece takvim
  // GERÇEKTEN o ayın son gününe ulaştıysa "bitmiş" sayılır.
  const ayBittiMi = seciliAy !== bugunAyStr || bugunStr >= ayinSonGunuStr

  // Belirli bir hedef aya (dahil) kaç taksitin "sayıldığını" ve bunların
  // toplam tutarını hesaplar — DÜZ AY BAZINDA (eski sistemdeki gibi): bir
  // taksit, kendi ayı geldiği andan (ayın 1'inden) itibaren o AYIN TAMAMI
  // boyunca borç sayılır. Taksitler artık eşit tutarlı olmak zorunda
  // olmadığı için (özel plan), tek tek toplanıyor.
  function sayilanKisim(hedefIndex) {
    const dahil = plan.filter((k) => k.ayIndex <= hedefIndex)
    return { adet: dahil.length, toplam: dahil.reduce((t, k) => t + k.tutar, 0) }
  }

  const hedefIndex = ayBittiMi ? seciliIndex + 1 : seciliIndex
  const { toplam: J } = sayilanKisim(hedefIndex)
  // "Bu ay yeni eklenen kısmı" bulmak için kıyaslama noktası: ay HENÜZ
  // bitmediyse (seçili ay hâlâ devam ediyorsa) bir önceki ayın sonuna kadar
  // kesinleşmiş olan — böylece seçili ayın kendi taksiti "yeni" sayılır.
  // BÜYÜK HATA DÜZELTMESİ: ay BİTTİYSE (geçmiş/kapanmış bir ayın ekstresine
  // bakılıyorsa) kıyaslama noktası bir önceki ay DEĞİL, seçili ayın KENDİSİ
  // olmalı — çünkü o zaman J zaten bir sonraki ayı da (önizleme olarak)
  // içeriyor (hedefIndex = seciliIndex+1). Eskiden burada da seciliIndex-1
  // kullanılıyordu, bu da seçili ayın KENDİ taksitini de "yeni eklenen" (Bu
  // Ayın Tutarı) sütununa yazıp Geçmiş Borç'u sıfırlıyordu — oysa seçili ay
  // artık bittiği (dolayısıyla o ayın taksiti de vadesi geçmiş sayıldığı)
  // için o taksit ARTIK "Geçmiş Borç", sadece bir sonraki ayın önizlemesi
  // "Bu Ayın Tutarı" olmalı (kullanıcının Ağustos ekstresinde Eylül'ü de
  // gösterip 30+30 şeklinde ayırma isteğiyle bulundu).
  const oncekiIndex = ayBittiMi ? seciliIndex : seciliIndex - 1
  const { toplam: oncekiJ } = sayilanKisim(oncekiIndex)

  const hedefAyObj = ayBittiMi ? ayEkle(seciliAy, 1) : { yil: seciliYil, ay: seciliAyNo }
  const odenen = odemeToplamKalem(odemeler, sozlesme.kalem, hedefAyObj)

  // Ödemeler kümülatif olarak en eski taksitten başlayarak kapatılıyor —
  // taksitler artık farklı tutarlı olabildiği için M (kaç taksit TAM
  // ödendi), tek bir bölme yerine taksitleri sırayla tüketerek bulunuyor.
  let M = 0
  let kalanOdenenBudget = odenen
  for (const k of plan) {
    if (kalanOdenenBudget >= k.tutar - 0.01) {
      kalanOdenenBudget -= k.tutar
      M++
    } else break
  }

  const kalanToplam = Math.max(0, J - odenen)
  // Veli, o ana kadar borçlanandan FAZLA ödeme yaptıysa (ör. taksitini önden
  // ya da fazladan ödediyse), bu fazlalık burada hesaplanır. Kümülatif
  // "J - odenen" karşılaştırması sayesinde bu fazlalık otomatik olarak bir
  // sonraki ayın taksitinden düşülür (ayrıca bir işlem gerekmez) — burada
  // sadece veli/yönetici görsün diye "+X Alacaklı" olarak da dışa veriyoruz.
  const fazlaOdeme = Math.max(0, odenen - J)
  // "Bu ay eklenen tutar" — bir önceki ayın sonuna göre YENİ eklenen kısım:
  // ya sadece bu ayın kendi taksiti (vadesi geldiyse), ya da (ay bittiyse)
  // hem bu ayın hem bir sonraki ayın taksiti birlikte. Kalan her şey daha
  // eski aylardan sürüklenen, hâlâ ödenmemiş borç.
  const buAyTutar = Math.min(Math.max(0, J - oncekiJ), kalanToplam)
  const gecmisBorc = Math.max(0, kalanToplam - buAyTutar)

  if (kalanToplam <= 0 && fazlaOdeme <= 0.01) return null

  let vade = null
  if (M < taksitSayisi) {
    if (ozelPlanMi) {
      // Özel plan taksitlerinde vade artık ayın 1'i değil, veli/yönetici o
      // satırda ne gün seçtiyse tam olarak o gün.
      vade = new Date(plan[M].tarih)
    } else {
      vade = new Date(sozlesme.ilk_taksit_tarihi)
      vade.setMonth(vade.getMonth() + M)
    }
  }

  return {
    label: `${sozlesme.kalem} - Taksit (${M}/${taksitSayisi})`,
    durum:
      kalanToplam > 0
        ? `Ödenmesi Gereken Vade: ${vade.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}`
        : 'Fazla Ödeme (Alacaklı)',
    buAyTutar,
    gecmisBorc,
    toplamOdenecek: kalanToplam,
    fazlaOdeme,
  }
}

// ============================================================================
// AYLIK KALEM BORÇLARI (Bire Bir / Yemek / Kantin) — taksit yok, sadece
// "o aya kadar kümülatif borç" vs "o aya kadar kümülatif ödenen" karşılaştırması.
// ============================================================================
export function aylikKalemHesapla(kalemAdi, aylikBorclar, odemeler, seciliAy) {
  const simdi = ayEkle(seciliAy, 0)
  const simdiIndex = ayIndexOf(simdi)

  const borclarBuKaleme = aylikBorclar.filter((a) => a.kalem === kalemAdi)
  if (borclarBuKaleme.length === 0) return null

  const J = borclarBuKaleme
    .filter((a) => {
      const d = new Date(a.donem)
      return ayIndexOf({ yil: d.getFullYear(), ay: d.getMonth() + 1 }) <= simdiIndex
    })
    .reduce((t, a) => t + Number(a.tutar), 0)

  const odenen = odemeToplamKalem(odemeler, kalemAdi, simdi)

  const buAyTutar = borclarBuKaleme
    .filter((a) => {
      const d = new Date(a.donem)
      return d.getFullYear() === simdi.yil && d.getMonth() + 1 === simdi.ay
    })
    .reduce((t, a) => t + Number(a.tutar), 0)

  const kalanToplam = Math.max(0, J - odenen)
  // Aynı mantık: veli bu kalemde borçtan fazla ödeme yaptıysa (ör. henüz Bire
  // Bir dersi/kantin alışı olmadan önden para bıraktıysa), fazlalık burada
  // hesaplanır ve otomatik olarak bir sonraki borçtan (yeni ders/alış
  // kaydından) düşülür — kümülatif karşılaştırma sayesinde kendiliğinden olur.
  const fazlaOdeme = Math.max(0, odenen - J)
  const gecmisBorc = Math.max(0, kalanToplam - buAyTutar)

  if (kalanToplam <= 0 && fazlaOdeme <= 0.01) return null

  return {
    label: kalemAdi,
    durum: kalanToplam > 0 ? 'Bakiye Borçlu' : 'Fazla Ödeme (Alacaklı)',
    buAyTutar,
    gecmisBorc,
    toplamOdenecek: kalanToplam,
    fazlaOdeme,
  }
}

// Bir tarih string'inden (ödemenin "tarih" alanı gibi) yerel gün anahtarı
// üretir ("YYYY-MM-DD") — aynı günün tüm ödemelerini gruplamak için kullanılır.
export function gunAnahtari(tarihStr) {
  const d = new Date(tarihStr)
  const yil = d.getFullYear()
  const ay = String(d.getMonth() + 1).padStart(2, '0')
  const gun = String(d.getDate()).padStart(2, '0')
  return `${yil}-${ay}-${gun}`
}

// Bir öğrencinin TÜM kalemlerini (sözleşme + aylık) tek listede hesaplar.
export function ogrenciSatirlariHesapla(sozlesmeler, aylikBorclar, odemeler, seciliAy) {
  return [
    ...sozlesmeler.map((s) => sozlesmeKalemHesapla(s, odemeler, seciliAy)),
    ...['Bire Bir', 'Yemek', 'Kantin'].map((k) => aylikKalemHesapla(k, aylikBorclar, odemeler, seciliAy)),
  ].filter(Boolean)
}

// ============================================================================
// FAZLA ÖDEME (ALACAK) ÖZETİ — bir öğrencinin "şu an itibarıyla" (bugünün
// ayına göre) hangi kalemlerde borçtan fazla ödeme yapılmış olduğunu (yani
// alacaklı olduğunu) özetler. Muhasebe sayfasında ay seçici olmadığı için bu
// fonksiyon içeride bugünün ayını kullanır. Her satırdaki fazlalık, ilgili
// kalemde bir sonraki borç doğduğunda (sonraki ay taksiti / sonraki Bire Bir
// dersi / kantin alışı) otomatik olarak düşer — bu sadece GÖRÜNÜRLÜK sağlar.
// ============================================================================
export function fazlaOdemeleriHesapla(sozlesmeler, aylikBorclar, odemeler) {
  const buAy = new Date().toISOString().slice(0, 7)
  const satirlar = [
    ...sozlesmeler.map((s) => sozlesmeKalemHesapla(s, odemeler, buAy)),
    ...['Bire Bir', 'Yemek', 'Kantin'].map((k) => aylikKalemHesapla(k, aylikBorclar, odemeler, buAy)),
  ].filter(Boolean)
  return satirlar
    .filter((s) => s.fazlaOdeme > 0.01 && s.toplamOdenecek <= 0.01)
    .map((s) => ({ label: s.label, fazlaOdeme: s.fazlaOdeme }))
}

// Türkçe telefon numarasını wa.me linkinin istediği "90XXXXXXXXXX" formatına çevirir.
export function telefonNormallestir(telefon) {
  if (!telefon) return null
  let t = String(telefon).replace(/[\s\-()]/g, '').replace(/^\+/, '')
  if (!t) return null
  if (t.startsWith('0')) t = '90' + t.slice(1)
  else if (t.startsWith('5') && t.length === 10) t = '90' + t
  else if (!t.startsWith('90')) t = '90' + t
  return t
}

// Excel'deki WHATSAPP MESAJ ŞABLONU'nun aynısı.
export function whatsappMesajiOlustur({ ogrenciAdi, ayYil, buAyTutar, kalanTutar, pdfLink }) {
  return (
    `Değerli Velimiz, \n${ogrenciAdi} için ${ayYil} ekstresi hazırdır.\n` +
    `Bu ayki taksit ve harcamalarınız: *₺${buAyTutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}*\n` +
    `Toplam ödenmesi gereken bakiye: *₺${kalanTutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}*\n` +
    `Ekstre: ${pdfLink}\n` +
    `Bilgi için bizimle iletişime geçebilirsiniz. Teşekkür ederiz.`
  )
}

// ============================================================================
// MAKBUZ TAKSİT BİLGİSİ — bir ödeme satırının (varsa) hangi sözleşmeye
// (Okul/Kurs/Kitap gibi taksitli bir kaleme) ait olduğunu bulup, o sözleşmenin
// toplamda kaç taksitinin şu ana kadar ödendiğini hesaplar. Makbuzda (hem
// WhatsApp metninde hem PDF'te) her kalemin yanında "3/8. taksit ödendi" gibi
// gösterebilmek için — kullanıcı isteğiyle eklendi: veli makbuzu görünce kaç
// taksitten kaçının ödendiğini bilemiyordu. Aylık kalemler (Bire Bir/Yemek/
// Kantin) veya eşleşen bir sözleşmesi olmayan kalemler için null döner
// (makbuzda o satırda "—" gösterilir).
//
// ÖNEMLİ (Fatura Ortağı için doğruluk): taksit durumu SADECE bu sözleşmenin
// sahibi öğrencinin KENDİ ödemeleriyle hesaplanır (tumOdemeler, ogrenci_id'ye
// göre burada süzülür) — grup genelindeki (kardeş/ikiz) TÜM ödemelerle
// hesaplanırsa, aynı isimde ("Okul" gibi) iki farklı öğrencinin sözleşmesi
// birbirine karışıp yanlış taksit sayısı gösterebilirdi.
// ============================================================================
export function makbuzTaksitBilgisiBul(odeme, sozlesmeler, tumOdemeler) {
  if (!odeme.kalem) return null
  const sozlesme = (sozlesmeler || []).find(
    (s) => s.ogrenci_id === odeme.ogrenci_id && odeme.kalem.startsWith(s.kalem)
  )
  if (!sozlesme) return null
  const kendiOdemeleri = (tumOdemeler || []).filter((o) => o.ogrenci_id === sozlesme.ogrenci_id)
  const taksitler = taksitPlaniOlustur(sozlesme, kendiOdemeleri)
  if (taksitler.length === 0) return null
  const odenenSayisi = taksitler.filter((t) => t.durum === 'odendi').length
  return { odenenSayisi, toplamSayisi: taksitler.length }
}

// ============================================================================
// MAKBUZ WHATSAPP MESAJI — Muhasebe.jsx'teki "WhatsApp'tan Gönder" butonu
// için. "Makbuz Yazdır" (MakbuzGunluk.jsx) ile AYNI gün-birleştirme mantığı:
// o günün TÜM kalemleri (kalemler dizisi) burada tek bir mesajda özetlenir,
// tek tek her kalem için ayrı mesaj gitmez. Her kalemin (varsa) taksitBilgisi
// alanı (bkz. makbuzTaksitBilgisiBul) satırın sonuna "(X/Y. taksit ödendi)"
// olarak ekleniyor.
// ============================================================================
export function makbuzWhatsappMesajiOlustur({ ogrenciAdi, tarihMetni, kalemler, toplam, pdfLink }) {
  const kalemSatirlari = kalemler
    .map((k) => {
      const taksitMetni = k.taksitBilgisi
        ? ` (${k.taksitBilgisi.odenenSayisi}/${k.taksitBilgisi.toplamSayisi}. taksit ödendi)`
        : ''
      return `• ${k.kalem || 'Ödeme'}: ₺${Number(k.tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}${taksitMetni}`
    })
    .join('\n')
  return (
    `Değerli Velimiz, \n${ogrenciAdi} için ${tarihMetni} tarihli ödemeniz alınmıştır.\n\n` +
    `${kalemSatirlari}\n\n` +
    `Toplam: *₺${Number(toplam || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}*\n` +
    `Makbuz: ${pdfLink}\n\n` +
    `Teşekkür ederiz.`
  )
}

// ============================================================================
// SÖZLEŞME WHATSAPP MESAJI — Muhasebe.jsx'teki Sözleşmeler tablosundaki
// "Anneye Gönder"/"Babaya Gönder" butonları için, makbuzWhatsappMesajiOlustur
// ile AYNI desen.
// ============================================================================
export function sozlesmeWhatsappMesajiOlustur({ ogrenciAdi, kalem, toplamTutar, pdfLink }) {
  return (
    `Değerli Velimiz, \n${ogrenciAdi} için ${kalem} sözleşmeniz ekte, tutar: ` +
    `*₺${Number(toplamTutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}*.\n\n` +
    `Sözleşme: ${pdfLink}\n\n` +
    `Teşekkür ederiz.`
  )
}

export function whatsappLinkOlustur(ogrenci, seciliAy, buAyTutar, kalanTutar) {
  const telefon = telefonNormallestir(ogrenci.telefon)
  if (!telefon) return null
  const ayYil = new Date(seciliAy + '-01').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
  const pdfLink = `${window.location.origin}/ekstre/${ogrenci.id}`
  const mesaj = whatsappMesajiOlustur({ ogrenciAdi: ogrenci.ad_soyad, ayYil, buAyTutar, kalanTutar, pdfLink })
  return `https://wa.me/${telefon}?text=${encodeURIComponent(mesaj)}`
}

// whatsappLinkOlustur ile aynı mesaj mantığı, ama telefon numarasını dışarıdan
// (anne/baba gibi FARKLI bir kişininkini) parametre olarak alır — Toplu
// Ekstre'de anneye ve babaya AYRI AYRI mesaj gönderebilmek için kullanılır.
export function whatsappLinkOlusturTelefonIcin(telefon, ogrenciAdi, ogrenciId, seciliAy, buAyTutar, kalanTutar) {
  const t = telefonNormallestir(telefon)
  if (!t) return null
  const ayYil = new Date(seciliAy + '-01').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
  const pdfLink = `${window.location.origin}/ekstre/${ogrenciId}`
  const mesaj = whatsappMesajiOlustur({ ogrenciAdi, ayYil, buAyTutar, kalanTutar, pdfLink })
  return `https://wa.me/${t}?text=${encodeURIComponent(mesaj)}`
}

// ============================================================================
// BİRE BİR GÜNLÜK DERS HATIRLATMASI — belirli bir tarihteki bire bir dersi
// için öğrenciye/anneye/babaya WhatsApp üzerinden "bugün şu saatte dersiniz
// var" hatırlatması gönderebilmek için mesaj/link üretir (BireBir.jsx'teki
// "Ders Hatırlatması Gönder" paneli kullanır).
// ============================================================================
export function bireBirHatirlaticiMesajiOlustur({ ogrenciAdi, tarihStr, baslangicSaat, bitisSaat, ogretmenAdi }) {
  const tarihMetni = new Date(tarihStr + 'T12:00:00').toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
  })
  const saatMetni = bitisSaat ? `${saatGoster(baslangicSaat)}–${saatGoster(bitisSaat)}` : saatGoster(baslangicSaat)
  return (
    `Merhaba, ${ogrenciAdi} için ${tarihMetni} günü saat ${saatMetni} arasında bire bir dersi bulunmaktadır` +
    (ogretmenAdi ? ` (Öğretmen: ${ogretmenAdi}).` : '.') +
    `\nİyi dersler dileriz.\nSavaş Akça Eğitim`
  )
}

export function bireBirHatirlaticiLinkOlustur(telefon, bilgiler) {
  const t = telefonNormallestir(telefon)
  if (!t) return null
  const mesaj = bireBirHatirlaticiMesajiOlustur(bilgiler)
  return `https://wa.me/${t}?text=${encodeURIComponent(mesaj)}`
}

// ============================================================================
// TOPLU DERS HATIRLATMASI — Aynı öğrencinin aynı gün (ya da haftada) BİRDEN
// FAZLA bire bir dersi olabiliyor (ör. bir öğrenci, farklı öğretmenlerle günde
// 3-4 kez ders alabiliyor). Bunları tek tek ayrı mesajlarla göndermek yerine,
// öğrenci başına TEK bir WhatsApp mesajında topluyoruz.
// ============================================================================

// Mesajın kime gittiğine göre selamlama satırını üretir — öğrencinin kendisine
// "Değerli Öğrencimiz,", anneye/babaya (veli) "Değerli Velimiz," diye başlar,
// devamı bir alt satırdan gelir (Toplu Ekstre'deki "Değerli Velimiz," ile
// aynı üslup).
function selamlamaSatiri(kimeGonderiliyor) {
  return kimeGonderiliyor === 'veli' ? 'Değerli Velimiz,' : 'Değerli Öğrencimiz,'
}

// Seçili GÜNÜN (bugün/yarın/seçilen tarih) TÜM derslerini tek mesajda özetler.
// dersler: [{ baslangicSaat, bitisSaat, dersAdi }] — saate göre sıralı olmalı.
// dersAdi, öğretmenin branşından gelir (ör. "Matematik") — kişi adı yerine
// hangi DERS olduğu yazsın diye.
export function bireBirGunlukOzetMesajiOlustur({ kimeGonderiliyor, ogrenciAdi, tarihStr, dersler }) {
  const tarihMetni = new Date(tarihStr + 'T12:00:00').toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
  })
  const satirlar = dersler
    .map((d) => `• ${d.bitisSaat ? `${saatGoster(d.baslangicSaat)}–${saatGoster(d.bitisSaat)}` : saatGoster(d.baslangicSaat)}${d.dersAdi ? ` (${d.dersAdi})` : ''}`)
    .join('\n')
  const derslerMetni = dersler.length > 1 ? 'aşağıdaki bire bir dersler bulunmaktadır' : 'aşağıdaki bire bir ders bulunmaktadır'
  return (
    `${selamlamaSatiri(kimeGonderiliyor)}\n${ogrenciAdi} için ${tarihMetni} günü ${derslerMetni}:\n` +
    `${satirlar}\n` +
    `İyi dersler dileriz.\nSavaş Akça Eğitim`
  )
}

// Öğrencinin o haftanın (seçili günden Pazar'a kadar) TÜM bire bir derslerini
// özetler — hem her hafta tekrar eden atamalar hem de o haftaya özel tek
// seferlik dersler dahildir. dersler: [{ gunAdi, baslangicSaat, bitisSaat, dersAdi }]
// — haftanın gününe göre sıralı olmalı.
export function bireBirHaftalikOzetMesajiOlustur({ kimeGonderiliyor, ogrenciAdi, dersler }) {
  const satirlar = dersler
    .map((d) => `• ${d.gunAdi}: ${d.bitisSaat ? `${saatGoster(d.baslangicSaat)}–${saatGoster(d.bitisSaat)}` : saatGoster(d.baslangicSaat)}${d.dersAdi ? ` (${d.dersAdi})` : ''}`)
    .join('\n')
  return (
    `${selamlamaSatiri(kimeGonderiliyor)}\n${ogrenciAdi} için bu hafta bire bir ders programı şu şekildedir:\n` +
    `${satirlar}\n` +
    `İyi dersler dileriz.\nSavaş Akça Eğitim`
  )
}

// Yukarıdaki iki özet fonksiyonundan çıkan HAZIR mesaj metnini alıp wa.me linkine çevirir.
export function bireBirOzetLinkOlustur(telefon, mesaj) {
  const t = telefonNormallestir(telefon)
  if (!t) return null
  return `https://wa.me/${t}?text=${encodeURIComponent(mesaj)}`
}

// ============================================================================
// DEVAMSIZLIK BİLDİRİMİ — Yoklama.jsx'te bir öğrenci "Gelmedi" olarak
// işaretlenip yoklama kaydedildiğinde, anneye/babaya WhatsApp üzerinden
// "bugün derse gelmedi" bildirimi gönderebilmek için mesaj üretir. Link
// üretimi için AYNI bireBirOzetLinkOlustur fonksiyonu kullanılır (telefon +
// hazır metin alıp wa.me linkine çeviren genel fonksiyon) — burada ayrıca
// bir link fonksiyonu tanımlamaya gerek yok.
// ============================================================================
export function devamsizlikMesajiOlustur({ ogrenciAdi, tarihStr, sinifAdi, saatAraligi }) {
  const tarihMetni = new Date(tarihStr + 'T12:00:00').toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
  })
  // saatAraligi çağıran taraftan hazır bir metin ("12:50–13:35" gibi) olarak
  // geliyor — tek bir alan olarak değil, serbest metin olarak geldiği için
  // saatGoster kullanamıyoruz; içindeki "HH:MM" kalıplarını "HH.MM"ye çeviren
  // genel bir regex ile aynı sonucu elde ediyoruz.
  const saatAraligiGosterilen = saatAraligi ? saatAraligi.replace(/(\d{1,2}):(\d{2})/g, '$1.$2') : saatAraligi
  return (
    `Değerli Velimiz,\n${ogrenciAdi} adlı öğrencimiz ${tarihMetni} günü` +
    `${sinifAdi ? ` ${sinifAdi} sınıfının` : ''}${saatAraligiGosterilen ? ` ${saatAraligiGosterilen} saatleri arasındaki` : ''} dersine gelmemiştir.\n` +
    `Bilginize sunarız.\nSavaş Akça Eğitim`
  )
}

// ============================================================================
// ÖDEV BİLDİRİMİ — Odev.jsx'te yeni bir ödev girildiğinde, öğrenciye/veliye
// WhatsApp üzerinden "yeni ödevin var" bildirimi gönderebilmek için mesaj
// üretir. Link üretimi için AYNI bireBirOzetLinkOlustur fonksiyonu kullanılır
// (telefon + hazır metin alıp wa.me linkine çeviren genel fonksiyon).
// ============================================================================
export function odevBildirimMesajiOlustur({ kimeGonderiliyor, ogrenciAdi, ders, baslik, aciklama, sonTarih }) {
  const sonTarihMetni = sonTarih
    ? new Date(sonTarih + 'T12:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null
  return (
    `${selamlamaSatiri(kimeGonderiliyor)}\n${ogrenciAdi} için yeni bir ödev girildi` +
    `${ders ? ` (${ders})` : ''}:\n` +
    `*${baslik}*\n` +
    (aciklama ? `${aciklama}\n` : '') +
    (sonTarihMetni ? `Son tarih: ${sonTarihMetni}\n` : '') +
    `İyi çalışmalar dileriz.\nSavaş Akça Eğitim`
  )
}

// ============================================================================
// TEK TEK ÖDEME PLANI — Bir sözleşmenin (Okul/Kurs/Kitap) TÜM taksitlerini,
// her birinin vade tarihi ve durumuyla (ödendi / gecikti / bekliyor) birlikte
// listeler. Hem veli hem yönetici bunu görebilir (Muhasebe sayfasında).
// ============================================================================
export function taksitPlaniOlustur(sozlesme, odemeler) {
  // ÖZEL PLAN — sozlesmeKalemHesapla ile aynı mantık: eşit bölme yerine her
  // taksitin kendi (ay, tutar) çifti ozel_taksitler'den geliyor.
  const ozelPlanMi =
    !!sozlesme.ozel_plan_mi && Array.isArray(sozlesme.ozel_taksitler) && sozlesme.ozel_taksitler.length > 0

  let plan // kronolojik sıralı [{tutar, vade}]
  if (ozelPlanMi) {
    plan = sozlesme.ozel_taksitler
      .map((k) => {
        // Geriye dönük uyumluluk: eski kayıtlarda sadece {ay:'YYYY-MM'} olabilir.
        const tarih = k.tarih || (k.ay ? `${k.ay}-01` : null)
        return tarih ? { tarih, tutar: Number(k.tutar) || 0, vade: new Date(tarih) } : null
      })
      .filter(Boolean)
      .sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : 0))
    if (plan.length === 0) return []
  } else {
    const taksitSayisi = Number(sozlesme.taksit_sayisi) || 0
    const toplamTutar = Number(sozlesme.toplam_tutar) || 0
    if (!sozlesme.ilk_taksit_tarihi || taksitSayisi <= 0) return []
    const ilkTarih = new Date(sozlesme.ilk_taksit_tarihi)
    const taksitTutari = toplamTutar / taksitSayisi
    plan = Array.from({ length: taksitSayisi }, (_, i) => {
      const vade = new Date(ilkTarih)
      vade.setMonth(vade.getMonth() + i)
      return { tutar: taksitTutari, vade }
    })
  }

  const bugun = new Date()

  // Bu kalem için bugüne kadar yapılmış TÜM ödemeler (devreden dahil, cutoff yok)
  const odenenToplam = odemeToplamKalem(odemeler, sozlesme.kalem, { yil: 9999, ay: 12 })

  const taksitler = []
  let kumulatifOncekiGereken = 0
  for (let i = 0; i < plan.length; i++) {
    const { tutar, vade } = plan[i]
    const kumulatifGereken = kumulatifOncekiGereken + tutar

    // Ödemeler kümülatif olarak sırayla taksitleri kapatır (önce en eski taksit).
    // Bu taksite düşen kısım: bir önceki taksitlere kadar olan borç tamamen
    // kapandıktan SONRA arta kalan ödeme, bu taksitin tutarını aşmayacak şekilde.
    // Kısmi ödeme yapıldıysa (ör. 22.000 taksitin sadece 10.000'i ödendiyse) bu
    // değer 10.000 çıkar ve kalanTutar 12.000 olur.
    const buTaksiteDusenOdenen = Math.min(
      Math.max(odenenToplam - kumulatifOncekiGereken, 0),
      tutar
    )
    const kalanTutar = Math.max(tutar - buTaksiteDusenOdenen, 0)

    let durum
    if (odenenToplam >= kumulatifGereken - 0.01) durum = 'odendi'
    else if (buTaksiteDusenOdenen > 0.01) durum = 'kismi'
    else if (vade < bugun) durum = 'gecikti'
    else durum = 'bekliyor'

    taksitler.push({ taksitNo: i + 1, vade, tutar, odenenTutar: buTaksiteDusenOdenen, kalanTutar, durum })
    kumulatifOncekiGereken = kumulatifGereken
  }
  return taksitler
}

// ============================================================================
// TAKSİT PLANI (ÖDEME TARİHİ DAHİL) — taksitPlaniOlustur ile AYNI taksit
// listesini üretir, ama her "ödendi" taksit için o taksitin hangi TARİHTE
// tamamlandığını (odemeTarihi) da ekler. Bu kalem için yapılmış ödemeler
// kronolojik sırayla kümülatif olarak taksitleri kapattığı için, bir taksitin
// kümülatif eşiğini AŞAN ilk ödemenin tarihi, o taksitin "ödendi" sayıldığı
// tarih olarak kabul edilir. "Ödeme Planı PDF İndir" (Muhasebe.jsx →
// pdfOlustur.js odemePlaniPdfOlustur) eski sistemdeki "Ödendi (DD.MM.YYYY)"
// görünümünü birebir vermek için bunu kullanır — taksitPlaniOlustur'un
// kendisi diğer yerlerde (ör. Muhasebe.jsx'in ekrandaki taksit tablosu)
// değişmeden çalışmaya devam etsin diye ayrı bir fonksiyon olarak tutuldu.
// ============================================================================
export function taksitPlaniDetayliOlustur(sozlesme, odemeler) {
  const taksitler = taksitPlaniOlustur(sozlesme, odemeler)
  if (taksitler.length === 0) return taksitler

  const kalemOdemeleri = (odemeler || [])
    .filter((o) => o.kalem && o.kalem.startsWith(sozlesme.kalem))
    .slice()
    .sort((a, b) => new Date(a.tarih) - new Date(b.tarih))

  // Hedef kümülatif eşik artık her taksitin (t.tutar) kendi tutarı üzerinden
  // birikimli olarak hesaplanıyor — özel planda taksitler eşit olmadığı için
  // sabit taksitTutari*taksitNo çarpımı yerine taksitler.map ile birikiyor.
  let kumulatif = 0
  let odemeIndex = 0
  let hedefKumulatif = 0
  return taksitler.map((t) => {
    hedefKumulatif += t.tutar
    const hedef = hedefKumulatif
    let sonOdemeTarihi = null
    while (odemeIndex < kalemOdemeleri.length && kumulatif < hedef - 0.01) {
      kumulatif += Number(kalemOdemeleri[odemeIndex].tutar)
      sonOdemeTarihi = kalemOdemeleri[odemeIndex].tarih
      odemeIndex++
    }
    return { ...t, odemeTarihi: t.durum === 'odendi' ? sonOdemeTarihi : null }
  })
}

// Aylık kalem borçları (Bire Bir / Yemek / Kantin) için tek tek satır bazında
// durum hesaplar (ödendi / kısmi ödendi / gecikti / bekliyor) — taksit yapısı
// olmadığı için kümülatif borç/ödeme karşılaştırması üzerinden gider. Ödemeler
// bu kalemin borçlarını, en eskisinden başlayarak sırayla kapatır — bu yüzden
// "bu borca düşen ödeme" hesabı, taksit planındaki AYNI mantıkla (bir önceki
// borçlar tamamen kapandıktan sonra arta kalan ödeme, bu borcun tutarını
// aşmayacak şekilde) yapılır. Kısmi ödeme yapılmışsa (ör. 37.750 borcun sadece
// 19.887'si ödendiyse) bu satırda görünsün diye geriye {durum, odenenTutar,
// kalanTutar} objesi döner.
export function aylikBorcDurumHesapla(borc, tumAylikBorclar, odemeler) {
  const kalemAdi = borc.kalem
  const borcTarihi = new Date(borc.donem)
  const bugun = new Date()
  const tutar = Number(borc.tutar) || 0

  const kumulatifOncekiBorc = tumAylikBorclar
    .filter((a) => a.kalem === kalemAdi)
    .filter((a) => new Date(a.donem) < borcTarihi)
    .reduce((t, a) => t + Number(a.tutar), 0)
  const kumulatifBorc = kumulatifOncekiBorc + tutar

  const odenenToplam = odemeToplamKalem(odemeler, kalemAdi, { yil: 9999, ay: 12 })

  const buBorcaDusenOdenen = Math.min(Math.max(odenenToplam - kumulatifOncekiBorc, 0), tutar)
  const kalanTutar = Math.max(tutar - buBorcaDusenOdenen, 0)

  let durum
  if (odenenToplam >= kumulatifBorc - 0.01) {
    durum = 'odendi'
  } else if (buBorcaDusenOdenen > 0.01) {
    durum = 'kismi'
  } else {
    // "Gecikti" sadece borcun ait olduğu AY geçtiyse (ör. Haziran borcu,
    // Temmuz'a girildiğinde) verilir — bu kalemler ay sonunda ekstre ile
    // faturalandığı için, içinde bulunduğumuz ayın borcu henüz "gecikmiş"
    // sayılmaz, "bekliyor" kalır.
    const borcAyIndex = ayIndexOf({ yil: borcTarihi.getFullYear(), ay: borcTarihi.getMonth() + 1 })
    const simdiAyIndex = ayIndexOf({ yil: bugun.getFullYear(), ay: bugun.getMonth() + 1 })
    durum = borcAyIndex < simdiAyIndex ? 'gecikti' : 'bekliyor'
  }

  return { durum, odenenTutar: buBorcaDusenOdenen, kalanTutar }
}

// ============================================================================
// AYLIK KALEM BORÇLARI TABLOSU İÇİN GRUPLAMA — bireBirBorclariOlustur ve
// kantinBorclariOlustur, HER dersi/alışı ayrı bir sentetik satır olarak
// üretiyor (ör. bir öğrenci bir ayda 15 bire bir dersi aldıysa, 15 ayrı satır).
// Muhasebe.jsx'teki "Aylık Kalem Borçları" tablosu bunları tek tek gösterirse
// çok uzun bir liste oluyor — bu fonksiyon AYNI kalem + AYNI ay içindeki tüm
// satırları TEK bir toplam satıra indirger (tutar toplanır). Alttaki "Bire Bir
// Ders Dökümü" bölümü zaten tek tek dersleri (tarih/saat/öğretmen ile) ayrıca
// gösterdiği için, bu tablo artık sadece ay bazında ÖZET gösteriyor. Yeni bir
// ders/alış eklendikçe (veriyiYenile ile) otomatik güncellenir.
// ============================================================================
export function aylikBorclariKalemAyaGoreGrupla(aylikBorclar) {
  const gruplar = new Map()
  for (const a of aylikBorclar || []) {
    const donemAyi = String(a.donem).slice(0, 7) // "YYYY-MM"
    const anahtar = `${a.kalem}|${donemAyi}`
    if (!gruplar.has(anahtar)) {
      gruplar.set(anahtar, { id: `grp-${anahtar}`, kalem: a.kalem, donem: a.donem, tutar: 0, satirlar: [] })
    }
    const g = gruplar.get(anahtar)
    g.tutar += Number(a.tutar) || 0
    g.satirlar.push(a)
  }
  return Array.from(gruplar.values()).sort((x, y) => {
    if (x.donem !== y.donem) return x.donem < y.donem ? -1 : 1
    return x.kalem.localeCompare(y.kalem, 'tr')
  })
}

// ============================================================================
// BİRE BİR DERS ÜCRETİ — Bir öğrencinin bire bir atamasına (öğretmen + ders
// ücreti) göre alınan yoklama ('geldi') kayıtlarını, aylik_borclar tablosuyla
// AYNI ŞEKİLDE ({kalem, tutar, donem}) sentetik satırlara çevirir. Bu sayede
// Ekstre / Muhasebe / Toplu Ekstre'deki kümülatif borç motoru hiç değişmeden
// "Bire Bir" borcunu otomatik hesaplar — elle "Aylık kalem borcu ekle" girişine
// gerek kalmaz, her "Geldi" yoklaması otomatik borç olur.
//
// İki tür yoklama kaydı olabilir:
//  - Haftalık atamaya bağlı (atama_id dolu): ücret atamadan okunur.
//  - "Ek Ders" (atama_id boş): asıl öğrenci gelmediğinde başka bir öğrenciye
//    verilen tek seferlik ders — ücret, öğrenci ve öğretmen doğrudan yoklama
//    satırının kendi ogrenci_id/ogretmen_profile_id/tutar alanlarında durur.
// ============================================================================
export function bireBirBorclariOlustur(atamalar, yoklamalar) {
  const atamaMap = new Map(atamalar.map((a) => [a.id, a]))
  return yoklamalar
    .filter((y) => y.durum === 'geldi')
    .map((y) => {
      const t = new Date(y.tarih)
      // NOT: burada bilerek toISOString() kullanılmıyor — o, yerel tarihi UTC'ye
      // çevirirken (Türkiye UTC+3) ayın 1'ini bir önceki ayın son gününe kaydırıp
      // "Temmuz" yerine "Haziran" gibi yanlış bir döneme düşürüyordu.
      const donem = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-01`

      if (y.atama_id) {
        const atama = atamaMap.get(y.atama_id)
        if (!atama) return null
        // Yoklama satırında "damgalanmış" bir ücret varsa (o gün geçerli olan
        // fiyat) onu kullan; yoksa (eski kayıtlar için) atamanın güncel ücretine
        // düş. Böylece sonradan yapılan zamlar geçmiş ayların borcunu değiştirmez.
        const tutar = y.tutar != null ? Number(y.tutar) : Number(atama.ders_ucreti) || 0
        return {
          id: `bb-${y.id}`,
          ogrenci_id: atama.ogrenci_id,
          kalem: 'Bire Bir',
          tutar,
          donem,
        }
      }

      // Soru Çözümü — öğretmenin öğrenciye bağlı olmadan yaptığı, bilerek
      // fiyatlandırılmayan seans. Hiçbir zaman borç oluşturmaz.
      if (y.tur === 'soru_cozumu') return null

      // Ek ders — atamaya bağlı değil, ücret/öğrenci doğrudan yoklama satırında.
      if (!y.ogrenci_id) return null
      return {
        id: `bb-${y.id}`,
        ogrenci_id: y.ogrenci_id,
        kalem: 'Bire Bir',
        tutar: Number(y.tutar) || 0,
        donem,
      }
    })
    .filter(Boolean)
}

// ============================================================================
// BİRE BİR DERS DÖKÜMÜ — bireBirBorclariOlustur ile aynı veriyi kullanır ama
// aya/haftaya göre TOPLAMAK yerine, her dersi TEK TEK (tarih, saat, öğretmen,
// tür) korur. Muhasebe (yönetici görünümü) ve Ekstre (veliye gönderilen PDF)
// sayfalarında "hangi tarihte hangi ders yapıldı" dökümü göstermek için.
// atamalar/yoklamalar parametreleri, öğretmen adının görünmesi için
// "profiles:ogretmen_profile_id(ad_soyad)" join'i içermeli.
// ============================================================================
export function bireBirDersDetaylariOlustur(atamalar, yoklamalar) {
  const atamaMap = new Map(atamalar.map((a) => [a.id, a]))
  return yoklamalar
    .filter((y) => y.durum === 'geldi')
    .map((y) => {
      const atama = y.atama_id ? atamaMap.get(y.atama_id) : null
      // Soru Çözümü — öğretmenin öğrenciye bağlı olmadan yaptığı, bilerek
      // fiyatlandırılmayan seans (bkz. bireBirBorclariOlustur). Dökümde
      // (Öğretmen Ekstresi vs.) "öğrenci" sütununda düz metin olarak görünsün
      // ve ücreti her zaman 0 sayılsın diye burada ayrıca ele alınıyor.
      const soruCozumuMu = !atama && y.tur === 'soru_cozumu'
      const ogretmenAdi = atama
        ? atama.profiles?.ad_soyad || atama.ogretmen_adi
        : y.profiles?.ad_soyad || y.ogretmen_adi
      // Öğretmenin branşı (Matematik, Türkçe vb.) — veli hocayı isimden değil,
      // hangi DERS için ders aldığından tanıyor; bu yüzden ders dökümünde
      // öğretmen adının yanında branşı da gösteriyoruz. Aynı "profiles" join'i
      // üzerinden geliyor, ayrıca bir sorguya gerek yok.
      const ogretmenBransi = atama
        ? atama.profiles?.brans
        : y.profiles?.brans
      // Öğretmen ekstresinde (OgretmenEkstre.jsx) "karşı taraf" öğrenci olduğu
      // için bunu da hesaplıyoruz — atamalar/yoklamalar parametreleri bunun için
      // ayrıca "ogrenciler(ad_soyad)" join'i içermeli (içermezse ogrenci_adi'ya düşer).
      const ogrenciAdi = soruCozumuMu
        ? 'Soru Çözümü'
        : atama
          ? atama.ogrenciler?.ad_soyad || atama.ogrenci_adi
          : y.ogrenciler?.ad_soyad || y.ogrenci_adi
      return {
        id: y.id,
        tarih: y.tarih,
        baslangicSaat: y.baslangic_saat || atama?.baslangic_saat || null,
        bitisSaat: y.bitis_saat || atama?.bitis_saat || null,
        ogretmenAdi: ogretmenAdi || '—',
        ogretmenBransi: ogretmenBransi || null,
        ogrenciAdi: ogrenciAdi || '—',
        tutar: soruCozumuMu ? 0 : (y.tutar != null ? Number(y.tutar) : Number(atama?.ders_ucreti) || 0),
        kaynak: y.atama_id ? 'Haftalık' : 'Tekil',
        tur: soruCozumuMu ? 'soru_cozumu' : 'ders',
      }
    })
    .sort((a, b) => (a.tarih < b.tarih ? 1 : -1))
}

// ============================================================================
// ÖĞRETMEN EKSTRESİ — SINIF DERSLERİ DÖKÜMÜ — bir öğretmenin verdiği (yoklaması
// alınmış) sınıf derslerini, bireBirDersDetaylariOlustur ile AYNI satır
// şekline ({tarih, baslangicSaat, bitisSaat, ogrenciAdi, tutar, tur}) çevirir —
// OgretmenEkstre.jsx'te bire bir + soru çözümü ile aynı tabloda, kronolojik
// karışık gösterilebilsin diye. Sınıf dersleri bu ekstredeki tutara hiç
// katkı vermez (tutar hep 0) — sadece "hangi tarihte hangi sınıfa, hangi
// dersi verdi" kaydı için.
//
// yoklamaKayitlari: 'yoklama' tablosundan gelen satırlar — HER SATIR bir
// ÖĞRENCİYE ait olduğu için (aynı ders saati + aynı gün için N öğrenci = N
// satır), burada (ders_programi_id, tarih) ikilisine göre TEK bir derse
// indirgeniyor — kaç öğrenci değil, kaç FARKLI ders saati işlendiği önemli.
// Her satır ".select('*, ders_programi(ders_adi, baslangic_saat, bitis_saat, siniflar(ad)))"
// join'i içermeli (ders_programi_id null olan genel yoklama satırları atlanır).
// ============================================================================
export function sinifDersDetaylariOlustur(yoklamaKayitlari) {
  const gruplar = new Map()
  for (const y of yoklamaKayitlari || []) {
    const dp = y.ders_programi
    if (!dp || !y.ders_programi_id) continue
    const anahtar = `${y.ders_programi_id}|${y.tarih}`
    if (gruplar.has(anahtar)) continue
    gruplar.set(anahtar, {
      id: `sn-${anahtar}`,
      tarih: y.tarih,
      baslangicSaat: dp.baslangic_saat || null,
      bitisSaat: dp.bitis_saat || null,
      ogretmenAdi: null,
      ogretmenBransi: null,
      ogrenciAdi: `${dp.siniflar?.ad || 'Sınıf'}${dp.ders_adi ? ' · ' + dp.ders_adi : ''}`,
      tutar: 0,
      kaynak: 'Sınıf',
      tur: 'sinif',
    })
  }
  return Array.from(gruplar.values()).sort((a, b) => (a.tarih < b.tarih ? 1 : -1))
}

// Bir tarihin (YYYY-MM-DD) içinde bulunduğu haftanın PAZARTESİ gününü bulur —
// haftalık gruplama için kullanılır.
export function haftaBaslangici(tarihStr) {
  const d = new Date(tarihStr + 'T12:00:00')
  const gun = d.getDay() === 0 ? 7 : d.getDay() // 1=Pzt...7=Paz
  d.setDate(d.getDate() - (gun - 1))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function haftaEtiketi(baslangicStr) {
  const b = new Date(baslangicStr + 'T12:00:00')
  const s = new Date(b)
  s.setDate(s.getDate() + 6)
  const fmt = (t) => t.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
  return `${fmt(b)} – ${fmt(s)} ${s.getFullYear()}`
}

// Bir tarihin (YYYY-MM-DD) içinde bulunduğu ayın 1'ini döndürür — aylık
// gruplama için kullanılır (haftaBaslangici'nin ay karşılığı).
export function ayBaslangici(tarihStr) {
  return tarihStr.slice(0, 7) + '-01'
}

export function ayEtiketi(baslangicStr) {
  return new Date(baslangicStr + 'T12:00:00').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
}

// ============================================================================
// KANTİN BORÇLARI — bireBirBorclariOlustur ile birebir aynı mantık: her veresiye
// alışı, aylik_borclar ile AYNI ŞEKİLDE ({kalem:'Kantin', tutar, donem}) sentetik
// bir satıra çevrilir. Alış anında damgalanmış "tutar" kullanılır (ürünün o anki
// fiyatı) — sonradan ürün fiyatı değişse bile geçmiş ay borçları değişmez.
// ============================================================================
export function kantinBorclariOlustur(alislar) {
  return (alislar || []).map((k) => {
    const t = new Date(k.tarih)
    const donem = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-01`
    return {
      id: `kt-${k.id}`,
      ogrenci_id: k.ogrenci_id,
      kalem: 'Kantin',
      tutar: Number(k.tutar) || 0,
      donem,
    }
  })
}

// ============================================================================
// BORÇ YAŞLANDIRMA (AGING) — bir öğrencinin (ya da Fatura Ortağı grubunun)
// VADESİ GEÇMİŞ (bugünden önceki bir tarihte ödenmesi gerekip hâlâ kapanmamış)
// borçlarını, vadenin üzerinden kaç gün geçtiğine göre "yaş kovalarına"
// ayırır. Sözleşme taksitleri için taksitPlaniOlustur (her taksitin kendi
// vade tarihi var), aylık kalem borçları için aylikBorclariKalemAyaGoreGrupla
// + aylikBorcDurumHesapla (bir borcun "vadesi", ait olduğu ayın BİTİŞİ —
// takvim bir sonraki aya geçtiğinde "gecikmiş" sayılması ile AYNI kural)
// kullanılır — Muhasebe.jsx'teki taksit/borç tablolarıyla birebir TUTARLI
// kalması için hesap mantığı oradan hiç değiştirilmeden buraya taşındı,
// sadece sonuçlar vade tarihine göre kovalara ayrılıyor.
// ============================================================================
export function yasKovasiHesapla(vadeTarihi, bugun = new Date()) {
  const gunFarki = Math.floor((bugun - vadeTarihi) / (1000 * 60 * 60 * 24))
  if (gunFarki <= 30) return '0-30'
  if (gunFarki <= 60) return '31-60'
  if (gunFarki <= 90) return '61-90'
  return '90+'
}

// Tek bir öğrenci/grup için: sözleşmeler + aylık kalem borçları + ödemeler
// verilince, VADESİ GEÇMİŞ tüm kalemleri ({kalem, vade, kalanTutar}) tek
// listede döner. Hiç vadesi geçmiş borç yoksa null döner.
export function ogrenciBorcYaslandirmaHesapla(sozlesmeler, aylikBorclar, odemeler, bugun = new Date()) {
  const kalemler = []

  for (const s of sozlesmeler) {
    const taksitler = taksitPlaniOlustur(s, odemeler)
    for (const t of taksitler) {
      if (t.kalanTutar > 0.01 && t.vade < bugun) {
        kalemler.push({ kalem: s.kalem, vade: t.vade, kalanTutar: t.kalanTutar })
      }
    }
  }

  const gruplu = aylikBorclariKalemAyaGoreGrupla(aylikBorclar)
  for (const g of gruplu) {
    const d = aylikBorcDurumHesapla(g, aylikBorclar, odemeler)
    if (d.kalanTutar <= 0.01) continue
    // Bu borcun vadesi, ait olduğu ayın BİTİŞİ (bir sonraki ayın 1'i) —
    // aylikBorcDurumHesapla'daki "gecikti" eşiğiyle birebir aynı kural.
    const vade = new Date(g.donem)
    vade.setMonth(vade.getMonth() + 1)
    if (vade < bugun) {
      kalemler.push({ kalem: g.kalem, vade, kalanTutar: d.kalanTutar })
    }
  }

  if (kalemler.length === 0) return null

  const enEskiVade = kalemler.reduce((min, k) => (k.vade < min ? k.vade : min), kalemler[0].vade)
  const toplamKalan = kalemler.reduce((t, k) => t + k.kalanTutar, 0)

  return { kalemler, toplamKalan, enEskiVade, kova: yasKovasiHesapla(enEskiVade, bugun) }
}

// ============================================================================
// TEK ÖĞRENCİ İÇİN EKSTRE VERİSİ (fetch) — Ekstre.jsx sayfasının kendi
// useEffect'indeki veri çekme mantığının AYNISI (fatura ortağı grubu, bire
// bir ders dökümü, kantin alış dökümü, ödeme geçmişi dahil), ama Toplu
// Ekstre'nin sayfayı hiç açmadan, "PDF ile Gönder" butonuna tıklandığında
// TEK SEFERLİK çekebilmesi için ayrıca dışa açılmış hali. Ekstre.jsx kendi
// başına çalışmaya devam ediyor, bu fonksiyona bağımlı DEĞİL — kod
// tekrarı var ama ikisi ayrı ayrı test edilip doğrulanmış akışlar,
// birbirini bozma riski almamak için bilerek ayrı tutuldu.
// ============================================================================
export async function ekstreVerisiGetir(supabase, ogrenciId, seciliAy) {
  const { data: kendisi } = await supabase.from('ogrenciler').select('*').eq('id', ogrenciId).single()
  if (!kendisi) return null

  const efektifId = kendisi.fatura_sahibi_id || kendisi.id
  const { data: grupOgrencileriVeri } = await supabase
    .from('ogrenciler')
    .select('*')
    .or(`id.eq.${efektifId},fatura_sahibi_id.eq.${efektifId}`)
  const grupOgrencileri = grupOgrencileriVeri || []
  const grup = grupOgrencileri.map((g) => g.id)

  const [s, a, od, bba, ekDersler, kantin] = await Promise.all([
    supabase.from('sozlesmeler').select('*').in('ogrenci_id', grup),
    supabase.from('aylik_borclar').select('*').in('ogrenci_id', grup),
    supabase.from('odemeler').select('*, ogrenciler(ad_soyad)').in('ogrenci_id', grup).order('tarih', { ascending: false }),
    supabase
      .from('bire_bir_atamalari')
      .select('*, profiles:ogretmen_profile_id(ad_soyad, brans), ogrenciler(ad_soyad)')
      .in('ogrenci_id', grup),
    supabase
      .from('bire_bir_yoklama')
      .select('*, profiles:ogretmen_profile_id(ad_soyad, brans), ogrenciler(ad_soyad)')
      .in('ogrenci_id', grup)
      .is('atama_id', null),
    supabase.from('kantin_alislar').select('*').in('ogrenci_id', grup),
  ])

  const atamalar = bba.data || []
  const atamaIdleri = atamalar.map((x) => x.id)
  const by =
    atamaIdleri.length > 0
      ? await supabase.from('bire_bir_yoklama').select('*, ogrenciler(ad_soyad)').in('atama_id', atamaIdleri)
      : { data: [] }
  const tumYoklamalar = [...(by.data || []), ...(ekDersler.data || [])]
  const bireBirBorclar = bireBirBorclariOlustur(atamalar, tumYoklamalar)
  const kantinBorclar = kantinBorclariOlustur(kantin.data || [])
  const aylikBorclar = [...(a.data || []), ...bireBirBorclar, ...kantinBorclar]
  const sozlesmeler = s.data || []
  // Veli, "Devreden Ödeme" (sisteme geçmeden önceki eski ödeme) kayıtlarını
  // Ekstre.jsx'te görmüyor — PDF de aynı görünürlük kuralına uysun diye
  // burada da filtreleniyor.
  const odemeler = (od.data || []).filter((o) => !o.kalem?.includes('Devreden'))
  // Borç hesaplarına devreden ödemeler YİNE DE dahil olmalı (yukarıdaki
  // filtre sadece GÖRÜNÜR listeyi etkiler) — bu yüzden hesaplama için ayrı,
  // filtresiz listeyi kullanıyoruz.
  const odemelerHesapIcin = od.data || []

  const satirlar = ogrenciSatirlariHesapla(sozlesmeler, aylikBorclar, odemelerHesapIcin, seciliAy)
  const buAyToplam = satirlar.reduce((t, x) => t + x.buAyTutar, 0)
  const gecmisBorcToplam = satirlar.reduce((t, x) => t + x.gecmisBorc, 0)
  const buAyOdenmesiGereken = satirlar.reduce((t, x) => t + x.toplamOdenecek, 0)

  const toplamSozlesme = sozlesmeler.reduce((t, x) => t + Number(x.toplam_tutar), 0)
  const toplamAylikBorc = aylikBorclar.reduce((t, x) => t + Number(x.tutar), 0)
  const toplamOdenen = odemelerHesapIcin.reduce((t, x) => t + Number(x.tutar), 0)
  const genelKalanBakiye = Math.max(0, toplamSozlesme + toplamAylikBorc - toplamOdenen)

  const faturaDigerleri = grupOgrencileri.filter((o) => o.id !== kendisi.id)
  const bireBirDersleri = bireBirDersDetaylariOlustur(atamalar, tumYoklamalar)
  const kantinAlislari = (kantin.data || [])
    .map((k) => ({
      id: k.id,
      tarih: k.tarih,
      urunAdi: k.urun_adi,
      adet: k.adet,
      birimFiyat: Number(k.birim_fiyat) || 0,
      tutar: Number(k.tutar) || 0,
    }))
    .sort((x, y) => (x.tarih < y.tarih ? 1 : -1))

  return {
    ogrenci: kendisi,
    ogrenciAdi: kendisi.ad_soyad,
    seciliAy,
    satirlar,
    buAyToplam,
    gecmisBorcToplam,
    buAyOdenmesiGereken,
    genelKalanBakiye,
    bireBirDersleri,
    kantinAlislari,
    faturaDigerleri,
    odemeler,
  }
}

// ============================================================================
// SON ALINAN ÖDEMELER — LİSTEYİ GRUP SINIRINDA KES — Muhasebe.jsx ve
// Dashboard.jsx'teki "Son Alınan Ödemeler" panelleri kullanır. "Dağıtılmamış"
// bir ödeme sonradan birden fazla kaleme bölündüğünde (bkz. Muhasebe.jsx
// OdemeDagitForm), AYNI öğrencinin AYNI günkü tek bir işlemi birden fazla
// satıra (ör. Bire Bir + Kitap) ayrılmış olur. Listeyi düz "en fazla N satır"
// diye kessek, bu satırlar ortadan bölünüp o öğrencinin o günkü işleminin
// yarısı görünmez hâle gelebilir. Bunun yerine: en az minSayisi satır
// göster, ama minSayisi'e ulaştıktan sonra bile, aynı öğrenci+aynı gün
// grubunun geri kalanı bitene kadar eklemeye devam et (grup sınırında kes).
// "data" ZATEN tarih DESC + created_at DESC sıralı gelmeli (Supabase
// sorgusundaki sıralamayla aynı) — bu fonksiyon sırayı değiştirmez, sadece
// nereye kadar göstereceğine karar verir.
// ============================================================================
export function sonOdemeleriGrupSiniriylaKes(data, minSayisi) {
  const grupAnahtari = (o) => `${o.ogrenci_id}|${(o.tarih || '').slice(0, 10)}`
  const sonuc = []
  for (const satir of data || []) {
    if (sonuc.length >= minSayisi) {
      if (sonuc.length > 0 && grupAnahtari(satir) === grupAnahtari(sonuc[sonuc.length - 1])) {
        sonuc.push(satir)
        continue
      }
      break
    }
    sonuc.push(satir)
  }
  return sonuc
}
