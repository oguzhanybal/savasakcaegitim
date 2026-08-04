import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ============================================================================
// UYGULAMA OLARAK YÜKLEME TEKLİFİ — Layout.jsx içinde, yani TÜM roller için
// (yönetici, öğretmen, veli, öğrenci, kantin, zil) ortak olarak gösterilir.
// Tarayıcı "bu site ana ekrana eklenebilir" dediğinde (beforeinstallprompt),
// tarayıcının kendi (genelde adres çubuğunda gizli, fark edilmesi zor)
// simgesine güvenmek yerine, kullanıcıya doğrudan alt kısımda "Yükle / Hayır
// / Bir daha gösterme" seçeneği sunuyoruz.
//
// ÖNEMLİ SINIRLAMA: "beforeinstallprompt" olayı sadece Chromium tabanlı
// tarayıcılarda (Chrome, Edge — Android ve masaüstü) çalışır. iPhone'da
// Safari bu olayı HİÇ desteklemiyor (Apple'ın kendi kısıtı) — o yüzden
// iPhone'da onun yerine basit "Paylaş > Ana Ekrana Ekle" talimatı
// gösteriyoruz. Ama Safari'de gerçek bir "yüklendi" sinyali JavaScript'e HİÇ
// bildirilmediği için, o kurulumlar "Uygulama İndirmeleri" listesine
// YANSIMAZ — bu teknik bir platform kısıtı, uygulama tarafında düzeltilebilir
// bir şey değil.
//
// "Hayır" tıklanınca sadece BU oturum için (React state, kalıcı DEĞİL)
// gizlenir — kullanıcı bir dahaki girişinde (sayfa yeniden yüklendiğinde)
// teklif tekrar sorulur. "Bir daha gösterme" ise profildeki
// pwa_bildirimi_kapali alanını true yapar, o kullanıcıya bir daha HİÇ
// sorulmaz.
// ============================================================================

function iosMu() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent || '') && !window.MSStream
}

function zatenYukluMu() {
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    window.navigator.standalone === true
  )
}

export default function UygulamaYukleBanner() {
  const { profile } = useAuth()
  const [ertelemeOlayi, setErtelemeOlayi] = useState(null)
  const [oturumdaGizlendi, setOturumdaGizlendi] = useState(false)
  const kayitGonderildiRef = useRef(false)

  useEffect(() => {
    function yakala(e) {
      e.preventDefault()
      setErtelemeOlayi(e)
    }
    window.addEventListener('beforeinstallprompt', yakala)
    return () => window.removeEventListener('beforeinstallprompt', yakala)
  }, [])

  // Kurulum GERÇEKTEN tamamlanınca (kullanıcı "Yükle" deyip tarayıcının
  // kendi onayını da geçtiğinde) tetiklenir — "Kimler İndirdi" listesi için
  // güvenilir tek kaynak burası; "Yükle" butonuna tıklamak tek başına
  // kurulumun tamamlandığını GARANTİ etmez, o yüzden kaydı burada, sadece BİR
  // KEZ (kayitGonderildiRef) gönderiyoruz.
  useEffect(() => {
    function yuklendi() {
      setErtelemeOlayi(null)
      if (!kayitGonderildiRef.current && profile?.id) {
        kayitGonderildiRef.current = true
        supabase
          .from('pwa_yuklemeleri')
          .insert({
            profile_id: profile.id,
            cihaz_bilgisi: window.navigator.userAgent?.slice(0, 300) || null,
          })
          .then(() => {})
      }
    }
    window.addEventListener('appinstalled', yuklendi)
    return () => window.removeEventListener('appinstalled', yuklendi)
  }, [profile?.id])

  async function yukle() {
    if (!ertelemeOlayi) return
    ertelemeOlayi.prompt()
    try {
      await ertelemeOlayi.userChoice
    } catch {}
    // Tarayıcının kendi "prompt" nesnesi SADECE BİR KEZ kullanılabilir —
    // sonucu ne olursa olsun temizliyoruz, gerçek kurulum takibini
    // "appinstalled" olayına bırakıyoruz.
    setErtelemeOlayi(null)
  }

  function hayirDe() {
    setOturumdaGizlendi(true)
  }

  async function birDahaGosterme() {
    setOturumdaGizlendi(true)
    if (profile?.id) {
      await supabase.from('profiles').update({ pwa_bildirimi_kapali: true }).eq('id', profile.id)
    }
  }

  if (zatenYukluMu()) return null
  if (oturumdaGizlendi) return null
  if (profile?.pwa_bildirimi_kapali) return null

  const iosGoster = !ertelemeOlayi && iosMu()
  if (!ertelemeOlayi && !iosGoster) return null

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 bg-navy text-white px-4 py-3 shadow-lg md:pl-64">
      <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm flex-1">
          {iosGoster
            ? 'Bu uygulamayı telefonuna ekleyebilirsin: Paylaş simgesine dokun, "Ana Ekrana Ekle" seçeneğini seç.'
            : 'Bu uygulamayı telefonuna/bilgisayarına "uygulama" gibi yükleyebilirsin — ana ekrandan tek dokunuşla açılır.'}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {!iosGoster && (
            <button
              type="button"
              onClick={yukle}
              className="bg-white text-navy text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
            >
              Yükle
            </button>
          )}
          <button type="button" onClick={hayirDe} className="text-white/80 text-sm px-3 py-2 hover:text-white">
            Hayır
          </button>
          <button
            type="button"
            onClick={birDahaGosterme}
            className="text-white/60 text-xs px-2 py-2 hover:text-white/90 hover:underline"
          >
            Bir daha gösterme
          </button>
        </div>
      </div>
    </div>
  )
}
