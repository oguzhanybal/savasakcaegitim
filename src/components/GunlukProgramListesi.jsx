import { useEffect, useMemo, useRef, useState } from 'react'
import { DERS_PERIYOTLARI } from '../lib/dersPeriyotlari'
import { saatGoster } from '../lib/saatFormat'
import { useBugununTarihi } from '../lib/bugununTarihi'

// DersProgrami.jsx'in "Günlük Program Listesi" sekmesinde kullanılan,
// salt-okunur görünüm — ayrı bir dosyaya çıkarılmış paylaşılan bileşen
// (kod tekrarını önlemek için). Bir ara ayrı bir sayfaya (/gunluk) da
// taşınmıştı ama kullanıcı vazgeçip eski sekme haline dönmeyi tercih etti.

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

function saatKisalt(s) {
  return s ? s.slice(0, 5) : s
}

function araliklarCakisiyorMu(b1, s1, b2, s2) {
  return saatKisalt(b1) < saatKisalt(s2) && saatKisalt(b2) < saatKisalt(s1)
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
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

function tarihStrYerel(isoStr) {
  if (!isoStr) return null
  const d = new Date(isoStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// DersProgrami.jsx'teki "Ders Ekleme Aracı" sekmesindeki musaitlikIcinProgram
// ile AYNI mantık (kod tekrarı olsa da, iki dosya arasında ayrı state/import
// zincirine girmemek için burada da bağımsız tutuluyor): "ders_programi"
// satırları belirli bir TARİHE değil haftanın GÜNÜNE bağlı şablonlar olduğu
// için, salt "aktif=true" filtresi seçilen tarihi hiç hesaba katmıyordu — bir
// sınıf dersi yakın zamanda başka bir öğretmene devredildiğinde (eski satır
// pasif_tarihi ile pasife çekilir, yeni satır baslangic_tarihi ile aktif
// eklenir) GEÇMİŞ bir tarih seçilince bile hep BUGÜNKÜ (güncel) öğretmen
// görünüyordu — bu da "12 Ağustos'ta Gülem hocanın dersi Yücel hocada
// görünüyor" hatasının kaynağıydı. Bu fonksiyon, seçilen tarihte GERÇEKTEN
// geçerli olan satırları (o tarihte aktif olanı, eski/yeni ayrımı gözetmeden)
// seçer — musaitlikTarihi yerine bu bileşenin kendi "tarih" state'iyle.
function tarihIcinAktifProgram(programTum, tarih) {
  const bugun = yerelBugunTarihi()
  return (programTum || []).filter((d) => {
    if (d.aktif !== false) {
      const esasTarih = d.baslangic_tarihi || tarihStrYerel(d.created_at)
      return !esasTarih || esasTarih <= tarih
    }
    if (!d.pasif_tarihi || tarih > d.pasif_tarihi) return false
    if (tarih === d.pasif_tarihi && tarih === bugun) return false
    return true
  })
}

export default function GunlukProgramListesi({ program, programTum, ogretmenler, atamalar, yoklamalar, ogrenciAdMap }) {
  // Sayfa açık bırakılıp gece yarısı geçildiğinde, hâlâ "bugün"e bakılıyorsa
  // (kullanıcı elle başka bir tarihe geçmediyse) gösterilen tarih otomatik
  // yeni güne ilerlesin diye — bkz. lib/bugununTarihi.js (kullanıcı isteğiyle
  // eklendi: sayfa açık kalınca hep önceki günü göstermeye devam ediyordu).
  const bugununTarihi = useBugununTarihi()
  const oncekiBugunRef = useRef(bugununTarihi)
  const [tarih, setTarih] = useState(bugununTarihi)
  useEffect(() => {
    if (bugununTarihi !== oncekiBugunRef.current) {
      setTarih((mevcut) => (mevcut === oncekiBugunRef.current ? bugununTarihi : mevcut))
      oncekiBugunRef.current = bugununTarihi
    }
  }, [bugununTarihi])
  const gun = gunNumaraTarihten(tarih)
  // Mobilde 14 sütunu kaydırmadan, okunaklı göstermek mümkün olmadığı için
  // günü ÜÇE bölüyoruz: sabah (09:00–13:25), erken öğleden sonra (14:15–18:40)
  // ve akşam (18:50–22:20). Önceden iki parçaya bölünüyordu (5+9 sütun) ama
  // 9 sütunluk kısımda hücreler o kadar daralıyordu ki kısa bir isim bile
  // ("Tural" gibi) bazen sığıp bazen "Tu..." diye kesiliyordu — üçe bölünce
  // en kalabalık parça 5 sütuna iniyor, isimler tutarlı şekilde sığıyor.
  // Masaüstünde bu ayrım kullanılmaz, tüm gün tek tabloda görünür.
  //
  // Varsayılan sekme, sayfa AÇILDIĞI ANDAKİ saate göre otomatik seçilir —
  // kullanıcı günün hangi bölümündeyse muhtemelen onu görmek istiyordur diye.
  const [mobilYariGun, setMobilYariGun] = useState(() => {
    const saat = new Date().getHours()
    if (saat < 14) return 'sabah'
    if (saat < 19) return 'ogle1'
    return 'ogle2'
  })

  // Seçilen TARİH için o an geçerli olan ders_programi satırları — sadece
  // "program" (aktif=true) DEĞİL, çünkü o her zaman BUGÜNKÜ güncel durumu
  // yansıtıyor. Bir sınıf dersi yakın zamanda başka bir öğretmene devredildiyse,
  // geçmiş bir tarih seçildiğinde o tarihte GERÇEKTEN kim ders veriyorduysa o
  // görünmeli (bkz. tarihIcinAktifProgram). programTum yoksa (örn. eski bir
  // kullanım yeri unutulmuşsa) program'a geri düşer.
  const gununProgrami = useMemo(
    () => tarihIcinAktifProgram(programTum || program, tarih),
    [programTum, program, tarih]
  )

  // O günün TÜM olaylarını (sınıf dersi + haftalık bire bir + tek seferlik
  // bire bir) tek listede topluyoruz.
  const gununOlaylari = useMemo(() => {
    const olaylar = []
    for (const d of gununProgrami) {
      if (d.gun !== gun || !d.ogretmen_profile_id) continue
      olaylar.push({
        ogretmenId: d.ogretmen_profile_id,
        baslangic: saatKisalt(d.baslangic_saat),
        bitis: saatKisalt(d.bitis_saat),
        // Hangi sınıfa girdiği asıl bilinmek istenen — branş/ders adı zaten
        // öğretmenden belli oluyor, o yüzden önce sınıf adı gösteriliyor.
        etiket: d.sinif_adi || d.ders_adi || 'Sınıf dersi',
        altEtiket: d.ders_adi,
        tur: 'sinif',
        renk: 'bg-blue-200 text-blue-900 border-l-4 border-l-blue-600',
      })
    }
    for (const a of atamalar || []) {
      if (!a.aktif || a.gun !== gun || !a.ogretmen_profile_id) continue
      olaylar.push({
        ogretmenId: a.ogretmen_profile_id,
        baslangic: saatKisalt(a.baslangic_saat),
        bitis: saatKisalt(a.bitis_saat),
        etiket: a.ogrenci_adi || 'Bire bir',
        altEtiket: null,
        tur: 'birebir',
        renk: 'bg-orange-200 text-orange-900 border-l-4 border-l-orange-600',
      })
    }
    for (const y of yoklamalar || []) {
      if (y.atama_id || y.tarih !== tarih || !y.baslangic_saat || !y.bitis_saat || !y.ogretmen_profile_id) continue
      if (y.durum === 'gelmedi') continue // öğrenci gelmediyse o saat artık boş sayılır
      // Soru Çözümü: öğrenciye bağlı olmadığı için ogrenciAdMap'te karşılığı
      // yok — MusaitlikTablosu.jsx'teki aynı düzeltmeyle tutarlı olsun diye
      // burada da ayrı etiket + renk (mor) kullanılıyor, "Bire bir" değil.
      const soruCozumuMu = y.tur === 'soru_cozumu'
      olaylar.push({
        ogretmenId: y.ogretmen_profile_id,
        baslangic: saatKisalt(y.baslangic_saat),
        bitis: saatKisalt(y.bitis_saat),
        etiket: soruCozumuMu ? 'Soru Çözümü' : (ogrenciAdMap && ogrenciAdMap.get(y.ogrenci_id)) || 'Bire bir',
        altEtiket: null,
        tur: soruCozumuMu ? 'soru_cozumu' : 'birebir',
        renk: soruCozumuMu
          ? 'bg-purple-200 text-purple-900 border-l-4 border-l-purple-600'
          : 'bg-orange-200 text-orange-900 border-l-4 border-l-orange-600',
      })
    }
    return olaylar
  }, [gununProgrami, atamalar, yoklamalar, gun, tarih, ogrenciAdMap])

  // Saat sütunları: artık o günün olaylarından türetilen değişken sınırlar
  // DEĞİL, okulun sabit ders periyotları (45dk ders + 10dk teneffüs, bkz.
  // dersPeriyotlari.js) — Müsaitlik Tablosu ile aynı sütun yapısı.
  const dilimler = DERS_PERIYOTLARI
  // 5+5+4 olarak üçe bölünüyor — sadece mobil görünümde kullanılır (bkz. mobilYariGun).
  const sabahDilimleri = DERS_PERIYOTLARI.slice(0, 5)
  const ogle1Dilimleri = DERS_PERIYOTLARI.slice(5, 10)
  const ogle2Dilimleri = DERS_PERIYOTLARI.slice(10)
  const mobilDilimler =
    mobilYariGun === 'sabah' ? sabahDilimleri : mobilYariGun === 'ogle1' ? ogle1Dilimleri : ogle2Dilimleri

  // Sadece o gün en az bir olayı (dersi) olan öğretmenler gösterilir.
  const gorunecekOgretmenler = useMemo(() => {
    const mesgulIdler = new Set(gununOlaylari.map((o) => o.ogretmenId))
    return ogretmenler.filter((o) => mesgulIdler.has(o.id))
  }, [ogretmenler, gununOlaylari])

  function hucreDurumu(ogretmenId, dilim) {
    return gununOlaylari.find(
      (o) => o.ogretmenId === ogretmenId && araliklarCakisiyorMu(dilim.baslangic, dilim.bitis, o.baslangic, o.bitis)
    )
  }

  // kaynakDilimler opsiyonel: verilmezse tüm gün (masaüstü tablosu), verilirse
  // sadece o alt küme (mobildeki sabah/öğleden sonra yarısı) için hücreleri
  // birleştirir — böylece öğle arasının iki yakası asla birbirine karışmaz.
  function satirHucreleriniOlustur(ogretmenId, kaynakDilimler = dilimler) {
    const hucreler = []
    let i = 0
    while (i < kaynakDilimler.length) {
      const dilim = kaynakDilimler[i]
      const dolu = hucreDurumu(ogretmenId, dilim)
      let span = 1
      if (dolu) {
        while (i + span < kaynakDilimler.length && hucreDurumu(ogretmenId, kaynakDilimler[i + span]) === dolu) {
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
          <h2 className="font-semibold text-gray-700">Günlük Program Listesi</h2>
          <p className="text-xs text-gray-400 mt-0.5">O gün dersi olan öğretmenler — kiminle, kaçta. Dersi olmayan öğretmenler görünmez.</p>
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
      {/* Masaüstünde (md ve üzeri) geniş tablo — yatay dilimler. Mobilde bu
          tablo 14 sütun yüzünden yana kaydırma gerektirdiği için gizlenir,
          yerine aşağıdaki dikey/kart görünüm gösterilir (bkz. md:hidden blok). */}
      <div className="hidden md:block overflow-x-auto" style={{ touchAction: 'pan-x pan-y' }}>
        <table className="border-collapse text-xs w-full">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-navy text-white px-3 py-2 text-left font-semibold min-w-[150px]">
                Öğretmen
              </th>
              {dilimler.map((d) => (
                <th key={d.baslangic} className="bg-navy text-white px-1 py-2 font-medium border-l border-white/10 min-w-[70px]">
                  {saatGoster(d.baslangic)}–{saatGoster(d.bitis)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gorunecekOgretmenler.map((o, i) => {
              const hucreler = satirHucreleriniOlustur(o.id)
              return (
                <tr key={o.id} className={i % 2 ? 'bg-gray-50/60' : ''}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-semibold text-gray-700 border-t border-gray-100 whitespace-nowrap">
                    {o.ad_soyad}
                    {o.brans && <span className="block text-[10px] font-normal text-gray-400">{o.brans}</span>}
                  </td>
                  {hucreler.map((h) => (
                    <td
                      key={h.baslangic}
                      colSpan={h.span}
                      title={h.dolu ? `${h.dolu.etiket}${h.dolu.altEtiket ? ' — ' + h.dolu.altEtiket : ''}` : ''}
                      className={`border-t border-l border-gray-100 text-center align-middle py-1 ${h.dolu ? h.dolu.renk : ''}`}
                    >
                      {h.dolu && (
                        // Sadece BAŞLICA bilgi gösteriliyor: sınıf dersiyse sınıf adı, bire
                        // birse öğrenci adı — branş/"Bire bir" gibi ikinci bir satır artık
                        // tekrar yazılmıyor (renk zaten hangisi olduğunu ayırt ediyor, tam
                        // detay hücreye dokununca/basılı tutunca çıkan başlıkta duruyor).
                        <span className="leading-none block px-0.5">
                          <span className="block truncate text-[11px] font-semibold">{h.dolu.etiket}</span>
                          {/* Ders, sabit periyot ızgarasına TAM oturmayan (ör. elle
                              periyot dışı bir saate girilmiş, ya da birden fazla
                              periyotu kaplayan) bir saatteyse, sütun başlığındaki
                              saatle karışmasın diye gerçek başlangıç–bitiş burada da
                              gösterilir — MusaitlikTablosu'ndaki aynı çözüm. */}
                          {(saatKisalt(h.dolu.baslangic) !== h.baslangic || saatKisalt(h.dolu.bitis) !== h.bitis) && (
                            <span className="block text-[9px] opacity-70 whitespace-nowrap font-normal">
                              {saatGoster(h.dolu.baslangic)}–{saatGoster(h.dolu.bitis)}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
            {gorunecekOgretmenler.length === 0 && (
              <tr>
                <td colSpan={dilimler.length + 1} className="px-4 py-4 text-center text-gray-400">
                  Bu tarihte dersi olan öğretmen bulunamadı.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobilde (md altı): masaüstündeki AYNI tablo mantığı, ama tüm 14 sütunu
          kaydırmadan sığdırmak okunaksız olacağı için gün ikiye bölünür (bkz.
          mobilYariGun) — her yarıda 5-9 sütun, kaydırma gerekmeden okunaklı sığar. */}
      <div className="md:hidden">
        <div className="flex border-b border-gray-100 text-xs">
          <button
            type="button"
            onClick={() => setMobilYariGun('sabah')}
            className={`flex-1 py-2 font-medium transition-colors ${mobilYariGun === 'sabah' ? 'bg-navy text-white' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            {saatGoster(sabahDilimleri[0].baslangic)}–{saatGoster(sabahDilimleri[sabahDilimleri.length - 1].bitis)}
          </button>
          <button
            type="button"
            onClick={() => setMobilYariGun('ogle1')}
            className={`flex-1 py-2 font-medium transition-colors ${mobilYariGun === 'ogle1' ? 'bg-navy text-white' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            {saatGoster(ogle1Dilimleri[0].baslangic)}–{saatGoster(ogle1Dilimleri[ogle1Dilimleri.length - 1].bitis)}
          </button>
          <button
            type="button"
            onClick={() => setMobilYariGun('ogle2')}
            className={`flex-1 py-2 font-medium transition-colors ${mobilYariGun === 'ogle2' ? 'bg-navy text-white' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            {saatGoster(ogle2Dilimleri[0].baslangic)}–{saatGoster(ogle2Dilimleri[ogle2Dilimleri.length - 1].bitis)}
          </button>
        </div>
        <table className="border-collapse text-[9px] w-full table-fixed">
          <thead>
            <tr>
              <th className="bg-navy text-white px-1 py-1.5 text-left font-semibold w-14">Öğr.</th>
              {mobilDilimler.map((d) => (
                <th key={d.baslangic} className="bg-navy text-white px-0.5 py-1.5 font-medium border-l border-white/10 leading-tight">
                  {saatGoster(d.baslangic)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gorunecekOgretmenler.map((o, i) => {
              const hucreler = satirHucreleriniOlustur(o.id, mobilDilimler)
              return (
                <tr key={o.id} className={i % 2 ? 'bg-gray-50/60' : ''}>
                  <td className="px-1 py-1 font-semibold text-gray-700 border-t border-gray-100 break-words leading-tight">
                    {o.ad_soyad}
                  </td>
                  {hucreler.map((h) => (
                    <td
                      key={h.baslangic}
                      colSpan={h.span}
                      title={h.dolu ? `${h.dolu.etiket}${h.dolu.altEtiket ? ' — ' + h.dolu.altEtiket : ''}` : ''}
                      className={`border-t border-l border-gray-100 text-center align-top py-1 leading-tight ${h.dolu ? h.dolu.renk : ''}`}
                    >
                      {h.dolu && (
                        // Gün artık 3 sekmeye bölündüğü için (en kalabalık sekmede 5 sütun,
                        // eskiden 9'du) her sütun için yaklaşık iki katı yer var — ad soyad
                        // artık tam gösterilebiliyor. Yine de aşırı uzun bir isim/soyisim
                        // gelirse diye truncate (tek satır, ...ile kesme) güvenlik amaçlı
                        // kalıyor; aynı isimde birden fazla kişi olduğunda soyadın hep
                        // görünmesi önemli olduğu için artık ilk isimle sınırlamıyoruz.
                        <span className="block truncate px-0.5">
                          {h.dolu.etiket}
                          {/* Masaüstündeki aynı mantık: periyot ızgarasına tam oturmayan
                              bir saatteyse gerçek saat burada da (küçük) gösterilir. */}
                          {(saatKisalt(h.dolu.baslangic) !== h.baslangic || saatKisalt(h.dolu.bitis) !== h.bitis) && (
                            <span className="block text-[8px] opacity-70 whitespace-nowrap font-normal">
                              {saatGoster(h.dolu.baslangic)}–{saatGoster(h.dolu.bitis)}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
            {gorunecekOgretmenler.length === 0 && (
              <tr>
                <td colSpan={mobilDilimler.length + 1} className="px-4 py-4 text-center text-gray-400">
                  Bu tarihte dersi olan öğretmen bulunamadı.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
