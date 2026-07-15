// Web Audio API kullanarak, harici bir ses dosyasına ihtiyaç duymadan,
// tarayıcıda anında ve güvenilir şekilde bir okul zili sesi ("ding-dong")
// üretir. Kurumun bilgisayarında internet bağlantısı olmasa bile (sayfa zaten
// açık kaldıktan sonra) çalışmaya devam eder.

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
// ÖZEL ZİL SESİ — Öğrenci, Öğretmen VE Çıkış zillerinin ÜÇÜ DE bu aynı özel
// sesi kullanır ("cikis-zili.mp3" — kurumun kendi MEB zil sesi kesiti).
// Dosya, projenin KÖK dizinindeki (src'nin içi DEĞİL) "public" klasörüne
// "cikis-zili.mp3" adıyla eklenmiş olmalı. Dosya henüz eklenmemişse veya
// tarayıcı çalıştıramazsa, otomatik olarak standart sentetik zil sesine
// (zilSesiCal) geri döner.
// ============================================================================
export function cikisZiliCal() {
  let geriDonuldu = false
  const geriDon = () => {
    if (geriDonuldu) return
    geriDonuldu = true
    zilSesiCal()
  }
  try {
    const ses = new Audio('/cikis-zili.mp3')
    ses.addEventListener('error', geriDon)
    const calmaSonucu = ses.play()
    if (calmaSonucu && typeof calmaSonucu.catch === 'function') {
      calmaSonucu.catch(geriDon)
    }
  } catch {
    geriDon()
  }
}

// ============================================================================
// MANUEL ÇAL — "istediğim zaman durdurayım" — tek bir tuşla zili SÜREKLİ
// (döngü halinde) çaldırır, "Manuel Durdur" çağrılana kadar durmaz. Özel ses
// dosyası varsa onu döngüde çalar; yoksa/çalışmazsa standart "ding-dong"
// sesini kendiliğinden tekrar tekrar çalarak aynı işi yapar.
// ============================================================================
let manuelSesElemani = null
let manuelYedekAraligi = null

export function manuelZilBaslat() {
  manuelZilDurdur() // önce olası eski bir çalmayı temizle

  const yedegeGec = () => {
    manuelZilDurdur()
    zilSesiCal()
    manuelYedekAraligi = setInterval(() => zilSesiCal(), 4500)
  }

  try {
    const ses = new Audio('/cikis-zili.mp3')
    ses.loop = true
    ses.addEventListener('error', yedegeGec)
    const calmaSonucu = ses.play()
    if (calmaSonucu && typeof calmaSonucu.catch === 'function') {
      calmaSonucu.catch(yedegeGec)
    }
    manuelSesElemani = ses
  } catch {
    yedegeGec()
  }
}

export function manuelZilDurdur() {
  if (manuelSesElemani) {
    manuelSesElemani.pause()
    manuelSesElemani.currentTime = 0
    manuelSesElemani = null
  }
  if (manuelYedekAraligi) {
    clearInterval(manuelYedekAraligi)
    manuelYedekAraligi = null
  }
}
