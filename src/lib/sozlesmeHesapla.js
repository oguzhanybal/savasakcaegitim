// Sozlesme.jsx'in (tek bir sözleşmeyi görüntüleme/yazdırma sayfası) ve
// Muhasebe.jsx'in (WhatsApp'tan Gönder — bkz. sozlesmeWhatsappGonder) AYNI
// sözleşme verisini AYNI şekilde hesaplaması gerekiyor; mantığın iki yerde
// ayrı ayrı yazılıp zamanla birbirinden sapması riskini önlemek için tek bir
// yerde topladık. Sozlesme.jsx sadece bu fonksiyonu çağırıp sonucu JSX'e
// (SozlesmeSayfalari bileşenine) geçiriyor.
import { taksitPlaniOlustur } from './ekstreHesap'

export function tarihFormat(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('tr-TR')
}

// { sozlesme, ogrenci, sinifAdi, bireBirVarMi, kitapSozlesme, kitapDahilMi, veliSecimi } al,
// sözleşme sayfalarının (ve WhatsApp'a giden PDF'in) ihtiyaç duyduğu TÜM
// türetilmiş değerleri döndürür. Sozlesme.jsx'teki ORİJİNAL hesaplamanın
// birebir aynısı — sadece bir bileşenin gövdesinden bağımsız bir fonksiyona
// taşındı.
export function sozlesmeVerisiHazirla({ sozlesme, ogrenci, sinifAdi, bireBirVarMi, kitapSozlesme, kitapDahilMi, veliSecimi }) {
  const kursTaksitler = taksitPlaniOlustur(sozlesme, [])
  const toplamTutar = Number(sozlesme.toplam_tutar) || 0
  const finalSinif = sozlesme.sinif_metni || sinifAdi || (bireBirVarMi ? 'Bire Bir' : '—')
  const sozlesmeTarihiMetni = tarihFormat(sozlesme.sozlesme_tarihi || sozlesme.created_at?.slice(0, 10))
  const egitimDonemi = sozlesme.egitim_donemi || '—'
  // Hem anne hem baba bilgisi kayıtlıysa (interaktif sayfada) kullanıcıya
  // sorulur; seçim yoksa/tek taraf varsa öncelik: baba → anne → bağlı veli
  // hesabı. Öğrencinin kendi telefonu iletişim bilgisi olarak asla kullanılmaz.
  const ikiVeliVar = !!(ogrenci.anne_adi_soyadi && ogrenci.baba_adi_soyadi)
  let veliAdSoyad = ''
  let iletisim = ''
  if (ikiVeliVar && veliSecimi === 'anne') {
    veliAdSoyad = ogrenci.anne_adi_soyadi
    iletisim = ogrenci.anne_telefon || ''
  } else if (ikiVeliVar) {
    veliAdSoyad = ogrenci.baba_adi_soyadi
    iletisim = ogrenci.baba_telefon || ''
  } else {
    veliAdSoyad = ogrenci.baba_adi_soyadi || ogrenci.anne_adi_soyadi || ogrenci.veli?.ad_soyad || ''
    iletisim = ogrenci.baba_adi_soyadi
      ? (ogrenci.baba_telefon || '')
      : ogrenci.anne_adi_soyadi
        ? (ogrenci.anne_telefon || '')
        : (ogrenci.veli?.telefon || '')
  }

  // Kitap sözleşmesi dahil edilsin mi? — sadece kitapSozlesme bulunduğunda VE
  // kitapDahilMi === true olduğunda true olur (null/false ile aynı sonuç:
  // dahil edilmez — WhatsApp'tan otomatik gönderimde admin'e sorulamadığı
  // için kasıtlı olarak "dahil etme" varsayılıyor, interaktif sayfada
  // olduğu gibi admin ayrıca "Evet, Dahil Et" demeden birleştirilmiyor).
  const kitapDahil = kitapDahilMi === true && !!kitapSozlesme
  const kitapTaksitler = kitapDahil ? taksitPlaniOlustur(kitapSozlesme, []) : []
  const kitapTutari = kitapDahil ? Number(kitapSozlesme.toplam_tutar) || 0 : 0

  const taksitler = [
    ...kursTaksitler.map((t) => ({ ...t, kaynak: 'kurs', toplamSayi: sozlesme.taksit_sayisi })),
    ...kitapTaksitler.map((t) => ({ ...t, kaynak: 'kitap', toplamSayi: kitapSozlesme?.taksit_sayisi })),
  ].sort((a, b) => a.vade - b.vade)

  const yayinBedeli = kitapDahil ? kitapTutari : sozlesme.kalem === 'Kitap' ? toplamTutar : null
  const egitimBedeli = sozlesme.kalem === 'Kurs' || sozlesme.kalem === 'Okul' ? toplamTutar : null
  const genelToplam = toplamTutar + kitapTutari

  return {
    toplamTutar,
    finalSinif,
    sozlesmeTarihiMetni,
    egitimDonemi,
    ikiVeliVar,
    veliAdSoyad,
    iletisim,
    kitapDahil,
    kitapTutari,
    taksitler,
    yayinBedeli,
    egitimBedeli,
    genelToplam,
  }
}
