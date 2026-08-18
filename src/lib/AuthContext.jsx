import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // Kullanıcının bildirdiği "site/uygulama bazen Yükleniyor ekranında
  // sonsuza kadar takılı kalıyor" hatası (Windows'ta da, Android'de hem
  // Chrome'da hem kurulu uygulamada da görülmüş) — kök nedeni bulundu:
  // supabase-js kütüphanesinin BİLİNEN bir kilitlenme (deadlock) hatası
  // (bkz. github.com/supabase/supabase-js issue #2013, #2111). Kütüphane,
  // "onAuthStateChange" callback'i çalışırken (özellikle token arka planda
  // yenilenirken — telefon arka plana alınıp geri getirildiğinde sıkça
  // olur) callback'İN İÇİNDEN başka bir Supabase isteği (burada: profil
  // çekme) yapılırsa, kendi iç kilidini asla serbest bırakmayabiliyor.
  // Sonuç: bir sonraki her Supabase isteği (dolayısıyla TÜM uygulama)
  // sonsuza kadar "Yükleniyor..." ekranında donuyor.
  const [zamanAsimiOldu, setZamanAsimiOldu] = useState(false)

  useEffect(() => {
    let bitti = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (bitti) return
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })

    // ASIL DÜZELTME: profil çekme isteğini (loadProfile) artık callback'in
    // İÇİNDE değil, setTimeout(...,0) ile callback bittikten HEMEN SONRA,
    // ayrı bir "tick"te başlatıyoruz. Bu, Supabase'in resmi olarak önerdiği
    // atlatma yöntemi — callback senkron olarak biter, kilit serbest kalır,
    // profil isteği güvenle yapılabilir.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (bitti) return
      setSession(session)
      if (session) {
        setTimeout(() => {
          if (!bitti) loadProfile(session.user.id)
        }, 0)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    // GÜVENLİK AĞI: yukarıdaki düzeltme kilitlenmenin bilinen tetikleyicisini
    // ortadan kaldırıyor, ama kötü/kopuk bir internet bağlantısı ya da
    // öngörülemeyen başka bir sebep yüzünden getSession()/loadProfile() yine
    // de hiç sonuçlanmayabilir. Önceden bu durumda uygulama "Yükleniyor..."
    // yazısında SONSUZA KADAR (kullanıcı için tamamen çıkışsız) takılı
    // kalıyordu. 12 saniye içinde hâlâ yüklenmemişse zorla durduruyoruz ki
    // en azından "bağlantı sorunu, tekrar dene" ekranı görünsün.
    const zamanAsimi = setTimeout(() => {
      setLoading((mevcutYukleniyorMu) => {
        if (mevcutYukleniyorMu) setZamanAsimiOldu(true)
        return false
      })
    }, 12000)

    return () => {
      bitti = true
      clearTimeout(zamanAsimi)
      listener.subscription.unsubscribe()
    }
  }, [])

  async function loadProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
    setLoading(false)
  }

  async function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, zamanAsimiOldu, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
