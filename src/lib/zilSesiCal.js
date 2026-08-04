// Web Audio API kullanarak, harici bir ses dosyasına ihtiyaç duymadan,
// tarayıcıda anında ve güvenilir şekilde bir okul zili sesi ("ding-dong")
// üretir. Kurumun bilgisayarında internet bağlantısı olmasa bile (sayfa zaten
// açık kaldıktan sonra) çalışmaya devam eder.

import { supabase } from './supabase'

let paylasilanBaglam = null

function baglamGetir() {
  if (!paylasilanBaglam) {
    const AudioContextSinifi = window.AudioContext || window.webkitAudioContext
    paylasilanBaglam = new AudioContextSinifi()
  }
  return paylasilanBaglam
}

// Tarayıcılar, kullanıcı bir şeye tıklamadan otomatik ses çalmayı engelliyor.
// Sayfa açıldığında "Zili Etkinleştir" butonuna tıklanınca bu fonksiyon
// çağrılmalı — AudioContext'i bir kullanıcı etkileşimiyle "kilidini açar",
// bundan sonra program tarafından tetiklenen zil sesleri sorunsuz çalar.
export function sesSisteminiEtkinlestir() {
  const ctx = baglamGetir()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx.state
}

function tonCal(ctx, frekans, baslangicZamani, sure, sesSeviyesi) {
  const osc = ctx.createOscillator()
  const kazanc = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = frekans
  osc.connect(kazanc)
  kazanc.connect(ctx.destination)
  // Ani başlayıp yumuşak sönen bir zarf (envelope) — sert bir "tık" yerine
  // doğal bir çan/zil hissi versin diye.
  kazanc.gain.setValueAtTime(0, baslangicZamani)
  kazanc.gain.linearRampToValueAtTime(sesSeviyesi, baslangicZamani + 0.02)
  kazanc.gain.exponentialRampToValueAtTime(0.001, baslangicZamani + sure)
  osc.start(baslangicZamani)
  osc.stop(baslangicZamani + sure + 0.05)
}

// Klasik okul zili: iki perde ("ding" - "dong"), 3 kez tekrarlanır (~4 saniye).
export function zilSesiCal() {
  const ctx = baglamGetir()
  if (ctx.state === 'suspended') ctx.resume()
  const simdi = ctx.currentTime
  const dingPerdesi = 784 // Sol5
  const dongPerdesi = 523 // Do5
  const tekrarSayisi = 3
  const birTekrarSuresi = 1.3
  for (let i = 0; i < tekrarSayisi; i++) {
    const baslangic = simdi + i * birTekrarSuresi
    tonCal(ctx, dingPerdesi, baslangic, 0.55, 0.35)
    tonCal(ctx, dongPerdesi, baslangic + 0.55, 0.65, 0.35)
  }
  // Toplam süre (saniye) — arayüzde "çalıyor" göstergesini bu kadar süre
  // açık tutmak isteyenler için dışa aktarılıyor.
  return tekrarSayisi * birTekrarSuresi
}

// ============================================================================
// ÖZEL ZİL SESİ — Öğrenci, Öğretmen VE Çıkış zillerinin ÜÇÜ DE aynı özel sesi
// kullanır. Öncelik sırası:
//   1) Yönetici Zil Sistemi > "Zil Sesi" kartından Supabase Storage'a
//      ("zil-sesi" bucket) kendi yüklediği özel dosya varsa O çalar — kodla/
//      GitHub'la hiç uğraşmadan istediği zaman değiştirebilsin diye.
//   2) Özel bir dosya yüklenmemişse, projenin KÖK dizinindeki (src'nin içi
//      DEĞİL) "public" klasöründeki "cikis-zili.mp3" (kurumun kendi MEB zil
//      sesi kesiti / öntanımlı dosya) çalar.
//   3) İkisi de yoksa veya tarayıcı hiçbirini çalıştıramazsa, standart
//      sentetik "ding-dong" sesine (zilSesiCal) geri döner.
// ============================================================================

// Storage'daki güncel özel zil dosyasının genel (public) URL'ini getirir —
// dosya adı sabit değil (yüklenen dosyanın uzantısını koruyoruz), bu yüzden
// önce bucket'ı listeleyip "aktif" ile başlayan dosyayı buluyoruz. Özel dosya
// hiç yüklenmemişse (ya da geçici bir ağ hatası olursa) sessizce null döner —
// çağıran taraf o zaman bir sonraki kademeye (yerel dosya) geçer. Sondaki
// "?t=" cache-kırıcı, yönetici sesi değiştirdikten hemen sonra tarayıcının
// eski (önbelleğe alınmış) dosyayı çalmaya devam etmesini engelliyor.
export async function aktifOzelZilUrlGetir() {
  try {
    const { data, error } = await supabase.storage.from('zil-sesi').list('', { search: 'aktif' })
    if (error || !data) return null
    const dosya = data.find((d) => d.name.startsWith('aktif'))
    if (!dosya) return null
    const { data: pub } = supabase.storage.from('zil-sesi').getPublicUrl(dosya.name)
    return pub?.publicUrl ? `${pub.publicUrl}?t=${Date.now()}` : null
  } catch {
    return null
  }
}

// Verilen URL listesini SIRAYLA dener — biri çalmayı başaramazsa (dosya yok,
// format desteklenmiyor, ağ hatası vb.) bir sonrakine geçer; hiçbiri
// çalışmazsa en sonunda sentetik ding-dong'a düşer.
function siraylaCal(urlListesi, index = 0) {
  if (index >= urlListesi.length) {
    zilSesiCal()
    return
  }
  let gecildi = false
  const sonrakine = () => {
    if (gecildi) return
    gecildi = true
    siraylaCal(urlListesi, index + 1)
  }
  try {
    const ses = new Audio(urlListesi[index])
    ses.addEventListener('error', sonrakine)
    const calmaSonucu = ses.play()
    if (calmaSonucu && typeof calmaSonucu.catch === 'function') {
      calmaSonucu.catch(sonrakine)
    }
  } catch {
    sonrakine()
  }
}

export function cikisZiliCal() {
  aktifOzelZilUrlGetir().then((ozelUrl) => {
    siraylaCal([ozelUrl, '/cikis-zili.mp3'].filter(Boolean))
  })
}

// ============================================================================
// MANUEL ÇAL (başlat/durdur) — "Manuel Çal"a basınca zil BİR KERE çalar;
// bitene kadar buton "Durdur"a döner. Ses tam bitmeden ikinci kez tetiklenmek
// istenirse (ör. çift tıklama) önceki çalma sessizce temizlenip yeniden
// başlatılır — asla üst üste binmez. Ses doğal olarak bittiğinde
// "bittiginde" callback'i çağrılır ki arayüz butonu kendiliğinden
// "Manuel Çal"a geri döndürebilsin. Elle "Durdur" çağrılırsa bu callback
// ÇAĞRILMAZ (arayüz zaten kendi tarafında durumu güncelliyor).
// ============================================================================
let manuelSesElemani = null
let manuelZamanlayiciId = null
let manuelBittiCallback = null
// Özel ses URL'i Storage'dan ASENKRON geliyor — o beklerken kullanıcı
// "Durdur"a basarsa ya da "Manuel Çal"a tekrar hızlıca basarsa, geç gelen
// cevabın eski/iptal edilmiş bir çalmayı yeniden başlatmasını önlemek için
// her manuelZilCalBaslat çağrısına artan bir "nesil" numarası veriyoruz —
// asenkron cevap geldiğinde numara hâlâ güncel mi diye kontrol ediyoruz.
let manuelNesil = 0

function manuelTemizle() {
  if (manuelSesElemani) {
    manuelSesElemani.pause()
    manuelSesElemani.currentTime = 0
    manuelSesElemani = null
  }
  if (manuelZamanlayiciId) {
    clearTimeout(manuelZamanlayiciId)
    manuelZamanlayiciId = null
  }
}

function manuelDogalBitis() {
  manuelTemizle()
  const geriCagir = manuelBittiCallback
  manuelBittiCallback = null
  if (typeof geriCagir === 'function') geriCagir()
}

function manuelUrlDene(url, sonrakiAdim) {
  try {
    const ses = new Audio(url)
    ses.addEventListener('ended', manuelDogalBitis)
    ses.addEventListener('error', sonrakiAdim)
    const calmaSonucu = ses.play()
    if (calmaSonucu && typeof calmaSonucu.catch === 'function') {
      calmaSonucu.catch(sonrakiAdim)
    }
    manuelSesElemani = ses
  } catch {
    sonrakiAdim()
  }
}

export function manuelZilCalBaslat(bittiginde) {
  manuelTemizle() // önceki bir çalma varsa (callback tetiklemeden) sessizce temizle
  manuelBittiCallback = bittiginde || null
  const benimNeslim = ++manuelNesil

  const sentetigeGec = () => {
    const sure = zilSesiCal()
    manuelZamanlayiciId = setTimeout(manuelDogalBitis, sure * 1000)
  }
  const yerelDosyayaGec = () => manuelUrlDene('/cikis-zili.mp3', sentetigeGec)

  aktifOzelZilUrlGetir().then((ozelUrl) => {
    // Beklerken "Durdur"a basıldı ya da tekrar "Manuel Çal"a basıldıysa, bu
    // artık eski bir çağrı — hiçbir şey başlatma.
    if (benimNeslim !== manuelNesil) return
    if (ozelUrl) manuelUrlDene(ozelUrl, yerelDosyayaGec)
    else yerelDosyayaGec()
  })
}

export function manuelZilDurdur() {
  manuelNesil++ // bekleyen bir asenkron URL cevabı varsa artık geçersiz say
  manuelBittiCallback = null // elle durdurulduğunda "doğal bitiş" callback'i çağrılmasın
  manuelTemizle()
}
