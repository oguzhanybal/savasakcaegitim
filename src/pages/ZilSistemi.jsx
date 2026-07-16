import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { sesSisteminiEtkinlestir, cikisZiliCal, manuelZilCalBaslat, manuelZilDurdur } from '../lib/zilSesiCal'

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
// bir cihazda da açılabilir. Oradaki "Manuel Çal" (tek tıkla tek çalma) ve
// "Durdur/Başlat" butonu, "zil_uzaktan_komutlar" tablosuna bir satır ekler;
// sayfa açık olan
// TÜM cihazlar bu tabloyu her 2 saniyede bir kontrol edip (basit "polling" —
// Supabase Realtime/websocket yerine, her zaman çalışan sıradan bir sorgu
// kullanılıyor, bu yüzden daha garanti) yeni komutları işler. AMA SES SADECE
// "zil" ROLÜYLE açık olan cihazda çalar — yönetici hesabıyla (ör. telefondan)
// açılan sayfa sadece bir UZAKTAN KUMANDA gibi davranır, kendi başına ses
// çıkarmaz. Böylece "uzaktan zil çal" dediğinde ses sadece kurumdaki (zil
// hesabıyla açık) bilgisayarda duyulur, komutu gönderen telefonda değil.
//
// SUNUCU SAATİ SENKRONİZASYONU: normalde her 10 dakikada bir tekrarlanır. Ama
// bir seferinde (ör. o anki geçici bir internet kesintisi/ağ sorunu yüzünden)
// senkronizasyon BAŞARISIZ olursa, bir dahaki 10 dakikaya kadar beklemek yerine
// aşağıdaki ayrı efekt sayesinde 5 saniyede bir OTOMATİK olarak tekrar dener —
// bağlantı düzelir düzelmez (birkaç saniye içinde) kendiliğinden düzelir,
// sayfanın elle yenilenmesine gerek kalmaz. Bu süre zarfında (senkron
// başarısız olduğu sürece) bilgisayarın KENDİ saati kullanılır, bu yanlışsa
// zil de yanlış saatte çalabilir — o yüzden ekrandaki kırmızı uyarı önemlidir.
//
// TARAYICI SEKME KISITLAMASI ("saat geri kalıyor" sorunu): tarayıcılar, pil
// tasarrufu için EKRANDA OLMAYAN/ARKA PLANDAKİ sekmelerin zamanlayıcılarını
// (setInterval) yavaşlatır — sekme dakikalarca arka planda ya da bilgisayar
// ekranı kararmış/uykuda kaldıysa, buradaki "her saniye" çalışması gereken
// kontrol, ARADA BÜYÜK BOŞLUKLAR bırakarak çok daha seyrek çalışabilir. Bunun
// iki somut sonucu vardı: (1) ekrandaki saat, gerçek saatin gerisinde kalmış
// gibi görünüyordu (aslında saat YANLIŞ hesaplanmıyor, sadece EKRANA
// YANSITILMASI gecikiyor) ve (2) bu gecikme yüzünden, tam o sırada
// gönderilmiş bir "Manuel Çal" uzaktan komutu, sekme uyanıp kontrol ettiğinde
// üzerinden 15 saniyeden fazla zaman geçmiş sayılıp SESSİZCE ATLANIYORDU. Bunu
// düzeltmek için üç önlem eklendi:
//   1) "Zili Başlat"a basılınca (ve uzaktan "başlat" komutu geldiğinde, SADECE
//      "zil" hesabıyla açık olan cihazda) bir Wake Lock (ekran uykuya
//      dalmasın) isteği gönderiliyor — sekme arka plana düşme ihtimali azalır.
//   2) Uzaktan komutlar için "çok eski, atla" eşiği 15 saniyeden 90 saniyeye
//      çıkarıldı — sekme birkaç on saniye gecikmeli uyansa bile komut artık
//      atlanmadan işlenir.
//   3) Otomatik zil kontrolü artık "şu anki saniye 0-2 mi" diye DAR bir
//      pencereye bakmak yerine, bir önceki kontrolden bu yana geçen TÜM
//      dakikaları (büyük bir boşluk varsa dahi) tek tek tarayıp hiçbir zili
//      atlamıyor.
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
  const [manuelCalIsliyor, setManuelCalIsliyor] = useState(false)
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

  // ---- Ekran Uykusu Engelleme (Wake Lock) ----
  // "zil" hesabıyla açık olan bilgisayarın ekranı kararıp uykuya dalarsa,
  // tarayıcı sekmesi de arka plana düşmüş gibi davranıp zamanlayıcıları
  // yavaşlatıyor ("saat geri kalıyor" ve "manuel çal çalışmıyor" şikayetinin
  // asıl kaynağı). Zil aktifken ekranın uykuya dalmasını mümkün olduğunca
  // engellemek için Wake Lock isteniyor. Tarayıcı desteklemiyorsa (eski
  // tarayıcı) sessizce atlanır, herhangi bir hataya yol açmaz.
  const wakeLockRef = useRef(null)

  async function wakeLockAl() {
    if (!('wakeLock' in navigator)) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
    } catch {
      // Sekme o an görünür değilken istenirse tarayıcı reddedebilir — sorun
      // değil, sekme tekrar görünür olunca aşağıdaki visibilitychange efekti
      // zaten yeniden deneyecek.
    }
  }

  function wakeLockBirak() {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {})
      wakeLockRef.current = null
    }
  }

  // Wake Lock, sekme gizlenince tarayıcı tarafından OTOMATİK olarak serbest
  // bırakılır — sekme tekrar görünür olduğunda (ör. başka bir pencereden
  // buraya dönüldüğünde) zil hâlâ aktifse burada YENİDEN isteniyor.
  useEffect(() => {
    function gorunurlukDegisti() {
      if (document.visibilityState === 'visible' && etkinMi && isZil) wakeLockAl()
    }
    document.addEventListener('visibilitychange', gorunurlukDegisti)
    return () => document.removeEventListener('visibilitychange', gorunurlukDegisti)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etkinMi, isZil])

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

  // OTOMATİK HIZLI TEKRAR DENEME: senkronizasyon bir kez BAŞARISIZ olduysa (ör.
  // geçici bir internet kesintisi/ağ sorunu), normal 10 dakikalık döngüyü
  // beklemeden 5 saniyede bir tekrar dener — bağlantı düzeldiği anda (birkaç
  // saniye içinde) kendiliğinden düzelir, sayfanın elle yenilenmesine (F5)
  // gerek kalmaz. Senkron başarılı olur olmaz (senkronDurumu 'tamam' olunca)
  // bu efekt otomatik olarak durur.
  useEffect(() => {
    if (senkronDurumu !== 'hata') return
    const id = setTimeout(senkronizeEt, 5000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senkronDurumu])

  // Bir önceki kontrolde işlenen dakika (Türkiye saatine göre, gün içindeki
  // dakika sayısı: 0-1439) ve hangi güne ait olduğu burada tutuluyor. Sekme
  // arka planda kalıp tarayıcı bu "her saniye" çalışması gereken kontrolü
  // GECİKTİRİRSE (bkz. dosya başındaki not), bu ref sayesinde ARADA KALAN
  // dakikaların HİÇBİRİ atlanmadan geriye dönük taranıp zili çalınabilir.
  // Normal durumda (sekme önde, gecikme yok) zaten her saniye tetiklendiği
  // için aralık her seferinde tek dakikadan ibarettir, davranış değişmez.
  const sonKontrolRef = useRef(null)

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

      const b = turkiyeSaatBilesenleri(suanki)
      const bugunAnahtari = turkiyeTarihAnahtari(suanki)
      const suankiDakika = Number(b.saat) * 60 + Number(b.dakika)

      const onceki = sonKontrolRef.current
      sonKontrolRef.current = { gun: bugunAnahtari, dakika: suankiDakika }

      if (susturBitisMs && suanki.getTime() < susturBitisMs) return

      // İlk çalıştırma, gün değişmiş ya da 3 saatten büyük bir boşluk varsa
      // (ör. bilgisayar geceden beri kapalıydı/uykudaydı) geriye dönük TÜM o
      // dakikaları taramak yerine sadece BU ANI kontrol ediyoruz — yoksa
      // bilgisayar açılır açılmaz saatlerce önceki ziller art arda, art
      // arda çalmaya kalkardı.
      let baslangicDakika = suankiDakika
      if (onceki && onceki.gun === bugunAnahtari && suankiDakika - onceki.dakika <= 180) {
        baslangicDakika = onceki.dakika + 1
      }
      if (baslangicDakika > suankiDakika) return // aynı dakika içinde ikinci kontrol, atla

      for (let dk = baslangicDakika; dk <= suankiDakika; dk++) {
        const dkHHMM = `${String(Math.floor(dk / 60)).padStart(2, '0')}:${String(dk % 60).padStart(2, '0')}`
        dersler.forEach((d) => {
          if (!d.aktif) return
          ;[
            { alan: 'ogrenci_saat', sesFonksiyonu: cikisZiliCal },
            { alan: 'ogretmen_saat', sesFonksiyonu: cikisZiliCal },
            { alan: 'cikis_saat', sesFonksiyonu: cikisZiliCal },
          ].forEach(({ alan, sesFonksiyonu }) => {
            const saat = d[alan]
            if (!saat || saatKisalt(saat) !== dkHHMM) return
            const anahtar = `${d.id}_${alan}_${bugunAnahtari}`
            if (calinanlarRef.current.has(anahtar)) return
            calinanlarRef.current.add(anahtar)
            sesFonksiyonu()
          })
        })
      }
    }, 1000)
    return () => clearInterval(id)
  }, [sunucuFarki, etkinMi, dersler, susturBitisMs, isZil])

  // ---- Uzaktan komutları kontrol et (ör. telefondan gönderilen manuel çal /
  // durdur / başlat). Supabase Realtime yerine BASİT POLLING kullanılıyor —
  // bazı kurulumlarda Realtime (websocket) güvenilir çalışmayabiliyor; her 2
  // saniyede bir düz bir SELECT ile yeni komut var mı kontrol etmek, aynı
  // "derslerYukle" gibi sıradan bir sorgu olduğu için çok daha garanti
  // çalışıyor. İşlenen komutlar id'siyle hatırlanır (aynı komut iki kez
  // işlenmesin diye); 90 saniyeden eski komutlar (ör. sayfa yeni açıldığında
  // geçmişte kalan eski bir komut, YA DA sekme arka planda kalıp gecikmeli
  // uyandığında hâlâ makul sürede fark edilebilecek bir komut) sessizce
  // atlanır. Bu eşik önceden 15 saniyeydi; tarayıcının arka plandaki sekmeleri
  // yavaşlatması yüzünden bazen "Manuel Çal" komutu 15 saniyeden geç fark
  // edilip sessizce atlanıyordu ("manuel çal çalışmıyor" şikayeti) — bu yüzden
  // 90 saniyeye çıkarıldı.
  const islenenKomutIdleriRef = useRef(new Set())
  useEffect(() => {
    let iptalEdildi = false

    function komutuIsle(komut, suankiSunucuMs) {
      // Durum bilgisi (rozet/mesaj) TÜM cihazlarda güncellenir — ama SES
      // sadece "zil" rolüyle açık olan cihazda çalar (isZil kontrolü).
      if (komut.komut === 'baslat') {
        if (isZil) {
          sesSisteminiEtkinlestir()
          wakeLockAl()
        }
        setEtkinMi(true)
        setUzaktanBilgi('Zil, uzaktan (başka bir cihazdan) başlatıldı.')
      } else if (komut.komut === 'durdur') {
        if (isZil) wakeLockBirak()
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
      } else if (komut.komut === 'manuel_cal') {
        setManuelCalIsliyor(true)
        if (isZil) manuelZilCalBaslat(() => setManuelCalIsliyor(false))
        setUzaktanBilgi('Manuel çal komutu uzaktan tetiklendi.')
      } else if (komut.komut === 'manuel_cal_durdur') {
        setManuelCalIsliyor(false)
        if (isZil) manuelZilDurdur()
        setUzaktanBilgi('Manuel çalma uzaktan durduruldu.')
      }
    }

    async function kontrolEt() {
      const { data, error } = await supabase
        .from('zil_uzaktan_komutlar')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)
      if (iptalEdildi || error || !data) return
      const suankiSunucuMs = Date.now() + sunucuFarkiRef.current
      // En eskiden en yeniye doğru işlensin diye ters çevir.
      ;[...data].reverse().forEach((komut) => {
        if (islenenKomutIdleriRef.current.has(komut.id)) return
        islenenKomutIdleriRef.current.add(komut.id)
        const komutZamaniMs = new Date(komut.created_at).getTime()
        if (suankiSunucuMs - komutZamaniMs > 90000) return
        komutuIsle(komut, suankiSunucuMs)
      })
    }

    kontrolEt()
    const id = setInterval(kontrolEt, 2000)
    return () => {
      iptalEdildi = true
      clearInterval(id)
    }
  }, [isZil])

  // Komuta kendi id'sini burada, tarayıcıda üretip gönderiyoruz — bu sayede
  // bu cihazın kendi gönderdiği komut, birkaç saniye sonra polling ile geri
  // "yankılanınca" ikinci kez işlenmez (id zaten işlenmiş sayılır). Bu, ör.
  // manuel çalmanın kendi kendine tekrar tetiklenip sesin yarıda kesilip
  // yeniden başlamasını önler.
  async function uzaktanKomutGonder(komut, sureDakika = null) {
    sesSisteminiEtkinlestir()
    // Mümkünse id'yi burada üretip önceden "işlendi" say — desteklenmeyen çok
    // eski bir tarayıcıdaysak (crypto.randomUUID yoksa) id göndermeden, veri
    // tabanının kendi ürettiği id'ye güveniyoruz (bu durumda komut, birkaç
    // saniye sonra bu cihaza da normal şekilde "gelir", ender bir durumdur).
    const id = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : null
    if (id) islenenKomutIdleriRef.current.add(id)
    const kayit = { komut, sure_dakika: sureDakika }
    if (id) kayit.id = id
    const { error } = await supabase.from('zil_uzaktan_komutlar').insert(kayit)
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

  // Manuel çal — basınca zil çalmaya başlar, buton "Durdur"a döner. Ses kendi
  // kendine bitince buton otomatik "Manuel Çal"a geri döner. Ses tam
  // bitmeden tekrar tıklanırsa (buton hâlâ "Durdur" gösterirken) yeniden
  // BAŞLATMAZ — sadece "Durdur" tıklanırsa erken kesilir.
  function manuelCalBaslat() {
    setManuelCalIsliyor(true)
    if (isZil) manuelZilCalBaslat(() => setManuelCalIsliyor(false))
    uzaktanKomutGonder('manuel_cal')
  }

  function manuelCalDurdur() {
    setManuelCalIsliyor(false)
    if (isZil) manuelZilDurdur()
    uzaktanKomutGonder('manuel_cal_durdur')
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
    if (isZil) wakeLockAl()
    setEtkinMi(true)
    uzaktanKomutGonder('baslat')
  }

  function zilDurdur() {
    if (isZil) wakeLockBirak()
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
              Sunucuyla senkronize edilemedi — bilgisayarın kendi saati kullanılıyor (yanlış olabilir). Otomatik
              olarak birkaç saniyede bir tekrar deneniyor, elle bir şey yapmanıza gerek yok.
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
          Bu sayfayı aynı hesapla telefondan da açabilirsin — buton birkaç saniye içinde kurumdaki bilgisayara ulaşır.
          Ama ses SADECE "zil" hesabıyla açık olan cihazda çalar; telefonun kendisi sessiz kalır, sadece bir uzaktan
          kumanda gibi çalışır. "Manuel Çal"a basınca zil çalmaya başlar, buton "Durdur"a döner; sesi kendi hâline
          bırakırsan kendiliğinden biter, istersen "Durdur"a basıp erken kesebilirsin.
        </p>
        <div className="flex flex-wrap gap-2">
          {!manuelCalIsliyor ? (
            <button
              type="button"
              onClick={manuelCalBaslat}
              className="bg-navy text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
            >
              🔔 Manuel Çal
            </button>
          ) : (
            <button
              type="button"
              onClick={manuelCalDurdur}
              className="bg-red-500 text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity animate-pulse"
            >
              ⏹ Durdur
            </button>
          )}
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
        sayfayı açıp "Zili Başlat" demeyi ve sekmeyi gün boyu açık bırakmayı unutmayın. Mümkünse zil bilgisayarında
        ekran/bilgisayar uykusunu (güç ayarlarından) tamamen kapatın ve bu sekmeyi en önde, başka bir pencereyle
        kapatılmadan tutun — bu, saatin ve uzaktan komutların gecikmesini en aza indirir.
      </p>
    </div>
  )
}
