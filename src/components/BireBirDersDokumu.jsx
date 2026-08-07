import { useEffect, useMemo, useState } from 'react'
import { paraFormat, haftaBaslangici, haftaEtiketi, ayBaslangici, ayEtiketi } from '../lib/ekstreHesap'
import { saatGoster } from '../lib/saatFormat'

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

// Bir dersin 'tur' alanına göre (bkz. ekstreHesap.js: bireBirDersDetaylariOlustur
// 'ders'/'soru_cozumu', sinifDersDetaylariOlustur 'sinif' üretir) gösterilecek
// rozet metnini ve rengini döner — Öğretmen Ekstresi gibi birden fazla ders
// türünün AYNI tabloda karıştığı sayfalarda "bu satır hangi tür ders"
// sorusunu tek bakışta cevaplasın diye (bkz. turGoster).
function turBilgisi(tur) {
  if (tur === 'sinif') return { text: 'Sınıf Dersi', className: 'bg-blue-100 text-blue-700' }
  if (tur === 'soru_cozumu') return { text: 'Soru Çözümü', className: 'bg-purple-100 text-purple-700' }
  return { text: 'Bire Bir', className: 'bg-gray-100 text-gray-600' }
}

function gunNumaraTarihten(tarihStr) {
  const g = new Date(tarihStr + 'T12:00:00').getDay()
  return g === 0 ? 7 : g
}

// Bugünün tarihini "YYYY-MM-DD" olarak YEREL saate göre üretir (toISOString
// KULLANMIYORUZ — Türkiye UTC+3 gece yarısına yakın saatlerde bir gün geriye kayabiliyor).
function yerelBugunTarihi() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// Bir kişinin (öğrenci ya da öğretmen) tüm bire bir derslerini haftalık ya da
// aylık gruplar halinde, yazdırılabilir/PDF alınabilir bir tablo olarak
// gösterir. Hem Ekstre.jsx (öğrenci ekstresi) hem OgretmenEkstre.jsx (öğretmen
// ekstresi) bu bileşeni ortak kullanıyor — aynı mantık, sadece "karşı taraf"ın
// kim olduğu (öğretmen mi öğrenci mi) değişiyor.
//
// dersler: [{ id, tarih, baslangicSaat, bitisSaat, karsiTarafAdi, tutar, tur? }]
// hedefDonem (opsiyonel): "YYYY-MM-01" formatında bir ay başlangıcı — verilirse
// (ör. Ekstre.jsx'teki üstteki "Dönem" seçicisiyle senkron kalsın diye) bu
// bileşen İLK AÇILIŞTA ve hedefDonem her değiştiğinde otomatik o aya atlar.
// Kullanıcı yine de Haftalık/Aylık butonları ya da dönem seçici ile İSTEDİĞİ
// ANDA elle farklı bir döneme geçebilir — hedefDonem sadece "varsayılan/senkron"
// değeri belirler, kilitlemez.
//
// ikinciTarafBasligi (opsiyonel): verilirse tabloya İKİNCİ bir kişi sütunu daha
// eklenir (ör. GenelBireBirEkstre.jsx'te hem "Öğrenci" hem "Öğretmen" aynı anda
// görünsün diye — herkesin bir arada olduğu, kişiye göre AYRILMAMIŞ genel bir
// dökümde ikisi de gerekiyor). O durumda her ders öğesinde ayrıca
// ikinciTarafAdi (ve opsiyonel ikinciTarafBransi) alanları beklenir.
export default function BireBirDersDokumu({
  dersler,
  karsiTarafBasligi,
  baslangicPeriyot = 'ay',
  hedefDonem = null,
  ikinciTarafBasligi = null,
}) {
  const [periyot, setPeriyot] = useState(hedefDonem ? 'ay' : baslangicPeriyot) // 'hafta' | 'ay' | 'hepsi'
  const [gosterilenSayisi, setGosterilenSayisi] = useState(6)

  // Dersler arasında Bire Bir dışında (Soru Çözümü / Sınıf Dersi gibi) FARKLI
  // türler de varsa (ör. Öğretmen Ekstresi'nde hepsi aynı tabloda karışık
  // görünüyor) tabloya ayrı bir "Tür" sütunu ekliyoruz — yoksa (ör. sade bir
  // öğrenci ekstresinde hepsi zaten Bire Bir'se) gereksiz yere sütun eklemiyoruz.
  const turGoster = useMemo(
    () => (dersler || []).some((d) => d.tur === 'sinif' || d.tur === 'soru_cozumu'),
    [dersler]
  )

  // İçinde bulunduğumuz haftanın/ayın anahtarını döner — AMA sadece o dönemde
  // gerçekten ders varsa (yoksa boş döner, en yeni dönemlerden sayfalanmış
  // listeye düşülür). Sayfa ilk açıldığında ve Haftalık/Aylık geçişte bu dönem
  // otomatik seçili gelsin diye.
  function icindeBulunulanDonem(periyotDegeri) {
    const anahtarUret = periyotDegeri === 'ay' ? ayBaslangici : haftaBaslangici
    const hedef = anahtarUret(yerelBugunTarihi())
    return dersler.some((d) => anahtarUret(d.tarih) === hedef) ? hedef : ''
  }

  // Boşsa en yeni dönemlerden sayfalanmış liste; doluysa (içinde bulunulan
  // dönem ya da elle seçilen) sadece o tek dönem gösterilir. hedefDonem
  // verilmişse "içinde bulunulan dönem" bugünün ayı değil, dışarıdan gelen
  // hedef ay olur.
  const [seciliDonem, setSeciliDonem] = useState(() => {
    if (hedefDonem) return dersler.some((d) => ayBaslangici(d.tarih) === hedefDonem) ? hedefDonem : ''
    return icindeBulunulanDonem(baslangicPeriyot)
  })

  // hedefDonem sonradan değişirse (ör. Ekstre.jsx'te üstteki "Dönem" inputu
  // değiştirildiyse) aşağıdaki dökümü de otomatik o aya taşı.
  useEffect(() => {
    if (!hedefDonem) return
    setPeriyot('ay')
    setGosterilenSayisi(6)
    setSeciliDonem(dersler.some((d) => ayBaslangici(d.tarih) === hedefDonem) ? hedefDonem : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hedefDonem])

  // "Tüm Zamanlar" seçiliyse hafta/aya göre BÖLMEDEN, tüm dersleri tek bir
  // sahte grupta ("tumu") topluyoruz — böyle aynı tabloYaz/gosterilenGruplar
  // mekanizması hiç değişmeden tek tablo olarak render edilebiliyor.
  const tumGruplar = useMemo(() => {
    if (periyot === 'hepsi') {
      return dersler.length > 0 ? [['tumu', dersler]] : []
    }
    const anahtarUret = periyot === 'ay' ? ayBaslangici : haftaBaslangici
    const gruplar = dersler.reduce((acc, d) => {
      const anahtar = anahtarUret(d.tarih)
      if (!acc[anahtar]) acc[anahtar] = []
      acc[anahtar].push(d)
      return acc
    }, {})
    return Object.entries(gruplar).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [dersler, periyot])

  const gosterilenGruplar = seciliDonem
    ? tumGruplar.filter(([anahtar]) => anahtar === seciliDonem)
    : tumGruplar.slice(0, gosterilenSayisi)
  const etiketUret = periyot === 'ay' ? ayEtiketi : periyot === 'hepsi' ? () => 'Tüm Zamanlar' : haftaEtiketi

  // Şu an seçili gösterilen dönem, İÇİNDE BULUNDUĞUMUZ ay/hafta DEĞİLSE (ör.
  // bu ay/hafta için henüz hiç ders kaydı yoksa, otomatik olarak kayıt
  // bulunan EN SON döneme düşülür) — bunu sessizce yapmak kafa karıştırıcı
  // oluyordu ("neden hep geçen ay görünüyor?"). Bu yüzden bu durumda üstte
  // açıkça hangi dönemin neden gösterildiğini belirten kısa bir not veriyoruz.
  const guncelDonemAnahtari = periyot === 'hepsi' ? null : (periyot === 'ay' ? ayBaslangici : haftaBaslangici)(yerelBugunTarihi())
  const gosterilenDonemGuncelDegil =
    periyot !== 'hepsi' && !!seciliDonem && !!guncelDonemAnahtari && seciliDonem !== guncelDonemAnahtari

  if (dersler.length === 0) {
    return <p className="text-sm text-gray-400">Kayıtlı ders bulunamadı.</p>
  }

  return (
    <div>
      {/* Yazdırma/PDF: sadece TEK BİR SATIRIN ortadan bölünmesini engelliyoruz
          (tr, break-inside:avoid). Ay/hafta başlığı ile altındaki uzun tabloyu
          (onlarca satır olabilir, tek sayfaya asla sığmaz) TÜMÜYLE bölünmez
          işaretlemek büyük bir hataydı — tarayıcı o zaman koca bloğu bir
          sonraki sayfaya itiyor, o da sığmayınca başlığı yalnız bırakıp tabloyu
          bir sayfa daha sonraya itiyordu; sonuç 1-2 neredeyse bomboş sayfa
          oluyordu. Bunun yerine sadece başlığın hemen altındaki içerikten
          KOPARILMASINI (break-after: avoid) engelliyoruz — başlık artık tek
          başına sayfa sonunda kalmıyor ama koca tablo gerektiği yerde sayfalar
          arasında doğal olarak bölünebiliyor. */}
      <style>{`
        @media print {
          tr { break-inside: avoid; page-break-inside: avoid; }
          .bire-bir-donem-baslik { break-after: avoid; page-break-after: avoid; }
        }
      `}</style>
      <div className="no-print flex gap-1.5 mb-3 items-center flex-wrap">
        <button
          type="button"
          onClick={() => { setPeriyot('hafta'); setGosterilenSayisi(6); setSeciliDonem(icindeBulunulanDonem('hafta')) }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            periyot === 'hafta' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
          }`}
        >
          Haftalık
        </button>
        <button
          type="button"
          onClick={() => { setPeriyot('ay'); setGosterilenSayisi(6); setSeciliDonem(icindeBulunulanDonem('ay')) }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            periyot === 'ay' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
          }`}
        >
          Aylık
        </button>
        <button
          type="button"
          onClick={() => { setPeriyot('hepsi'); setGosterilenSayisi(6); setSeciliDonem('tumu') }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            periyot === 'hepsi' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
          }`}
        >
          Tüm Zamanlar
        </button>
        {/* "Tüm Zamanlar"da tek grup olduğu için (haftalık/aylık gibi aralarında
            seçim yapılacak birden fazla dönem yok) dönem seçici anlamsız —
            sadece hafta/ay modunda gösteriliyor. */}
        {periyot !== 'hepsi' && (
          <select
            value={seciliDonem}
            onChange={(e) => setSeciliDonem(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue"
          >
            <option value="">{periyot === 'ay' ? 'Bir ay seç...' : 'Bir hafta seç...'}</option>
            {tumGruplar.map(([anahtar]) => (
              <option key={anahtar} value={anahtar}>{etiketUret(anahtar)}</option>
            ))}
          </select>
        )}
      </div>

      {gosterilenDonemGuncelDegil && (
        <p className="no-print text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
          İçinde bulunduğumuz {periyot === 'ay' ? 'ay' : 'hafta'} olan{' '}
          <b className="capitalize">{etiketUret(guncelDonemAnahtari)}</b> için henüz kayıt yok — bu yüzden kayıt
          bulunan en son dönem olan <b className="capitalize">{etiketUret(seciliDonem)}</b> gösteriliyor.
        </p>
      )}

      {gosterilenGruplar.map(([anahtar, grupDersleri]) => {
        const grupToplami = grupDersleri.reduce((t, d) => t + d.tutar, 0)
        // Belirli bir HAFTA seçiliyse, o haftayı tek tabloda değil gün gün
        // (Pazartesi, Salı...) ayrı ayrı gösteriyoruz.
        const gunGunMu = periyot === 'hafta' && seciliDonem === anahtar
        const gunGruplari = gunGunMu
          ? Object.entries(
              grupDersleri.reduce((acc, d) => {
                if (!acc[d.tarih]) acc[d.tarih] = []
                acc[d.tarih].push(d)
                return acc
              }, {})
            ).sort((a, b) => (a[0] < b[0] ? -1 : 1))
          : null

        const sutunSayisi = (ikinciTarafBasligi ? 5 : 4) + (turGoster ? 1 : 0)

        const tabloYaz = (dersListesi, toplam) => (
          <table className="w-full text-xs sm:text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-navy text-white text-left">
                <th className="px-2 sm:px-3 py-2 font-semibold">Tarih</th>
                <th className="px-2 sm:px-3 py-2 font-semibold">Saat</th>
                <th className="px-2 sm:px-3 py-2 font-semibold">{karsiTarafBasligi}</th>
                {ikinciTarafBasligi && <th className="px-2 sm:px-3 py-2 font-semibold">{ikinciTarafBasligi}</th>}
                {turGoster && <th className="px-2 sm:px-3 py-2 font-semibold">Tür</th>}
                <th className="px-2 sm:px-3 py-2 font-semibold text-right">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {dersListesi.map((d, i) => (
                <tr key={d.id} className={i % 2 ? 'bg-gray-50' : ''}>
                  <td className="px-2 sm:px-3 py-2">{new Date(d.tarih + 'T12:00:00').toLocaleDateString('tr-TR')}</td>
                  <td className="px-2 sm:px-3 py-2 text-gray-500">
                    {d.baslangicSaat ? `${saatGoster(d.baslangicSaat)}${d.bitisSaat ? '–' + saatGoster(d.bitisSaat) : ''}` : '—'}
                  </td>
                  <td className="px-2 sm:px-3 py-2">
                    {d.karsiTarafAdi || '—'}
                    {d.karsiTarafBransi && <span className="text-gray-400"> ({d.karsiTarafBransi})</span>}
                  </td>
                  {ikinciTarafBasligi && (
                    <td className="px-2 sm:px-3 py-2">
                      {d.ikinciTarafAdi || '—'}
                      {d.ikinciTarafBransi && <span className="text-gray-400"> ({d.ikinciTarafBransi})</span>}
                    </td>
                  )}
                  {turGoster && (
                    <td className="px-2 sm:px-3 py-2">
                      <span
                        className={`inline-block text-[11px] sm:text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${turBilgisi(d.tur).className}`}
                      >
                        {turBilgisi(d.tur).text}
                      </span>
                    </td>
                  )}
                  <td className="px-2 sm:px-3 py-2 text-right font-medium">{paraFormat(d.tutar)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={sutunSayisi - 1} className="px-2 sm:px-3 py-2 text-right">Toplam</td>
                <td className="px-2 sm:px-3 py-2 text-right">{paraFormat(toplam)}</td>
              </tr>
            </tfoot>
          </table>
        )

        return (
          <div key={anahtar} className="mb-4">
            <div className="flex justify-between items-center mb-1 bire-bir-donem-baslik">
              <p className="font-semibold text-navy text-sm capitalize">{etiketUret(anahtar)}</p>
              <p className="text-xs text-gray-500">{grupDersleri.length} ders</p>
            </div>
            {gunGunMu ? (
              gunGruplari.map(([tarih, gunDersleri]) => (
                <div key={tarih} className="mb-3 last:mb-0">
                  <p className="text-sm font-bold text-white bg-navy rounded-lg px-3 py-1.5 mb-2 tracking-wide bire-bir-donem-baslik">
                    {GUNLER[gunNumaraTarihten(tarih)]} — {new Date(tarih + 'T12:00:00').toLocaleDateString('tr-TR')}
                  </p>
                  {tabloYaz(gunDersleri, gunDersleri.reduce((t, d) => t + d.tutar, 0))}
                </div>
              ))
            ) : (
              tabloYaz(grupDersleri, grupToplami)
            )}
          </div>
        )
      })}

      {/* "Tüm Zamanlar"da zaten tek grup var, geri dönülecek/sayfalanacak başka
          bir dönem yok — bu yüzden bu iki kontrol sadece hafta/ay modunda gösterilir. */}
      {periyot !== 'hepsi' && seciliDonem && (
        <button
          type="button"
          onClick={() => setSeciliDonem('')}
          className="no-print text-navy text-sm font-semibold underline hover:no-underline"
        >
          ← Tüm {periyot === 'ay' ? 'ayları' : 'haftaları'} listele
        </button>
      )}
      {periyot !== 'hepsi' && !seciliDonem && gosterilenGruplar.length < tumGruplar.length && (
        <button
          type="button"
          onClick={() => setGosterilenSayisi((n) => n + 6)}
          className="no-print text-navy text-sm font-semibold underline hover:no-underline"
        >
          Daha eski {periyot === 'ay' ? 'ayları' : 'haftaları'} göster ({tumGruplar.length - gosterilenGruplar.length} tane daha)
        </button>
      )}
    </div>
  )
}
