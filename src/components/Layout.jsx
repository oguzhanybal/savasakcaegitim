import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import UygulamaYukleBanner from './UygulamaYukleBanner'
import PullToRefresh from './PullToRefresh'
import { bildirimAcikMi, bildirimleriAc, bildirimleriKapat, pushDestekleniyorMu } from '../lib/pushBildirim'
import { usePwaYukleme, iosMu, zatenYukluMu, safariMasaustuMu, androidMu, gercektenYukluMu } from '../lib/usePwaYukleme'

const ROL_ETIKET = {
  yonetici: 'Yönetici',
  ogretmen: 'Öğretmen',
  veli: 'Veli',
  ogrenci: 'Öğrenci',
  kantin: 'Kantin',
  zil: 'Zil Ekranı',
}

function menuOlustur(rol) {
  if (rol === 'yonetici') {
    return [
      { tur: 'link', to: '/', label: 'Ana Sayfa', end: true },
      { tur: 'link', to: '/sifremi-degistir', label: 'Şifremi Değiştir' },
      {
        tur: 'grup',
        label: 'Kullanıcılar',
        ogeler: [
          { to: '/ogrenciler', label: 'Öğrenciler' },
          { to: '/ogretmenler', label: 'Öğretmenler' },
          { to: '/kullanici-olustur', label: 'Kullanıcı Oluştur' },
          { to: '/sifre-sifirla', label: 'Şifre Sıfırla' },
          { to: '/giris-kayitlari', label: 'Giriş Kayıtları' },
          { to: '/duyurular', label: 'Duyurular' },
          { to: '/uygulama-yuklemeleri', label: 'Uygulama İndirmeleri' },
          { to: '/yedek-al', label: 'Yedek Al' },
          { to: '/zil-sistemi', label: 'Zil Sistemi' },
        ],
      },
      {
        tur: 'grup',
        label: 'Ödemeler',
        ogeler: [
          { to: '/muhasebe', label: 'Muhasebe' },
          { to: '/ogretmen-ekstresi', label: 'Öğretmen Ekstresi' },
          { to: '/toplu-ekstre', label: 'Toplu Ekstre' },
          { to: '/gelir-raporu', label: 'Gelir Raporu' },
          { to: '/giderler', label: 'Giderler' },
          { to: '/aylik-ozet', label: 'Aylık Özet' },
          { to: '/borc-yaslandirma', label: 'Borç Yaşlandırma' },
          { to: '/kantin', label: 'Kantin' },
          { to: '/kantin-gunluk-rapor', label: 'Kantin Günlük Rapor' },
        ],
      },
      {
        tur: 'grup',
        label: 'Sınıflar',
        ogeler: [
          { to: '/siniflar', label: 'Sınıf Listesi' },
        ],
      },
      {
        tur: 'grup',
        label: 'Program',
        ogeler: [
          { to: '/program', label: 'Ders Programı' },
          { to: '/gunluk', label: 'Günlük Program' },
          { to: '/bire-bir', label: 'Bire Bir' },
        ],
      },
      { tur: 'link', to: '/odev', label: 'Ödevler' },
      {
        tur: 'grup',
        label: 'Yoklama',
        ogeler: [
          { to: '/yoklama', label: 'Yoklama Al' },
          { to: '/gecmis-yoklama', label: 'Geçmiş Yoklama' },
          { to: '/yoklama-raporu', label: 'Yoklama Raporu' },
        ],
      },
      {
        tur: 'grup',
        label: 'Sınavlar',
        ogeler: [
          { to: '/sinav-kitapciklari', label: 'Sınav Kitapçıkları' },
          { to: '/sinav-yukle', label: 'Sınav Sonucu Yükle' },
          { to: '/sinav-sonuclari', label: 'Sınav Sonuçları' },
          { to: '/karnem', label: 'Gelişim Grafiği' },
        ],
      },
    ]
  }
  if (rol === 'kantin') {
    return [
      { tur: 'link', to: '/kantin', label: 'Kantin', end: true },
      { tur: 'link', to: '/kantin-gunluk-rapor', label: 'Kantin Günlük Rapor' },
      { tur: 'link', to: '/sifremi-degistir', label: 'Şifremi Değiştir' },
    ]
  }
  // "zil" rolü SADECE Zil Sistemi'ni görebilir — bu hesap, kurumdaki herkesin
  // ulaşabileceği bir bilgisayarda hep açık bırakılacağı için, yönetici
  // hesabının o bilgisayarda açık kalmaması adına kasıtlı olarak bu kadar kısıtlı.
  // "Şifremi Değiştir" bilerek YOK — bu hesabın şifresini sadece yönetici,
  // kendi oturumundan "Şifre Sıfırla" ile değiştirebilsin diye.
  if (rol === 'zil') {
    return [{ tur: 'link', to: '/zil-sistemi', label: 'Zil Sistemi', end: true }]
  }
  if (rol === 'ogretmen') {
    return [
      { tur: 'link', to: '/', label: 'Ana Sayfa', end: true },
      { tur: 'link', to: '/program', label: 'Ders Programım' },
      { tur: 'link', to: '/bire-bir', label: 'Bire Bir Derslerim' },
      { tur: 'link', to: '/odev', label: 'Ödevler' },
      // Öğretmen burada sadece GÖRÜNTÜLEME + İNDİRME yapabilir (kitapçık
      // yükleme/düzenleme/silme butonları sayfa içinde SinavKitapciklari.jsx'te
      // isYonetici kontrolüyle gizleniyor) — hata analizi yaparken kitapçığın
      // orijinal PDF'ini indirebilsin diye eklendi.
      { tur: 'link', to: '/sinav-kitapciklari', label: 'Sınav Kitapçıkları' },
      // "Yoklama Al" linki öğretmen menüsünden kaldırıldı — artık yoklama,
      // Ders Programım'da derse tıklayıp açılan popup'tan (Yoklama ve Konu
      // İşaretleme) alınıyor, bu ayrı sayfa öğretmen için gereksiz kaldı
      // (kullanıcı isteğiyle kaldırıldı). Yönetici menüsündeki "Yoklama Al"
      // linkine dokunulmadı — yönetici istediği sınıfı seçip kendisi de
      // yoklama alabilsin diye orada duruyor.
      { tur: 'link', to: '/yoklama-raporu', label: 'Yoklama Raporu' },
      // Unutulan/eksik kalan bir günün yoklamasını sonradan girebilsin diye
      // (kullanıcı isteğiyle eklendi) — "Yoklama Al"dan farklı olarak burada
      // geçmiş bir tarih seçilebiliyor.
      { tur: 'link', to: '/gecmis-yoklama', label: 'Geçmiş Yoklama' },
      { tur: 'link', to: '/sifremi-degistir', label: 'Şifremi Değiştir' },
    ]
  }
  if (rol === 'veli') {
    return [
      { tur: 'link', to: '/', label: 'Ana Sayfa', end: true },
      { tur: 'link', to: '/muhasebe', label: 'Ödeme Durumu' },
      { tur: 'link', to: '/program', label: 'Ders Programı' },
      { tur: 'link', to: '/yoklamalarim', label: 'Yoklamalar' },
      { tur: 'link', to: '/odev', label: 'Ödevler' },
      { tur: 'link', to: '/karnem', label: 'Sınav Sonuçları' },
      { tur: 'link', to: '/sifremi-degistir', label: 'Şifremi Değiştir' },
    ]
  }
  if (rol === 'ogrenci') {
    return [
      { tur: 'link', to: '/', label: 'Ana Sayfa', end: true },
      { tur: 'link', to: '/program', label: 'Ders Programım' },
      { tur: 'link', to: '/yoklamalarim', label: 'Yoklamalarım' },
      { tur: 'link', to: '/odev', label: 'Ödevlerim' },
      { tur: 'link', to: '/karnem', label: 'Sınav Sonuçlarım' },
      { tur: 'link', to: '/sifremi-degistir', label: 'Şifremi Değiştir' },
    ]
  }
  return []
}

// Bire bir dersinden 10 dakika önce gerçek push bildirimi almak isteyenler bu
// butona basıp izin veriyor. ÖNCEDEN sadece öğrenci rolünde gösteriliyordu —
// ama yöneticiye de (bkz. api/bire-bir-hatirlatma.js) her bire bir dersten 10
// dakika önce "kim kiminle dersi var" bildirimi gönderilmeye başlandığında,
// yöneticinin buna abone olabileceği bir buton hiç eklenmemişti — yönetici
// hiçbir zaman push_abonelikleri'ne kaydolamadığı için bildirim de hiç
// gitmiyordu (kullanıcının fark ettiği hata). Artık yönetici için de gösteriliyor,
// mesaj metni role göre değişiyor (öğrenci "kendi dersi", yönetici "bir
// öğrencinin dersi" diye bildirim alacağını anlasın diye).
// Desteklenmeyen tarayıcılarda (ör. iPhone Safari'de ana ekrana eklenmeden)
// buton yine görünür, basılınca açıklayıcı bir hata mesajı gösterir.
function BildirimButonu({ profileId, rol }) {
  const [acik, setAcik] = useState(false)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [kontrolEdildi, setKontrolEdildi] = useState(false)

  useEffect(() => {
    let iptal = false
    bildirimAcikMi().then((deger) => {
      if (!iptal) {
        setAcik(deger)
        setKontrolEdildi(true)
      }
    })
    return () => { iptal = true }
  }, [])

  async function tikla() {
    setYukleniyor(true)
    try {
      if (acik) {
        await bildirimleriKapat()
        setAcik(false)
      } else {
        await bildirimleriAc(profileId)
        setAcik(true)
        alert(
          rol === 'yonetici'
            ? 'Bildirimler açıldı. Bir öğrencinin bire bir dersinden 10 dakika önce bildirim alacaksınız.'
            : 'Bildirimler açıldı. Bire bir dersinizden 10 dakika önce bildirim alacaksınız.'
        )
      }
    } catch (err) {
      alert(err.message)
    }
    setYukleniyor(false)
  }

  if (!pushDestekleniyorMu()) return null

  return (
    <button
      onClick={tikla}
      disabled={yukleniyor}
      className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
    >
      {yukleniyor ? 'İşleniyor...' : acik ? '🔔 Bildirimler Açık (kapatmak için tıkla)' : '🔕 Bildirimleri Aç'}
    </button>
  )
}

// Alttaki otomatik banner "Bir daha gösterme" ile kalıcı olarak kapatılmış
// olsa bile (bkz. UygulamaYukleBanner.jsx), uygulamayı istediği an elle
// kurabilsin diye TÜM rollere sol menünün altında sabit duran buton —
// kullanıcı isteğiyle eklendi: telefondan uygulamayı silip tekrar kurmak
// isteyen ama daha önce "bir daha gösterme" demiş biri, banner'ın geri
// gelmesini beklemeden buradan kurabiliyor.
function UygulamaYukleButonu({ ertelemeOlayi, yukle }) {
  const [yuklu, setYuklu] = useState(zatenYukluMu())

  useEffect(() => {
    function yuklendi() { setYuklu(true) }
    window.addEventListener('appinstalled', yuklendi)
    return () => window.removeEventListener('appinstalled', yuklendi)
  }, [])

  // zatenYukluMu() SADECE "bu sekme şu an kurulu haliyle mi açık" sorusuna
  // cevap veriyor — normal bir tarayıcı sekmesinde uygulama BAŞKA bir yerde
  // (Dock, Başlat Menüsü, telefonun ana ekranı) kurulu olsa bile bunu
  // YAKALAMIYOR, kullanıcının şikayet ettiği tam olarak buydu: buton kurulu
  // olsa da görünmeye devam ediyor, tıklayınca da anlamsız bir uyarı
  // veriyordu. gercektenYukluMu() ise tarayıcının kendi kurulu-uygulamalar
  // kaydına bakan GERÇEK bir kontrol — sonuç kesin "kurulu" ise butonu
  // tamamen kaldırıyoruz.
  useEffect(() => {
    let iptal = false
    gercektenYukluMu().then((sonuc) => {
      if (!iptal && sonuc === true) setYuklu(true)
    })
    return () => { iptal = true }
  }, [])

  if (yuklu) return null

  async function tikla() {
    if (ertelemeOlayi) {
      await yukle()
      return
    }
    if (iosMu()) {
      alert('Bu uygulamayı telefonuna ekleyebilirsin: Paylaş simgesine dokun, "Ana Ekrana Ekle" seçeneğini seç.')
      return
    }
    if (safariMasaustuMu()) {
      alert('Safari bu otomatik yükleme penceresini desteklemiyor. Üstteki "Dosya" menüsünden "Dock\'a Ekle" seçeneğini kullanabilirsin — zaten Dock\'a eklediysen bu adımı tekrarlamana gerek yok, oradan açabilirsin.')
      return
    }
    // Chrome/Edge burada iki nedenden biri yüzünden olabilir: (1) sayfa daha
    // yeni açıldı, tarayıcı teklifi henüz hazırlamadı — yenileyip biraz
    // beklemek çözer; (2) BU CİHAZDA UYGULAMA ZATEN KURULU — Chrome, bir
    // siteyi bir kez kurduktan sonra AYNI TARAYICIDA bir daha kurulum teklifi
    // ASLA göstermiyor (kullanıcının kendi gözlemiyle hem masaüstünde hem
    // Android'de doğrulandı). İkinci durumu JS'ten güvenilir şekilde ayırt
    // edebilecek bir API yok, o yüzden ikisini de tek mesajda anlatıyoruz.
    // Android ile masaüstü Chrome'un "zaten kurulu mu" kontrol yolu farklı
    // olduğu için (adres çubuğu ikonu / chrome://apps masaüstünde var,
    // Android'de yok) mesajı platforma göre ayırıyoruz.
    if (androidMu()) {
      alert(
        'Tarayıcınız şu an yükleme teklifini hazırlamadı.\n\n' +
          'Sayfayı yenileyip birkaç saniye sonra tekrar deneyebilirsiniz — ' +
          'ama bu telefonda uygulama ZATEN kuruluysa (ana ekranınızda ya da ' +
          'uygulama çekmecenizde "Savaş Akça Eğitim" simgesini arayın), ' +
          'Chrome aynı tarayıcıda bir daha kurulum teklifi göstermez — bu ' +
          'normaldir, kurulu olanı doğrudan oradan açabilirsiniz. Silip ' +
          'yeniden kurmak isterseniz: Ayarlar > Uygulamalar içinden "Savaş ' +
          'Akça Eğitim"i bulup kaldırabilir, ya da simgeye basılı tutup ' +
          '"Kaldır" seçebilirsiniz.'
      )
      return
    }
    alert(
      'Tarayıcınız şu an yükleme teklifini hazırlamadı.\n\n' +
        'Sayfayı yenileyip birkaç saniye sonra tekrar deneyebilirsiniz — ' +
        'ama bu bilgisayarda uygulama ZATEN kuruluysa (adres çubuğunun ' +
        'sağındaki bilgisayar ikonuna ya da chrome://apps sayfasına ' +
        'bakabilirsiniz), Chrome aynı tarayıcıda bir daha kurulum teklifi ' +
        'göstermez — bu normaldir, kurulu olanı doğrudan oradan açabilirsiniz.'
    )
  }

  return (
    <button
      type="button"
      onClick={tikla}
      className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
    >
      📲 Uygulamayı Yükle
    </button>
  )
}

function OkGosterge({ acik }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform duration-150 ${acik ? 'rotate-180' : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function GrupMenuOgesi({ grup, pathname, onLinkTiklandi }) {
  const grupAktifMi = grup.ogeler.some((o) => pathname === o.to || pathname.startsWith(o.to + '/'))
  const [acik, setAcik] = useState(grupAktifMi)

  return (
    <div>
      <button
        type="button"
        onClick={() => setAcik((a) => !a)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          grupAktifMi ? 'text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
        }`}
      >
        <span>{grup.label}</span>
        <OkGosterge acik={acik} />
      </button>
      {acik && (
        <div className="ml-3 pl-3 mt-0.5 mb-1 space-y-0.5 border-l border-white/10">
          {grup.ogeler.map((o) => (
            <NavLink
              key={o.to}
              to={o.to}
              end={o.end}
              onClick={onLinkTiklandi}
              className={({ isActive }) =>
                `block px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-white/15 text-white font-medium' : 'text-white/60 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {o.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const { profile, session, signOut } = useAuth()
  const rol = profile?.rol
  const [menuAcik, setMenuAcik] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const menu = menuOlustur(rol)
  // "beforeinstallprompt"/"appinstalled" olaylarını TEK bir yerde (burada)
  // yakalayıp, hem alttaki banner'a hem sol menüdeki butona aynı sonucu
  // veriyoruz — bkz. usePwaYukleme.js dosya başındaki genel not.
  const { ertelemeOlayi, yukle: pwaYukle } = usePwaYukleme(profile?.id)

  // Giriş yapmadan doğrudan bir sayfaya (ör. /gunluk) girilirse, sistem önce
  // giriş ekranına atıyor. Giriş başarılı olunca Login sayfası kendi içinde
  // hep "/" ana sayfaya yönlendirdiği için, kullanıcı asıl gitmek istediği
  // sayfayı unutup ana sayfada buluyordu kendini. Giriş öncesi App.jsx'te
  // sessionStorage'a yazılan hedefi burada, oturum açılır açılmaz okuyup
  // o sayfaya yönlendiriyoruz.
  useEffect(() => {
    if (!session) return
    let hedef = null
    try { hedef = sessionStorage.getItem('sa_giris_sonrasi_hedef') } catch {}
    if (!hedef) return
    try { sessionStorage.removeItem('sa_giris_sonrasi_hedef') } catch {}
    if (hedef !== location.pathname) navigate(hedef, { replace: true })
  }, [session])

  // "Kim ne zaman nereden girdi" kaydı — Giriş Kayıtları sayfası (yönetici)
  // için. Sekme/tarayıcı oturumu başına SADECE BİR KEZ gönderilir (sessionStorage
  // ile işaretlenir) — sayfa içinde gezinirken (route değişse de Layout aynı
  // kalır) veya F5 ile yenilemede TEKRAR göndermez, gereksiz kayıt birikmesin
  // diye. "Gönderildi" işareti SADECE istek gerçekten BAŞARILI olursa
  // yazılıyor — önceden (API/tablo henüz kurulmadan önce test edilirken) her
  // durumda işaretlendiği için, bir kere başarısız olan istek bir daha hiç
  // denenmiyordu (aynı sekmede kalındığı sürece). Artık başarısız olursa
  // işaret yazılmıyor, bir sonraki sayfa yüklemesinde/route değişiminde
  // tekrar denenir. Hata olursa yine sessizce yutulur — giriş kaydı asla asıl
  // işi engellemez.
  useEffect(() => {
    if (!profile?.id || !session?.access_token) return
    const ANAHTAR = 'sa_giris_kaydi_gonderildi'
    if (sessionStorage.getItem(ANAHTAR)) return
    fetch('/api/giris-kaydet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => {
        if (r.ok) sessionStorage.setItem(ANAHTAR, '1')
      })
      .catch(() => {})
  }, [profile?.id, session?.access_token])

  return (
    <div className="min-h-screen bg-cream">
      {/* iOS'ta "Ana Ekrana Ekle" ile kurulan sürümde tarayıcının kendi
          "aşağı çek → yenile" jesti çalışmadığı için (kullanıcı şikayeti —
          yenilemek için uygulamayı komple kapatıp açmak zorunda kalıyorlardı),
          bu jesti elle taklit eden bileşen — sadece standalone modda devreye
          girer, normal tarayıcı sekmesinde hiçbir şey yapmaz. */}
      <PullToRefresh />
      {/* Mobil üst çubuk — sadece küçük ekranlarda görünür. iPhone'da
          "uygulama olarak yükle"nen (Ana Ekrana Ekle) sürümde, status bar
          stilimiz "black-translucent" olduğu için saat/pil/sinyal simgeleri
          normalde bu çubuğun ÜZERİNE biniyordu — üstteki güvenli alan kadar
          (çentik/Dynamic Island yüksekliği) ekstra boşluk ekleyerek çubuğun
          içeriği status bar'ın ALTINDAN başlıyor, ama lacivert arka plan
          status bar'ın arkasına kadar devam ediyor (böylece boş beyaz bir
          şerit görünmüyor). */}
      <div
        className="md:hidden flex items-center justify-between bg-navy text-white px-4 py-3 sticky top-0 z-20"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="bg-white rounded-lg p-1 shrink-0">
            <img src="/logo.png" alt="Savaş Akça Eğitim" className="w-7 h-7 object-contain" />
          </div>
          <span className="font-bold truncate">Savaş Akça Eğitim</span>
        </div>
        <button
          onClick={() => setMenuAcik(true)}
          aria-label="Menüyü aç"
          className="p-2 shrink-0"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Mobilde menü açıkken arkayı karartan katman */}
      {menuAcik && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setMenuAcik(false)}
        />
      )}

      {/* Kenar menü — masaüstünde ekranın soluna sabit, tüm yükseklik boyunca */}
      <aside
        className={`fixed top-0 left-0 h-full md:h-screen w-64 md:w-60 bg-navy text-white flex flex-col shrink-0 z-40 transform transition-transform duration-200 ease-out overflow-y-auto ${
          menuAcik ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        {/* Açılan kenar menü de iPhone'da status bar'ın altına aynı şekilde
            güvenli boşluk alıyor (masaüstünde env() zaten 0 döndüğü için
            hiçbir şey değişmiyor). */}
        <div
          className="p-5 border-b border-white/10 flex flex-col items-center text-center shrink-0"
          style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top))' }}
        >
          <div className="bg-white rounded-xl p-1.5 mb-2">
            <img src="/logo.png" alt="Savaş Akça Eğitim" className="w-14 h-14 object-contain" />
          </div>
          <p className="font-bold text-lg leading-tight">Savaş Akça Eğitim</p>
          <span className="inline-block text-[11px] font-semibold text-white/80 bg-white/10 px-2 py-0.5 rounded-full mt-1.5">
            {ROL_ETIKET[rol] || ''}
          </span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {menu.map((oge) =>
            oge.tur === 'grup' ? (
              <GrupMenuOgesi
                key={oge.label}
                grup={oge}
                pathname={location.pathname}
                onLinkTiklandi={() => setMenuAcik(false)}
              />
            ) : (
              <NavLink
                key={oge.to}
                to={oge.to}
                end={oge.end}
                onClick={() => setMenuAcik(false)}
                className={({ isActive }) =>
                  `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                {oge.label}
              </NavLink>
            )
          )}
        </nav>
        {/* PWA olarak (özellikle iPad/iPhone'da tarayıcı çubuğu olmadan)
            yüklendiğinde, alt kısım cihazın home indicator / güvenli alan
            şeridiyle çakışıp "Çıkış Yap" gibi son öğeler tam görünmüyordu —
            üstteki safe-area-inset-top ile aynı mantıkla alta da boşluk
            ekleniyor (masaüstünde env() zaten 0 olduğu için bir şey değişmez). */}
        <div
          className="p-3 border-t border-white/10 shrink-0"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <p className="text-xs text-white/60 px-3 mb-2 truncate">{profile?.ad_soyad}</p>
          {(rol === 'ogrenci' || rol === 'yonetici') && profile?.id && (
            <BildirimButonu profileId={profile.id} rol={rol} />
          )}
          <UygulamaYukleButonu ertelemeOlayi={ertelemeOlayi} yukle={pwaYukle} />
          <button
            onClick={() => {
              if (window.confirm('Çıkış yapmak istediğinize emin misiniz?')) signOut()
            }}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            Çıkış Yap
          </button>
        </div>
      </aside>

      <main className="md:ml-60 p-4 md:p-6 overflow-x-hidden min-h-screen">
        <Outlet />
      </main>

      {/* Tüm roller için ortak "Uygulama olarak yükle" teklifi — burada,
          Layout'ta tek bir yerde durduğu için her rolün her sayfasında
          otomatik olarak devreye girer. */}
      <UygulamaYukleBanner ertelemeOlayi={ertelemeOlayi} yukle={pwaYukle} />
    </div>
  )
}
