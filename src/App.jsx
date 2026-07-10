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
import Ekstre from './pages/Ekstre'
import TopluEkstre from './pages/TopluEkstre'

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
          path="/ekstre/:ogrenciId"
          element={
            <Korumali izinliRoller={['yonetici', 'veli']}>
              <Ekstre />
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
          <Route index element={<Dashboard />} />
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
