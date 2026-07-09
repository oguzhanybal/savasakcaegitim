import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Ogrenciler from './pages/Ogrenciler'
import Muhasebe from './pages/Muhasebe'
import Siniflar from './pages/Siniflar'
import SinifDetay from './pages/SinifDetay'
import DersProgrami from './pages/DersProgrami'
import Yoklama from './pages/Yoklama'

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
            path="muhasebe"
            element={
              <Korumali izinliRoller={['yonetici', 'veli']}>
                <Muhasebe />
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
