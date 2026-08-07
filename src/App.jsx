import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Ogrenciler from './pages/Ogrenciler'
import Ogretmenler from './pages/Ogretmenler'
import Muhasebe from './pages/Muhasebe'
import Siniflar from './pages/Siniflar'
import SinifDetay from './pages/SinifDetay'
import DersProgrami from './pages/DersProgrami'
import GunlukProgram from './pages/GunlukProgram'
import Yoklama from './pages/Yoklama'
import YoklamaRaporu from './pages/YoklamaRaporu'
import Makbuz from './pages/Makbuz'
import MakbuzGunluk from './pages/MakbuzGunluk'
import BireBir from './pages/BireBir'
import Ekstre from './pages/Ekstre'
import OgretmenEkstre from './pages/OgretmenEkstre'
import OgretmenEkstreSecici from './pages/OgretmenEkstreSecici'
import GenelBireBirEkstre from './pages/GenelBireBirEkstre'
import TopluEkstre from './pages/TopluEkstre'
import GelirRaporu from './pages/GelirRaporu'
import Giderler from './pages/Giderler'
import AylikOzet from './pages/AylikOzet'
import BorcYaslandirma from './pages/BorcYaslandirma'
import KullaniciOlustur from './pages/KullaniciOlustur'
import Kantin from './pages/Kantin'
import KantinFiyatListesi from './pages/KantinFiyatListesi'
import KantinGunlukRapor from './pages/KantinGunlukRapor'
import SinavKitapciklari from './pages/SinavKitapciklari'
import SinavYukle from './pages/SinavYukle'
import SinavSonuclari from './pages/SinavSonuclari'
import HataKitapcigi from './pages/HataKitapcigi'
import Karnem from './pages/Karnem'
import Yoklamalarim from './pages/Yoklamalarim'
import Sozlesme from './pages/Sozlesme'
import SifreSifirla from './pages/SifreSifirla'
import GirisKayitlari from './pages/GirisKayitlari'
import SifremiDegistir from './pages/SifremiDegistir'
import Odev from './pages/Odev'
import OgrenciZamanCizelgesi from './pages/OgrenciZamanCizelgesi'
import YedekAl from './pages/YedekAl'
import ZilSistemi from './pages/ZilSistemi'
import Duyurular from './pages/Duyurular'
import UygulamaYuklemeleri from './pages/UygulamaYuklemeleri'

function Yukleniyor() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream">
      <p className="text-gray-400">Yükleniyor...</p>
    </div>
  )
}

function Korumali({ children, izinliRoller }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Yukleniyor />
  if (!session) {
    const hedef = location.pathname + location.search
    // Sadece location.state'e güvenmek yetmiyor — Login.jsx giriş başarılı
    // olunca kendi içinde doğrudan "/" ana sayfaya yönlendirebiliyor, o zaman
    // state kaybolur. sessionStorage'a da yazıp Layout.jsx'te giriş sonrası
    // bu hedefe dönüyoruz, hangi yoldan "/" ye düşülürse düşülsün çalışsın diye.
    // "/" hedefini KAYDETMİYORUZ: giriş anında oturum bilgisi bir anlığına henüz
    // güncellenmemiş olabiliyor, o sırada "/" için de bu fonksiyon tetiklenip
    // asıl hedefi (ör. /gunluk) "/" ile ezip siliyordu — bug buradaydı.
    if (hedef && hedef !== '/giris' && hedef !== '/') {
      try { sessionStorage.setItem('sa_giris_sonrasi_hedef', hedef) } catch {}
    }
    return <Navigate to="/giris" state={{ from: hedef }} replace />
  }
  // Tam giriş yaptıktan hemen sonra bir sayfaya düşülürse "session" zaten
  // hazır ama "profile" (rol bilgisini içeren kayıt) veritabanından AYRI bir
  // istekle geliyor ve o istek henüz bitmemiş olabiliyor. ÖNCEDEN bu bekleme
  // sadece izinliRoller belirtilen sayfalarda yapılıyordu — izinliRoller
  // belirtilmeyen sayfalarda (ör. /program, ana sayfa) profile boşken hemen
  // çocuklar render ediliyordu. Bu sayfaların KENDİ içindeki "sayfa açılır
  // açılmaz veri çek" efektleri de genelde sadece BİR KEZ ([] bağımlılıkla)
  // çalıştığı için, o an profile boş olduğunda role özel veri (ör. öğretmenin
  // Bire Bir/Soru Çözümü seansları) hiç çekilmiyor, sayfa geç yenilenmedikçe
  // (başka bir işlem tekrar veri çekene kadar) hiç görünmüyordu — kullanıcının
  // "bazen geç geliyor" dediği asıl kök neden buydu. Artık profile,
  // izinliRoller olsun olmasın HER durumda beklenir; sayfa bileşenleri artık
  // her zaman dolu bir profile ile monte olur.
  if (!profile) return <Yukleniyor />
  if (izinliRoller && !izinliRoller.includes(profile?.rol)) return <Navigate to="/" replace />
  return children
}

function GirisSayfasi() {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Yukleniyor />
  if (session) return <Navigate to={location.state?.from || '/'} replace />
  return <Login />
}

// Kantin görevlisi giriş yapınca doğrudan Kantin sayfasına gitsin — Panel'de
// onunla ilgisi olmayan öğrenci/ödeme bilgileri var, o yüzden "/" onun için
// hiç gösterilmiyor.
// "zil" rolü de kantin gibi tek-amaçlı bir hesap — Panel'de onunla ilgisi
// olmayan bilgiler var, o yüzden doğrudan Zil Sistemi'ne yönlendiriliyor.
function AnaSayfa() {
  const { profile } = useAuth()
  if (profile?.rol === 'kantin') return <Navigate to="/kantin" replace />
  if (profile?.rol === 'zil') return <Navigate to="/zil-sistemi" replace />
  return <Dashboard />
}

function AnaUygulama() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/giris" element={<GirisSayfasi />} />

        {/* Yazdırılabilir sayfalar: kenar menüsüz, tam sayfa */}
        <Route
          path="/makbuz/:odemeId"
          element={
            <Korumali izinliRoller={['yonetici']}>
              <Makbuz />
            </Korumali>
          }
        />
        <Route
          path="/makbuz-gun/:ogrenciId/:tarih"
          element={
            <Korumali izinliRoller={['yonetici']}>
              <MakbuzGunluk />
            </Korumali>
          }
        />
        <Route
          path="/ekstre/:ogrenciId"
          element={
            <Korumali izinliRoller={['yonetici', 'veli']}>
              <Ekstre />
            </Korumali>
          }
        />
        <Route
          path="/ogretmen-ekstre/:ogretmenId"
          element={
            <Korumali izinliRoller={['yonetici', 'ogretmen']}>
              <OgretmenEkstre />
            </Korumali>
          }
        />
        <Route
          path="/bire-bir-genel-ekstre"
          element={
            <Korumali izinliRoller={['yonetici']}>
              <GenelBireBirEkstre />
            </Korumali>
          }
        />
        <Route
          path="/sozlesme/:sozlesmeId"
          element={
            <Korumali izinliRoller={['yonetici']}>
              <Sozlesme />
            </Korumali>
          }
        />
        <Route
          path="/hata-kitapcigi/:sonucId"
          element={
            <Korumali izinliRoller={['yonetici', 'veli', 'ogrenci']}>
              <HataKitapcigi />
            </Korumali>
          }
        />
        <Route
          path="/kantin-fiyat-listesi"
          element={
            <Korumali izinliRoller={['yonetici']}>
              <KantinFiyatListesi />
            </Korumali>
          }
        />

        <Route
          path="/"
          element={
            <Korumali>
              <Layout />
            </Korumali>
          }
        >
          <Route index element={<AnaSayfa />} />
          <Route
            path="kantin"
            element={
              <Korumali izinliRoller={['yonetici', 'kantin']}>
                <Kantin />
              </Korumali>
            }
          />
          <Route
            path="kantin-gunluk-rapor"
            element={
              <Korumali izinliRoller={['yonetici', 'kantin']}>
                <KantinGunlukRapor />
              </Korumali>
            }
          />
          <Route
            path="ogrenciler"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <Ogrenciler />
              </Korumali>
            }
          />
          <Route
            path="ogrenci/:ogrenciId"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <OgrenciZamanCizelgesi />
              </Korumali>
            }
          />
          <Route
            path="ogretmenler"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <Ogretmenler />
              </Korumali>
            }
          />
          <Route
            path="kullanici-olustur"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <KullaniciOlustur />
              </Korumali>
            }
          />
          <Route
            path="sifre-sifirla"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <SifreSifirla />
              </Korumali>
            }
          />
          <Route
            path="giris-kayitlari"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <GirisKayitlari />
              </Korumali>
            }
          />
          <Route
            path="yedek-al"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <YedekAl />
              </Korumali>
            }
          />
          <Route
            path="duyurular"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <Duyurular />
              </Korumali>
            }
          />
          <Route
            path="uygulama-yuklemeleri"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <UygulamaYuklemeleri />
              </Korumali>
            }
          />
          <Route
            path="zil-sistemi"
            element={
              <Korumali izinliRoller={['yonetici', 'zil']}>
                <ZilSistemi />
              </Korumali>
            }
          />
          <Route
            path="muhasebe"
            element={
              <Korumali izinliRoller={['yonetici', 'veli']}>
                <Muhasebe />
              </Korumali>
            }
          />
          <Route
            path="ogretmen-ekstresi"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <OgretmenEkstreSecici />
              </Korumali>
            }
          />
          <Route
            path="toplu-ekstre"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <TopluEkstre />
              </Korumali>
            }
          />
          <Route
            path="gelir-raporu"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <GelirRaporu />
              </Korumali>
            }
          />
          <Route
            path="giderler"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <Giderler />
              </Korumali>
            }
          />
          <Route
            path="aylik-ozet"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <AylikOzet />
              </Korumali>
            }
          />
          <Route
            path="borc-yaslandirma"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <BorcYaslandirma />
              </Korumali>
            }
          />
          <Route
            path="siniflar"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <Siniflar />
              </Korumali>
            }
          />
          <Route
            path="siniflar/:sinifId"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <SinifDetay />
              </Korumali>
            }
          />
          <Route path="program" element={<DersProgrami />} />
          <Route
            path="gunluk"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <GunlukProgram />
              </Korumali>
            }
          />
          <Route path="sifremi-degistir" element={<SifremiDegistir />} />
          <Route
            path="bire-bir"
            element={
              <Korumali izinliRoller={['yonetici', 'ogretmen']}>
                <BireBir />
              </Korumali>
            }
          />
          <Route
            path="odev"
            element={
              <Korumali izinliRoller={['yonetici', 'ogretmen', 'veli', 'ogrenci']}>
                <Odev />
              </Korumali>
            }
          />
          <Route
            path="yoklama"
            element={
              <Korumali izinliRoller={['yonetici', 'ogretmen']}>
                <Yoklama />
              </Korumali>
            }
          />
          <Route
            path="yoklama-raporu"
            element={
              <Korumali izinliRoller={['yonetici', 'ogretmen']}>
                <YoklamaRaporu />
              </Korumali>
            }
          />
          <Route
            path="sinav-kitapciklari"
            element={
              <Korumali izinliRoller={['yonetici', 'ogretmen']}>
                <SinavKitapciklari />
              </Korumali>
            }
          />
          <Route
            path="sinav-yukle"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <SinavYukle />
              </Korumali>
            }
          />
          <Route
            path="sinav-sonuclari"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <SinavSonuclari />
              </Korumali>
            }
          />
          <Route
            path="karnem"
            element={
              <Korumali izinliRoller={['veli', 'ogrenci', 'yonetici']}>
                <Karnem />
              </Korumali>
            }
          />
          <Route
            path="yoklamalarim"
            element={
              <Korumali izinliRoller={['veli', 'ogrenci']}>
                <Yoklamalarim />
              </Korumali>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AnaUygulama />
    </AuthProvider>
  )
}
