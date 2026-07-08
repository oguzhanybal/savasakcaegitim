import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

const ROL_ETIKET = {
  yonetici: 'Yönetici',
  ogretmen: 'Öğretmen',
  veli: 'Veli',
  ogrenci: 'Öğrenci',
}

export default function Layout() {
  const { profile, signOut } = useAuth()
  const rol = profile?.rol

  const links = []
  if (rol === 'yonetici') {
    links.push(
      { to: '/', label: 'Panel', end: true },
      { to: '/ogrenciler', label: 'Öğrenciler' },
      { to: '/muhasebe', label: 'Muhasebe' },
      { to: '/siniflar', label: 'Sınıflar' },
      { to: '/program', label: 'Ders Programı' },
    )
  } else if (rol === 'ogretmen') {
    links.push(
      { to: '/', label: 'Panel', end: true },
      { to: '/program', label: 'Ders Programım' },
      { to: '/yoklama', label: 'Yoklama Al' },
    )
  } else if (rol === 'veli') {
    links.push(
      { to: '/', label: 'Panel', end: true },
      { to: '/muhasebe', label: 'Ödeme Durumu' },
      { to: '/program', label: 'Ders Programı' },
    )
  } else if (rol === 'ogrenci') {
    links.push(
      { to: '/', label: 'Panel', end: true },
      { to: '/program', label: 'Ders Programım' },
    )
  }

  return (
    <div className="min-h-screen bg-cream flex">
      <aside className="w-60 bg-navy text-white flex flex-col shrink-0">
        <div className="p-5 border-b border-white/10">
          <p className="font-bold text-lg leading-tight">Savaş Akça</p>
          <p className="text-xs text-white/60">{ROL_ETIKET[rol] || ''}</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <p className="text-xs text-white/60 px-3 mb-2 truncate">{profile?.ad_soyad}</p>
          <button
            onClick={signOut}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            Çıkış Yap
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
