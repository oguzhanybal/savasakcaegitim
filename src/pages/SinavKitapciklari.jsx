import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ilkHarfleriBuyukYap } from '../lib/adSoyadFormat'
import {
  pdfBelgesiAc,
  sayfayiGoruntuyeCevir,
  sayfadaSoruNumaralariniTespitEt,
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
function KutuKatmani({ sayfaGoruntusu, sorularBuSayfada, seciliGeciciId, cizimModu, onCizimBitti }) {
  const containerRef = useRef(null)
  const [cizilen, setCizilen] = useState(null)

  function ekrandanDogalKoordinata(clientX, clientY) {
    const rect = containerRef.current.getBoundingClientRect()
    const oranX = sayfaGoruntusu.genislik / rect.width
    const oranY = sayfaGoruntusu.yukseklik / rect.height
    return { x: (clientX - rect.left) * oranX, y: (clientY - rect.top) * oranY }
  }

  function mouseDown(e) {
    if (!cizimModu) return
    const p = ekrandanDogalKoordinata(e.clientX, e.clientY)
    setCizilen({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  function mouseMove(e) {
    if (!cizimModu || !cizilen) return
    const p = ekrandanDogalKoordinata(e.clientX, e.clientY)
    setCizilen((c) => ({ ...c, x1: p.x, y1: p.y }))
  }
  function mouseUp() {
    if (!cizimModu || !cizilen) return
    const x = Math.min(cizilen.x0, cizilen.x1)
    const y = Math.min(cizilen.y0, cizilen.y1)
    const genislik = Math.abs(cizilen.x1 - cizilen.x0)
    const yukseklik = Math.abs(cizilen.y1 - cizilen.y0)
    setCizilen(null)
    if (genislik > 5 && yukseklik > 5) onCizimBitti({ x, y, genislik, yukseklik })
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ cursor: cizimModu ? 'crosshair' : 'default' }}
      onMouseDown={mouseDown}
      onMouseMove={mouseMove}
      onMouseUp={mouseUp}
      onMouseLeave={() => setCizilen(null)}
    >
      {cizimModu && (
        <div className="absolute inset-x-0 -top-11 z-10 bg-orange text-white text-sm font-semibold text-center py-2 rounded-lg shadow-md animate-pulse">
          👇 Aşağıdaki sayfada, sorunun SOL ÜST köşesine tıklayıp basılı tutarak SAĞ ALT köşesine kadar sürükle, sonra bırak.
        </div>
      )}
      <img
        src={sayfaGoruntusu.dataUrl}
        alt={`Sayfa ${sayfaGoruntusu.sayfaNo}`}
        className="w-full block rounded-lg border border-gray-200"
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
  )
}

export default function SinavKitapciklari() {
  const [sinavlar, setSinavlar] = useState([])
  const [kitapciklar, setKitapciklar] = useState([])
  const [seciliSinavId, setSeciliSinavId] = useState('')
  const [yeniSinavAdi, setYeniSinavAdi] = useState('')
  const [yeniSinavTarihi, setYeniSinavTarihi] = useState('')
  const [kitapcikTuru, setKitapcikTuru] = useState('A')
  const [dosya, setDosya] = useState(null)

  const [analizEdiliyor, setAnalizEdiliyor] = useState(false)
  const [analizDurumu, setAnalizDurumu] = useState('')
  const [sayfaGoruntuleri, setSayfaGoruntuleri] = useState([])
  const [sorular, setSorular] = useState([])
  const [seciliIndex, setSeciliIndex] = useState(0)
  const [cizimModu, setCizimModu] = useState(false)

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

  useEffect(() => {
    veriyiYenile()
  }, [])

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
      for (let s = 1; s <= sayfaSayisi; s++) {
        setAnalizDurumu(`Sayfa ${s}/${sayfaSayisi} görüntüye çevriliyor...`)
        const { dataUrl, genislik, yukseklik, canvas } = await sayfayiGoruntuyeCevir(belge, s, 2)
        goruntuler.push({ sayfaNo: s, dataUrl, genislik, yukseklik })
        setAnalizDurumu(`Sayfa ${s}/${sayfaSayisi} taranıyor (OCR)...`)
        const adaylarHam = await sayfadaSoruNumaralariniTespitEt(canvas, genislik, yukseklik, (ilerleme) => {
          setAnalizDurumu(`Sayfa ${s}/${sayfaSayisi} taranıyor (OCR) — %${Math.round(ilerleme * 100)}`)
        })
        const adaylar = girintiliAdaylariEle(adaylarHam, genislik)
        const sutunlu = sutunSiralaTahmini(adaylar, genislik).map((a) => ({ ...a, sayfa_no: s }))
        sayfaVerileri.push({ sayfaNo: s, genislik, yukseklik, sutunluAdaylar: sutunlu })
        tumAdaylarSirali.push(...sutunlu)
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
        const { data, error } = await supabase
          .from('sinavlar')
          .insert({ sinav_adi: ilkHarfleriBuyukYap(yeniSinavAdi.trim()), sinav_tarihi: yeniSinavTarihi || null })
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
            .eq('sinav_adi', yeniSinavAdi.trim())
            .single()
          if (bulmaHatasi || !mevcutSinav) throw error
          sinavId = mevcutSinav.id
        } else if (error) {
          throw error
        } else {
          sinavId = data.id
        }
      }

      const dosyaYolu = `${sinavId}/${kitapcikTuru}-${Date.now()}.pdf`
      const { error: yuklemeHatasi } = await supabase.storage
        .from('sinav-kitapciklari')
        .upload(dosyaYolu, dosya, { contentType: 'application/pdf' })
      if (yuklemeHatasi) throw yuklemeHatasi

      const { data: kitapcikVerisi, error: kitapcikHatasi } = await supabase
        .from('sinav_kitapciklari')
        .upsert(
          { sinav_id: sinavId, kitapcik: kitapcikTuru, pdf_yolu: dosyaYolu, sayfa_sayisi: sayfaGoruntuleri.length, onaylandi: true },
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
      <h1 className="text-2xl font-bold text-navy mb-2">Sınav Kitapçıkları</h1>
      <p className="text-sm text-gray-500 mb-6">
        Bir kitapçığın (A/B) taranmış PDF'ini yükleyin, sistem soruların yaklaşık yerini otomatik bulmaya çalışır,
        siz her birini kontrol edip onaylarsınız. Bu işlem her kitapçık için SADECE BİR KERE yapılır — sonra o
        sınavı giren her öğrencinin yanlış sorularını buradan otomatik kesip kişiye özel kitapçık üretebiliriz.
      </p>

      {kitapciklar.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto mb-6">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-gray-700">Kayıtlı Kitapçıklar</h2>
          </div>
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Sınav</th>
                <th className="px-4 py-2 font-medium">Kitapçık</th>
                <th className="px-4 py-2 font-medium">Sayfa</th>
                <th className="px-4 py-2 font-medium">Durum</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
                onClick={() => setKitapcikTuru('A')}
                className={`px-3 py-2 rounded-lg text-sm font-semibold ${kitapcikTuru === 'A' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
              >
                A
              </button>
              <button
                type="button"
                onClick={() => setKitapcikTuru('B')}
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
            {analizEdiliyor ? 'Analiz ediliyor...' : 'Kitapçığı Analiz Et'}
          </button>
        </div>

        {analizEdiliyor && <p className="text-sm text-blue mt-3">{analizDurumu} (sayfa sayısına göre birkaç dakika sürebilir, sayfayı kapatmayın.)</p>}
        {hata && <p className="text-red-600 text-sm mt-3">{hata}</p>}
        {!hata && basari && <p className="text-green-600 text-sm mt-3">{basari}</p>}
      </div>

      {sorular.length > 0 && seciliSoru && (
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
            <p className="font-semibold text-gray-700">
              Soru {seciliIndex + 1} / {sorular.length} — {tamamlananSayisi} tanesi dolduruldu
            </p>
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
                    soruGuncelle(seciliSoru.gecici_id, kutu)
                    setCizimModu(false)
                  }}
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
                <datalist id="ders-onerileri">
                  {DERS_ONERILERI.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
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
                onClick={() => setCizimModu(true)}
                className={`w-full px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  cizimModu ? 'bg-orange text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {cizimModu ? '👆 Yukarıda sayfada sürükleyerek kutu çiz' : 'Kutuyu Yeniden Çiz'}
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
    </div>
  )
}
