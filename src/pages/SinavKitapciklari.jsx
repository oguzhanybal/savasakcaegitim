import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { ilkHarfleriBuyukYap, buyukIstisnalariDuzelt } from '../lib/adSoyadFormat'
import {
  pdfBelgesiAc,
  sayfayiGoruntuyeCevir,
  sayfadaSoruNumaralariniTespitEt,
  soruNumarasiWorkerOlustur,
  soruNumarasiWorkerKapat,
  girintiliAdaylariEle,
  sutunSiralaTahmini,
  ardisikDiziyeGoreFiltrele,
  baslangicKutulariUret,
} from '../lib/kitapcikOcr'

const DERS_ONERILERI = [
  'Türkçe', 'Matematik', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü',
  'Fizik', 'Kimya', 'Biyoloji', 'Sosyal Bilimler', 'Fen Bilimleri', 'Geometri',
]

// Sayfa üzerine soru kutularını çizen / kutu yeniden çizmeyi (mouse ile
// sürükle-bırak) yöneten katman. Koordinatlar her zaman sayfanın DOĞAL piksel
// boyutunda (canvas render boyutu) saklanır; ekranda ne kadar küçük/büyük
// gösterilirse gösterilsin, % tabanlı konumlandırma sayesinde eşleşme bozulmaz.
function KutuKatmani({ sayfaGoruntusu, sorularBuSayfada, seciliGeciciId, cizimModu, onCizimBitti, parcaKutusu }) {
  const containerRef = useRef(null)
  const [cizilen, setCizilen] = useState(null)

  function ekrandanDogalKoordinata(clientX, clientY) {
    const rect = containerRef.current.getBoundingClientRect()
    const oranX = sayfaGoruntusu.genislik / rect.width
    const oranY = sayfaGoruntusu.yukseklik / rect.height
    return { x: (clientX - rect.left) * oranX, y: (clientY - rect.top) * oranY }
  }

  // NOT: Sadece mouse (onMouseDown/Move/Up) olayları kullanılıyordu — bu,
  // masaüstünde çalışır ama tabletlerde kalemle (stylus/S-Pen/Apple Pencil)
  // çizim yapılamamasına sebep oluyordu, çünkü dokunma/kalem girişleri
  // tarayıcıda mouse olayı olarak DAVRANMAYABİLİR. Pointer Events API
  // (onPointerDown/Move/Up) fare, dokunma VE kalemi tek bir olay modelinde
  // birleştirir — üçü için de aynı şekilde çalışır.
  function pointerDown(e) {
    if (!cizimModu) return
    e.preventDefault()
    containerRef.current?.setPointerCapture?.(e.pointerId)
    const p = ekrandanDogalKoordinata(e.clientX, e.clientY)
    setCizilen({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  function pointerMove(e) {
    if (!cizimModu || !cizilen) return
    e.preventDefault()
    const p = ekrandanDogalKoordinata(e.clientX, e.clientY)
    setCizilen((c) => (c ? { ...c, x1: p.x, y1: p.y } : c))
  }
  function pointerUp(e) {
    if (!cizimModu || !cizilen) return
    containerRef.current?.releasePointerCapture?.(e.pointerId)
    const x = Math.min(cizilen.x0, cizilen.x1)
    const y = Math.min(cizilen.y0, cizilen.y1)
    const genislik = Math.abs(cizilen.x1 - cizilen.x0)
    const yukseklik = Math.abs(cizilen.y1 - cizilen.y0)
    setCizilen(null)
    if (genislik > 5 && yukseklik > 5) onCizimBitti({ x, y, genislik, yukseklik })
  }

  return (
    <div className="flex justify-center overflow-auto">
    <div
      ref={containerRef}
      className="relative inline-block select-none"
      style={{
        cursor: cizimModu ? 'crosshair' : 'default',
        // Çizim modundayken tarayıcının dokunma/kalem hareketini kaydırma
        // veya yakınlaştırma jesti olarak yorumlamasını engeller — aksi
        // halde tablette çizmeye çalışırken sayfa kayar.
        touchAction: cizimModu ? 'none' : 'auto',
      }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerLeave={() => setCizilen(null)}
      onPointerCancel={() => setCizilen(null)}
    >
      {cizimModu && (
        <div className="absolute inset-x-0 -top-11 z-10 bg-orange text-white text-sm font-semibold text-center py-2 rounded-lg shadow-md animate-pulse">
          👇 Aşağıdaki sayfada, sorunun SOL ÜST köşesine tıklayıp basılı tutarak SAĞ ALT köşesine kadar sürükle, sonra bırak.
        </div>
      )}
      <img
        src={sayfaGoruntusu.dataUrl}
        alt={`Sayfa ${sayfaGoruntusu.sayfaNo}`}
        className="max-h-[72vh] w-auto block rounded-lg border border-gray-200"
        draggable={false}
      />
      {sorularBuSayfada.map((s) => (
        <div
          key={s.gecici_id}
          className={`absolute border-2 pointer-events-none ${
            s.gecici_id === seciliGeciciId
              ? 'border-orange bg-orange/20'
              : s.ders_adi.trim()
              ? 'border-green-500 bg-green-500/10'
              : 'border-blue-400 bg-blue-400/10'
          }`}
          style={{
            left: `${(s.x / sayfaGoruntusu.genislik) * 100}%`,
            top: `${(s.y / sayfaGoruntusu.yukseklik) * 100}%`,
            width: `${(s.genislik / sayfaGoruntusu.genislik) * 100}%`,
            height: `${(s.yukseklik / sayfaGoruntusu.yukseklik) * 100}%`,
          }}
        >
          <span className="absolute -top-5 left-0 text-[10px] font-semibold bg-navy text-white px-1 rounded">
            {s.ders_adi || '?'} {s.soru_no}
          </span>
        </div>
      ))}
      {parcaKutusu && (
        <div
          className="absolute border-2 border-dashed border-purple-500 bg-purple-500/10 pointer-events-none"
          style={{
            left: `${(parcaKutusu.x / sayfaGoruntusu.genislik) * 100}%`,
            top: `${(parcaKutusu.y / sayfaGoruntusu.yukseklik) * 100}%`,
            width: `${(parcaKutusu.genislik / sayfaGoruntusu.genislik) * 100}%`,
            height: `${(parcaKutusu.yukseklik / sayfaGoruntusu.yukseklik) * 100}%`,
          }}
        >
          <span className="absolute -top-5 left-0 text-[10px] font-semibold bg-purple-600 text-white px-1 rounded">
            Ortak Parça
          </span>
        </div>
      )}
      {cizilen && (
        <div
          className="absolute border-2 border-orange bg-orange/20 pointer-events-none"
          style={{
            left: `${(Math.min(cizilen.x0, cizilen.x1) / sayfaGoruntusu.genislik) * 100}%`,
            top: `${(Math.min(cizilen.y0, cizilen.y1) / sayfaGoruntusu.yukseklik) * 100}%`,
            width: `${(Math.abs(cizilen.x1 - cizilen.x0) / sayfaGoruntusu.genislik) * 100}%`,
            height: `${(Math.abs(cizilen.y1 - cizilen.y0) / sayfaGoruntusu.yukseklik) * 100}%`,
          }}
        />
      )}
    </div>
    </div>
  )
}

// ============================================================================
// HIZLI ELLE İŞARETLEME — OCR'a hiç güvenmeden, admin her sorunun sadece SOL
// ÜST köşesine (soru numarasının olduğu yere) TEK TIKLAMA yapar, sürükleme
// YOK. Kutunun boyutu otomatik hesaplanır: genişlik, tıklanan noktanın sayfa
// sol/sağ yarısında olmasına göre (2 sütunlu düzen varsayımıyla) o sütunun
// kalan genişliği; yükseklik ise AYNI SÜTUNDAKİ bir SONRAKİ tıklamaya kadar
// olan mesafe (sütunda son soru ise sayfa altına kadar). Bu, karmaşık/eşit
// olmayan yükseklikte sorular (grafik, tablo, resim içeren AYT matematik
// soruları gibi) içeren kitapçıklarda OCR'dan çok daha güvenilir sonuç verir
// — çünkü admin zaten soruyu insan gözüyle görüp doğru yeri işaretliyor.
function NoktaIsaretlemeKatmani({ sayfaGoruntusu, buSayfadakiNoktalar, onNoktaEkle }) {
  const containerRef = useRef(null)

  function tiklandi(e) {
    const rect = containerRef.current.getBoundingClientRect()
    const oranX = sayfaGoruntusu.genislik / rect.width
    const oranY = sayfaGoruntusu.yukseklik / rect.height
    onNoktaEkle({ x: (e.clientX - rect.left) * oranX, y: (e.clientY - rect.top) * oranY })
  }

  return (
    <div className="flex justify-center overflow-auto">
    <div
      ref={containerRef}
      className="relative inline-block select-none"
      style={{ cursor: 'crosshair' }}
      onClick={tiklandi}
    >
      <img
        src={sayfaGoruntusu.dataUrl}
        alt={`Sayfa ${sayfaGoruntusu.sayfaNo}`}
        className="max-h-[72vh] w-auto block rounded-lg border border-gray-200"
        draggable={false}
      />
      {buSayfadakiNoktalar.map((n, i) => (
        <div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-orange text-white text-xs font-bold flex items-center justify-center border-2 border-white shadow pointer-events-none"
          style={{
            left: `${(n.x / sayfaGoruntusu.genislik) * 100}%`,
            top: `${(n.y / sayfaGoruntusu.yukseklik) * 100}%`,
          }}
        >
          {n.globalSira}
        </div>
      ))}
    </div>
    </div>
  )
}

// TYT'nin standart 120 soruluk ders/sayı/başlangıç no dağılımı — kullanıcı
// isteğiyle eklendi: sınav türü "TYT" ise Toplu Ders Ataması paneli bomboş
// gelmek yerine bu dağılımla dolu gelir, admin sadece istisnaları düzeltir
// (yine de her satırı elle değiştirebilir/silebilir/ekleyebilir).
// Türkçe Testi: Türkçe 40. Sosyal Bilimler Testi: Tarih 5, Coğrafya 5,
// Felsefe 5, Din Kültürü 5 (grup içinde kesintisiz 1-20). Matematik Testi:
// Matematik 40. Fen Bilimleri Testi: Fizik 7, Kimya 7, Biyoloji 6 (grup
// içinde kesintisiz 1-20). Toplam 120 soru.
const TYT_STANDART_BLOKLAR = [
  { id: 'tyt-1', ders: 'Türkçe', sayi: '40', baslangic: '1' },
  { id: 'tyt-2', ders: 'Tarih', sayi: '5', baslangic: '1' },
  { id: 'tyt-3', ders: 'Coğrafya', sayi: '5', baslangic: '6' },
  { id: 'tyt-4', ders: 'Felsefe', sayi: '5', baslangic: '11' },
  { id: 'tyt-5', ders: 'Din Kültürü', sayi: '5', baslangic: '16' },
  { id: 'tyt-6', ders: 'Matematik', sayi: '40', baslangic: '1' },
  { id: 'tyt-7', ders: 'Fizik', sayi: '7', baslangic: '1' },
  { id: 'tyt-8', ders: 'Kimya', sayi: '7', baslangic: '8' },
  { id: 'tyt-9', ders: 'Biyoloji', sayi: '6', baslangic: '15' },
]

// ============================================================================
// TOPLU DERS ATAMA — OCR'ın bulduğu soru kutuları (doğru sırada) hazır olunca,
// admin'in her birine TEK TEK ders adı + soru no yazması (100+ soru için
// saatler süren bir iş) yerine, sadece "hangi dersten kaç soru var" bilgisini
// (ör. Türkçe 40, Matematik 40, Fizik 14...) tek seferde girmesini sağlar.
// Sistem bunu, kutuların zaten doğru okuma sırasında olmasından yararlanarak,
// hepsine birden otomatik dağıtır. Admin'e sadece İSTİSNALARI (yanlış yerdeki
// birkaç kutu) tek tek düzeltmek kalır.
// ============================================================================
function TopluDersAtamaPaneli({ toplamSoru, onUygula, onVazgec, onGeriDon, baslangicBloklari }) {
  // Düzenleme modunda (mevcut bir kitapçık açılmışsa) baştan boş satırla
  // başlamak yerine, sorular dizisindeki HÂLİHAZIRDA atanmış ders adı/soru
  // no'lardan bloklar tahmin edilip buraya hazır gelir — admin sadece
  // yanlış olan birkaç bloğu düzeltir, hepsini yeniden yazmak zorunda kalmaz.
  const [bloklar, setBloklar] = useState(
    baslangicBloklari && baslangicBloklari.length > 0
      ? baslangicBloklari
      : [{ id: 1, ders: '', sayi: '', baslangic: '1' }]
  )

  const toplamGirilen = bloklar.reduce((t, b) => t + (Number(b.sayi) || 0), 0)

  function blokGuncelle(id, alanlar) {
    setBloklar((liste) => liste.map((b) => (b.id === id ? { ...b, ...alanlar } : b)))
  }
  function blokEkle() {
    setBloklar((liste) => [...liste, { id: Date.now(), ders: '', sayi: '', baslangic: '1' }])
  }
  function blokSil(id) {
    setBloklar((liste) => liste.filter((b) => b.id !== id))
  }
  // "Öncekinin devamı" — bir önceki bloğun başlangıç no'su + soru sayısını
  // bu bloğun başlangıcı yapar. Bkz. panel içindeki uyarı: karnede TYT'nin
  // Sosyal Bilimler / Fen Bilimleri grupları İÇİNDEKİ dersler (Tarih→Coğrafya
  // →Felsefe→Din Kültürü, Fizik→Kimya→Biyoloji) numarayı SIFIRLAMADAN devam
  // ettiriyor (Kimya 8'den, Biyoloji 15'ten başlıyor gibi) — bu buton o
  // devamı elle hesaplama derdini ortadan kaldırıyor.
  function oncekininDevami(index) {
    if (index === 0) return
    const onceki = bloklar[index - 1]
    const yeniBaslangic = (Number(onceki.baslangic) || 1) + (Number(onceki.sayi) || 0)
    blokGuncelle(bloklar[index].id, { baslangic: String(yeniBaslangic) })
  }

  function uygula() {
    const gecerliBloklar = bloklar.filter((b) => b.ders.trim() && Number(b.sayi) > 0)
    if (gecerliBloklar.length === 0) return
    onUygula(
      gecerliBloklar.map((b) => ({ ders: b.ders.trim(), sayi: Number(b.sayi), baslangic: Number(b.baslangic) || 1 }))
    )
  }

  return (
    <div className="bg-blue/5 border border-blue/20 rounded-2xl p-5 mb-6">
      <p className="font-semibold text-navy mb-1">Toplu Ders Ataması (önerilen — çok zaman kazandırır)</p>
      <p className="text-sm text-gray-600 mb-4">
        Sistem toplam <b>{toplamSoru}</b> soru kutusu buldu ve bunlar zaten kitapçıktaki okuma sırasında (baştan
        sona). Her birini tek tek doldurmak yerine, hangi dersten kaç soru olduğunu aşağıya sırayla yazın —
        sistem hepsine otomatik ders adı ve soru numarası verecek. Sonra sadece nadir hatalı kutuları tek tek
        düzeltirsiniz.
      </p>
      <p className="text-xs text-orange bg-orange/10 border border-orange/20 rounded-lg px-3 py-2 mb-4">
        Önemli: "Sosyal" ve "Fen" bloklarını TEK satırda toplamayın — sonuç karnesindeki Konu Analizi tablosu
        bunları ayrı ayrı sayar (Tarih, Coğrafya, Felsefe, Din Kültürü / Fizik, Kimya, Biyoloji). Bu dersler
        kendi GRUBU içinde 1'den BAŞLAMAZ — grup içinde kesintisiz devam eder: Tarih 1-5, Coğrafya 6-10,
        Felsefe 11-15, Din Kültürü 16-20; Fizik 1-7, Kimya 8-14, Biyoloji 15-20 gibi ("↳ öncekinin devamı"
        butonu bunun için).
        <br />
        <b>AMA her YENİ TEST (Türkçe Testi → Sosyal Bilimler Testi → Matematik Testi → Fen Bilimleri Testi
        geçişlerinde) numarayı MUTLAKA 1'e SIFIRLAYIN</b> — karnede her test kendi başına yeniden 1'den başlar,
        kitapçık boyunca kesintisiz saymaz. Yani "↳ öncekinin devamı" SADECE aynı grubun İÇİNDEKİ bir sonraki
        derse (ör. Tarih'ten Coğrafya'ya) geçerken kullanılır — Sosyal Bilimler'den Matematik'e ya da Matematik'ten
        Fen Bilimleri'ne geçerken YENİ satırın Başlangıç No'sunu elle <b>1</b> yazın, "öncekinin devamı"na
        BASMAYIN. (Bu karıştırılırsa tüm sorular yanlış numaralanır ve Hata Kitapçığı hiçbirini eşleştiremez —
        sonradan SQL ile düzeltmek gerekir, o yüzden en başta doğru girmek önemli.)
      </p>

      <div className="space-y-2 mb-3">
        {bloklar.map((b, i) => (
          <div key={b.id} className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 w-5 shrink-0">{i + 1}.</span>
            <input
              list="ders-onerileri"
              value={b.ders}
              onChange={(e) => blokGuncelle(b.id, { ders: e.target.value })}
              placeholder="örn. Türkçe"
              className="flex-1 min-w-[140px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue bg-white"
            />
            <input
              type="number"
              min="1"
              value={b.sayi}
              onChange={(e) => blokGuncelle(b.id, { sayi: e.target.value })}
              placeholder="soru sayısı"
              className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue bg-white"
            />
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400">No:</span>
              <input
                type="number"
                min="1"
                value={b.baslangic}
                onChange={(e) => blokGuncelle(b.id, { baslangic: e.target.value })}
                placeholder="1"
                title="Bu dersin ilk sorusu karnede kaç numara?"
                className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue bg-white"
              />
            </div>
            {i > 0 && (
              <button
                type="button"
                onClick={() => oncekininDevami(i)}
                className="text-xs text-blue font-semibold hover:underline whitespace-nowrap"
                title="Başlangıç no'yu bir önceki dersin devamı yap"
              >
                ↳ öncekinin devamı
              </button>
            )}
            {bloklar.length > 1 && (
              <button
                type="button"
                onClick={() => blokSil(b.id)}
                className="text-red-400 text-sm px-2 hover:text-red-600"
                title="Bu satırı sil"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={blokEkle}
            className="text-navy text-sm font-semibold hover:underline"
          >
            + Ders Ekle
          </button>
          <span
            className={`text-xs font-semibold ${
              toplamGirilen === toplamSoru ? 'text-green-600' : 'text-gray-400'
            }`}
          >
            Toplam: {toplamGirilen} / {toplamSoru} soru
          </span>
          {onGeriDon && (
            <button
              type="button"
              onClick={onGeriDon}
              className="text-xs text-orange font-semibold hover:underline"
            >
              ↺ Soru Noktalarına Dön (Eksik Soru Ekle)
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onVazgec}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-500 hover:bg-white"
          >
            Bunu atla, tek tek gireceğim
          </button>
          <button
            type="button"
            onClick={uygula}
            disabled={toplamGirilen === 0}
            className="bg-navy text-white font-semibold px-4 py-1.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-40"
          >
            Uygula
          </button>
        </div>
      </div>
      {toplamGirilen !== 0 && toplamGirilen !== toplamSoru && (
        <p className="text-xs text-orange mt-2">
          Girdiğiniz toplam ({toplamGirilen}), tespit edilen soru sayısından ({toplamSoru}) farklı — yine de
          uygulayabilirsiniz, kalan kutulara ders adı boş atanır, onları tek tek düzeltirsiniz.
        </p>
      )}
    </div>
  )
}

export default function SinavKitapciklari() {
  // Öğretmen bu sayfaya artık erişebiliyor (bkz. Layout.jsx nav) ama SADECE
  // görüntüleme + PDF indirme yapabilmeli — yükleme/düzenleme/silme
  // (kitapçık OCR akışının tamamı + sınav/kitapçık Düzenle-Sil butonları)
  // sadece yöneticiye açık kalıyor.
  const { profile } = useAuth()
  const isYonetici = profile?.rol === 'yonetici'
  const [sinavlar, setSinavlar] = useState([])
  const [kitapciklar, setKitapciklar] = useState([])
  const [silinenKitapcikId, setSilinenKitapcikId] = useState(null)
  const [silinenSinavId, setSilinenSinavId] = useState(null)
  // "İndir" butonuna basılınca, o an indirilmekte olan kitapçığın id'si —
  // buton "İndiriliyor..." gösterip tekrar tıklanmayı engellesin diye.
  const [indirilenKitapcikId, setIndirilenKitapcikId] = useState(null)
  // Sınavlar tablosundaki inline "Düzenle" — hangi sınavın adı/tarihi o an
  // düzenleniyor (id) ve o satırın taslak değerleri.
  const [duzenlenenSinavId, setDuzenlenenSinavId] = useState(null)
  const [duzenlenenSinavAdi, setDuzenlenenSinavAdi] = useState('')
  const [duzenlenenSinavTarihi, setDuzenlenenSinavTarihi] = useState('')
  // Öğrenci/veli tarafındaki gelişim grafiğinin (Karnem.jsx) türlere göre
  // ayrı çizgiler çizebilmesi için — özellikle eski (bu alan eklenmeden önce
  // oluşturulmuş, otomatik "Diğer" gelen) sınavları geriye dönük etiketlemek için.
  const [duzenlenenSinavTuru, setDuzenlenenSinavTuru] = useState('Diğer')
  const [sinavAdiKaydediliyor, setSinavAdiKaydediliyor] = useState(false)
  const [seciliSinavId, setSeciliSinavId] = useState('')
  const [yeniSinavAdi, setYeniSinavAdi] = useState('')
  const [yeniSinavTarihi, setYeniSinavTarihi] = useState('')
  const [yeniSinavTuru, setYeniSinavTuru] = useState('TYT')
  const [kitapcikTuru, setKitapcikTuru] = useState('A')
  const [dosya, setDosya] = useState(null)

  // Zaten kaydedilmiş bir kitapçığı DÜZENLEME modunda mı çalışıyoruz —
  // doluysa kaydet() PDF'i yeniden yüklemek yerine mevcut pdf_yolu'nu
  // kullanır (admin sadece ders adı/soru no gibi hataları düzeltiyor,
  // dosyanın kendisi değişmiyor).
  const [duzenlenenKitapcik, setDuzenlenenKitapcik] = useState(null)
  // Hangi kitapçığın (id'si) şu an açılmakta olduğu — sadece o satırdaki
  // "Düzenle" butonunu "Açılıyor..." göstermek için kullanılıyor.
  const [duzenlemeYukleniyorId, setDuzenlemeYukleniyorId] = useState(null)

  const [analizEdiliyor, setAnalizEdiliyor] = useState(false)
  const [analizDurumu, setAnalizDurumu] = useState('')
  const [sayfaGoruntuleri, setSayfaGoruntuleri] = useState([])
  const [sorular, setSorular] = useState([])
  const [seciliIndex, setSeciliIndex] = useState(0)
  const [cizimModu, setCizimModu] = useState(false)
  // cizimModu açıkken sürüklenen dikdörtgenin NEREYE yazılacağını belirler:
  // 'soru' → sorunun kendi kutusu (eskisi gibi), 'parca' → aşağıdaki "Ortak
  // Parça" özelliği için ayrı bir kutu (bkz. onCizimBitti ve parça bölümü).
  const [cizimAlani, setCizimAlani] = useState('soru')
  // "39-40. soruları aşağıdaki parçaya göre cevaplayınız" gibi ortak parçalı
  // soru çiftlerinde, seçili sorunun az önce çizilen/kayıtlı parça kutusunu
  // TEK TIKLA aynı sayfadaki başka sorulara da uygulayabilmek için — işaretli
  // gecici_id'ler burada tutulur.
  const [parcaUygulanacakIdler, setParcaUygulanacakIdler] = useState([])
  // Yeni bir analiz sonucu geldiğinde varsayılan olarak TOPLU DERS ATAMA
  // paneli gösterilir (bkz. TopluDersAtamaPaneli) — admin isterse "Bunu atla"
  // deyip eski tek-tek düzenleme akışına geçebilir.
  const [blokPaneliGoster, setBlokPaneliGoster] = useState(false)

  // "Hızlı Elle İşaretleme" modu — OCR kullanmadan, admin sayfa sayfa
  // gezinip her sorunun sol üst köşesine tıklar. elleNoktalar TÜM sayfalar
  // boyunca, TIKLAMA SIRASINA göre (yani zaten doğru okuma sırasında) tutulur.
  const [elleIsaretlemeModu, setElleIsaretlemeModu] = useState(false)
  const [elleNoktalar, setElleNoktalar] = useState([])
  const [elleSayfaIndex, setElleSayfaIndex] = useState(0)

  // Sayfaların hangi ölçekte (kaç kat) görüntüye çevrildiği — OCR modu 3,
  // Hızlı Elle İşaretleme modu 2 kullanıyor. Kaydederken sinav_kitapciklari.olcek
  // sütununa yazılır; hata kitapçığı oluşturma ekranı sayfayı doğru kesebilmek
  // için sayfayı AYNI ölçekte tekrar üretmek zorunda, bu yüzden saklanması şart.
  const [kullanilanOlcek, setKullanilanOlcek] = useState(null)

  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState('')
  const [basari, setBasari] = useState('')

  function veriyiYenile() {
    supabase.from('sinavlar').select('*').order('sinav_tarihi', { ascending: false }).then(({ data }) => {
      setSinavlar(data || [])
    })
    supabase
      .from('sinav_kitapciklari')
      .select('*, sinavlar(sinav_adi)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setKitapciklar(data || []))
  }

  // Bir kitapçığı (ör. deneme amaçlı yüklenmiş, yanlış yüklenmiş vb.) kalıcı
  // olarak siler: önce o kitapçığa bağlı soru haritasını (sinav_kitapcik_sorulari),
  // sonra Storage'daki taranmış PDF dosyasını, en son da kitapçık satırının
  // kendisini kaldırır. "Sınav" kaydının kendisi (ör. "1. TYT") silinmez —
  // aynı sınava başka bir kitapçık (B gibi) daha sonra yüklenebilsin diye.
  async function kitapcikSil(k) {
    if (
      !confirm(
        `"${k.sinavlar?.sinav_adi || 'Bu sınav'}" — "${k.kitapcik}" kitapçığını kalıcı olarak silmek istediğinize emin misiniz?\n\n` +
          `Bu kitapçığa ait soru işaretlemeleri de silinir. Bu işlem GERİ ALINAMAZ.`
      )
    )
      return
    setSilinenKitapcikId(k.id)
    try {
      const { error: soruHatasi } = await supabase.from('sinav_kitapcik_sorulari').delete().eq('kitapcik_id', k.id)
      if (soruHatasi) throw soruHatasi
      if (k.pdf_yolu) {
        // Depolamadaki dosya silinemese bile (ör. zaten yoksa) kitapçık
        // kaydının silinmesini engellemesin diye hatasını sadece konsola yazıyoruz.
        const { error: dosyaHatasi } = await supabase.storage.from('sinav-kitapciklari').remove([k.pdf_yolu])
        if (dosyaHatasi) console.error('PDF dosyası silinemedi:', dosyaHatasi.message)
      }
      const { error: kitapcikHatasi } = await supabase.from('sinav_kitapciklari').delete().eq('id', k.id)
      if (kitapcikHatasi) throw kitapcikHatasi
      veriyiYenile()
    } catch (e) {
      alert('Hata: ' + e.message)
    } finally {
      setSilinenKitapcikId(null)
    }
  }

  // Kayıtlı bir kitapçığın, Storage'a yüklenmiş ORİJİNAL PDF'ini indirir —
  // kitapcikDuzenle() ile AYNI şekilde .download() ile blob'u çekip, tarayıcı
  // üzerinden gerçek bir dosya indirmesi tetikler (görünmez bir <a download>
  // linkine tıklanmış gibi). Dosya adı "sınav adı - kitapçık.pdf" olsun diye
  // ayrıca ayarlanıyor — Storage'daki teknik yol adı (ör. "abc123/A-171....pdf")
  // yerine admin için anlamlı bir isimle iner.
  async function kitapcikIndir(k) {
    if (!k.pdf_yolu) {
      alert('Bu kitapçık için kayıtlı bir PDF bulunamadı.')
      return
    }
    setIndirilenKitapcikId(k.id)
    try {
      const { data: pdfBlobu, error } = await supabase.storage.from('sinav-kitapciklari').download(k.pdf_yolu)
      if (error) throw error
      const url = URL.createObjectURL(pdfBlobu)
      const a = document.createElement('a')
      a.href = url
      const sinavAdi = (k.sinavlar?.sinav_adi || 'sinav').replace(/[\\/:*?"<>|]/g, ' ').trim()
      a.download = `${sinavAdi} - ${k.kitapcik}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('İndirme hatası: ' + e.message)
    } finally {
      setIndirilenKitapcikId(null)
    }
  }

  // Bir SINAVIN KENDİSİNİ (ör. deneme amaçlı eklenmiş "1. tyt", "2" gibi
  // test kayıtları) kalıcı olarak siler — kitapcikSil'in aksine bu, sınava
  // bağlı HER ŞEYİ temizler: kitapçıklar (+ soru haritaları + Storage'daki
  // PDF'ler) VE o sınava ait tüm öğrenci sonuçları (+ ders/soru detayları).
  // Çok yıkıcı bir işlem olduğu için onay metninde tam olarak neyin
  // silineceği açıkça yazıyor.
  async function sinavSil(s) {
    const buSinavinKitapciklari = kitapciklar.filter((k) => k.sinav_id === s.id)
    if (
      !confirm(
        `"${s.sinav_adi}" sınavını kalıcı olarak silmek istediğinize emin misiniz?\n\n` +
          `Bu, o sınava ait ${buSinavinKitapciklari.length} kitapçığı (soru haritalarıyla birlikte) VE bu sınava ` +
          `girmiş tüm öğrencilerin kaydedilmiş sonuçlarını (karne/hata kitapçığı verileri dahil) da siler. ` +
          `Bu işlem GERİ ALINAMAZ.`
      )
    )
      return
    setSilinenSinavId(s.id)
    try {
      // 1) Bu sınavın kitapçıkları: soru haritaları + Storage'daki PDF'ler + kitapçık satırları.
      for (const k of buSinavinKitapciklari) {
        await supabase.from('sinav_kitapcik_sorulari').delete().eq('kitapcik_id', k.id)
        if (k.pdf_yolu) {
          const { error: dosyaHatasi } = await supabase.storage.from('sinav-kitapciklari').remove([k.pdf_yolu])
          if (dosyaHatasi) console.error('PDF dosyası silinemedi:', dosyaHatasi.message)
        }
      }
      await supabase.from('sinav_kitapciklari').delete().eq('sinav_id', s.id)

      // 2) Bu sınava girmiş öğrencilerin sonuçları: ders/soru detayları + sonuç satırları.
      const { data: sonuclar } = await supabase.from('ogrenci_sinav_sonuclari').select('id').eq('sinav_id', s.id)
      const sonucIdleri = (sonuclar || []).map((x) => x.id)
      if (sonucIdleri.length > 0) {
        await supabase.from('sinav_ders_sonuclari').delete().in('sonuc_id', sonucIdleri)
        await supabase.from('sinav_soru_sonuclari').delete().in('sonuc_id', sonucIdleri)
        await supabase.from('ogrenci_sinav_sonuclari').delete().in('id', sonucIdleri)
      }

      // 3) Sınavın kendisi.
      const { error } = await supabase.from('sinavlar').delete().eq('id', s.id)
      if (error) throw error

      veriyiYenile()
      if (seciliSinavId === s.id) setSeciliSinavId('')
    } catch (e) {
      alert('Hata: ' + e.message)
    } finally {
      setSilinenSinavId(null)
    }
  }

  // Sınav adı/tarihini DÜZENLEME — ör. PDF'ten otomatik ayrıştırılırken
  // metin tekrarlanmış ("...Tyt-0)(...Tyt-0)" gibi) ya da admin baştan farklı
  // bir isim yazmak istiyor. Kitapçıklara/sonuçlara DOKUNMAZ, sadece sinavlar
  // satırının kendi ad/tarih alanlarını günceller.
  function sinavDuzenlemeyeBasla(s) {
    setDuzenlenenSinavId(s.id)
    setDuzenlenenSinavAdi(s.sinav_adi)
    setDuzenlenenSinavTarihi(s.sinav_tarihi || '')
    setDuzenlenenSinavTuru(s.tur || 'Diğer')
  }

  function sinavDuzenlemeyiVazgec() {
    setDuzenlenenSinavId(null)
  }

  async function sinavDuzenlemeyiKaydet(id) {
    if (!duzenlenenSinavAdi.trim()) {
      alert('Sınav adı boş olamaz.')
      return
    }
    setSinavAdiKaydediliyor(true)
    try {
      const { error } = await supabase
        .from('sinavlar')
        .update({
          // Sınav adı BİLEREK tam büyük harf düzeltmesinden geçirilmiyor —
          // admin geri kalanını tam olarak yazdığı gibi kaydedebilsin (öğrenci
          // adı gibi diğer alanlarda bu düzeltme aynen devam ediyor), ama
          // TYT/YKS/AYT gibi istisna kelimeler (bkz. buyukIstisnalariDuzelt)
          // küçük yazılsa bile büyütülüyor.
          sinav_adi: buyukIstisnalariDuzelt(duzenlenenSinavAdi.trim()),
          sinav_tarihi: duzenlenenSinavTarihi || null,
          tur: duzenlenenSinavTuru,
        })
        .eq('id', id)
      if (error) throw error
      setDuzenlenenSinavId(null)
      veriyiYenile()
    } catch (e) {
      alert('Hata: ' + e.message)
    } finally {
      setSinavAdiKaydediliyor(false)
    }
  }

  // Daha önce kaydedilmiş bir kitapçığı DÜZENLEMEK için açar: kayıtlı PDF'i
  // Storage'dan indirip kaydedildiği ÖLÇEKTE (sinav_kitapciklari.olcek —
  // eski kayıtlarda bu sütun yoksa/boşsa varsayılan 3, çünkü eski kayıtlar
  // hep OCR ile yapılıyordu) tekrar görüntüye çevirir, mevcut soru haritasını
  // (sinav_kitapcik_sorulari) tek tek düzenleme ekranına yükler. Admin
  // sadece hatalı ders adı/soru no'ları düzeltip tekrar kaydeder — 125
  // soruyu yeniden tıklamasına gerek kalmaz.
  async function kitapcikDuzenle(k) {
    setHata('')
    setBasari('')
    setDuzenlemeYukleniyorId(k.id)
    try {
      const { data: pdfBlobu, error: indirmeHatasi } = await supabase.storage
        .from('sinav-kitapciklari')
        .download(k.pdf_yolu)
      if (indirmeHatasi) throw indirmeHatasi

      // NOT: BURADA ders_adi/soru_no'ya göre değil, FİZİKSEL OKUMA SIRASINA
      // göre sıralıyoruz (sayfa → sütun → yukarıdan aşağı). Sebep: admin
      // düzenleme ekranında "Toplu Ders Ataması"nı TEKRAR çalıştırabilsin
      // istiyoruz (topluAta() `sorular` dizisini SIRAYLA dolduruyor) — eğer
      // burada ders_adi'ye göre alfabetik sıralasaydık, toplu atama fiziksel
      // sayfa sırasıyla UYUŞMAYAN bir sıraya soru no/ders adı yazardı.
      const { data: mevcutSorular, error: soruHatasi } = await supabase
        .from('sinav_kitapcik_sorulari')
        .select('*')
        .eq('kitapcik_id', k.id)
      if (soruHatasi) throw soruHatasi

      const olcek = Number(k.olcek) || 3
      const belge = await pdfBelgesiAc(pdfBlobu)
      const sayfaSayisi = belge.numPages
      const goruntuler = []
      for (let s = 1; s <= sayfaSayisi; s++) {
        setAnalizDurumu(`Sayfa ${s}/${sayfaSayisi} açılıyor...`)
        const { dataUrl, genislik, yukseklik } = await sayfayiGoruntuyeCevir(belge, s, olcek)
        goruntuler.push({ sayfaNo: s, dataUrl, genislik, yukseklik })
      }
      const genislikMap = new Map(goruntuler.map((g) => [g.sayfaNo, g.genislik]))

      const fizikselSirali = (mevcutSorular || [])
        .slice()
        .sort((a, b) => {
          if (a.sayfa_no !== b.sayfa_no) return a.sayfa_no - b.sayfa_no
          const genislikA = genislikMap.get(a.sayfa_no) || 0
          const sutunA = Number(a.x) < genislikA / 2 ? 0 : 1
          const sutunB = Number(b.x) < genislikA / 2 ? 0 : 1
          if (sutunA !== sutunB) return sutunA - sutunB
          return Number(a.y) - Number(b.y)
        })

      setSayfaGoruntuleri(goruntuler)
      setSorular(
        fizikselSirali.map((s) => ({
          gecici_id: s.id,
          ders_adi: s.ders_adi || '',
          soru_no: s.soru_no,
          sayfa_no: s.sayfa_no,
          x: Number(s.x),
          y: Number(s.y),
          genislik: Number(s.genislik),
          yukseklik: Number(s.yukseklik),
          // Ortak Parça (bkz. migration_sinav_kitapcik_ortak_parca.sql) — eski
          // kayıtlarda bu alanlar hiç yoktur, o zaman hepsi null/undefined
          // kalır ve "parça yok" olarak yorumlanır (bkz. seciliSoru.parca_x != null kontrolleri).
          parca_sayfa_no: s.parca_sayfa_no ?? null,
          parca_x: s.parca_x !== null && s.parca_x !== undefined ? Number(s.parca_x) : null,
          parca_y: s.parca_y !== null && s.parca_y !== undefined ? Number(s.parca_y) : null,
          parca_genislik: s.parca_genislik !== null && s.parca_genislik !== undefined ? Number(s.parca_genislik) : null,
          parca_yukseklik: s.parca_yukseklik !== null && s.parca_yukseklik !== undefined ? Number(s.parca_yukseklik) : null,
        }))
      )
      setSeciliIndex(0)
      setKullanilanOlcek(olcek)
      setElleNoktalar([])
      setElleIsaretlemeModu(false)
      // Doğrudan Toplu Ders Ataması paneline açıyoruz — soru KUTULARI zaten
      // fiziksel sırayla hazır, admin genelde "Sosyal"/"Fen" gibi hatalı
      // lump'lanmış dersleri hızlıca Tarih/Coğrafya/... gibi ayrı bloklara
      // bölüp TEK SEFERDE düzeltmek istiyor — 125 soruyu tek tek açıp
      // düzeltmesine gerek yok. İsterse "Bunu atla, tek tek gireceğim" ile
      // yine tek tek düzenleme ekranına geçebilir.
      setBlokPaneliGoster(true)
      setCizimModu(false)
      setDosya(null)
      setSeciliSinavId(k.sinav_id)
      setKitapcikTuru(k.kitapcik)
      setDuzenlenenKitapcik({ id: k.id, pdf_yolu: k.pdf_yolu, sinav_id: k.sinav_id, kitapcik: k.kitapcik })
      setAnalizDurumu('')
      setBasari(
        `"${k.sinavlar?.sinav_adi || 'Kitapçık'}" — ${k.kitapcik} kitapçığı düzenleme için açıldı (${
          (mevcutSorular || []).length
        } soru, fiziksel sayfa sırasına göre dizildi). Aşağıdan Toplu Ders Ataması ile hızlıca yeniden atayabilir ya da ` +
          `"Bunu atla, tek tek gireceğim" deyip tek tek düzeltebilirsiniz. Dosyanın kendisi yeniden yüklenmeyecek.`
      )
      window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })
    } catch (e) {
      setHata('Düzenleme için açılamadı: ' + e.message)
    } finally {
      setDuzenlemeYukleniyorId(null)
    }
  }

  function duzenlemeyiIptalEt() {
    setDuzenlenenKitapcik(null)
    setSayfaGoruntuleri([])
    setSorular([])
    setKullanilanOlcek(null)
    setSeciliSinavId('')
    setDosya(null)
  }

  useEffect(() => {
    veriyiYenile()
  }, [])

  // Farklı bir soruya geçince ("Sonraki"/"Önceki"/tıklama), önceki sorunun
  // "Bu Parçayı Şunlara da Uygula" seçimleri (checkbox'lar) yanlışlıkla yeni
  // soruya taşınmasın diye sıfırlanır — ayrıca çizim modu da (bir soru için
  // yarım kalmış bir kutu çizimi başka soruya karışmasın diye) kapatılır.
  useEffect(() => {
    setParcaUygulanacakIdler([])
    setCizimModu(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seciliIndex])

  // Elle işaretleme modundayken ok tuşlarıyla sayfa arasında gezinmeyi ve
  // Backspace/Delete ile son noktayı geri almayı sağlıyor — admin her sayfada
  // fareyle "Sonraki Sayfa" butonuna tıklamak zorunda kalmadan, klavyeden
  // sağ/sol oklarla hızlıca ilerleyebilsin diye.
  useEffect(() => {
    if (!elleIsaretlemeModu) return
    function tusaBasildi(e) {
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setElleSayfaIndex((i) => Math.min(sayfaGoruntuleri.length - 1, i + 1))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setElleSayfaIndex((i) => Math.max(0, i - 1))
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        elleSonNoktayiGeriAl()
      }
    }
    window.addEventListener('keydown', tusaBasildi)
    return () => window.removeEventListener('keydown', tusaBasildi)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elleIsaretlemeModu, sayfaGoruntuleri.length])

  // Kaydedilmemiş iş varken (nokta işaretlenmiş ya da OCR/elle sonucu sorular
  // listesi dolmuş ama henüz "Onayla ve Kaydet"e basılmamışsa) sekmeyi/
  // pencereyi kapatmaya çalışınca tarayıcının kendi "Bu sayfadan ayrılmak
  // istediğinize emin misiniz?" uyarısını göstermesini sağlıyor — yanlışlıkla
  // saatlerce süren işaretleme emeğinin kaybolmaması için.
  useEffect(() => {
    const kayitsizVeriVarMi = elleNoktalar.length > 0 || sorular.length > 0
    function ayrilmadanOnce(e) {
      if (!kayitsizVeriVarMi) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', ayrilmadanOnce)
    return () => window.removeEventListener('beforeunload', ayrilmadanOnce)
  }, [elleNoktalar, sorular])

  function girdileriDogrula() {
    if (!dosya) {
      setHata('Lütfen önce bir PDF seçin.')
      return false
    }
    if (!seciliSinavId) {
      setHata('Lütfen bir sınav seçin ya da yeni sınav ekleyin.')
      return false
    }
    if (seciliSinavId === '__yeni__' && !yeniSinavAdi.trim()) {
      setHata('Yeni sınavın adını girin.')
      return false
    }
    return true
  }

  // OCR'a HİÇ başvurmadan — sadece sayfaları görüntüye çevirip "Hızlı Elle
  // İşaretleme" moduna geçiyoruz. OCR'ın güvenilir olmadığı (grafik/tablo/
  // resim ağırlıklı, düzensiz yükseklikte sorular içeren) kitapçıklarda bu
  // çok daha hızlı ve hatasız sonuç veriyor.
  async function elleIsaretlemeyeBasla() {
    setHata('')
    setBasari('')
    if (!girdileriDogrula()) return
    setAnalizEdiliyor(true)
    setSayfaGoruntuleri([])
    setSorular([])
    setElleNoktalar([])
    setKullanilanOlcek(2)
    try {
      setAnalizDurumu('PDF açılıyor...')
      const belge = await pdfBelgesiAc(dosya)
      const sayfaSayisi = belge.numPages
      const goruntuler = []
      for (let s = 1; s <= sayfaSayisi; s++) {
        setAnalizDurumu(`Sayfa ${s}/${sayfaSayisi} hazırlanıyor...`)
        const { dataUrl, genislik, yukseklik } = await sayfayiGoruntuyeCevir(belge, s, 2)
        goruntuler.push({ sayfaNo: s, dataUrl, genislik, yukseklik })
      }
      setSayfaGoruntuleri(goruntuler)
      setElleSayfaIndex(0)
      setElleIsaretlemeModu(true)
      setAnalizDurumu('')
    } catch (e) {
      setHata('Hata: ' + e.message)
    } finally {
      setAnalizEdiliyor(false)
    }
  }

  function elleNoktaEkle(sayfaNo, nokta) {
    setElleNoktalar((liste) => [...liste, { sayfaNo, x: nokta.x, y: nokta.y }])
  }

  // Admin, kutulara çevirip ders adı/soru no doldurmaya başladıktan SONRA
  // aslında bazı soruları hiç işaretlemediğini fark edebilir (ör. "8 soru
  // işaretledim ama testte 40 soru var"). Bu fonksiyon, ÖNCEDEN tıklanan
  // noktaları KORUYARAK (elleNoktalar silinmiyor) tekrar işaretleme moduna
  // dönmeyi sağlıyor — admin eksik soruları ekleyip "Tamamla → Kutulara Çevir"e
  // tekrar basabilir. Kutulara çevirme İŞLEMİ TÜM noktaları sıfırdan kutuya
  // çevirdiği için, o ana kadar tek tek girilmiş ders adı/soru no bilgileri
  // sıfırlanır — bu yüzden önceden doldurulmuş bir şey varsa admin'i uyarıyoruz.
  function elleIsaretlemeyeGeriDon() {
    const doldurulmusVarMi = sorular.some((s) => s.ders_adi && s.ders_adi.trim())
    if (
      doldurulmusVarMi &&
      !confirm(
        'Soru noktalarına dönüp yeni nokta eklersen, "Kutulara Çevir"e tekrar bastığında şu ana kadar girdiğin ' +
          'ders adı / soru no bilgileri sıfırlanır (hepsi yeniden boş kutu olarak gelir, Toplu Ders Ataması ile ' +
          'tekrar hızlıca doldurabilirsin). Devam edilsin mi?'
      )
    ) {
      return
    }
    const sonNokta = elleNoktalar[elleNoktalar.length - 1]
    const hedefIndex = sonNokta ? sayfaGoruntuleri.findIndex((g) => g.sayfaNo === sonNokta.sayfaNo) : 0
    setElleSayfaIndex(hedefIndex === -1 ? 0 : hedefIndex)
    setElleIsaretlemeModu(true)
    setBlokPaneliGoster(false)
  }

  function elleSonNoktayiGeriAl() {
    setElleNoktalar((liste) => {
      if (liste.length === 0) return liste
      const yeni = liste.slice(0, -1)
      const silinen = liste[liste.length - 1]
      // Silinen nokta başka bir sayfadaysa, admin'in onu görebilmesi için o
      // sayfaya geri dön.
      const silinenSayfaIndex = sayfaGoruntuleri.findIndex((g) => g.sayfaNo === silinen.sayfaNo)
      if (silinenSayfaIndex !== -1) setElleSayfaIndex(silinenSayfaIndex)
      return yeni
    })
  }

  // Tıklama noktalarını (doğru okuma sırasında) gerçek kutulara çevirir —
  // bkz. NoktaIsaretlemeKatmani üstündeki açıklama: genişlik sütuna (sayfanın
  // sol/sağ yarısı) göre, yükseklik aynı sütundaki bir sonraki noktaya kadar.
  function noktalariKutuyaCevir() {
    const sayfaMap = new Map(sayfaGoruntuleri.map((g) => [g.sayfaNo, g]))
    const kenarBosluk = 12
    const kutular = elleNoktalar.map((nokta, i) => {
      const g = sayfaMap.get(nokta.sayfaNo)
      const solYarida = nokta.x < g.genislik / 2
      const genislik = Math.max(60, (solYarida ? g.genislik / 2 - nokta.x : g.genislik - nokta.x) - kenarBosluk)

      const sonraki = elleNoktalar[i + 1]
      const sonrakiAyniSutunda =
        sonraki && sonraki.sayfaNo === nokta.sayfaNo && sonraki.x < g.genislik / 2 === solYarida ? sonraki : null

      const yukseklik = Math.max(
        30,
        (sonrakiAyniSutunda ? sonrakiAyniSutunda.y - nokta.y : g.yukseklik - nokta.y) - 6
      )

      return {
        gecici_id: `m${nokta.sayfaNo}-${i}`,
        ders_adi: '',
        soru_no: i + 1,
        sayfa_no: nokta.sayfaNo,
        x: nokta.x,
        y: nokta.y,
        genislik,
        yukseklik,
      }
    })
    setSorular(kutular)
    setSeciliIndex(0)
    setElleIsaretlemeModu(false)
    setBlokPaneliGoster(kutular.length > 0)
    setBasari(
      `${kutular.length} soru işaretlendi. Şimdi hangi dersten kaç soru olduğunu girip toplu atayabilirsiniz.`
    )
  }

  async function analizEt() {
    setHata('')
    setBasari('')
    if (!dosya) {
      setHata('Lütfen önce bir PDF seçin.')
      return
    }
    if (!seciliSinavId) {
      setHata('Lütfen bir sınav seçin ya da yeni sınav ekleyin.')
      return
    }
    if (seciliSinavId === '__yeni__' && !yeniSinavAdi.trim()) {
      setHata('Yeni sınavın adını girin.')
      return
    }
    setAnalizEdiliyor(true)
    setSayfaGoruntuleri([])
    setSorular([])
    setKullanilanOlcek(3)
    try {
      setAnalizDurumu('PDF açılıyor...')
      const belge = await pdfBelgesiAc(dosya)
      const sayfaSayisi = belge.numPages
      const goruntuler = []
      // Önce TÜM sayfalardaki adayları toplayıp (sayfa sırasına göre) tek bir
      // okuma-sırası dizisi oluşturuyoruz — bir dersin soruları (örn. Türkçe
      // testinin 40 sorusu) birden fazla sayfaya yayılabildiği için ardışıklık
      // kontrolünü SAYFA BAZINDA değil, TÜM belge üzerinde yapmamız gerekiyor.
      const sayfaVerileri = []
      const tumAdaylarSirali = []
      // OCR işçisi (worker) TÜM belge için BİR KEZ kuruluyor ve her sayfada
      // yeniden kullanılıyor (hem hızlı hem de sayfa başına ayarları tekrar
      // kurma derdi yok) — bkz. kitapcikOcr.js açıklaması.
      const ocrWorker = await soruNumarasiWorkerOlustur()
      try {
        for (let s = 1; s <= sayfaSayisi; s++) {
          setAnalizDurumu(`Sayfa ${s}/${sayfaSayisi} görüntüye çevriliyor...`)
          // olcek: 2 yerine 3 kullanılıyor — küçük puntolu/çok sütunlu (AYT
          // matematik gibi) kitapçıklarda soru numaraları çok küçük kaldığı
          // için Tesseract çoğunu okuyamıyordu (160 sorudan sadece 25'i
          // bulunabilmişti). Daha yüksek çözünürlük tanıma oranını artırıyor.
          const { dataUrl, genislik, yukseklik, canvas } = await sayfayiGoruntuyeCevir(belge, s, 3)
          goruntuler.push({ sayfaNo: s, dataUrl, genislik, yukseklik })
          setAnalizDurumu(`Sayfa ${s}/${sayfaSayisi} taranıyor (OCR)...`)
          const adaylarHam = await sayfadaSoruNumaralariniTespitEt(ocrWorker, canvas, genislik, yukseklik, (ilerleme) => {
            setAnalizDurumu(`Sayfa ${s}/${sayfaSayisi} taranıyor (OCR) — %${Math.round(ilerleme * 100)}`)
          })
          const adaylar = girintiliAdaylariEle(adaylarHam, genislik)
          const sutunlu = sutunSiralaTahmini(adaylar, genislik).map((a) => ({ ...a, sayfa_no: s }))
          sayfaVerileri.push({ sayfaNo: s, genislik, yukseklik, sutunluAdaylar: sutunlu })
          tumAdaylarSirali.push(...sutunlu)
        }
      } finally {
        await soruNumarasiWorkerKapat(ocrWorker)
      }

      // Sadece yeterince UZUN, artan bir dizinin parçası olan adaylar gerçek
      // soru sayılır — yönergedeki kısa "1. ... 2. ..." gibi kopuk
      // numaralandırmalar burada elenir (bkz. kitapcikOcr.js açıklaması).
      let guvenilirAdaylar = ardisikDiziyeGoreFiltrele(tumAdaylarSirali)
      let siraFiltresiUygulanmadi = false
      // Güvenlik: taramanın kalitesi düşükse bu filtre HER ŞEYİ eleyebilir —
      // o zaman admin'i elle işaretlemeye tek başına bırakmak yerine,
      // filtrelemeden önceki (daha ham ama en azından dolu) listeye geri
      // dönüyoruz; admin zaten her adayı gözden geçirip yanlışları silecek.
      if (guvenilirAdaylar.length === 0 && tumAdaylarSirali.length > 0) {
        guvenilirAdaylar = tumAdaylarSirali
        siraFiltresiUygulanmadi = true
      }
      const guvenilirSet = new Set(guvenilirAdaylar)

      const tumSorular = []
      for (const sayfaVerisi of sayfaVerileri) {
        const buSayfaGuvenilirler = sayfaVerisi.sutunluAdaylar.filter((a) => guvenilirSet.has(a))
        const kutular = baslangicKutulariUret(buSayfaGuvenilirler, sayfaVerisi.genislik, sayfaVerisi.yukseklik)
        kutular.forEach((k) => {
          tumSorular.push({
            gecici_id: `s${sayfaVerisi.sayfaNo}-${tumSorular.length}`,
            ders_adi: '',
            soru_no: tumSorular.length + 1,
            sayfa_no: sayfaVerisi.sayfaNo,
            x: k.x,
            y: k.y,
            genislik: k.genislik,
            yukseklik: k.yukseklik,
          })
        })
      }
      setSayfaGoruntuleri(goruntuler)
      setSorular(tumSorular)
      setSeciliIndex(0)
      setAnalizDurumu('')
      // Yeni bir analiz sonrası, önce hızlı toplu atama paneli gösterilir —
      // admin isterse "Bunu atla" diyip eski tek-tek akışa geçebilir.
      setBlokPaneliGoster(tumSorular.length > 0)
      if (tumSorular.length === 0) {
        setHata('Hiç soru başlangıcı tespit edilemedi. Aşağıdan "Soru Ekle" ile elle işaretleyebilirsiniz.')
      } else if (siraFiltresiUygulanmadi) {
        setBasari(
          `${tumSorular.length} olası soru tespit edildi. Bu taramanın kalitesi düşük olduğu için sıralama kontrolü hiçbir şey bulamadı, o yüzden TÜM adaylar (yönerge gibi yanlış olanlar dahil) gösteriliyor — her birini dikkatlice gözden geçirip yanlış olanları "Bu Soruyu Sil" ile çıkarın.`
        )
      } else {
        setBasari(
          `${tumSorular.length} olası soru tespit edildi (yönerge gibi kısa/kopuk numaralar otomatik elendi). Bu bir İLK TAHMİN — şimdi her birinin ders adını/numarasını girip kutucuğu gerekirse düzeltin.`
        )
      }
    } catch (e) {
      setHata('Hata: ' + e.message)
    } finally {
      setAnalizEdiliyor(false)
    }
  }

  // Mevcut `sorular` dizisindeki (zaten fiziksel sırada duran) ders_adi
  // değerlerine bakıp, ART ARDA aynı dersten olan grupları TEK bir Toplu
  // Ders Ataması bloğuna çevirir — böylece "Düzenle" ile açılan bir
  // kitapçıkta admin baştan bütün dersleri yeniden yazmak zorunda kalmaz,
  // sadece hatalı olan tek tük bloğu düzeltir. soru_no'ların GERÇEKTEN
  // ardışık olup olmadığını kontrol etmiyoruz (admin zaten "Başlangıç No"yu
  // görüp gerekirse elle düzeltebilir) — sadece ders_adi'ye göre grupluyoruz.
  function dersBloklariniTahminEt(sorularListesi) {
    const bloklar = []
    for (const s of sorularListesi) {
      const son = bloklar[bloklar.length - 1]
      if (son && son.ders === (s.ders_adi || '')) {
        son.sayi += 1
      } else {
        bloklar.push({
          id: `${s.gecici_id}-blok`,
          ders: s.ders_adi || '',
          sayi: 1,
          baslangic: String(s.soru_no || 1),
        })
      }
    }
    if (bloklar.length === 0) return [{ id: 1, ders: '', sayi: '', baslangic: '1' }]
    return bloklar.map((b) => ({ ...b, sayi: String(b.sayi) }))
  }

  // Bu kitapçığın bağlı olduğu sınavın türü TYT mi — hem yeni oluşturulan
  // bir sınav (seciliSinavId === '__yeni__', o an seçili yeniSinavTuru) hem
  // de listeden seçilmiş MEVCUT bir sınav (sinavlar dizisindeki tur alanı)
  // için çalışır.
  function buSinavTytMi() {
    if (seciliSinavId === '__yeni__') return yeniSinavTuru === 'TYT'
    return sinavlar.find((s) => s.id === seciliSinavId)?.tur === 'TYT'
  }

  // Toplu Ders Ataması paneline gidecek başlangıç blokları: sorularda zaten
  // ders_adi işaretlenmişse (ör. Düzenle ile açılmış bir kitapçık) o tahmin
  // kullanılır — mevcut çalışma asla ezilmez. Hiçbiri işaretlenmemişse VE
  // sınav TYT ise, admin'in her seferinde elle yazmasın diye standart TYT
  // dağılımıyla (Türkçe 40, Tarih/Coğrafya/Felsefe/Din Kültürü 5'er,
  // Matematik 40, Fizik/Kimya/Biyoloji) hazır gelir — admin isterse yine de
  // her satırı değiştirebilir.
  function baslangicBloklariHesapla() {
    const tahmin = dersBloklariniTahminEt(sorular)
    const bosMu = tahmin.length === 1 && !tahmin[0].ders
    if (bosMu && buSinavTytMi()) {
      return TYT_STANDART_BLOKLAR.map((b) => ({ ...b }))
    }
    return tahmin
  }

  // TopluDersAtamaPaneli'nden gelen [{ders, sayi}, ...] blok listesini,
  // `sorular` dizisindeki (zaten okuma sırasında olan) kutulara sırayla
  // dağıtır. Örn. [{ders:'Türkçe', sayi:40}, {ders:'Matematik', sayi:40}]
  // verilirse, ilk 40 kutuya "Türkçe 1..40", sonraki 40'a "Matematik 1..40" yazılır.
  function topluAta(bloklar) {
    setSorular((liste) => {
      let kalan = [...bloklar]
      let mevcutBlok = kalan.shift()
      let sayacBuBlokta = 0
      return liste.map((s) => {
        while (mevcutBlok && sayacBuBlokta >= mevcutBlok.sayi) {
          mevcutBlok = kalan.shift()
          sayacBuBlokta = 0
        }
        if (!mevcutBlok) return s
        sayacBuBlokta += 1
        // soru_no, bloğun "Başlangıç No"suna göre hesaplanır — çoğu ders
        // 1'den başlar ama karnede bazı dersler (ör. bir grubun ikinci/üçüncü
        // alt dersi) numarayı sıfırlamadan devam ettirir (Kimya 8'den,
        // Biyoloji 15'ten başlaması gibi) — bkz. TopluDersAtamaPaneli notu.
        const baslangic = Number(mevcutBlok.baslangic) || 1
        return { ...s, ders_adi: mevcutBlok.ders, soru_no: baslangic + sayacBuBlokta - 1 }
      })
    })
    setBlokPaneliGoster(false)
    setBasari('Toplu atama uygulandı. Şimdi sayfaları hızlıca gözden geçirip, varsa yanlış yerdeki nadir kutuları düzeltin.')
  }

  function soruGuncelle(gecici_id, alanlar) {
    setSorular((liste) => liste.map((s) => (s.gecici_id === gecici_id ? { ...s, ...alanlar } : s)))
  }

  function soruSil(gecici_id) {
    setSorular((liste) => liste.filter((s) => s.gecici_id !== gecici_id))
    setSeciliIndex((i) => Math.max(0, i - 1))
  }

  function soruEkle() {
    const buSayfa = sorular[seciliIndex]?.sayfa_no || sayfaGoruntuleri[0]?.sayfaNo || 1
    const yeni = {
      gecici_id: `manuel-${Date.now()}`,
      ders_adi: '',
      soru_no: sorular.length + 1,
      sayfa_no: buSayfa,
      x: 20,
      y: 20,
      genislik: 200,
      yukseklik: 150,
    }
    setSorular((liste) => {
      const yeniListe = [...liste, yeni]
      setSeciliIndex(yeniListe.length - 1)
      return yeniListe
    })
    setCizimModu(true)
  }

  async function kaydet() {
    setHata('')
    setBasari('')
    if (sorular.length === 0) {
      setHata('Kaydedilecek soru yok.')
      return
    }
    const eksikler = sorular.filter((s) => !s.ders_adi.trim() || !s.soru_no)
    if (eksikler.length > 0) {
      setHata(`${eksikler.length} sorunun ders adı ya da soru numarası eksik — önce onları tamamlayın.`)
      return
    }
    setKaydediliyor(true)
    try {
      let sinavId = seciliSinavId
      if (sinavId === '__yeni__') {
        // Sınav adı BİLEREK tam büyük harf düzeltmesinden geçirilmiyor —
        // admin geri kalanını tam olarak yazdığı gibi (manuel) kaydetmek
        // istiyor, ama TYT/YKS/AYT gibi istisna kelimeler yine büyütülüyor.
        const { data, error } = await supabase
          .from('sinavlar')
          .insert({ sinav_adi: buyukIstisnalariDuzelt(yeniSinavAdi.trim()), sinav_tarihi: yeniSinavTarihi || null, tur: yeniSinavTuru })
          .select()
          .single()
        if (error && error.code === '23505') {
          // Bu isimde bir sınav zaten var (muhtemelen A kitapçığını kaydederken
          // oluşturulmuş, şimdi B kitapçığı için ya da yanlışlıkla "+ Yeni sınav
          // ekle" ile aynı isim tekrar yazılmış olabilir). Hata vermek yerine
          // var olan sınavı bulup ONA kaydediyoruz — admin'in dropdown'dan
          // seçmesini beklemek yerine bunu otomatik toparlıyoruz.
          const { data: mevcutSinav, error: bulmaHatasi } = await supabase
            .from('sinavlar')
            .select('id')
            .eq('sinav_adi', buyukIstisnalariDuzelt(yeniSinavAdi.trim()))
            .single()
          if (bulmaHatasi || !mevcutSinav) throw error
          sinavId = mevcutSinav.id
        } else if (error) {
          throw error
        } else {
          sinavId = data.id
        }
      }

      // Düzenleme modunda (mevcut bir kitapçığı düzeltiyorsak) ve admin YENİ
      // bir dosya seçmediyse, PDF'i tekrar yüklemeye gerek yok — zaten
      // Storage'da duran dosyanın yolunu (pdf_yolu) aynen koruyoruz. Sadece
      // yeni PDF seçilmişse (ör. yanlış dosya yüklenmiş, düzeltiliyor) gerçek
      // bir yükleme yapılır.
      // GÜVENLİK KİLİDİ: duzenlenenKitapcik'in pdf_yolu'sunu SADECE hâlâ AYNI
      // harf (A/B) düzenleniyorsa miras alıyoruz. Eskiden buradaki kontrol
      // harfe bakmıyordu — admin "A"yı düzenlerken (Düzenle) harfi "B"ye
      // değiştirip yeni bir PDF SEÇMEDEN kaydederse, B kaydı A'nın PDF'ini
      // sessizce çalıyordu. Batuhan Aka'nın TYT sonucundaki "A/B karışıklığı"
      // teşhisinin kök nedeni tam olarak buydu: sistemde aynı sınav için A ve
      // B kitapçığı, İKİSİ DE aynı PDF dosyasına işaret ediyordu. Artık harf
      // uyuşmuyorsa dosyaYolu null kalır ve aşağıdaki "Lütfen bir PDF seçin"
      // hatası admin'i gerçek bir B dosyası seçmeye zorlar.
      let dosyaYolu =
        duzenlenenKitapcik && duzenlenenKitapcik.kitapcik === kitapcikTuru ? duzenlenenKitapcik.pdf_yolu : null
      if (dosya) {
        dosyaYolu = `${sinavId}/${kitapcikTuru}-${Date.now()}.pdf`
        const { error: yuklemeHatasi } = await supabase.storage
          .from('sinav-kitapciklari')
          .upload(dosyaYolu, dosya, { contentType: 'application/pdf' })
        if (yuklemeHatasi) throw yuklemeHatasi
      } else if (!dosyaYolu) {
        throw new Error('Lütfen bir PDF seçin.')
      }

      const { data: kitapcikVerisi, error: kitapcikHatasi } = await supabase
        .from('sinav_kitapciklari')
        .upsert(
          {
            sinav_id: sinavId,
            kitapcik: kitapcikTuru,
            pdf_yolu: dosyaYolu,
            sayfa_sayisi: sayfaGoruntuleri.length,
            onaylandi: true,
            olcek: kullanilanOlcek || 3,
          },
          { onConflict: 'sinav_id,kitapcik' }
        )
        .select()
        .single()
      if (kitapcikHatasi) throw kitapcikHatasi

      // Aynı kitapçık daha önce kaydedilmişse eski soru haritasını temizleyip yeniden yazıyoruz.
      await supabase.from('sinav_kitapcik_sorulari').delete().eq('kitapcik_id', kitapcikVerisi.id)

      const satirlar = sorular.map((s) => ({
        kitapcik_id: kitapcikVerisi.id,
        ders_adi: ilkHarfleriBuyukYap(s.ders_adi.trim()),
        soru_no: Number(s.soru_no),
        sayfa_no: s.sayfa_no,
        x: s.x,
        y: s.y,
        genislik: s.genislik,
        yukseklik: s.yukseklik,
        // Ortak Parça — bkz. migration_sinav_kitapcik_ortak_parca.sql. Parçası
        // olmayan sorularda hepsi null kalır.
        parca_sayfa_no: s.parca_sayfa_no ?? null,
        parca_x: s.parca_x ?? null,
        parca_y: s.parca_y ?? null,
        parca_genislik: s.parca_genislik ?? null,
        parca_yukseklik: s.parca_yukseklik ?? null,
      }))
      const { error: soruHatasi } = await supabase.from('sinav_kitapcik_sorulari').insert(satirlar)
      if (soruHatasi) throw soruHatasi

      setBasari(`✓ ${satirlar.length} soru kaydedildi. Bu kitapçık artık öğrenci hata kitapçıkları için hazır.`)
      setSeciliSinavId('')
      setYeniSinavAdi('')
      setYeniSinavTarihi('')
      setDosya(null)
      setSayfaGoruntuleri([])
      setSorular([])
      setKullanilanOlcek(null)
      setDuzenlenenKitapcik(null)
      veriyiYenile()
    } catch (e) {
      setHata('Hata: ' + e.message)
    } finally {
      setKaydediliyor(false)
    }
  }

  const seciliSoru = sorular[seciliIndex]
  const buSayfaGoruntusu = sayfaGoruntuleri.find((g) => g.sayfaNo === seciliSoru?.sayfa_no)
  const buSayfadakiSorular = sorular.filter((s) => s.sayfa_no === seciliSoru?.sayfa_no)
  const tamamlananSayisi = sorular.filter((s) => s.ders_adi.trim() && s.soru_no).length

  return (
    <div>
      {/* Ders adı önerileri — hem Toplu Ders Ataması paneli hem de tek tek
          düzenleme ekranındaki "Ders Adı" kutuları bunu kullanıyor. Burada,
          bileşenin en üstünde, HER ZAMAN render edildiği için hangi panel
          açık olursa olsun öneriler çalışır. */}
      <datalist id="ders-onerileri">
        {DERS_ONERILERI.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <h1 className="text-2xl font-bold text-navy mb-2">Sınav Kitapçıkları</h1>
      <p className="text-sm text-gray-500 mb-6">
        {isYonetici ? (
          <>
            Bir kitapçığın (A/B) taranmış PDF'ini yükleyin, sistem soruların yaklaşık yerini otomatik bulmaya çalışır,
            siz her birini kontrol edip onaylarsınız. Bu işlem her kitapçık için SADECE BİR KERE yapılır — sonra o
            sınavı giren her öğrencinin yanlış sorularını buradan otomatik kesip kişiye özel kitapçık üretebiliriz.
          </>
        ) : (
          'Kayıtlı kitapçıkların listesi aşağıda — hata analizi için orijinal PDF\'i "İndir" ile indirebilirsiniz.'
        )}
      </p>

      {duzenlenenKitapcik && (
        <div className="bg-navy/5 border border-navy/20 rounded-2xl p-4 mb-6 flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-navy font-semibold">✎ Düzenleme modu — mevcut bir kitapçığın soru haritası düzeltiliyor, PDF yeniden yüklenmeyecek.</p>
          <button
            type="button"
            onClick={duzenlemeyiIptalEt}
            className="text-xs font-semibold text-gray-500 hover:underline"
          >
            Düzenlemeyi İptal Et
          </button>
        </div>
      )}

      {sinavlar.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto mb-6" style={{ touchAction: 'pan-x pan-y' }}>
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-gray-700">Sınavlar</h2>
            {isYonetici && (
              <p className="text-xs text-gray-400 mt-0.5">
                Yanlışlıkla ya da deneme amaçlı eklenmiş bir sınavı buradan silebilirsiniz — o sınava ait TÜM
                kitapçıklar ve öğrenci sonuçları da birlikte silinir.
              </p>
            )}
          </div>
          <table className="w-full text-sm min-w-[400px]">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Sınav</th>
                <th className="px-4 py-2 font-medium">Tarih</th>
                <th className="px-4 py-2 font-medium">Tür</th>
                <th className="px-4 py-2 font-medium text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {sinavlar.map((s) =>
                duzenlenenSinavId === s.id ? (
                  <tr key={s.id} className="border-t border-gray-50 bg-blue/5">
                    <td className="px-4 py-2">
                      <input
                        value={duzenlenenSinavAdi}
                        onChange={(e) => setDuzenlenenSinavAdi(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                        autoFocus
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="date"
                        value={duzenlenenSinavTarihi}
                        onChange={(e) => setDuzenlenenSinavTarihi(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={duzenlenenSinavTuru}
                        onChange={(e) => setDuzenlenenSinavTuru(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue"
                      >
                        <option value="TYT">TYT</option>
                        <option value="AYT">AYT</option>
                        <option value="Konu Analiz">Konu Analiz</option>
                        <option value="Diğer">Diğer</option>
                      </select>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => sinavDuzenlemeyiKaydet(s.id)}
                        disabled={sinavAdiKaydediliyor}
                        className="text-navy text-sm font-semibold hover:underline disabled:opacity-50 mr-4"
                      >
                        {sinavAdiKaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
                      </button>
                      <button
                        onClick={sinavDuzenlemeyiVazgec}
                        disabled={sinavAdiKaydediliyor}
                        className="text-gray-400 text-sm hover:underline disabled:opacity-50"
                      >
                        Vazgeç
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id} className="border-t border-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-800">{s.sinav_adi}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {s.sinav_tarihi ? new Date(s.sinav_tarihi).toLocaleDateString('tr-TR') : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          !s.tur || s.tur === 'Diğer' ? 'bg-gray-100 text-gray-500' : 'bg-blue/10 text-blue'
                        }`}
                      >
                        {s.tur || 'Diğer'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {isYonetici && (
                        <>
                          <button
                            onClick={() => sinavDuzenlemeyeBasla(s)}
                            className="text-navy text-sm font-semibold hover:underline mr-4"
                          >
                            Düzenle
                          </button>
                          <button
                            onClick={() => sinavSil(s)}
                            disabled={silinenSinavId === s.id}
                            className="text-red-500 text-sm hover:underline disabled:opacity-50"
                          >
                            {silinenSinavId === s.id ? 'Siliniyor...' : 'Sil'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {kitapciklar.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto mb-6" style={{ touchAction: 'pan-x pan-y' }}>
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-gray-700">Kayıtlı Kitapçıklar</h2>
          </div>
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Sınav</th>
                <th className="px-4 py-2 font-medium">Kitapçık</th>
                <th className="px-4 py-2 font-medium">Sayfa</th>
                <th className="px-4 py-2 font-medium">Durum</th>
                <th className="px-4 py-2 font-medium text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {kitapciklar.map((k) => (
                <tr key={k.id} className="border-t border-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{k.sinavlar?.sinav_adi}</td>
                  <td className="px-4 py-2">{k.kitapcik}</td>
                  <td className="px-4 py-2 text-gray-500">{k.sayfa_sayisi}</td>
                  <td className="px-4 py-2">
                    {k.onaylandi ? (
                      <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-full">Hazır</span>
                    ) : (
                      <span className="text-xs font-semibold bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">Onay bekliyor</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => kitapcikIndir(k)}
                      disabled={indirilenKitapcikId === k.id}
                      className="text-navy text-sm font-semibold hover:underline disabled:opacity-50 mr-4"
                    >
                      {indirilenKitapcikId === k.id ? 'İndiriliyor...' : 'İndir'}
                    </button>
                    {isYonetici && (
                      <>
                        <button
                          onClick={() => kitapcikDuzenle(k)}
                          disabled={duzenlemeYukleniyorId !== null}
                          className="text-navy text-sm font-semibold hover:underline disabled:opacity-50 mr-4"
                        >
                          {duzenlemeYukleniyorId === k.id ? 'Açılıyor...' : 'Düzenle'}
                        </button>
                        <button
                          onClick={() => kitapcikSil(k)}
                          disabled={silinenKitapcikId === k.id}
                          className="text-red-500 text-sm hover:underline disabled:opacity-50"
                        >
                          {silinenKitapcikId === k.id ? 'Siliniyor...' : 'Sil'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Kitapçık yükleme + OCR/soru-bölgesi inceleme akışının TAMAMI
          (aşağıdaki "Yeni Kitapçık Yükle" formundan, en alttaki soru
          düzenleme popup'ına kadar) SADECE YÖNETİCİYE gösteriliyor —
          öğretmen bu sayfaya sadece kayıtlı kitapçıkları görmek/indirmek
          için erişiyor (bkz. yukarıdaki "Kayıtlı Kitapçıklar" tablosu),
          yükleme/düzenleme/silme yetkisi yok. */}
      {isYonetici && (
      <>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <p className="font-semibold text-gray-700 mb-3">Yeni Kitapçık Yükle</p>
        <div className="flex flex-wrap gap-3 items-end mb-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sınav</label>
            <select
              value={seciliSinavId}
              onChange={(e) => setSeciliSinavId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
            >
              <option value="">Seçiniz...</option>
              <option value="__yeni__">+ Yeni sınav ekle</option>
              {sinavlar.map((s) => (
                <option key={s.id} value={s.id}>{s.sinav_adi}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[130px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Kitapçık</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  // Düzenlenmekte olan kitapçık (Düzenle'ye basılmış) BAŞKA
                  // bir harfe aitse, harf değişimiyle birlikte o eski
                  // düzenleme durumunu/önizlemeyi tamamen temizliyoruz —
                  // yoksa eski PDF/soru kutuları yeni harfe yanlışlıkla
                  // miras kalabilirdi (bkz. kaydet() içindeki güvenlik kilidi).
                  if (duzenlenenKitapcik && duzenlenenKitapcik.kitapcik !== 'A') {
                    setDuzenlenenKitapcik(null)
                    setDosya(null)
                    setSayfaGoruntuleri([])
                    setSorular([])
                    setKullanilanOlcek(null)
                  }
                  setKitapcikTuru('A')
                }}
                className={`px-3 py-2 rounded-lg text-sm font-semibold ${kitapcikTuru === 'A' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
              >
                A
              </button>
              <button
                type="button"
                onClick={() => {
                  if (duzenlenenKitapcik && duzenlenenKitapcik.kitapcik !== 'B') {
                    setDuzenlenenKitapcik(null)
                    setDosya(null)
                    setSayfaGoruntuleri([])
                    setSorular([])
                    setKullanilanOlcek(null)
                  }
                  setKitapcikTuru('B')
                }}
                className={`px-3 py-2 rounded-lg text-sm font-semibold ${kitapcikTuru === 'B' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
              >
                B
              </button>
            </div>
          </div>
        </div>

        {seciliSinavId === '__yeni__' && (
          <div className="flex flex-wrap gap-3 items-end mb-3 bg-gray-50 border border-gray-100 rounded-lg p-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Yeni Sınav Adı</label>
              <input
                value={yeniSinavAdi}
                onChange={(e) => setYeniSinavAdi(e.target.value)}
                placeholder="örn. 50. TYT Denemesi"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>
            <div className="min-w-[150px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tarih (opsiyonel)</label>
              <input
                type="date"
                value={yeniSinavTarihi}
                onChange={(e) => setYeniSinavTarihi(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>
            <div className="min-w-[140px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Sınav Türü</label>
              <select
                value={yeniSinavTuru}
                onChange={(e) => setYeniSinavTuru(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue"
              >
                <option value="TYT">TYT</option>
                <option value="AYT">AYT</option>
                <option value="Konu Analiz">Konu Analiz</option>
                <option value="Diğer">Diğer</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Kitapçık PDF'i</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setDosya(e.target.files?.[0] || null)}
              className="w-full text-sm"
            />
          </div>
          <button
            type="button"
            onClick={analizEt}
            disabled={analizEdiliyor}
            className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {analizEdiliyor ? 'Hazırlanıyor...' : 'Kitapçığı Analiz Et (OCR)'}
          </button>
          <button
            type="button"
            onClick={elleIsaretlemeyeBasla}
            disabled={analizEdiliyor}
            className="bg-navy text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {analizEdiliyor ? 'Hazırlanıyor...' : 'Hızlı Elle İşaretle (OCR\'sız)'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Grafik/tablo/resim içeren, düzensiz uzunlukta sorulardan oluşan kitapçıklarda (ör. AYT Matematik) OCR
          çoğu soruyu bulamayabilir — bu durumda "Hızlı Elle İşaretle" ile her sorunun sol üst köşesine sırayla
          tek tıklayarak çok daha hızlı ve hatasız sonuç alırsınız.
        </p>

        {analizEdiliyor && <p className="text-sm text-blue mt-3">{analizDurumu} (sayfa sayısına göre birkaç dakika sürebilir, sayfayı kapatmayın.)</p>}
        {hata && <p className="text-red-600 text-sm mt-3">{hata}</p>}
        {!hata && basari && <p className="text-green-600 text-sm mt-3">{basari}</p>}
      </div>

      {elleIsaretlemeModu && sayfaGoruntuleri[elleSayfaIndex] && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
          <div className="bg-blue/5 border border-blue/20 rounded-lg p-3 mb-4 text-sm text-gray-700">
            <p className="font-semibold text-navy mb-1">Nasıl kullanılır:</p>
            <p>
              Sayfada, HER sorunun numarasının olduğu SOL ÜST köşeye, okuma sırasına göre (yukarıdan aşağı, sonra
              soldan sağa sütuna) TEK TEK tıklayın. Kutu boyutunu siz çizmiyorsunuz — bir sonraki tıklamaya kadar
              olan alanı sistem otomatik kutu yapıyor. Sayfada soru yoksa (kapak, boş sayfa vb.) hiç tıklamadan
              sonraki sayfaya geçin.
            </p>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <p className="font-semibold text-gray-700">
              Sayfa {elleSayfaIndex + 1} / {sayfaGoruntuleri.length} — toplam işaretlenen: {elleNoktalar.length}
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={elleSonNoktayiGeriAl}
                disabled={elleNoktalar.length === 0}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              >
                ↺ Son Noktayı Geri Al
              </button>
              <button
                type="button"
                onClick={() => setElleSayfaIndex((i) => Math.max(0, i - 1))}
                disabled={elleSayfaIndex === 0}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              >
                ← Önceki Sayfa
              </button>
              <button
                type="button"
                onClick={() => setElleSayfaIndex((i) => Math.min(sayfaGoruntuleri.length - 1, i + 1))}
                disabled={elleSayfaIndex === sayfaGoruntuleri.length - 1}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              >
                Sonraki Sayfa →
              </button>
              <button
                type="button"
                onClick={() => setElleIsaretlemeModu(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-100"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={noktalariKutuyaCevir}
                disabled={elleNoktalar.length === 0}
                className="bg-orange text-white font-semibold px-4 py-1.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-40"
              >
                Tamamla → Kutulara Çevir ({elleNoktalar.length})
              </button>
            </div>
          </div>

          <NoktaIsaretlemeKatmani
            sayfaGoruntusu={sayfaGoruntuleri[elleSayfaIndex]}
            buSayfadakiNoktalar={elleNoktalar
              .map((n, i) => ({ ...n, globalSira: i + 1 }))
              .filter((n) => n.sayfaNo === sayfaGoruntuleri[elleSayfaIndex].sayfaNo)}
            onNoktaEkle={(nokta) => elleNoktaEkle(sayfaGoruntuleri[elleSayfaIndex].sayfaNo, nokta)}
          />
        </div>
      )}

      {sorular.length > 0 && blokPaneliGoster && (
        <TopluDersAtamaPaneli
          toplamSoru={sorular.length}
          onUygula={topluAta}
          onVazgec={() => setBlokPaneliGoster(false)}
          onGeriDon={elleNoktalar.length > 0 ? elleIsaretlemeyeGeriDon : null}
          baslangicBloklari={baslangicBloklariHesapla()}
        />
      )}

      {sorular.length > 0 && !blokPaneliGoster && seciliSoru && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
          <div className="bg-blue/5 border border-blue/20 rounded-lg p-3 mb-4 text-sm text-gray-700 space-y-1">
            <p className="font-semibold text-navy">Nasıl kullanılır — her aday için tek tek:</p>
            <p>1. Turuncu kutu sayfada GERÇEK bir soruyu mu gösteriyor bak. Değilse (logo, başlık, yönerge yazısı gibi bir yeri işaretlemişse) sağdan <b>"Bu Soruyu Sil"</b>e bas, sıradaki adaya geç.</p>
            <p>2. Gerçek bir soruysa sağa <b>Ders Adı</b> (örn. Türkçe) ve <b>Soru No</b>'yu yaz.</p>
            <p>3. Kutu soruyu tam kapsamıyorsa <b>"Kutuyu Yeniden Çiz"</b>e basıp sayfada soruyu fare ile sürükleyerek yeniden kutula.</p>
            <p>4. <b>Sonraki →</b> ile devam et. Hepsini bitirince en alttaki <b>"Onayla ve Kaydet"</b>e bas.</p>
            <p className="pt-1 border-t border-blue/10 mt-1">
              <b>Not:</b> "Kutuyu Yeniden Çiz" ya da "+ Eksik Soru Ekle"ye bastığında sayfanın üstünde turuncu bir
              uyarı çıkar ve fare imleci artı işaretine döner — o an sayfada, sorunun sol üst köşesinden sağ alt
              köşesine kadar fareyi BASILI TUTARAK sürüklemen bekleniyor. Yanlışlıkla bu moda girdiysen sağdaki
              <b> "Vazgeç"</b>e bas, hiçbir şey değişmez.
            </p>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <p className="font-semibold text-gray-700">
                Soru {seciliIndex + 1} / {sorular.length} — {tamamlananSayisi} tanesi dolduruldu
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setBlokPaneliGoster(true)}
                  className="text-xs text-navy font-semibold hover:underline"
                >
                  ↺ Toplu Ders Atamaya Dön
                </button>
                {elleNoktalar.length > 0 && (
                  <button
                    type="button"
                    onClick={elleIsaretlemeyeGeriDon}
                    className="text-xs text-orange font-semibold hover:underline"
                  >
                    ↺ Soru Noktalarına Dön (Eksik Soru Ekle)
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSeciliIndex(0)}
                disabled={seciliIndex === 0}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              >
                ⏮ Başa Dön
              </button>
              <button
                type="button"
                onClick={() => setSeciliIndex((i) => Math.max(0, i - 1))}
                disabled={seciliIndex === 0}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              >
                ← Önceki
              </button>
              <button
                type="button"
                onClick={() => setSeciliIndex((i) => Math.min(sorular.length - 1, i + 1))}
                disabled={seciliIndex === sorular.length - 1}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              >
                Sonraki →
              </button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-5">
            <div className="lg:w-2/3">
              {buSayfaGoruntusu && (
                <KutuKatmani
                  sayfaGoruntusu={buSayfaGoruntusu}
                  sorularBuSayfada={buSayfadakiSorular}
                  seciliGeciciId={seciliSoru.gecici_id}
                  cizimModu={cizimModu}
                  onCizimBitti={(kutu) => {
                    if (cizimAlani === 'parca') {
                      soruGuncelle(seciliSoru.gecici_id, {
                        parca_sayfa_no: seciliSoru.sayfa_no,
                        parca_x: kutu.x,
                        parca_y: kutu.y,
                        parca_genislik: kutu.genislik,
                        parca_yukseklik: kutu.yukseklik,
                      })
                    } else {
                      soruGuncelle(seciliSoru.gecici_id, kutu)
                    }
                    setCizimModu(false)
                  }}
                  parcaKutusu={
                    seciliSoru.parca_x != null
                      ? {
                          x: seciliSoru.parca_x,
                          y: seciliSoru.parca_y,
                          genislik: seciliSoru.parca_genislik,
                          yukseklik: seciliSoru.parca_yukseklik,
                        }
                      : null
                  }
                />
              )}
              <p className="text-xs text-gray-400 mt-2">Sayfa {seciliSoru.sayfa_no}</p>
            </div>

            <div className="lg:w-1/3 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ders Adı</label>
                <input
                  list="ders-onerileri"
                  value={seciliSoru.ders_adi}
                  onChange={(e) => soruGuncelle(seciliSoru.gecici_id, { ders_adi: e.target.value })}
                  placeholder="örn. Türkçe"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Soru No (bu ders içinde)</label>
                <input
                  type="number"
                  min="1"
                  value={seciliSoru.soru_no}
                  onChange={(e) => soruGuncelle(seciliSoru.gecici_id, { soru_no: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setCizimAlani('soru')
                  setCizimModu(true)
                }}
                className={`w-full px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  cizimModu && cizimAlani === 'soru' ? 'bg-orange text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {cizimModu && cizimAlani === 'soru' ? '👆 Yukarıda sayfada sürükleyerek kutu çiz' : 'Kutuyu Yeniden Çiz'}
              </button>
              {cizimModu && (
                <button
                  type="button"
                  onClick={() => setCizimModu(false)}
                  className="w-full px-3 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-100"
                >
                  Vazgeç (kutu çizmeden çık)
                </button>
              )}

              {/* ORTAK PARÇA — "39-40. soruları aşağıdaki parçaya göre
                  cevaplayınız" gibi, bir okuma parçasının birden fazla soruya
                  bağlı olduğu durumlar için. Parça, sorunun kendi kutusundan
                  AYRI bir dikdörtgen olarak saklanır (bkz. yukarıdaki
                  onCizimBitti) — Hata Kitapçığı, bir soru yanlış/boş çıkınca
                  bu parçayı kendi kutusunun ÜSTÜNE ekleyerek basar. */}
              <div className="pt-3 mt-1 border-t border-gray-100 space-y-2">
                <p className="text-xs font-semibold text-purple-600">
                  Ortak Parça {seciliSoru.parca_x != null ? '(tanımlı)' : '(yok)'}
                </p>
                <p className="text-[11px] text-gray-400 leading-snug">
                  Bu soru, bir okuma parçasına bağlıysa (ör. "39-40. soruları aşağıdaki parçaya göre
                  cevaplayınız") parçayı burada ayrı bir kutu olarak işaretle — Hata Kitapçığı'nda bu soru
                  yanlış/boş çıkarsa parça, sorunun üstüne otomatik eklenir.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCizimAlani('parca')
                    setCizimModu(true)
                  }}
                  className={`w-full px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    cizimModu && cizimAlani === 'parca'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white border border-purple-200 text-purple-700 hover:bg-purple-50'
                  }`}
                >
                  {cizimModu && cizimAlani === 'parca'
                    ? '👆 Yukarıda parçayı sürükleyerek çiz'
                    : seciliSoru.parca_x != null
                    ? 'Parça Kutusunu Yeniden Çiz'
                    : '+ Ortak Parça Kutusu Çiz'}
                </button>
                {seciliSoru.parca_x != null && (
                  <button
                    type="button"
                    onClick={() =>
                      soruGuncelle(seciliSoru.gecici_id, {
                        parca_sayfa_no: null,
                        parca_x: null,
                        parca_y: null,
                        parca_genislik: null,
                        parca_yukseklik: null,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50"
                  >
                    Parçayı Kaldır
                  </button>
                )}
                {seciliSoru.parca_x != null && buSayfadakiSorular.length > 1 && (
                  <div className="bg-purple-50/60 border border-purple-100 rounded-lg p-2.5 space-y-1.5">
                    <p className="text-[11px] font-semibold text-purple-700">
                      Bu parçayı aynı sayfadaki başka sorulara da uygula:
                    </p>
                    <div className="max-h-28 overflow-auto space-y-1">
                      {buSayfadakiSorular
                        .filter((s) => s.gecici_id !== seciliSoru.gecici_id)
                        .map((s) => (
                          <label key={s.gecici_id} className="flex items-center gap-1.5 text-xs text-gray-600">
                            <input
                              type="checkbox"
                              checked={parcaUygulanacakIdler.includes(s.gecici_id)}
                              onChange={(e) =>
                                setParcaUygulanacakIdler((liste) =>
                                  e.target.checked
                                    ? [...liste, s.gecici_id]
                                    : liste.filter((id) => id !== s.gecici_id)
                                )
                              }
                            />
                            {s.ders_adi || '?'} {s.soru_no}
                          </label>
                        ))}
                    </div>
                    <button
                      type="button"
                      disabled={parcaUygulanacakIdler.length === 0}
                      onClick={() => {
                        const { parca_sayfa_no, parca_x, parca_y, parca_genislik, parca_yukseklik } = seciliSoru
                        setSorular((liste) =>
                          liste.map((s) =>
                            parcaUygulanacakIdler.includes(s.gecici_id)
                              ? { ...s, parca_sayfa_no, parca_x, parca_y, parca_genislik, parca_yukseklik }
                              : s
                          )
                        )
                        setParcaUygulanacakIdler([])
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:opacity-90 disabled:opacity-40"
                    >
                      Seçilenlere Uygula
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => soruSil(seciliSoru.gecici_id)}
                className="w-full px-3 py-2 rounded-lg text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50"
              >
                Bu Soruyu Sil (yanlış tespit)
              </button>

              <button
                type="button"
                onClick={soruEkle}
                className="w-full px-3 py-2 rounded-lg text-sm font-semibold text-navy border border-navy/20 hover:bg-navy/5"
              >
                + Eksik Soru Ekle
              </button>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-gray-400">
              Kaydetmeden önce tüm soruların ders adı ve numarası dolu olmalı. Kutu konumu tam oturmasa da olur,
              önemli olan doğru soruyu kapsaması.
            </p>
            <button
              type="button"
              onClick={kaydet}
              disabled={kaydediliyor}
              className="bg-orange text-white font-semibold px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
            >
              {kaydediliyor ? 'Kaydediliyor...' : 'Onayla ve Kaydet'}
            </button>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}
