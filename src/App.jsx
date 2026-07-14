import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import Yoklama from './pages/Yoklama'
import YoklamaRaporu from './pages/YoklamaRaporu'
import Makbuz from './pages/Makbuz'
import MakbuzGunluk from './pages/MakbuzGunluk'
import BireBir from './pages/BireBir'
import Ekstre from './pages/Ekstre'
import OgretmenEkstre from './pages/OgretmenEkstre'
import GenelBireBirEkstre from './pages/GenelBireBirEkstre'
import TopluEkstre from './pages/TopluEkstre'
import GelirRaporu from './pages/GelirRaporu'
import KullaniciOlustur from './pages/KullaniciOlustur'
import Kantin from './pages/Kantin'
import SinavKitapciklari from './pages/SinavKitapciklari'
import SinavYukle from './pages/SinavYukle'
import Sozlesme from './pages/Sozlesme'
import SifreSifirla from './pages/SifreSifirla'
import SifremiDegistir from './pages/SifremiDegistir'
import Odev from './pages/Odev'

function Yukleniyor() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream">
      <p className="text-gray-400">Yükleniyor...</p>
    </div>
  )
}

function Korumali({ children, izinliRoller }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <Yukleniyor />
  if (!session) return <Navigate to="/giris" replace />
  if (izinliRoller && !izinliRoller.includes(profile?.rol)) return <Navigate to="/" replace />
  return children
}

function GirisSayfasi() {
  const { session, loading } = useAuth()
  if (loading) return <Yukleniyor />
  if (session) return <Navigate to="/" replace />
  return <Login />
}

// Kantin görevlisi giriş yapınca doğrudan Kantin sayfasına gitsin — Panel'de
// onunla ilgisi olmayan öğrenci/ödeme bilgileri var, o yüzden "/" onun için
// hiç gösterilmiyor.
function AnaSayfa() {
  const { profile } = useAuth()
  if (profile?.rol === 'kantin') return <Navigate to="/kantin" replace />
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
          path="/odev"
          element={
            <Korumali izinliRoller={['yonetici', 'ogretmen', 'veli', 'ogrenci']}>
              <Odev />
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
            path="ogrenciler"
            element={
              <Korumali izinliRoller={['yonetici']}>
                <Ogrenciler />
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
            path="muhasebe"
            element={
              <Korumali izinliRoller={['yonetici', 'veli']}>
                <Muhasebe />
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
              <Korumali izinliRoller={['yonetici']}>
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
