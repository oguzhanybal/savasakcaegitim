// Ekstre / Toplu Ekstre hesaplama motoru — Excel'deki "_HESAP_EKSTRE" ve
// "TOPLU EKSTRE" sayfalarındaki formüllerin JavaScript karşılığı.
// Hem Ekstre.jsx hem de TopluEkstre.jsx bu dosyayı kullanır (tek yerden yönetilsin diye).

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
  const taksitSayisi = Number(sozlesme.taksit_sayisi) || 0
  const toplamTutar = Number(sozlesme.toplam_tutar) || 0
  if (!sozlesme.ilk_taksit_tarihi || taksitSayisi <= 0) return null

  const ilkTarih = new Date(sozlesme.ilk_taksit_tarihi)
  const ilk = { yil: ilkTarih.getFullYear(), ay: ilkTarih.getMonth() + 1 }
  const hedef = ayEkle(seciliAy, 1) // vade ayı: seçili ay + 1 (Excel: EOMONTH(B4,1))
  const simdi = ayEkle(seciliAy, 0) // seçili ayın kendisi (Excel: EOMONTH(B4,0))

  const taksitTutari = toplamTutar / taksitSayisi

  const G = Math.max(0, Math.min(taksitSayisi, ayFarki(hedef, ilk) + 1))
  const H = Math.max(0, Math.min(taksitSayisi, ayFarki(simdi, ilk) + 1))

  const odenen = odemeToplamKalem(odemeler, sozlesme.kalem, hedef)

  const J = taksitTutari * G
  const L = taksitTutari * H
  const M = taksitTutari > 0 ? Math.min(taksitSayisi, Math.floor(odenen / taksitTutari)) : 0

  let vade = null
  if (G > 0) {
    const vadeAyIndex = G >= taksitSayisi ? taksitSayisi - 1 : G - 1
    vade = new Date(ilkTarih)
    vade.setMonth(vade.getMonth() + vadeAyIndex)
  }

  const kalanToplam = Math.max(0, J - odenen)
  // Veli, o ana kadar borçlanandan FAZLA ödeme yaptıysa (ör. taksitini önden
  // ya da fazladan ödediyse), bu fazlalık burada hesaplanır. Kümülatif
  // "J - odenen" karşılaştırması sayesinde bu fazlalık otomatik olarak bir
  // sonraki ayın taksitinden düşülür (ayrıca bir işlem gerekmez) — burada
  // sadece veli/yönetici görsün diye "+X Alacaklı" olarak da dışa veriyoruz.
  const fazlaOdeme = Math.max(0, odenen - J)
  const buAyTutar = Math.max(0, J - L)
  const gecmisBorc = Math.max(0, kalanToplam - buAyTutar)

  if (kalanToplam <= 0 && fazlaOdeme <= 0.01) return null

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
  const saatMetni = bitisSaat ? `${baslangicSaat}–${bitisSaat}` : baslangicSaat
  return (
    `Merhaba, ${ogrenciAdi} için ${tarihMetni} tarihinde saat ${saatMetni} arasında bire bir dersi bulunmaktadır` +
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
    .map((d) => `• ${d.bitisSaat ? `${d.baslangicSaat}–${d.bitisSaat}` : d.baslangicSaat}${d.dersAdi ? ` (${d.dersAdi})` : ''}`)
    .join('\n')
  const derslerMetni = dersler.length > 1 ? 'aşağıdaki bire bir dersler bulunmaktadır' : 'aşağıdaki bire bir ders bulunmaktadır'
  return (
    `${selamlamaSatiri(kimeGonderiliyor)}\n${ogrenciAdi} için ${tarihMetni} tarihinde ${derslerMetni}:\n` +
    `${satirlar}\n` +
    `İyi dersler dileriz.\nSavaş Akça Eğitim`
  )
}

// Öğrencinin HER HAFTA tekrar eden bire bir ders programını (gün + saat) tek
// mesajda özetler. dersler: [{ gunAdi, baslangicSaat, bitisSaat, dersAdi }]
// — haftanın gününe göre sıralı olmalı (Pazartesi'den başlayarak).
export function bireBirHaftalikOzetMesajiOlustur({ kimeGonderiliyor, ogrenciAdi, dersler }) {
  const satirlar = dersler
    .map((d) => `• ${d.gunAdi}: ${d.bitisSaat ? `${d.baslangicSaat}–${d.bitisSaat}` : d.baslangicSaat}${d.dersAdi ? ` (${d.dersAdi})` : ''}`)
    .join('\n')
  return (
    `${selamlamaSatiri(kimeGonderiliyor)}\n${ogrenciAdi} için haftalık bire bir ders programı şu şekildedir:\n` +
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
  const taksitSayisi = Number(sozlesme.taksit_sayisi) || 0
  const toplamTutar = Number(sozlesme.toplam_tutar) || 0
  if (!sozlesme.ilk_taksit_tarihi || taksitSayisi <= 0) return []

  const ilkTarih = new Date(sozlesme.ilk_taksit_tarihi)
  const taksitTutari = toplamTutar / taksitSayisi
  const bugun = new Date()

  // Bu kalem için bugüne kadar yapılmış TÜM ödemeler (devreden dahil, cutoff yok)
  const odenenToplam = odemeToplamKalem(odemeler, sozlesme.kalem, { yil: 9999, ay: 12 })

  const taksitler = []
  for (let n = 1; n <= taksitSayisi; n++) {
    const vade = new Date(ilkTarih)
    vade.setMonth(vade.getMonth() + (n - 1))
    const kumulatifOncekiGereken = taksitTutari * (n - 1)
    const kumulatifGereken = taksitTutari * n

    // Ödemeler kümülatif olarak sırayla taksitleri kapatır (önce en eski taksit).
    // Bu taksite düşen kısım: bir önceki taksitlere kadar olan borç tamamen
    // kapandıktan SONRA arta kalan ödeme, bu taksitin tutarını aşmayacak şekilde.
    // Kısmi ödeme yapıldıysa (ör. 22.000 taksitin sadece 10.000'i ödendiyse) bu
    // değer 10.000 çıkar ve kalanTutar 12.000 olur.
    const buTaksiteDusenOdenen = Math.min(
      Math.max(odenenToplam - kumulatifOncekiGereken, 0),
      taksitTutari
    )
    const kalanTutar = Math.max(taksitTutari - buTaksiteDusenOdenen, 0)

    let durum
    if (odenenToplam >= kumulatifGereken - 0.01) durum = 'odendi'
    else if (buTaksiteDusenOdenen > 0.01) durum = 'kismi'
    else if (vade < bugun) durum = 'gecikti'
    else durum = 'bekliyor'

    taksitler.push({ taksitNo: n, vade, tutar: taksitTutari, odenenTutar: buTaksiteDusenOdenen, kalanTutar, durum })
  }
  return taksitler
}

// Aylık kalem borçları (Bire Bir / Yemek / Kantin) için tek tek satır bazında
// durum hesaplar (ödendi / gecikti / bekliyor) — taksit yapısı olmadığı için
// kümülatif borç/ödeme karşılaştırması üzerinden gider.
export function aylikBorcDurumHesapla(borc, tumAylikBorclar, odemeler) {
  const kalemAdi = borc.kalem
  const borcTarihi = new Date(borc.donem)
  const bugun = new Date()

  const kumulatifBorc = tumAylikBorclar
    .filter((a) => a.kalem === kalemAdi)
    .filter((a) => new Date(a.donem) <= borcTarihi)
    .reduce((t, a) => t + Number(a.tutar), 0)

  const odenenToplam = odemeToplamKalem(odemeler, kalemAdi, { yil: 9999, ay: 12 })

  if (odenenToplam >= kumulatifBorc - 0.01) return 'odendi'

  // "Gecikti" sadece borcun ait olduğu AY geçtiyse (ör. Haziran borcu, Temmuz'a
  // girildiğinde) verilir — bu kalemler ay sonunda ekstre ile faturalandığı için,
  // içinde bulunduğumuz ayın borcu henüz "gecikmiş" sayılmaz, "bekliyor" kalır.
  const borcAyIndex = ayIndexOf({ yil: borcTarihi.getFullYear(), ay: borcTarihi.getMonth() + 1 })
  const simdiAyIndex = ayIndexOf({ yil: bugun.getFullYear(), ay: bugun.getMonth() + 1 })
  if (borcAyIndex < simdiAyIndex) return 'gecikti'
  return 'bekliyor'
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
      const ogrenciAdi = atama
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
        tutar: y.tutar != null ? Number(y.tutar) : Number(atama?.ders_ucreti) || 0,
        kaynak: y.atama_id ? 'Haftalık' : 'Tek Seferlik',
      }
    })
    .sort((a, b) => (a.tarih < b.tarih ? 1 : -1))
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
