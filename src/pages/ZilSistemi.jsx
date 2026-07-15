import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { sesSisteminiEtkinlestir, cikisZiliCal } from '../lib/zilSesiCal'

// ============================================================================
// ZİL SİSTEMİ — kurumun bilgisayarının saati kayıyor (eski donanım), bu yüzden
// zil yanlış saatte çalıyordu. Çözüm: bu sayfa, bilgisayarın kendi saatine
// DEĞİL, Supabase sunucusundan alınan gerçek saate göre çalışır — bilgisayarın
// saati (hatta saat dilimi ayarı) yanlış olsa bile zil doğru saatte çalar.
//
// Yapı, kurumun kullandığı "Supper Zill" tarzı programlara benziyor: her ders
// için üç ayrı zil — Öğrenci (derse girme), Öğretmen (öğretmenin başlaması,
// varsayılan öğrenci+1dk) ve Çıkış (ders bitişi, varsayılan öğretmen+45dk).
// Üç zil de aynı özel sesi kullanır (bkz. zilSesiCal.js — cikisZiliCal); bu
// dosya bulunamazsa/çalınamazsa otomatik olarak standart sentetik "ding-dong"
// sesine (zilSesiCal) geri döner.
//
// Bu sayfa hep açık bir sekmede, herkesin ulaşabileceği bir bilgisayarda
// duracağı için, yönetici hesabı o bilgisayarda açık bırakılmasın diye SADECE
// bu sayfayı görebilen ayrı bir "zil" rolü var (bkz. Layout.jsx, App.jsx).
//
// UZAKTAN KONTROL: Bu sayfa, aynı hesapla (ör. yönetici, telefondan) başka
// bir cihazda da açılabilir. Oradaki "Manuel Çal" butonları ve "Durdur/
// Başlat" butonu, "zil_uzaktan_komutlar" tablosuna bir satır ekler; Supabase
// Realtime sayesinde, sayfa açık olan TÜM cihazlar bu satırı anında görür.
// AMA SES SADECE "zil" ROLÜYLE açık olan cihazda çalar — yönetici hesabıyla
// (ör. telefondan) açılan sayfa sadece bir UZAKTAN KUMANDA gibi davranır,
// kendi başına ses çıkarmaz. Böylece "uzaktan zil çal" dediğinde ses sadece
// kurumdaki (zil hesabıyla açık) bilgisayarda duyulur, komutu gönderen
// telefonda değil.
// ============================================================================

// ÖNEMLİ: Saat dilimi burada "Europe/Istanbul" olarak SABİTLENMİŞTİR —
// bilgisayarın kendi saat dilimi ayarı ne olursa olsun, zil her zaman
// Türkiye saatine göre hesaplanır.
const TURKIYE_SAAT_DILIMI = 'Europe/Istanbul'

function saatKisalt(s) {
  return s ? s.slice(0, 5) : s
}

function turkiyeSaatBilesenleri(d) {
  const parcalar = new Intl.DateTimeFormat('en-GB', {
    timeZone: TURKIYE_SAAT_DILIMI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const bul = (tip) => parcalar.find((p) => p.type === tip)?.value
  return {
    yil: bul('year'),
    ay: bul('month'),
    gun: bul('day'),
    saat: bul('hour'),
    dakika: bul('minute'),
    saniye: bul('second'),
  }
}

function saatMetni(d) {
  const { saat, dakika, saniye } = turkiyeSaatBilesenleri(d)
  return `${saat}:${dakika}:${saniye}`
}

function turkiyeTarihAnahtari(d) {
  const { yil, ay, gun } = turkiyeSaatBilesenleri(d)
  return `${yil}-${ay}-${gun}`
}

// "HH:MM" formatındaki bir saate dakika ekler/çıkarır, gün sınırını sarar
// (ör. 23:50 + 20dk = 00:10).
function saateDakikaEkle(saatStr, dakika) {
  if (!saatStr) return ''
  const [h, m] = saatStr.split(':').map(Number)
  let toplam = h * 60 + m + dakika
  toplam = ((toplam % 1440) + 1440) % 1440
  const yeniH = Math.floor(toplam / 60)
  const yeniM = toplam % 60
  return `${String(yeniH).padStart(2, '0')}:${String(yeniM).padStart(2, '0')}`
}

const BOS_FORM = { devre: '', dersNo: '', ogrenci: '', ogretmen: '', cikis: '' }

export default function ZilSistemi() {
  const { profile } = useAuth()
  const isYonetici = profile?.rol === 'yonetici'
  // Ses SADECE "zil" rolüyle açık olan cihazda çalar — bkz. dosya başındaki not.
  const isZil = profile?.rol === 'zil'

  const [dersler, setDersler] = useState([])
  const [loading, setLoading] = useState(true)
  const [hata, setHata] = useState('')

  // ---- Sunucu saatiyle senkronizasyon ----
  const [sunucuFarki, setSunucuFarki] = useState(0)
  const [senkronDurumu, setSenkronDurumu] = useState('bekliyor') // 'bekliyor' | 'tamam' | 'hata'
  const [sonSenkronZamani, setSonSenkronZamani] = useState(null)

  const [gosterilenSaat, setGosterilenSaat] = useState(new Date())
  const [etkinMi, setEtkinMi] = useState(false)
  const [uzaktanBilgi, setUzaktanBilgi] = useState('')
  const [susturmaSaatSecimi, setSusturmaSaatSecimi] = useState(1)
  // "2 saat zil çalma" gibi geçici susturma — bu, doğru (sunucudan alınan)
  // saate göre bir bitiş anı (ms) tutar. Süre dolunca otomatik olarak
  // kendiliğinden kalkar, "Zili Durdur"un aksine elle "Başlat"a gerek yoktur.
  const [susturBitisMs, setSusturBitisMs] = useState(null)
  const calinanlarRef = useRef(new Set())
  // Ring-check ve uzaktan komut dinleme kapanışları (closure) her zaman GÜNCEL
  // sunucuFarki'na erişsin diye bir ref'te de tutuyoruz (bağımlılık dizisi
  // boş olan efektler için).
  const sunucuFarkiRef = useRef(0)
  useEffect(() => {
    sunucuFarkiRef.current = sunucuFarki
  }, [sunucuFarki])

  // ---- Yeni ders ekleme formu — Öğrenci girilince Öğretmen (+1dk),
  // Öğretmen (elle ya da otomatik) belli olunca Çıkış (+45dk) öneriliyor.
  // Kullanıcı öneriyi elle değiştirirse, bir sonraki otomatik öneri onu ezmez.
  const [form, setForm] = useState(BOS_FORM)
  const [ogretmenOtomatikMi, setOgretmenOtomatikMi] = useState(true)
  const [cikisOtomatikMi, setCikisOtomatikMi] = useState(true)
  const [ekleniyor, setEkleniyor] = useState(false)

  async function derslerYukle() {
    const { data, error } = await supabase
      .from('zil_dersleri')
      .select('*')
      .order('sira', { ascending: true })
    if (error) setHata(error.message)
    else setDersler(data || [])
    setLoading(false)
  }

  async function senkronizeEt() {
    const oncekiAn = Date.now()
    const { data, error } = await supabase.rpc('simdiki_zaman')
    const sonrakiAn = Date.now()
    if (error || !data) {
      setSenkronDurumu('hata')
      return
    }
    const sunucuMs = new Date(data).getTime()
    const tahminiGecikme = (sonrakiAn - oncekiAn) / 2
    const yerelReferansAn = oncekiAn + tahminiGecikme
    setSunucuFarki(sunucuMs - yerelReferansAn)
    setSenkronDurumu('tamam')
    setSonSenkronZamani(new Date())
  }

  useEffect(() => {
    derslerYukle()
    senkronizeEt()
    const senkronId = setInterval(senkronizeEt, 10 * 60 * 1000)
    return () => clearInterval(senkronId)
  }, [])

  // Her saniye: gösterilen saati güncelle, zil zamanı geldiyse çal.
  useEffect(() => {
    const id = setInterval(() => {
      const suanki = new Date(Date.now() + sunucuFarki)
      setGosterilenSaat(suanki)
      // Susturma süresi dolduysa kendiliğinden kalksın.
      if (susturBitisMs && suanki.getTime() >= susturBitisMs) setSusturBitisMs(null)
      // Otomatik zil SADECE "zil" hesabıyla açık olan cihazda gerçekten çalar
      // — yönetici hesabıyla açık olan sayfa (ör. telefon) sadece durumu
      // görür, kendi başına ses çıkarmaz.
      if (!isZil) return
      if (!etkinMi) return
      if (susturBitisMs && suanki.getTime() < susturBitisMs) return
      const b = turkiyeSaatBilesenleri(suanki)
      const suankiHHMM = `${b.saat}:${b.dakika}`
      const suankiSaniye = Number(b.saniye)
      if (suankiSaniye > 2) return
      const bugunAnahtari = turkiyeTarihAnahtari(suanki)

      dersler.forEach((d) => {
        if (!d.aktif) return
        ;[
          { alan: 'ogrenci_saat', sesFonksiyonu: cikisZiliCal },
          { alan: 'ogretmen_saat', sesFonksiyonu: cikisZiliCal },
          { alan: 'cikis_saat', sesFonksiyonu: cikisZiliCal },
        ].forEach(({ alan, sesFonksiyonu }) => {
          const saat = d[alan]
          if (!saat || saatKisalt(saat) !== suankiHHMM) return
          const anahtar = `${d.id}_${alan}_${bugunAnahtari}`
          if (calinanlarRef.current.has(anahtar)) return
          calinanlarRef.current.add(anahtar)
          sesFonksiyonu()
        })
      })
    }, 1000)
    return () => clearInterval(id)
  }, [sunucuFarki, etkinMi, dersler, susturBitisMs, isZil])

  // ---- Uzaktan komutları dinle (ör. telefondan gönderilen manuel çal /
  // durdur / başlat) — Supabase Realtime ile, sayfa açık olan TÜM cihazlara
  // anında ulaşır. Bağlantı kesilip yeniden kurulduğunda eski (>15 saniyelik)
  // komutların "geç" gelip tekrar işlenmemesi için zaman kontrolü var.
  useEffect(() => {
    const kanal = supabase
      .channel('zil-uzaktan-komutlar')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'zil_uzaktan_komutlar' },
        (payload) => {
          const komut = payload.new
          const komutZamaniMs = new Date(komut.created_at).getTime()
          const suankiSunucuMs = Date.now() + sunucuFarkiRef.current
          if (suankiSunucuMs - komutZamaniMs > 15000) return

          // Durum bilgisi (rozet/mesaj) TÜM cihazlarda güncellenir — ama SES
          // sadece "zil" rolüyle açık olan cihazda çalar (isZil kontrolü).
          if (komut.komut === 'baslat') {
            if (isZil) sesSisteminiEtkinlestir()
            setEtkinMi(true)
            setUzaktanBilgi('Zil, uzaktan (başka bir cihazdan) başlatıldı.')
          } else if (komut.komut === 'durdur') {
            setEtkinMi(false)
            setUzaktanBilgi('Zil, uzaktan (başka bir cihazdan) durduruldu.')
          } else if (komut.komut === 'sustur') {
            const dakika = Number(komut.sure_dakika) || 0
            setSusturBitisMs(suankiSunucuMs + dakika * 60000)
            const saat = Math.floor(dakika / 60)
            const dk = dakika % 60
            const sureMetni = saat > 0 ? `${saat} saat${dk > 0 ? ` ${dk} dk` : ''}` : `${dk} dk`
            setUzaktanBilgi(`Zil, uzaktan ${sureMetni} susturuldu.`)
          } else if (komut.komut === 'susturma_kaldir') {
            setSusturBitisMs(null)
            setUzaktanBilgi('Susturma, uzaktan kaldırıldı.')
          } else {
            const etiketler = { cal_ogrenci: 'Öğrenci Zili', cal_ogretmen: 'Öğretmen Zili', cal_cikis: 'Çıkış Zili' }
            const etiket = etiketler[komut.komut]
            if (!etiket) return
            if (isZil) cikisZiliCal()
            setUzaktanBilgi(`Manuel "${etiket}" komutu uzaktan tetiklendi.`)
          }
        }
      )
      .subscribe()
    return () => supabase.removeChannel(kanal)
  }, [])

  async function uzaktanKomutGonder(komut, sureDakika = null) {
    sesSisteminiEtkinlestir()
    const { error } = await supabase.from('zil_uzaktan_komutlar').insert({ komut, sure_dakika: sureDakika })
    if (error) alert('Komut gönderilemedi: ' + error.message)
  }

  // "2 saat / 3 saat zil çalma" — hem bu cihazda hemen etkili olsun (iyimser
  // güncelleme) hem de diğer cihazlara (ör. kurumdaki bilgisayar) uzaktan
  // komutla ulaşsın diye ikisi de yapılıyor.
  function susturmaBaslat(dakika) {
    setSusturBitisMs(Date.now() + sunucuFarki + dakika * 60000)
    uzaktanKomutGonder('sustur', dakika)
  }

  function susturmayiKaldir() {
    setSusturBitisMs(null)
    uzaktanKomutGonder('susturma_kaldir')
  }

  const susturuluyorMu = susturBitisMs != null && gosterilenSaat.getTime() < susturBitisMs

  const siradakiZil = useMemo(() => {
    const b = turkiyeSaatBilesenleri(gosterilenSaat)
    const suankiHHMMSS = `${b.saat}:${b.dakika}:${b.saniye}`
    const tumZiller = []
    dersler
      .filter((d) => d.aktif)
      .forEach((d) => {
        ;[
          { alan: 'ogrenci_saat', tur: 'Öğrenci' },
          { alan: 'ogretmen_saat', tur: 'Öğretmen' },
          { alan: 'cikis_saat', tur: 'Çıkış' },
        ].forEach(({ alan, tur }) => {
          if (!d[alan]) return
          tumZiller.push({
            saat: saatKisalt(d[alan]),
            etiket: `${d.devre ? d.devre + ' — ' : ''}${d.ders_no}. Ders (${tur})`,
          })
        })
      })
    tumZiller.sort((a, b2) => a.saat.localeCompare(b2.saat))
    const sonraki = tumZiller.find((z) => `${z.saat}:00` > suankiHHMMSS)
    return sonraki || tumZiller[0] || null
  }, [dersler, gosterilenSaat])

  function zilBaslat() {
    sesSisteminiEtkinlestir()
    setEtkinMi(true)
    uzaktanKomutGonder('baslat')
  }

  function zilDurdur() {
    setEtkinMi(false)
    uzaktanKomutGonder('durdur')
  }

  function formuSifirla() {
    setForm(BOS_FORM)
    setOgretmenOtomatikMi(true)
    setCikisOtomatikMi(true)
  }

  function ogrenciDegisti(v) {
    setForm((f) => {
      const yeni = { ...f, ogrenci: v }
      if (ogretmenOtomatikMi) {
        yeni.ogretmen = saateDakikaEkle(v, 1)
        if (cikisOtomatikMi) yeni.cikis = saateDakikaEkle(yeni.ogretmen, 45)
      }
      return yeni
    })
  }

  function ogretmenDegisti(v) {
    setOgretmenOtomatikMi(false)
    setForm((f) => {
      const yeni = { ...f, ogretmen: v }
      if (cikisOtomatikMi) yeni.cikis = saateDakikaEkle(v, 45)
      return yeni
    })
  }

  function cikisDegisti(v) {
    setCikisOtomatikMi(false)
    setForm((f) => ({ ...f, cikis: v }))
  }

  async function dersEkle(e) {
    e.preventDefault()
    if (!form.dersNo || !form.ogrenci) return
    setEkleniyor(true)
    const { error } = await supabase.from('zil_dersleri').insert({
      devre: form.devre.trim() || null,
      ders_no: Number(form.dersNo),
      ogrenci_saat: form.ogrenci,
      ogretmen_saat: form.ogretmen || null,
      cikis_saat: form.cikis || null,
      sira: dersler.length,
    })
    setEkleniyor(false)
    if (error) {
      alert('Hata: ' + error.message)
      return
    }
    formuSifirla()
    derslerYukle()
  }

  async function dersGuncelle(d, alan, deger) {
    const { error } = await supabase
      .from('zil_dersleri')
      .update({ [alan]: deger || null })
      .eq('id', d.id)
    if (error) alert('Hata: ' + error.message)
    else derslerYukle()
  }

  async function dersAktifDegistir(d) {
    const { error } = await supabase.from('zil_dersleri').update({ aktif: !d.aktif }).eq('id', d.id)
    if (error) alert('Hata: ' + error.message)
    else derslerYukle()
  }

  async function dersSil(d) {
    if (!confirm(`"${d.ders_no}. Ders" satırını silmek istediğinize emin misiniz?`)) return
    const { error } = await supabase.from('zil_dersleri').delete().eq('id', d.id)
    if (error) alert('Hata: ' + error.message)
    else derslerYukle()
  }

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-navy mb-1">Zil Sistemi</h1>
      <p className="text-sm text-gray-500 mb-6">
        Bu sayfa açık kaldığı sürece, bilgisayarın kendi saati (hatta saat dilimi ayarı) yanlış olsa bile zil doğru
        saatte çalar — saat hem sunucudan alınıyor hem her zaman Türkiye saatine göre hesaplanıyor.
      </p>

      {hata && <p className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{hata}</p>}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6 text-center">
        <p className="text-5xl font-bold text-navy tracking-wide tabular-nums">{saatMetni(gosterilenSaat)}</p>
        <p className="text-xs text-gray-400 mt-2">
          {senkronDurumu === 'tamam' && sonSenkronZamani && (
            <>Saat sunucuyla senkronize edildi (son senkron: {saatMetni(sonSenkronZamani)}).</>
          )}
          {senkronDurumu === 'bekliyor' && 'Sunucuyla senkronize ediliyor...'}
          {senkronDurumu === 'hata' && (
            <span className="text-red-500">
              Sunucuyla senkronize edilemedi — bilgisayarın kendi saati kullanılıyor (yanlış olabilir).
            </span>
          )}
        </p>

        {siradakiZil && (
          <p className="text-sm text-gray-600 mt-3">
            Sıradaki zil: <span className="font-semibold text-navy">{siradakiZil.saat}</span> — {siradakiZil.etiket}
          </p>
        )}

        <div className="mt-5">
          {!etkinMi ? (
            <button
              type="button"
              onClick={zilBaslat}
              className="bg-orange text-white font-bold px-8 py-3 rounded-xl hover:opacity-90 transition-opacity text-lg"
            >
              Zili Başlat
            </button>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <span className="inline-flex items-center gap-2 text-green-700 font-semibold text-sm bg-green-50 px-4 py-2 rounded-full">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Zil aktif — planlanan saatlerde
                otomatik çalacak
              </span>
              <button type="button" onClick={zilDurdur} className="text-gray-400 text-xs hover:underline">
                Durdur
              </button>
            </div>
          )}
        </div>
        {!etkinMi && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-4">
            "Zili Başlat" butonuna basılmadan zil çalmaz — tarayıcılar, bir tıklama olmadan otomatik ses çalınmasına
            izin vermiyor. Bu butona SADECE sabah bir kez basmanız yeterli, sayfa açık kaldığı sürece gün boyu çalışır.
          </p>
        )}
        {susturuluyorMu && (
          <div className="flex flex-col items-center gap-2 mt-4">
            <span className="inline-flex items-center gap-2 text-amber-700 font-semibold text-sm bg-amber-50 px-4 py-2 rounded-full">
              🔇 Zil susturuldu — {saatMetni(new Date(susturBitisMs))} saatine kadar otomatik çalmayacak
            </span>
            <button type="button" onClick={susturmayiKaldir} className="text-gray-400 text-xs hover:underline">
              Susturmayı Şimdi Kaldır
            </button>
          </div>
        )}
        {uzaktanBilgi && (
          <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2 mt-3">{uzaktanBilgi}</p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <h2 className="font-semibold text-gray-700 mb-1">Manuel Çal / Uzaktan Kontrol</h2>
        <p className="text-xs text-gray-400 mb-4">
          Bu sayfayı aynı hesapla telefondan da açabilirsin — buradaki butonlar anında kurumdaki bilgisayara ulaşır.
          Ama ses SADECE "zil" hesabıyla açık olan cihazda çalar; telefonun kendisi sessiz kalır, sadece bir uzaktan
          kumanda gibi çalışır.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => uzaktanKomutGonder('cal_ogrenci')}
            className="bg-navy text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            Öğrenci Zilini Çal
          </button>
          <button
            type="button"
            onClick={() => uzaktanKomutGonder('cal_ogretmen')}
            className="bg-navy text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            Öğretmen Zilini Çal
          </button>
          <button
            type="button"
            onClick={() => uzaktanKomutGonder('cal_cikis')}
            className="bg-navy text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            Çıkış Zilini Çal
          </button>
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-2">
            Belirli bir süre zil çalmasın (süre dolunca otomatik olarak kendiliğinden devam eder):
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={susturmaSaatSecimi}
              onChange={(e) => setSusturmaSaatSecimi(Number(e.target.value))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
            >
              {Array.from({ length: 24 }, (_, i) => i + 1).map((saat) => (
                <option key={saat} value={saat}>
                  {saat} Saat
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => susturmaBaslat(susturmaSaatSecimi * 60)}
              className="bg-amber-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
            >
              Zil Çalmasın
            </button>
            {susturuluyorMu && (
              <button
                type="button"
                onClick={susturmayiKaldir}
                className="text-gray-400 text-sm px-4 py-2 hover:underline"
              >
                Susturmayı Kaldır
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="font-semibold text-gray-700">Zil Saatleri</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Her ders için Öğrenci, Öğretmen (öğrenci+1dk) ve Çıkış (öğretmen+45dk) zilleri.
          </p>
        </div>
        {dersler.length === 0 ? (
          <p className="px-4 py-6 text-center text-gray-400 text-sm">
            {isYonetici ? 'Henüz ders/zil eklenmedi, aşağıdan ekleyebilirsiniz.' : 'Henüz ders/zil eklenmedi.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Devre</th>
                <th className="px-3 py-2 font-medium">Ders</th>
                <th className="px-3 py-2 font-medium">Öğrenci</th>
                <th className="px-3 py-2 font-medium">Öğretmen</th>
                <th className="px-3 py-2 font-medium">Çıkış</th>
                <th className="px-3 py-2 font-medium">Durum</th>
                {isYonetici && <th className="px-3 py-2 font-medium text-right">İşlemler</th>}
              </tr>
            </thead>
            <tbody>
              {dersler.map((d) => (
                <tr key={d.id} className={`border-t border-gray-50 ${!d.aktif ? 'opacity-40' : ''}`}>
                  <td className="px-3 py-2 text-gray-500">{d.devre || '—'}</td>
                  <td className="px-3 py-2 font-semibold text-navy whitespace-nowrap">{d.ders_no}. Ders</td>
                  {[
                    { alan: 'ogrenci_saat', sesFonksiyonu: cikisZiliCal },
                    { alan: 'ogretmen_saat', sesFonksiyonu: cikisZiliCal },
                    { alan: 'cikis_saat', sesFonksiyonu: cikisZiliCal },
                  ].map(({ alan, sesFonksiyonu }) => (
                    <td key={alan} className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {isYonetici ? (
                          <input
                            type="time"
                            defaultValue={saatKisalt(d[alan]) || ''}
                            onBlur={(e) => {
                              if (e.target.value !== (saatKisalt(d[alan]) || '')) dersGuncelle(d, alan, e.target.value)
                            }}
                            className="px-2 py-1 border border-gray-200 rounded-lg text-sm w-[100px] focus:outline-none focus:ring-2 focus:ring-blue"
                          />
                        ) : (
                          <span>{saatKisalt(d[alan]) || '—'}</span>
                        )}
                        {isYonetici && (
                          <button
                            type="button"
                            onClick={() => sesFonksiyonu()}
                            title="Bu sütunun sesini dinle"
                            className="text-blue text-xs hover:underline shrink-0"
                          >
                            Dinle
                          </button>
                        )}
                      </div>
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    {d.aktif ? (
                      <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-full">Aktif</span>
                    ) : (
                      <span className="text-xs font-semibold bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Pasif</span>
                    )}
                  </td>
                  {isYonetici && (
                    <td className="px-3 py-2 text-right whitespace-nowrap space-x-3">
                      <button onClick={() => dersAktifDegistir(d)} className="text-navy text-sm hover:underline">
                        {d.aktif ? 'Pasif Yap' : 'Aktif Yap'}
                      </button>
                      <button onClick={() => dersSil(d)} className="text-red-500 text-sm hover:underline">
                        Sil
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {isYonetici && (
          <form onSubmit={dersEkle} className="p-4 border-t border-gray-100 flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Devre (opsiyonel)</label>
              <input
                type="text"
                value={form.devre}
                onChange={(e) => setForm((f) => ({ ...f, devre: e.target.value }))}
                placeholder="ör. Sabahçı Devre"
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-[150px] focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Ders No</label>
              <input
                type="number"
                min="1"
                value={form.dersNo}
                onChange={(e) => setForm((f) => ({ ...f, dersNo: e.target.value }))}
                required
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-[80px] focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Öğrenci</label>
              <input
                type="time"
                value={form.ogrenci}
                onChange={(e) => ogrenciDegisti(e.target.value)}
                required
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Öğretmen</label>
              <input
                type="time"
                value={form.ogretmen}
                onChange={(e) => ogretmenDegisti(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Çıkış</label>
              <input
                type="time"
                value={form.cikis}
                onChange={(e) => cikisDegisti(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>
            <button
              type="submit"
              disabled={ekleniyor}
              className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {ekleniyor ? 'Ekleniyor...' : 'Ekle'}
            </button>
          </form>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Not: Bu sekme kapanırsa, bilgisayar uykuya geçerse ya da tarayıcı yeniden başlatılırsa zil çalmaz — sabah bu
        sayfayı açıp "Zili Başlat" demeyi ve sekmeyi gün boyu açık bırakmayı unutmayın.
      </p>
    </div>
  )
}
