import { useMemo, useState } from 'react'
import { saatGoster } from '../lib/saatFormat'

// DersProgrami.jsx'in "Yönetici" bölümüne eklenen yeni sekme — kullanıcı
// isteğiyle: "Günlük Müsaitlik" (bir günde tüm öğretmenlerin durumu) tek
// başına yeterli değildi, bir SINIFIN ya da bir ÖĞRETMENİN bütün haftalık
// programını TEK YERDE (gün gün tıklamadan) görebilmek isteniyordu. Bu
// bileşen, sınıf veya öğretmen seçilince o kişinin/sınıfın Pazartesi-
// Cumartesi arası tüm ders saatlerini saat satırı × gün sütunu şeklinde
// gösteren salt-okunur bir tablo. Günlük Müsaitlik'e (hücreye tıklayıp ders
// ekleme) DOKUNULMADI, o olduğu gibi duruyor — bu sadece ayrı, ek bir
// GÖRÜNTÜLEME aracı.
//
// BİRE BİR DERSLER — kullanıcı isteğiyle: önce bire_bir_atamalari (haftalık
// TEKRAR EDEN atama) tablosundan besleniyordu, ama kullanıcı bunun gerçek
// kullanımı yansıtmadığını belirtti: "her hafta değişiyor, bu hafta olanları
// görelim, gelecek hafta da gelecek hafta olanları". Yani bire bir dersler
// çoğunlukla haftalık sabit bir ATAMA değil, her hafta ayrı ayrı GİRİLEN,
// TARİHLİ kayıtlar (bire_bir_yoklama). Bu yüzden öğretmen görünümü artık bir
// HAFTA SEÇİCİ (◀ Bu Hafta ▶) içeriyor: seçili haftanın Pazartesi-Cumartesi
// tarihlerine denk gelen bire_bir_yoklama kayıtları gösteriliyor. Yine de
// GERÇEKTEN haftalık tekrar eden bir atama varsa (aktif=true) o da aynı
// haftaya YANSITILIYOR — ama sadece o slot için o haftaya ait tarihli bir
// kayıt YOKSA (aksi halde aynı ders iki kez görünürdü).

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

function saatKisalt(s) {
  return s ? s.slice(0, 5) : s
}

function yerelTarih(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Verilen tarihin ait olduğu haftanın PAZARTESİ'sini döner.
function haftaninPazartesisi(tarih) {
  const d = new Date(tarih)
  const gun = d.getDay() // 0=Pazar, 1=Pazartesi, ..., 6=Cumartesi
  const fark = gun === 0 ? -6 : 1 - gun
  d.setDate(d.getDate() + fark)
  return d
}

function tarihKisaGoster(tarihStr) {
  return new Date(tarihStr + 'T12:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'long' })
}

function tarihStrYerel(isoStr) {
  if (!isoStr) return null
  const d = new Date(isoStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function yerelBugunTarihi() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// GunlukProgramListesi.jsx'teki AYNI ADLI fonksiyonla BİREBİR aynı mantık —
// kod tekrarı bilerek yapıldı (dosyalar arasında bağımsız tutuluyor, bkz.
// oradaki uzun açıklama). Seçilen TARİHTE, her slot (sınıf+gün+saat) için
// GERÇEKTEN geçerli olan ders_programi satırını (eski/yeni öğretmen devri
// gözetilerek en yenisini) seçer — sadece "aktif=true" satırlara değil,
// pasif (devredilmiş/silinmiş) satırlara da bakarak.
function tarihIcinAktifProgram(programTum, tarih) {
  const bugun = yerelBugunTarihi()
  const gruplar = new Map() // sınıf+gün+saat -> satır dizisi
  for (const d of programTum || []) {
    const anahtar = `${d.sinif_id || d.id}|${d.gun}|${d.baslangic_saat}-${d.bitis_saat}`
    if (!gruplar.has(anahtar)) gruplar.set(anahtar, [])
    gruplar.get(anahtar).push(d)
  }
  const sonuc = []
  for (const satirlar of gruplar.values()) {
    let enYeni = null
    let enYeniEsasTarih = null
    for (const d of satirlar) {
      const esasTarih = d.baslangic_tarihi || tarihStrYerel(d.created_at)
      if (esasTarih && esasTarih > tarih) continue
      if (d.aktif === false) {
        if (!d.pasif_tarihi || tarih > d.pasif_tarihi) continue
        if (tarih === d.pasif_tarihi && tarih === bugun) continue
      }
      const karsilastirma = `${esasTarih || ''}T${d.created_at || ''}`
      const enYeniKarsilastirma =
        enYeniEsasTarih !== null ? `${enYeniEsasTarih || ''}T${enYeni.created_at || ''}` : null
      if (!enYeni || karsilastirma > enYeniKarsilastirma) {
        enYeni = d
        enYeniEsasTarih = esasTarih
      }
    }
    if (enYeni) sonuc.push(enYeni)
  }
  return sonuc
}

// ÖNEMLİ DÜZELTME — kullanıcı bildirimi: "öğretmenlere bakıyoruz ya o
// sağdaki geçmiş haftaları seçtiğimde program saçmalıyor şu anki programa
// göre sonuç çıkarıyor". Önceden bu bileşen, öğretmen görünümünde ◀/▶ ile
// başka bir hafta seçilse bile SINIF DERSLERİ kısmında hep "program" (canlı/
// güncel aktif satırlar) kullanıyordu — hafta seçici sadece Bire Bir kısmını
// etkiliyordu, sınıf dersleri hiç değişmiyordu. Artık seçilen HAFTANIN her
// günü (Pazartesi-Cumartesi) kendi GERÇEK takvim tarihine
// (haftaGunTarihleri[gun-1]) göre AYRI AYRI yeniden kuruluyor — bir öğretmen
// devri hafta İÇİNDE gerçekleşmiş olsa bile (ör. Çarşamba'dan itibaren yeni
// program başladıysa) Pazartesi/Salı eski, Çarşamba-Cumartesi yeni öğretmeni
// doğru gösterir. GunlukProgramListesi'nin gün gün yaptığının haftalık toplu
// hali.
function haftaIcinSinifDersleri(programTum, haftaGunTarihleri) {
  const sonuc = []
  for (let gun = 1; gun <= 6; gun++) {
    const tarih = haftaGunTarihleri[gun - 1]
    if (!tarih) continue
    const oGuninProgrami = tarihIcinAktifProgram(programTum, tarih).filter((d) => d.gun === gun)
    sonuc.push(...oGuninProgrami)

    // BOŞLUK YEDEĞİ — GunlukProgramListesi.jsx'teki AYNI mantık: o tarihte
    // hiçbir tarihsel satır bir slotu (sınıf+saat) kapsamıyorsa (ör. bir
    // düzenleme sırasında araya kısa bir boşluk girdiyse) ama o sınıf o
    // tarihte zaten kurulmuşsa, o slot için GÜNCEL (şu an aktif) satırı
    // yedek olarak gösteriyoruz — dersin haftalık görünümden tamamen
    // kaybolmasındansa.
    const kapsananlar = new Set(oGuninProgrami.filter((d) => d.sinif_id).map((d) => `${d.sinif_id}|${saatKisalt(d.baslangic_saat)}`))
    const gecmisteVarOlanSiniflar = new Set(
      (programTum || [])
        .filter((d) => {
          const esasTarih = d.baslangic_tarihi || tarihStrYerel(d.created_at)
          return !esasTarih || esasTarih <= tarih
        })
        .map((d) => d.sinif_id)
    )
    const guncelYedek = (programTum || [])
      .filter((d) => d.aktif !== false)
      .filter(
        (d) =>
          d.sinif_id &&
          d.gun === gun &&
          !kapsananlar.has(`${d.sinif_id}|${saatKisalt(d.baslangic_saat)}`) &&
          gecmisteVarOlanSiniflar.has(d.sinif_id)
      )
    sonuc.push(...guncelYedek)
  }
  return sonuc
}

export default function HaftalikProgramGoruntule({ program, programTum, siniflar, ogretmenler, atamalar, bireBirYoklamalar, ogrenciler }) {
  const [tip, setTip] = useState('sinif') // 'sinif' | 'ogretmen'
  const [seciliId, setSeciliId] = useState('')
  // Sadece öğretmen görünümünde anlamlı — 0: bu hafta, 1: gelecek hafta,
  // -1: geçen hafta vb. Sınıf/öğretmen değişince veya tip değişince şaşırtıcı
  // olmasın diye sıfırlanıyor.
  const [haftaOfset, setHaftaOfset] = useState(0)

  const haftaGunTarihleri = useMemo(() => {
    const pazartesi = haftaninPazartesisi(new Date())
    pazartesi.setDate(pazartesi.getDate() + haftaOfset * 7)
    return [0, 1, 2, 3, 4, 5].map((i) => {
      const d = new Date(pazartesi)
      d.setDate(d.getDate() + i)
      return yerelTarih(d)
    })
  }, [haftaOfset])

  function ogrenciAdi(ogrenciId) {
    return ogrenciler?.find((o) => o.id === ogrenciId)?.ad_soyad || 'Öğrenci'
  }

  // Öğretmen seçiliyken, sınıf derslerinin yanına o öğretmenin seçili
  // HAFTAYA ait bire bir derslerini de ekliyoruz (bkz. yukarıdaki not).
  const filtreliDersler = useMemo(() => {
    if (!seciliId) return []
    // Sınıf görünümünde hafta seçici zaten yok (her zaman güncel/canlı
    // programı gösterir, önceki davranış aynen korunuyor) — sadece öğretmen
    // görünümünde, seçilen HAFTAYA göre tarihsel olarak yeniden kuruluyor
    // (bkz. haftaIcinSinifDersleri üstündeki not).
    const sinifDersleri =
      tip === 'sinif'
        ? (program || []).filter((d) => d.sinif_id === seciliId)
        : haftaIcinSinifDersleri(programTum || program, haftaGunTarihleri).filter(
            (d) => d.ogretmen_profile_id === seciliId
          )
    if (tip !== 'ogretmen') return sinifDersleri

    const tarihliBireBir = (bireBirYoklamalar || [])
      .filter((y) => y.ogretmen_profile_id === seciliId && haftaGunTarihleri.includes(y.tarih))
      .map((y) => ({
        id: `bby-${y.id}`,
        gun: haftaGunTarihleri.indexOf(y.tarih) + 1,
        baslangic_saat: y.baslangic_saat,
        ders_adi: y.ogrenci_id ? ogrenciAdi(y.ogrenci_id) : y.tur === 'soru_cozumu' ? 'Soru Çözümü' : 'Bire Bir',
        sinif_adi: 'Bire Bir',
      }))
    // Aynı gün+saat için zaten tarihli bir kayıt varsa, altta o SLOT için
    // haftalık atamayı ikinci kez göstermeyelim (kullanıcı isteğiyle
    // eklenen "GERÇEKTEN alınmış olan öncelikli" deseni — GecmisYoklama.jsx
    // ve BugunkuYoklamaDurumu'ndaki AYNI mantık).
    const doluSlotlar = new Set(tarihliBireBir.map((d) => `${d.gun}|${saatKisalt(d.baslangic_saat)}`))
    const atamaBireBir = (atamalar || [])
      .filter((a) => a.ogretmen_profile_id === seciliId && a.aktif !== false)
      .filter((a) => !doluSlotlar.has(`${a.gun}|${saatKisalt(a.baslangic_saat)}`))
      .map((a) => ({
        id: `bba-${a.id}`,
        gun: a.gun,
        baslangic_saat: a.baslangic_saat,
        ders_adi: a.ogrenci_adi || 'Öğrenci',
        sinif_adi: 'Bire Bir',
      }))
    return [...sinifDersleri, ...tarihliBireBir, ...atamaBireBir]
  }, [program, programTum, atamalar, bireBirYoklamalar, ogrenciler, tip, seciliId, haftaGunTarihleri])

  const gunlereGore = useMemo(
    () =>
      GUNLER.map((_, gun) =>
        filtreliDersler
          .filter((d) => d.gun === gun)
          .sort((a, b) => (a.baslangic_saat || '').localeCompare(b.baslangic_saat || ''))
      ).slice(1),
    [filtreliDersler]
  )

  // ÖNEMLİ DÜZELTME: önceden BÜTÜN filtreliDersler'deki saatler satır olarak
  // listeleniyordu — gün numarası ne olursa olsun (kullanıcı bildirimi: bir
  // sınıfta hiçbir sütunda karşılığı olmayan, baştan sona BOŞ bir saat satırı
  // görünüyordu, ör. "10.00"). Sebebi: tablo sadece Pazartesi-Cumartesi (gun
  // 1-6) sütunlarını gösteriyor, ama bir ders satırının gün numarası bu
  // aralığın dışındaysa (ör. hatalı/silinmemiş bir veri satırı Pazar/gun=7
  // olarak kayıtlıysa) o satırın saati yine de listeye giriyor, hiçbir
  // sütunda karşılığı olmadığı için tamamen boş bir satır olarak görünüyordu.
  // Artık sadece GERÇEKTEN gösterilen 6 güne (1-6) ait saatler satır oluyor.
  const saatSatirlari = useMemo(
    () =>
      [...new Set(filtreliDersler.filter((d) => d.gun >= 1 && d.gun <= 6).map((d) => saatKisalt(d.baslangic_saat)))].sort(),
    [filtreliDersler]
  )

  const secilenAd =
    tip === 'sinif'
      ? siniflar.find((s) => s.id === seciliId)?.ad
      : ogretmenler.find((o) => o.id === seciliId)?.ad_soyad

  // ÖZET — kullanıcı isteğiyle eklendi: bir sınıf seçildiğinde "hangi
  // öğretmen hangi derse haftada kaç kez giriyor", bir öğretmen seçildiğinde
  // "hangi sınıfa haftada kaç kez giriyor" özetini tek bakışta gösteren
  // küçük bir tablo. Aynı haftalık ızgaradaki (filtreliDersler) satırlar
  // "karşı taraf" (sınıf seçiliyse öğretmen, öğretmen seçiliyse sınıf) +
  // ders adına göre gruplanıp sayılıyor — ızgaradaki hücrelerle birebir
  // aynı veriden türediği için ekstra bir sorgu gerekmiyor.
  const ozet = useMemo(() => {
    if (!seciliId || filtreliDersler.length === 0) return []
    const gruplar = new Map() // "karşıTaraf|ders" -> {karsiTaraf, ders, sayi}
    for (const d of filtreliDersler) {
      const karsiTaraf = (tip === 'sinif' ? d.ogretmen_adi : d.sinif_adi) || 'Atanmamış'
      const ders = d.ders_adi || 'Ders'
      const anahtar = `${karsiTaraf}|${ders}`
      if (!gruplar.has(anahtar)) gruplar.set(anahtar, { karsiTaraf, ders, sayi: 0 })
      gruplar.get(anahtar).sayi += 1
    }
    // Öğretmen görünümünde "karşı taraf" gerçek bir sınıf olabileceği gibi
    // "Bire Bir" de olabilir (bkz. filtreliDersler) — kullanıcı isteğiyle,
    // alfabetik sıraya bakılmaksızın önce SINIF dersleri, en altta Bire Bir
    // satırları gösteriliyor.
    return [...gruplar.values()].sort((a, b) => {
      const aBireBir = a.karsiTaraf === 'Bire Bir' ? 1 : 0
      const bBireBir = b.karsiTaraf === 'Bire Bir' ? 1 : 0
      if (aBireBir !== bBireBir) return aBireBir - bBireBir
      return a.karsiTaraf.localeCompare(b.karsiTaraf, 'tr') || b.sayi - a.sayi || a.ders.localeCompare(b.ders, 'tr')
    })
  }, [filtreliDersler, tip, seciliId])
  const ozetToplam = ozet.reduce((t, o) => t + o.sayi, 0)

  function hucreDersleri(gun, saat) {
    return (gunlereGore[gun - 1] || []).filter((d) => saatKisalt(d.baslangic_saat) === saat)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
      <p className="font-semibold text-gray-700 mb-1">Haftalık Program Görüntüle</p>
      <p className="text-xs text-gray-500 mb-3">
        Bir sınıf ya da öğretmen seçin, o sınıfın/öğretmenin bütün haftalık ders programını tek tabloda görün.
      </p>
      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div className="flex bg-gray-50 border border-gray-200 rounded-lg overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => {
              setTip('sinif')
              setSeciliId('')
              setHaftaOfset(0)
            }}
            className={`px-3 py-1.5 font-medium transition-colors ${
              tip === 'sinif' ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Sınıf
          </button>
          <button
            type="button"
            onClick={() => {
              setTip('ogretmen')
              setSeciliId('')
              setHaftaOfset(0)
            }}
            className={`px-3 py-1.5 font-medium transition-colors ${
              tip === 'ogretmen' ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Öğretmen
          </button>
        </div>
        <div className="min-w-[220px]">
          <select
            value={seciliId}
            onChange={(e) => setSeciliId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            <option value="">{tip === 'sinif' ? 'Sınıf seçiniz...' : 'Öğretmen seçiniz...'}</option>
            {tip === 'sinif'
              ? siniflar.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.ad}
                  </option>
                ))
              : ogretmenler.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.brans ? `${o.ad_soyad} — ${o.brans}` : o.ad_soyad}
                  </option>
                ))}
          </select>
        </div>

        {tip === 'ogretmen' && seciliId && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setHaftaOfset((h) => h - 1)}
              className="px-2 py-1.5 rounded-lg text-sm bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              title="Önceki hafta"
            >
              ◀
            </button>
            <span className="text-sm text-gray-600 font-medium whitespace-nowrap px-1">
              {haftaOfset === 0 ? 'Bu Hafta' : haftaOfset === 1 ? 'Gelecek Hafta' : haftaOfset === -1 ? 'Geçen Hafta' : null}
              {Math.abs(haftaOfset) <= 1 ? (
                <span className="text-gray-400 font-normal"> ({tarihKisaGoster(haftaGunTarihleri[0])} – {tarihKisaGoster(haftaGunTarihleri[5])})</span>
              ) : (
                <>{tarihKisaGoster(haftaGunTarihleri[0])} – {tarihKisaGoster(haftaGunTarihleri[5])}</>
              )}
            </span>
            <button
              type="button"
              onClick={() => setHaftaOfset((h) => h + 1)}
              className="px-2 py-1.5 rounded-lg text-sm bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              title="Sonraki hafta"
            >
              ▶
            </button>
            {haftaOfset !== 0 && (
              <button
                type="button"
                onClick={() => setHaftaOfset(0)}
                className="text-xs text-blue hover:underline ml-1"
              >
                Bu haftaya dön
              </button>
            )}
          </div>
        )}
      </div>

      {!seciliId && <p className="text-gray-400 text-sm">Yukarıdan bir {tip === 'sinif' ? 'sınıf' : 'öğretmen'} seçin.</p>}

      {seciliId && filtreliDersler.length === 0 && (
        <p className="text-gray-400 text-sm">
          {secilenAd || 'Seçilen'} için {tip === 'ogretmen' ? 'bu haftaya ait' : 'programlanmış'} ders bulunamadı.
        </p>
      )}

      {seciliId && filtreliDersler.length > 0 && (
        <div className="overflow-x-auto touch-pan-x touch-pan-y mb-5">
          <table className="w-full text-sm border-collapse min-w-[720px]">
            <thead>
              <tr>
                <th className="text-left px-2 py-2 border-b border-gray-100 text-gray-500 font-medium whitespace-nowrap">Saat</th>
                {GUNLER.slice(1, 7).map((g) => (
                  <th key={g} className="text-left px-2 py-2 border-b border-gray-100 text-gray-500 font-medium">
                    {g}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {saatSatirlari.map((saat) => (
                <tr key={saat} className="border-b border-gray-50">
                  <td className="px-2 py-2 text-gray-400 whitespace-nowrap align-top">{saatGoster(saat)}</td>
                  {[1, 2, 3, 4, 5, 6].map((gun) => {
                    const dersler = hucreDersleri(gun, saat)
                    return (
                      <td key={gun} className="px-2 py-2 align-top">
                        {dersler.length === 0 ? (
                          <span className="text-gray-200">—</span>
                        ) : (
                          dersler.map((d) => (
                            <div key={d.id} className="mb-1.5 last:mb-0">
                              <p className="font-medium text-gray-800 leading-tight">{d.ders_adi || 'Ders'}</p>
                              <p className="text-xs text-gray-400 leading-tight">
                                {tip === 'sinif' ? d.ogretmen_adi : d.sinif_adi}
                              </p>
                            </div>
                          ))
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {seciliId && ozet.length > 0 && (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
          <p className="text-xs font-semibold text-gray-500 mb-2">
            {tip === 'sinif'
              ? `${secilenAd || 'Bu sınıf'} — öğretmen/ders bazında haftalık ders sayısı`
              : `${secilenAd || 'Bu öğretmen'} — sınıf/ders bazında haftalık ders sayısı`}
          </p>
          {/* ÖNEMLİ DÜZELTME 2: bir önceki denemede sayı satırın SAĞ UCUNA
              (justify-between ile) sabitleniyordu — kullanıcı bildirimi: bu
              da, kutu geniş olduğunda (mobilde bile) yazı kısa kalınca yine
              yazıyla sayı arasında büyük bir boşluk bırakıyordu. Artık sayı
              sağa değil, yazının HEMEN ARDINDAN aynı akışta (normal metin
              gibi) geliyor — kutu ne kadar geniş olursa olsun, aradaki
              mesafe hep aynı küçük boşluk (bir boşluk karakteri) kadar
              kalıyor. */}
          <div className="divide-y divide-white">
            {ozet.map((o) => (
              <p key={`${o.karsiTaraf}|${o.ders}`} className="py-1.5 text-sm text-gray-700">
                <span className="font-medium">{o.karsiTaraf}</span>
                <span className="text-gray-400"> — {o.ders}: </span>
                <span className="font-semibold">{o.sayi} ders</span>
              </p>
            ))}
            <p className="pt-2 text-sm font-semibold text-gray-800">Toplam: {ozetToplam} ders</p>
          </div>
        </div>
      )}
    </div>
  )
}
