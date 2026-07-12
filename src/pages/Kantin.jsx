import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { paraFormat } from '../lib/ekstreHesap'
import { ilkHarfleriBuyukYap } from '../lib/adSoyadFormat'

function yerelBugunTarihi() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// Yeni bir ürün için 8 haneli, rakamlardan oluşan bir barkod üretir (zamana
// dayalı olduğu için pratikte hiç çakışmaz). Elle barkod girmeye gerek yok.
function yeniBarkodUret() {
  return String(Date.now()).slice(-8)
}

// ============================================================================
// BARKOD (Code 39) — dışarıdan kütüphane eklemeden, saf JS ile barkod çizimi.
// Code 39, ucuz USB barkod okuyucuların neredeyse tamamının fabrika ayarıyla
// okuyabildiği en yaygın barkod türlerinden biri olduğu için seçildi.
// ============================================================================
const CODE39_DESENLERI = {
  '0': 'NNNWWNWNN', '1': 'WNNWNNNNW', '2': 'NNWWNNNNW', '3': 'WNWWNNNNN',
  '4': 'NNNWWNNNW', '5': 'WNNWWNNNN', '6': 'NNWWWNNNN', '7': 'NNNWNNWNW',
  '8': 'WNNWNNWNN', '9': 'NNWWNNWNN',
  // DÜZELTME: Bu başlangıç/bitiş ("*") deseni yanlış yazılmıştı (NNNWNWNNW).
  // Barkodun ortasındaki rakamlar doğru olsa da, tarayıcılar barkodu ancak
  // doğru "*" işaretiyle tanıyabiliyor — bu yüzden hiçbir kamera/okuyucu
  // şimdiye kadar üretilen barkodları okuyamıyordu. Doğrusu: NWNNWNWNN.
  '*': 'NWNNWNWNN',
}

function code39CubuklariUret(deger) {
  const icerik = `*${deger}*`
  const cubuklar = []
  for (const karakter of icerik) {
    const desen = CODE39_DESENLERI[karakter]
    if (!desen) continue
    for (let i = 0; i < desen.length; i++) {
      cubuklar.push({ siyah: i % 2 === 0, genis: desen[i] === 'W' })
    }
    cubuklar.push({ siyah: false, genis: false }) // karakterler arası dar boşluk
  }
  return cubuklar
}

function BarkodSVG({ deger, darBirim = 3, yukseklik = 60 }) {
  if (!deger) return null
  const cubuklar = code39CubuklariUret(deger)
  // Kamera/okuyucuların barkodu ayırt edebilmesi için sağda-solda boş bir
  // "sessiz bölge" (quiet zone) şart — yoksa bar kod bitişik gibi algılanıp
  // hiç okunmuyor.
  const kenarBosluk = darBirim * 10
  let x = kenarBosluk
  const dikdortgenler = []
  for (const c of cubuklar) {
    const genislik = c.genis ? darBirim * 3 : darBirim
    if (c.siyah) dikdortgenler.push(<rect key={x} x={x} y={0} width={genislik} height={yukseklik} fill="black" />)
    x += genislik
  }
  const toplamGenislik = x + kenarBosluk
  return (
    <svg width={toplamGenislik} height={yukseklik + 16} viewBox={`0 0 ${toplamGenislik} ${yukseklik + 16}`}>
      <rect x={0} y={0} width={toplamGenislik} height={yukseklik} fill="white" />
      {dikdortgenler}
      <text x={toplamGenislik / 2} y={yukseklik + 13} textAnchor="middle" fontSize="11" fontFamily="monospace">{deger}</text>
    </svg>
  )
}

// Yazdırma penceresi için barkodu SVG metni olarak üretir (React'siz, düz HTML).
function barkodSvgMetni(deger, darBirim = 4, yukseklik = 80) {
  const cubuklar = code39CubuklariUret(deger)
  const kenarBosluk = darBirim * 10
  let x = kenarBosluk
  let dikdortgenler = ''
  for (const c of cubuklar) {
    const genislik = c.genis ? darBirim * 3 : darBirim
    if (c.siyah) dikdortgenler += `<rect x="${x}" y="0" width="${genislik}" height="${yukseklik}" fill="black" />`
    x += genislik
  }
  const toplamGenislik = x + kenarBosluk
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${toplamGenislik}" height="${yukseklik + 20}" viewBox="0 0 ${toplamGenislik} ${yukseklik + 20}"><rect x="0" y="0" width="${toplamGenislik}" height="${yukseklik}" fill="white" />${dikdortgenler}<text x="${toplamGenislik / 2}" y="${yukseklik + 16}" text-anchor="middle" font-size="14" font-family="monospace">${deger}</text></svg>`
}

// Barkodun toplam piksel genişliğini önceden hesaplar — pencereyi barkoda göre
// boyutlandırmak için gerekli. Önceden pencere sabit (420px) boyuttaydı ama
// barkod bundan çok daha genişti; bu yüzden barkodun bir kısmı pencerenin
// dışında kalıyor, ekrandan okutmaya çalışan kamera barkodun TAMAMINI değil
// sadece kırpılmış bir kısmını görüyordu ve hiç okuyamıyordu.
function code39ToplamGenislik(deger, darBirim) {
  const cubuklar = code39CubuklariUret(deger)
  let x = darBirim * 10
  for (const c of cubuklar) x += c.genis ? darBirim * 3 : darBirim
  return x + darBirim * 10
}

function barkoduYazdir(urun) {
  const darBirim = 4
  const yukseklik = 80
  const barkodGenislik = code39ToplamGenislik(urun.barkod, darBirim)
  // Pencereyi barkodun tamamı sığacak şekilde açıyoruz (kırpılmasın diye),
  // en az 480 en fazla 1000 piksel genişlikte.
  const pencereGenislik = Math.min(Math.max(barkodGenislik + 80, 480), 1000)
  const pencere = window.open('', '_blank', `width=${pencereGenislik},height=360`)
  if (!pencere) {
    alert('Yazdırma penceresi açılamadı — tarayıcınız pop-up\'ı engellemiş olabilir.')
    return
  }
  pencere.document.write(`
    <html>
      <head>
        <title>${urun.ad} — Barkod</title>
        <style>
          @media print { .yazdirma-gizli { display: none; } }
        </style>
      </head>
      <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:sans-serif;padding:16px;box-sizing:border-box;">
        <p style="margin-bottom:12px;font-weight:600;">${urun.ad}</p>
        ${barkodSvgMetni(urun.barkod, darBirim, yukseklik)}
        <p class="yazdirma-gizli" style="margin-top:18px;font-size:12px;color:#888;max-width:340px;text-align:center;">
          Kağıda yapıştıracaksanız "Yazdır"a basın. Ekrandan okutacaksanız bu pencereyi
          açık bırakıp kamerayı barkoda yaklaştırın (barkodun tamamı, kenarlardaki boşluklarla
          birlikte kamerada görünmeli).
        </p>
        <button class="yazdirma-gizli" onclick="window.print()" style="margin-top:14px;padding:10px 22px;font-size:14px;font-weight:600;background:#1e3a5f;color:white;border:none;border-radius:8px;cursor:pointer;">
          Yazdır
        </button>
      </body>
    </html>
  `)
  pencere.document.close()
}

// ============================================================================
// ÜRÜN YÖNETİMİ — sadece yönetici görür. Kantin görevlisi ürün ekleyip
// düzenleyemez, sadece listeden seçip satış girer.
// ============================================================================
function UrunEkleForm({ onEklendi }) {
  const [ad, setAd] = useState('')
  const [fiyat, setFiyat] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [hata, setHata] = useState('')

  async function ekle(e) {
    e.preventDefault()
    setHata('')
    if (!ad.trim() || !fiyat) {
      setHata('Ürün adı ve fiyatı girin.')
      return
    }
    setGonderiliyor(true)
    const { error } = await supabase
      .from('kantin_urunler')
      .insert({ ad: ilkHarfleriBuyukYap(ad.trim()), fiyat: Number(fiyat), barkod: yeniBarkodUret() })
    setGonderiliyor(false)
    if (error) {
      setHata('Hata: ' + error.message)
    } else {
      setAd('')
      setFiyat('')
      onEklendi()
    }
  }

  return (
    <form onSubmit={ekle} className="flex flex-wrap gap-3 items-end mb-4">
      <div className="flex-1 min-w-[180px]">
        <label className="block text-sm font-medium text-gray-700 mb-1">Ürün Adı</label>
        <input
          value={ad}
          onChange={(e) => setAd(e.target.value)}
          placeholder="örn. Su"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
        />
      </div>
      <div className="min-w-[130px]">
        <label className="block text-sm font-medium text-gray-700 mb-1">Fiyat (₺)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={fiyat}
          onChange={(e) => setFiyat(e.target.value)}
          placeholder="10"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
        />
      </div>
      <button
        type="submit"
        disabled={gonderiliyor}
        className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {gonderiliyor ? 'Ekleniyor...' : 'Ürün Ekle'}
      </button>
      {hata && <p className="text-red-600 text-sm basis-full">{hata}</p>}
    </form>
  )
}

function UrunSatiri({ u, onKaydedildi, onVazgec }) {
  const [ad, setAd] = useState(u.ad)
  const [fiyat, setFiyat] = useState(String(u.fiyat))
  const [gonderiliyor, setGonderiliyor] = useState(false)

  async function kaydet() {
    if (!ad.trim() || !fiyat) return
    setGonderiliyor(true)
    const { error } = await supabase.from('kantin_urunler').update({ ad: ilkHarfleriBuyukYap(ad.trim()), fiyat: Number(fiyat) }).eq('id', u.id)
    setGonderiliyor(false)
    if (error) alert('Hata: ' + error.message)
    else onKaydedildi()
  }

  return (
    <tr className="bg-blue-50">
      <td className="px-4 py-2">
        <input value={ad} onChange={(e) => setAd(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={fiyat}
          onChange={(e) => setFiyat(e.target.value)}
          className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
        />
      </td>
      <td className="px-4 py-2 text-xs font-mono text-gray-400">{u.barkod || '—'}</td>
      <td className="px-4 py-2 text-gray-400 text-xs">—</td>
      <td className="px-4 py-2 text-right space-x-3 whitespace-nowrap">
        <button onClick={kaydet} disabled={gonderiliyor} className="text-green-600 text-sm font-semibold hover:underline">
          Kaydet
        </button>
        <button onClick={onVazgec} className="text-gray-500 text-sm hover:underline">Vazgeç</button>
      </td>
    </tr>
  )
}

function UrunYonetimi({ urunler, onDegisti }) {
  const [duzenlenenId, setDuzenlenenId] = useState(null)

  async function aktiflikDegistir(u) {
    const { error } = await supabase.from('kantin_urunler').update({ aktif: !u.aktif }).eq('id', u.id)
    if (error) alert('Hata: ' + error.message)
    else onDegisti()
  }

  async function sil(id) {
    if (!confirm('Bu ürünü silmek istediğinize emin misiniz? Geçmiş satışlar etkilenmez, sadece ürün listesinden kalkar.')) return
    const { error } = await supabase.from('kantin_urunler').delete().eq('id', id)
    if (error) alert('Hata: ' + error.message)
    else onDegisti()
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto mb-6">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="font-semibold text-gray-700">Ürün Yönetimi</h2>
        <p className="text-xs text-gray-400 mt-0.5">Kantin görevlisi satış ekranında sadece "Aktif" ürünleri görür.</p>
      </div>
      <div className="p-4 border-b border-gray-50">
        <UrunEkleForm onEklendi={onDegisti} />
      </div>
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="px-4 py-2 font-medium">Ürün</th>
            <th className="px-4 py-2 font-medium">Fiyat</th>
            <th className="px-4 py-2 font-medium">Barkod</th>
            <th className="px-4 py-2 font-medium">Durum</th>
            <th className="px-4 py-2 font-medium text-right">İşlemler</th>
          </tr>
        </thead>
        <tbody>
          {urunler.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-4 text-center text-gray-400">Henüz ürün eklenmedi.</td>
            </tr>
          )}
          {urunler.map((u) =>
            duzenlenenId === u.id ? (
              <UrunSatiri
                key={u.id}
                u={u}
                onKaydedildi={() => { setDuzenlenenId(null); onDegisti() }}
                onVazgec={() => setDuzenlenenId(null)}
              />
            ) : (
              <tr key={u.id} className="border-t border-gray-50">
                <td className="px-4 py-2 font-medium text-gray-800">{u.ad}</td>
                <td className="px-4 py-2">{paraFormat(u.fiyat)}</td>
                <td className="px-4 py-2">
                  {u.barkod ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-500">{u.barkod}</span>
                      <button onClick={() => barkoduYazdir(u)} className="text-blue text-xs hover:underline whitespace-nowrap">
                        Barkodu Yazdır
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {u.aktif ? (
                    <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-full">Aktif</span>
                  ) : (
                    <span className="text-xs font-semibold bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Pasif</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap space-x-3">
                  <button onClick={() => setDuzenlenenId(u.id)} className="text-navy text-sm hover:underline">Düzenle</button>
                  <button onClick={() => aktiflikDegistir(u)} className="text-blue text-sm hover:underline">
                    {u.aktif ? 'Pasif Yap' : 'Aktif Yap'}
                  </button>
                  <button onClick={() => sil(u.id)} className="text-red-500 text-sm hover:underline">Sil</button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// KANTİN ANA SAYFA — hem yönetici hem kantin rolü görür. Öğrenci bir kez
// seçilir (isim yazarak, listeden), sonra ürün ya "Barkod Okut" kutusuna
// okutularak ya da butona tıklanarak o öğrenciye ANINDA veresiye kaydı olarak
// eklenir. USB barkod okuyucular klavye gibi davranır (kodu yazıp Enter'a
// basar), bu yüzden ekstra bir donanım/API entegrasyonu gerekmiyor — okutma
// kutusunun odakta kalması yeterli.
// ============================================================================
export default function Kantin() {
  const { profile } = useAuth()
  const isYonetici = profile?.rol === 'yonetici'

  const [ogrenciler, setOgrenciler] = useState([])
  const [urunler, setUrunler] = useState([])
  const [alislar, setAlislar] = useState([])
  const [loading, setLoading] = useState(true)
  const ilkYuklemeTamamRef = useRef(false)

  const [ogrenciId, setOgrenciId] = useState('')
  const [ogrenciArama, setOgrenciArama] = useState('')
  const [adet, setAdet] = useState(1)
  const [ekleniyorUrunId, setEkleniyorUrunId] = useState(null)
  // Butona hızlı hızlı basılınca ya da barkod arka arkaya okununca birden
  // fazla satır açılmasını engelleyen kilit — bkz. urunEkle içindeki açıklama.
  const eklemeKilitliRef = useRef(false)
  const [hata, setHata] = useState('')
  const [basari, setBasari] = useState('')
  const [barkodDeger, setBarkodDeger] = useState('')
  const barkodInputRef = useRef(null)

  // ---- Kamerayla barkod okuma ----
  // İki yöntem var: (1) telefonun/tarayıcının kendi barkod tanıma motoru
  // (BarcodeDetector API) — Android Chrome'da donanım hızlandırmalı ve çok
  // daha güvenilir, bu yüzden varsa ÖNCELİKLE bu kullanılıyor. (2) Bu API'yi
  // desteklemeyen tarayıcılar (Safari, Firefox, eski Chrome) için CDN'den
  // yüklenen QuaggaJS kütüphanesi yedek olarak devrede kalıyor.
  const [kameraAcik, setKameraAcik] = useState(false)
  const [kameraYukleniyor, setKameraYukleniyor] = useState(false)
  const [kameraModu, setKameraModu] = useState(null) // 'algilayici' | 'quagga'
  const kameraKutusuRef = useRef(null) // Quagga'nın video/canvas eklediği kutu
  const videoElRef = useRef(null) // Native BarcodeDetector için kendi <video>'muz
  const mediaStreamRef = useRef(null)
  const algilamaAralikRef = useRef(null)
  const quaggaOkumaIsleyiciRef = useRef(null)
  const quaggaIslemeIsleyiciRef = useRef(null)
  // "Aynı ürün kaç kez görüldüyse o kadar eklendi" sorununu çözen kilit: bir
  // barkod eklendiğinde burada "kilitli" olarak tutulur ve kamera o barkodu
  // görmeye devam ettiği sürece (ürün hâlâ kadrajdaysa) TEKRAR EKLENMEZ.
  // Kilit ancak barkod kadrajdan tamamen çıkıp kaybolduğunda açılıyor — yani
  // aynı ürünü tekrar eklemek için ürünü bir an kameradan uzaklaştırıp
  // tekrar göstermeniz gerekiyor.
  const kilitliKodRef = useRef(null)
  // Bir okuma işlenirken (veritabanına kaydedilirken) gelen yeni okumaları
  // yok sayar — üst üste hızlı eklemeleri engelliyor.
  const islemSurerRef = useRef(false)
  // Quagga'nın algılama olayı sadece BİR KEZ kaydedildiği için (kamera açılırken),
  // içeride her zaman GÜNCEL değerleri kullanabilmek adına en son öğrenci/ürün
  // listesini ve en güncel urunEkle fonksiyonunu ref'lerde tutuyoruz.
  const aktifUrunlerRef = useRef([])
  const urunEkleRef = useRef(() => {})
  const kameraZamanAsimiRef = useRef(null)
  // Kamera açıkken kullanıcı ekranın altındaki mesajı fark etmiyor — okutunca
  // ne olduğu kameranın ÜSTÜNDE, büyük ve renkli olarak gösterilsin diye.
  const [kameraBildirim, setKameraBildirim] = useState(null) // { tur: 'basari'|'hata'|'yukleniyor', mesaj }
  const kameraBildirimZamanlayiciRef = useRef(null)

  function kameraBildirimGoster(tur, mesaj, sureMs = 2200) {
    setKameraBildirim({ tur, mesaj })
    if (kameraBildirimZamanlayiciRef.current) clearTimeout(kameraBildirimZamanlayiciRef.current)
    if (tur !== 'yukleniyor') {
      kameraBildirimZamanlayiciRef.current = setTimeout(() => setKameraBildirim(null), sureMs)
    }
  }

  function veriyiYenile() {
    if (!ilkYuklemeTamamRef.current) setLoading(true)
    const bugun = yerelBugunTarihi()
    Promise.all([
      supabase.from('ogrenciler').select('*').order('ad_soyad'),
      supabase.from('kantin_urunler').select('*').order('ad'),
      supabase.from('kantin_alislar').select('*').eq('tarih', bugun).order('created_at', { ascending: false }),
    ]).then(([o, u, a]) => {
      setOgrenciler((o.data || []).filter((x) => (x.durum || 'aktif') === 'aktif'))
      setUrunler(u.data || [])
      setAlislar(a.data || [])
      ilkYuklemeTamamRef.current = true
      setLoading(false)
    })
  }

  useEffect(() => {
    veriyiYenile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!loading) barkodInputRef.current?.focus()
  }, [loading])

  const ogrenciAdMap = useMemo(() => new Map(ogrenciler.map((o) => [o.id, o.ad_soyad])), [ogrenciler])

  const gorunenOgrenciler = useMemo(() => {
    const aranan = ogrenciArama.trim().toLocaleLowerCase('tr-TR')
    if (!aranan) return ogrenciler
    return ogrenciler.filter((o) => o.ad_soyad.toLocaleLowerCase('tr-TR').includes(aranan))
  }, [ogrenciler, ogrenciArama])

  const aktifUrunler = urunler.filter((u) => u.aktif)

  useEffect(() => {
    aktifUrunlerRef.current = aktifUrunler
  })

  // Geriye { ok, mesaj } döner — kamera okuması bu sonucu doğrudan kameranın
  // üstündeki bildirimde göstermek için kullanıyor.
  //
  // eklemeKilitliRef: butona hızlı hızlı (çift/üçlü) dokunulduğunda ya da
  // barkod arka arkaya okutulduğunda birden fazla kayıt açılmasını engeller.
  // "disabled" ile buton devre dışı bırakmak tek başına yetmiyordu, çünkü
  // ekranın yeniden çizilip butonu devre dışı göstermesi bir an sürüyor — bu
  // sırada atılan ikinci dokunuş yine de geçebiliyordu. Bu kilit ise ANINDA
  // (ekran yeniden çizilmeden) devreye giriyor, bu yüzden hiçbir ikinci
  // çağrı sızamıyor.
  async function urunEkle(urun) {
    if (eklemeKilitliRef.current) {
      return { ok: false, mesaj: 'Az önce bir ekleme yapıldı, bir saniye bekleyin.' }
    }
    eklemeKilitliRef.current = true
    setHata('')
    setBasari('')
    if (!ogrenciId) {
      eklemeKilitliRef.current = false
      const mesaj = 'Önce öğrenci seçin.'
      setHata(mesaj)
      return { ok: false, mesaj }
    }
    setEkleniyorUrunId(urun.id)
    const { error } = await supabase.from('kantin_alislar').insert({
      ogrenci_id: ogrenciId,
      urun_id: urun.id,
      urun_adi: urun.ad,
      birim_fiyat: urun.fiyat,
      adet,
      tutar: Number(urun.fiyat) * Number(adet),
      tarih: yerelBugunTarihi(),
    })
    setEkleniyorUrunId(null)
    let sonuc
    if (error) {
      const mesaj = 'Hata: ' + error.message
      setHata(mesaj)
      sonuc = { ok: false, mesaj }
    } else {
      const mesaj = `${ogrenciAdMap.get(ogrenciId) || 'Öğrenci'} — ${adet} x ${urun.ad} eklendi`
      setBasari(`✓ ${mesaj}.`)
      setAdet(1)
      veriyiYenile()
      sonuc = { ok: true, mesaj }
    }
    barkodInputRef.current?.focus()
    eklemeKilitliRef.current = false
    return sonuc
  }

  // Barkod okuyucu, tarattığı kodu klavyeden yazılmış gibi yazıp en sonunda
  // Enter'a basar — bu yüzden burada özel bir donanım/API entegrasyonu
  // gerekmiyor, sadece bu input'un odakta kalması yeterli.
  async function barkodOkutuldu(e) {
    e.preventDefault()
    const deger = barkodDeger.trim()
    setBarkodDeger('')
    if (!deger) return
    setHata('')
    setBasari('')
    if (!ogrenciId) {
      setHata('Önce öğrenci seçin.')
      barkodInputRef.current?.focus()
      return
    }
    const urun = aktifUrunler.find((u) => u.barkod === deger)
    if (!urun) {
      setHata(`Bu barkoda (${deger}) ait aktif bir ürün bulunamadı.`)
      barkodInputRef.current?.focus()
      return
    }
    await urunEkle(urun)
  }

  // urunEkle her render'da yeniden oluşuyor (ogrenciId'yi kendi içinde okuyor);
  // Quagga'nın olay dinleyicisi kamerayı açarken SADECE BİR KEZ kaydedildiği
  // için, dinleyici içinde her zaman en güncel urunEkle'yi çağırabilmek üzere
  // bunu bir ref'te güncel tutuyoruz.
  useEffect(() => {
    urunEkleRef.current = urunEkle
  })

  // QuaggaJS kütüphanesini sadece kamera ilk açıldığında, CDN üzerinden yükler
  // (projeye npm bağımlılığı eklemeye gerek kalmasın diye). Bazı ağlarda tek
  // bir CDN'e erişim sorunlu olabildiği için birden fazla kaynak sırayla denenir.
  function quaggaYukle() {
    const kaynaklar = [
      'https://cdn.jsdelivr.net/npm/quagga@0.12.1/dist/quagga.min.js',
      'https://unpkg.com/quagga@0.12.1/dist/quagga.min.js',
    ]
    return new Promise((resolve, reject) => {
      if (window.Quagga) {
        resolve(window.Quagga)
        return
      }
      let i = 0
      function dene() {
        if (i >= kaynaklar.length) {
          reject(new Error('Kamera kütüphanesi hiçbir kaynaktan yüklenemedi. İnternet bağlantınızı kontrol edin.'))
          return
        }
        const script = document.createElement('script')
        script.src = kaynaklar[i]
        script.onload = () => resolve(window.Quagga)
        script.onerror = () => {
          i += 1
          dene()
        }
        document.body.appendChild(script)
      }
      dene()
    })
  }

  // Bir barkod GERÇEKTEN eklenmeye değer mi? (kilitli değilse ve o an başka
  // bir okuma işlenmiyorsa) — kilitleme/kilit-açma mantığı, algılama döngüsü
  // (hem native BarcodeDetector hem Quagga tarafı) tarafından çağrılıyor.
  function kareGorundu(kod) {
    if (!kod) {
      // Bu karede barkod görünmüyor — ürün kadrajdan çıktı, kilidi kaldır ki
      // aynı ürün tekrar gösterildiğinde yeniden eklenebilsin.
      kilitliKodRef.current = null
      return
    }
    if (islemSurerRef.current) return // önceki ekleme hâlâ işleniyor
    if (kilitliKodRef.current === kod) return // bu ürün zaten eklendi, hâlâ kadrajda — tekrar ekleme
    kilitliKodRef.current = kod
    kameraOkuma({ codeResult: { code: kod } })
  }

  async function kameraOkuma(sonuc) {
    const kod = sonuc?.codeResult?.code
    if (!kod) return
    const urun = aktifUrunlerRef.current.find((u) => u.barkod === kod)
    if (!urun) {
      kameraBildirimGoster('hata', `Bilinmeyen barkod: ${kod}`)
      return
    }
    islemSurerRef.current = true
    // Telefon titreşimi + kameranın üstünde büyük "ekleniyor" yazısı — kullanıcı
    // okumanın gerçekten algılandığını hemen, aşağı bakmadan görsün.
    if (navigator.vibrate) navigator.vibrate(80)
    kameraBildirimGoster('yukleniyor', `${urun.ad} ekleniyor...`)
    const sonucEkle = await urunEkleRef.current(urun)
    if (sonucEkle) {
      kameraBildirimGoster(sonucEkle.ok ? 'basari' : 'hata', sonucEkle.ok ? `✓ ${sonucEkle.mesaj}` : sonucEkle.mesaj)
    }
    islemSurerRef.current = false
  }

  // Telefonun/tarayıcının kendi barkod tanıma motorunu (varsa) kullanır.
  // Android Chrome'da bu, işletim sistemi seviyesinde çalışıp donanımdan
  // yararlandığı için QuaggaJS'in saf JavaScript ile görüntüyü satır satır
  // taramasından çok daha güvenilir ve hızlı okuyor.
  async function kameraAlgilayiciDestekleniyorMu() {
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return false
    try {
      const formatlar = await window.BarcodeDetector.getSupportedFormats()
      return formatlar.includes('code_39')
    } catch {
      return false
    }
  }

  async function kameraDetectorIleAc(zamanAsimi) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })
    mediaStreamRef.current = stream
    setKameraModu('algilayici')
    setKameraAcik(true)
    // <video> elementinin DOM'a yerleşmesini bekle.
    setTimeout(async () => {
      const video = videoElRef.current
      if (!video) return
      video.srcObject = stream
      try {
        await video.play()
      } catch {
        // bazı tarayıcılarda otomatik oynatma anlık olarak reddedilebiliyor, sorun değil
      }
      clearTimeout(zamanAsimi)
      setKameraYukleniyor(false)
      const detector = new window.BarcodeDetector({ formats: ['code_39'] })
      algilamaAralikRef.current = setInterval(async () => {
        if (!video || video.readyState < 2) return
        try {
          const sonuclar = await detector.detect(video)
          kareGorundu(sonuclar && sonuclar.length > 0 ? sonuclar[0].rawValue : null)
        } catch {
          // tek bir karede okuma başarısız olabilir, bir sonraki karede tekrar dener
        }
      }, 300)
    }, 50)
  }

  async function kameraQuaggaIleAc(zamanAsimi) {
    const Quagga = await quaggaYukle()
    setKameraModu('quagga')
    setKameraAcik(true)
    // Kamera kutusunun (kameraKutusuRef) DOM'a gerçekten yerleşmesi için
    // bir sonraki render'ı bekliyoruz, yoksa Quagga hedef elementi bulamaz.
    setTimeout(() => {
      Quagga.init(
        {
          inputStream: {
            type: 'LiveStream',
            target: kameraKutusuRef.current,
            // "ideal" olarak istiyoruz — laptop/masaüstü gibi arka kamerası
            // olmayan cihazlarda "zorunlu" istenirse kamera hiç açılmıyordu.
            constraints: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          // numOfWorkers: 0 -> arka plan iş parçacığı (Web Worker) kullanmadan
          // ana iş parçacığında okusun. CDN'den yüklenen sürümlerde bazı
          // mobil tarayıcılarda worker'lar sessizce çalışmayıp kamera açık
          // görünse de barkod hiç okunmuyordu; bu ayar bunu ortadan kaldırıyor.
          numOfWorkers: 0,
          frequency: 10,
          locator: { patchSize: 'medium', halfSample: true },
          decoder: { readers: ['code_39_reader'], multiple: false },
          locate: true,
        },
        (hata) => {
          clearTimeout(zamanAsimi)
          setKameraYukleniyor(false)
          if (hata) {
            setHata('Kamera açılamadı: ' + (hata.message || hata.name || 'bilinmeyen hata') + ' (kameraya izin verdiniz mi?)')
            setKameraAcik(false)
            return
          }
          Quagga.start()
        }
      )
      quaggaOkumaIsleyiciRef.current = (sonuc) => kareGorundu(sonuc?.codeResult?.code)
      // Quagga sadece BAŞARILI okumada onDetected'i tetikliyor; barkodun
      // kadrajdan çıktığını anlayabilmemiz (kilidi açabilmemiz) için her
      // işlenen karede (başarısız olsa da) onProcessed'i de dinliyoruz.
      quaggaIslemeIsleyiciRef.current = (sonuc) => {
        if (!sonuc || !sonuc.codeResult) kilitliKodRef.current = null
      }
      Quagga.onDetected(quaggaOkumaIsleyiciRef.current)
      Quagga.onProcessed(quaggaIslemeIsleyiciRef.current)
    }, 50)
  }

  async function kamerayiAc() {
    setHata('')
    if (!ogrenciId) {
      setHata('Önce öğrenci seçin.')
      return
    }
    setKameraYukleniyor(true)
    setKameraBildirim(null)
    kilitliKodRef.current = null
    islemSurerRef.current = false

    // Kamera bazı durumlarda (izin penceresi kapatılırsa, kamera bulunamazsa vb.)
    // hiç callback çağırmadan asılı kalabiliyor — bu yüzden 8 saniye içinde
    // açılmazsa kullanıcıyı bekletmemek için otomatik olarak hata gösteriyoruz.
    const zamanAsimi = setTimeout(() => {
      setKameraYukleniyor(false)
      setKameraAcik(false)
      setHata('Kamera 8 saniyede açılamadı. Tarayıcının adres çubuğunda kamera izni engellenmiş olabilir, ya da bu cihazda/tarayıcıda kamera erişimi desteklenmiyor olabilir.')
    }, 8000)
    kameraZamanAsimiRef.current = zamanAsimi

    try {
      const algilayiciVarMi = await kameraAlgilayiciDestekleniyorMu()
      if (algilayiciVarMi) {
        await kameraDetectorIleAc(zamanAsimi)
      } else {
        await kameraQuaggaIleAc(zamanAsimi)
      }
    } catch (e) {
      clearTimeout(zamanAsimi)
      setKameraYukleniyor(false)
      setKameraAcik(false)
      setHata(e.message)
    }
  }

  function kamerayiKapat() {
    if (kameraZamanAsimiRef.current) clearTimeout(kameraZamanAsimiRef.current)
    if (kameraBildirimZamanlayiciRef.current) clearTimeout(kameraBildirimZamanlayiciRef.current)
    if (algilamaAralikRef.current) {
      clearInterval(algilamaAralikRef.current)
      algilamaAralikRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }
    if (window.Quagga) {
      if (quaggaOkumaIsleyiciRef.current) window.Quagga.offDetected(quaggaOkumaIsleyiciRef.current)
      if (quaggaIslemeIsleyiciRef.current) window.Quagga.offProcessed(quaggaIslemeIsleyiciRef.current)
      window.Quagga.stop()
    }
    kilitliKodRef.current = null
    islemSurerRef.current = false
    setKameraAcik(false)
    setKameraYukleniyor(false)
    setKameraBildirim(null)
    setKameraModu(null)
  }

  // Sayfadan tamamen ayrılırken kamera açık kalmasın.
  useEffect(() => {
    return () => {
      if (window.Quagga) window.Quagga.stop()
      if (algilamaAralikRef.current) clearInterval(algilamaAralikRef.current)
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      if (kameraBildirimZamanlayiciRef.current) clearTimeout(kameraBildirimZamanlayiciRef.current)
    }
  }, [])

  async function sil(id) {
    if (!confirm('Bu alışı silmek istediğinize emin misiniz? (borç da kaldırılacak)')) return
    const { error } = await supabase.from('kantin_alislar').delete().eq('id', id)
    if (error) alert('Hata: ' + error.message)
    else veriyiYenile()
  }

  const gununToplami = alislar.reduce((t, a) => t + Number(a.tutar), 0)

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">Kantin</h1>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <p className="font-semibold text-gray-700 mb-3">Satış Ekle</p>
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Öğrenci</label>
            <input
              type="text"
              value={ogrenciArama}
              onChange={(e) => setOgrenciArama(e.target.value)}
              placeholder="İsim yazarak ara..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg mb-1.5 focus:outline-none focus:ring-2 focus:ring-blue"
            />
            <select
              value={ogrenciId}
              onChange={(e) => setOgrenciId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue"
            >
              <option value="">Seçiniz...</option>
              {gorunenOgrenciler.map((o) => (
                <option key={o.id} value={o.id}>{o.ad_soyad}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Adet</label>
            <div
              className={`flex items-center rounded-lg overflow-hidden bg-white border-2 ${
                adet > 1 ? 'border-orange' : 'border-gray-200'
              }`}
            >
              <button
                type="button"
                onClick={() => setAdet((a) => Math.max(1, a - 1))}
                className="w-11 h-11 flex items-center justify-center text-xl font-bold text-gray-600 hover:bg-gray-50"
              >
                −
              </button>
              <span className={`flex-1 text-center text-xl font-bold ${adet > 1 ? 'text-orange' : 'text-gray-800'}`}>
                {adet}
              </span>
              <button
                type="button"
                onClick={() => setAdet((a) => a + 1)}
                className="w-11 h-11 flex items-center justify-center text-xl font-bold text-gray-600 hover:bg-gray-50"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {ogrenciId ? (
          <p className="text-sm text-gray-500 mb-2">
            Seçili öğrenci: <span className="font-semibold text-navy">{ogrenciAdMap.get(ogrenciId)}</span> — barkod okutun ya da aşağıdan ürüne tıklayın, anında kaydedilir.
          </p>
        ) : (
          <p className="text-sm text-orange-600 mb-2">Önce yukarıdan bir öğrenci seçin.</p>
        )}

        <div className="flex flex-wrap items-end gap-3 mb-4">
          <form onSubmit={barkodOkutuldu} className="flex-1 min-w-[240px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Barkod Okut</label>
            <input
              ref={barkodInputRef}
              type="text"
              value={barkodDeger}
              onChange={(e) => setBarkodDeger(e.target.value)}
              placeholder="USB okuyucuyla okutun (ya da elle yazıp Enter'a basın)"
              autoComplete="off"
              className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
            />
          </form>
          {!kameraAcik ? (
            <button
              type="button"
              onClick={kamerayiAc}
              disabled={kameraYukleniyor}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {kameraYukleniyor ? 'Kamera açılıyor...' : '📷 Kamerayla Okut'}
            </button>
          ) : (
            <button
              type="button"
              onClick={kamerayiKapat}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50"
            >
              Kamerayı Kapat
            </button>
          )}
        </div>

        {kameraAcik && (
          <div className="mb-4">
            <div
              className="relative w-full max-w-sm rounded-lg overflow-hidden border border-gray-200 bg-black"
              style={{ minHeight: 220 }}
            >
              {kameraModu === 'algilayici' ? (
                <video
                  ref={videoElRef}
                  className="absolute inset-0 w-full h-full object-cover"
                  playsInline
                  muted
                />
              ) : (
                // Quagga sadece bu iç kutunun içine video/canvas ekliyor — üstteki
                // bildirim ayrı bir katman olduğu için birbirine karışmıyor.
                <div ref={kameraKutusuRef} className="absolute inset-0" />
              )}

              {kameraBildirim && (
                <>
                  <div
                    className={`absolute inset-0 pointer-events-none transition-colors ${
                      kameraBildirim.tur === 'basari'
                        ? 'bg-green-500/30'
                        : kameraBildirim.tur === 'hata'
                        ? 'bg-red-500/30'
                        : 'bg-black/10'
                    }`}
                  />
                  <div
                    className={`absolute inset-x-0 bottom-0 px-3 py-3 text-center text-sm font-bold text-white ${
                      kameraBildirim.tur === 'basari'
                        ? 'bg-green-600'
                        : kameraBildirim.tur === 'hata'
                        ? 'bg-red-600'
                        : 'bg-gray-700'
                    }`}
                  >
                    {kameraBildirim.tur === 'basari' && '✓ '}
                    {kameraBildirim.tur === 'hata' && '✗ '}
                    {kameraBildirim.mesaj}
                  </div>
                </>
              )}
            </div>
            {/* Kameranın hemen altında da bir "kapat" butonu — kutuya bakarken elinizi
                yukarı kaydırmadan da kapatabilesiniz diye. */}
            <button
              type="button"
              onClick={kamerayiKapat}
              className="mt-2 w-full max-w-sm px-4 py-2 rounded-lg text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50"
            >
              Kamerayı Kapat
            </button>
            <p className="text-xs text-gray-400 mt-1">
              Barkodu kameradan yaklaşık 10-15 cm uzakta, iyi ışıkta ve tüm barkod (etrafındaki boşluklarla
              birlikte) kutunun içinde kalacak şekilde sabit tutun — bulanıksa biraz uzaklaştırıp yaklaştırarak
              netleşmesini bekleyin. Ürün okunduğunda kutunun üstünde yeşil bir onay yazısı çıkar. Aynı ürünü
              tekrar eklemek için barkodu bir an kameradan uzaklaştırıp tekrar gösterin — kamerada göründüğü
              sürece aynı ürün ikinci kez eklenmez.
            </p>
          </div>
        )}

        {/* Ürün listesinin hemen üstünde adet hatırlatıcısı — kullanıcı yukarı
            kaydırmadan, tam ürüne basacağı yerde kaç adet ekleyeceğini görsün
            ve isterse buradan da değiştirebilsin. */}
        <div className="flex items-center justify-between gap-3 mb-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <span className="text-sm text-gray-500">
            Aşağıdaki bir ürüne bastığınızda <span className="font-semibold text-gray-700">{adet} adet</span> eklenecek
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAdet((a) => Math.max(1, a - 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 bg-white text-base font-bold text-gray-600 hover:bg-gray-100"
            >
              −
            </button>
            <span className={`w-8 text-center text-lg font-bold ${adet > 1 ? 'text-orange' : 'text-gray-800'}`}>
              {adet}
            </span>
            <button
              type="button"
              onClick={() => setAdet((a) => a + 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 bg-white text-base font-bold text-gray-600 hover:bg-gray-100"
            >
              +
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {aktifUrunler.map((u) => (
            <button
              key={u.id}
              type="button"
              disabled={!ogrenciId || ekleniyorUrunId === u.id}
              onClick={() => urunEkle(u)}
              className="text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-orange hover:bg-orange-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <p className="font-semibold text-gray-800 text-sm leading-tight">{u.ad}</p>
              <p className="text-xs text-gray-500">{paraFormat(u.fiyat)}</p>
            </button>
          ))}
          {aktifUrunler.length === 0 && (
            <p className="text-sm text-gray-400 col-span-full">
              {isYonetici ? 'Henüz ürün eklenmedi, aşağıdaki "Ürün Yönetimi"nden ekleyin.' : 'Henüz ürün eklenmedi.'}
            </p>
          )}
        </div>

        {hata && <p className="text-red-600 text-sm mt-3">{hata}</p>}
        {!hata && basari && <p className="text-green-600 text-sm mt-3">{basari}</p>}
      </div>

      {isYonetici && <UrunYonetimi urunler={urunler} onDegisti={veriyiYenile} />}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-semibold text-gray-700">Bugünkü Alışlar</h2>
            <p className="text-xs text-gray-400 mt-0.5">Yanlış girilen bir satırı "Sil" ile geri alabilirsiniz.</p>
          </div>
          <p className="text-sm font-semibold text-navy">Bugünün Toplamı: {paraFormat(gununToplami)}</p>
        </div>
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Saat</th>
              <th className="px-4 py-2 font-medium">Öğrenci</th>
              <th className="px-4 py-2 font-medium">Ürün</th>
              <th className="px-4 py-2 font-medium">Adet</th>
              <th className="px-4 py-2 font-medium">Tutar</th>
              <th className="px-4 py-2 font-medium text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {alislar.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">Bugün henüz kayıt yok.</td>
              </tr>
            )}
            {alislar.map((a) => (
              <tr key={a.id} className="border-t border-gray-50">
                <td className="px-4 py-2 text-gray-500">
                  {new Date(a.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-4 py-2 font-medium text-gray-800">{ogrenciAdMap.get(a.ogrenci_id) || '—'}</td>
                <td className="px-4 py-2">{a.urun_adi}</td>
                <td className="px-4 py-2">{a.adet}</td>
                <td className="px-4 py-2">{paraFormat(a.tutar)}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => sil(a.id)} className="text-red-500 text-sm hover:underline">Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
