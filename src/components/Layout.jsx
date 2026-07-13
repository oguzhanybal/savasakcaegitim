import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

const ROL_ETIKET = {
  yonetici: 'Yönetici',
  ogretmen: 'Öğretmen',
  veli: 'Veli',
  ogrenci: 'Öğrenci',
  kantin: 'Kantin Görevlisi',
}

function menuOlustur(rol) {
  if (rol === 'yonetici') {
    return [
      { tur: 'link', to: '/', label: 'Panel', end: true },
      { tur: 'link', to: '/sifremi-degistir', label: 'Şifremi Değiştir' },
      {
        tur: 'grup',
        label: 'Kullanıcılar',
        ogeler: [
          { to: '/ogrenciler', label: 'Öğrenciler' },
          { to: '/ogretmenler', label: 'Öğretmenler' },
          { to: '/kullanici-olustur', label: 'Kullanıcı Oluştur' },
          { to: '/sifre-sifirla', label: 'Şifre Sıfırla' },
        ],
      },
      {
        tur: 'grup',
        label: 'Ödemeler',
        ogeler: [
          { to: '/muhasebe', label: 'Muhasebe' },
          { to: '/toplu-ekstre', label: 'Toplu Ekstre' },
          { to: '/gelir-raporu', label: 'Gelir Raporu' },
          { to: '/kantin', label: 'Kantin' },
        ],
      },
      {
        tur: 'grup',
        label: 'Sınıflar',
        ogeler: [
          { to: '/siniflar', label: 'Sınıf Listesi' },
          { to: '/program', label: 'Ders Programı' },
          { to: '/bire-bir', label: 'Bire Bir' },
        ],
      },
      {
        tur: 'grup',
        label: 'Yoklama',
        ogeler: [
          { to: '/yoklama', label: 'Yoklama Al' },
          { to: '/yoklama-raporu', label: 'Yoklama Raporu' },
        ],
      },
      {
        tur: 'grup',
        label: 'Sınavlar',
        ogeler: [
          { to: '/sinav-kitapciklari', label: 'Sınav Kitapçıkları' },
          { to: '/sinav-yukle', label: 'Sınav Sonucu Yükle' },
        ],
      },
    ]
  }
  if (rol === 'kantin') {
    return [
      { tur: 'link', to: '/kantin', label: 'Kantin', end: true },
      { tur: 'link', to: '/sifremi-degistir', label: 'Şifremi Değiştir' },
    ]
  }
  if (rol === 'ogretmen') {
    return [
      { tur: 'link', to: '/', label: 'Panel', end: true },
      { tur: 'link', to: '/program', label: 'Ders Programım' },
      { tur: 'link', to: '/bire-bir', label: 'Bire Bir Derslerim' },
      { tur: 'link', to: '/yoklama', label: 'Yoklama Al' },
      { tur: 'link', to: '/yoklama-raporu', label: 'Yoklama Raporu' },
      { tur: 'link', to: '/sifremi-degistir', label: 'Şifremi Değiştir' },
    ]
  }
  if (rol === 'veli') {
    return [
      { tur: 'link', to: '/', label: 'Panel', end: true },
      { tur: 'link', to: '/muhasebe', label: 'Ödeme Durumu' },
      { tur: 'link', to: '/program', label: 'Ders Programı' },
      { tur: 'link', to: '/sifremi-degistir', label: 'Şifremi Değiştir' },
    ]
  }
  if (rol === 'ogrenci') {
    return [
      { tur: 'link', to: '/', label: 'Panel', end: true },
      { tur: 'link', to: '/program', label: 'Ders Programım' },
      { tur: 'link', to: '/sifremi-degistir', label: 'Şifremi Değiştir' },
    ]
  }
  return []
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
  const { profile, signOut } = useAuth()
  const rol = profile?.rol
  const [menuAcik, setMenuAcik] = useState(false)
  const location = useLocation()

  const menu = menuOlustur(rol)

  return (
    <div className="min-h-screen bg-cream">
      {/* Mobil üst çubuk — sadece küçük ekranlarda görünür */}
      <div className="md:hidden flex items-center justify-between bg-navy text-white px-4 py-3 sticky top-0 z-20">
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
        <div className="p-5 border-b border-white/10 flex flex-col items-center text-center shrink-0">
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
        <div className="p-3 border-t border-white/10 shrink-0">
          <p className="text-xs text-white/60 px-3 mb-2 truncate">{profile?.ad_soyad}</p>
          <button
            onClick={signOut}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            Çıkış Yap
          </button>
        </div>
      </aside>

      <main className="md:ml-60 p-4 md:p-6 overflow-x-hidden min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}
