import { useState } from 'react'
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
  const [menuAcik, setMenuAcik] = useState(false)

  const links = []
  if (rol === 'yonetici') {
    links.push(
      { to: '/', label: 'Panel', end: true },
      { to: '/ogrenciler', label: 'Öğrenciler' },
      { to: '/ogretmenler', label: 'Öğretmenler' },
      { to: '/muhasebe', label: 'Muhasebe' },
      { to: '/toplu-ekstre', label: 'Toplu Ekstre' },
      { to: '/siniflar', label: 'Sınıflar' },
      { to: '/program', label: 'Ders Programı' },
      { to: '/yoklama', label: 'Yoklama' },
      { to: '/yoklama-raporu', label: 'Yoklama Raporu' },
    )
  } else if (rol === 'ogretmen') {
    links.push(
      { to: '/', label: 'Panel', end: true },
      { to: '/program', label: 'Ders Programım' },
      { to: '/yoklama', label: 'Yoklama Al' },
      { to: '/yoklama-raporu', label: 'Yoklama Raporu' },
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
    <div className="min-h-screen bg-cream md:flex">
      {/* Mobil üst çubuk — sadece küçük ekranlarda görünür */}
      <div className="md:hidden flex items-center justify-between bg-navy text-white px-4 py-3 sticky top-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <div className="bg-white rounded-lg p-1 shrink-0">
            <img src="/logo.png" alt="Savaş Akça Eğitim" className="w-7 h-7 object-contain" />
          </div>
          <span className="font-bold truncate">Savaş Akça</span>
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

      <aside
        className={`fixed md:static top-0 left-0 h-full w-64 md:w-60 bg-navy text-white flex flex-col shrink-0 z-40 transform transition-transform duration-200 ease-out ${
          menuAcik ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="p-5 border-b border-white/10 flex flex-col items-center text-center">
          <div className="bg-white rounded-xl p-1.5 mb-2">
            <img src="/logo.png" alt="Savaş Akça Eğitim" className="w-14 h-14 object-contain" />
          </div>
          <p className="font-bold text-lg leading-tight">Savaş Akça</p>
          <span className="inline-block text-[11px] font-semibold text-white/80 bg-white/10 px-2 py-0.5 rounded-full mt-1.5">
            {ROL_ETIKET[rol] || ''}
          </span>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" onClick={() => setMenuAcik(false)}>
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
      <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  )
}
