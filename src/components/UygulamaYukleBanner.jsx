import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { iosMu, zatenYukluMu } from '../lib/usePwaYukleme'

// ============================================================================
// UYGULAMA OLARAK YÜKLEME TEKLİFİ — Layout.jsx içinde, yani TÜM roller için
// (yönetici, öğretmen, veli, öğrenci, kantin, zil) ortak olarak gösterilir.
// Tarayıcı "bu site ana ekrana eklenebilir" dediğinde (beforeinstallprompt),
// tarayıcının kendi (genelde adres çubuğunda gizli, fark edilmesi zor)
// simgesine güvenmek yerine, kullanıcıya doğrudan alt kısımda "Yükle / Hayır
// / Bir daha gösterme" seçeneği sunuyoruz.
//
// "beforeinstallprompt"/"appinstalled" olaylarını yakalama işi artık BURADA
// değil, Layout.jsx'in kullandığı ortak usePwaYukleme() hook'unda —
// ertelemeOlayi/yukle prop olarak geliyor (bkz. usePwaYukleme.js'teki genel
// not: aynı anda iki ayrı yerde dinlenirse kurulum kaydı iki kez atılabiliyor,
// o yüzden tek kaynak Layout).
//
// "Hayır" tıklanınca sadece BU oturum için (React state, kalıcı DEĞİL)
// gizlenir — kullanıcı bir dahaki girişinde (sayfa yeniden yüklendiğinde)
// teklif tekrar sorulur. "Bir daha gösterme" ise profildeki
// pwa_bildirimi_kapali alanını true yapar, o kullanıcıya bu OTOMATİK banner
// bir daha HİÇ çıkmaz — ama Layout'un sol menüsündeki "📲 Uygulamayı Yükle"
// butonu her zaman durur, istediği an oradan elle kurabilir (kullanıcı
// isteğiyle eklendi).
// ============================================================================

export default function UygulamaYukleBanner({ ertelemeOlayi, yukle }) {
  const { profile } = useAuth()
  const [oturumdaGizlendi, setOturumdaGizlendi] = useState(false)

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
    <div
      className="fixed bottom-0 inset-x-0 z-50 bg-navy text-white px-4 py-3 shadow-lg md:pl-64"
      // iPhone X ve sonrası modellerde alt kısımdaki "home indicator" çubuğu
      // banner'ın üzerine binmesin diye güvenli alan boşluğu — index.html'de
      // viewport-fit=cover eklenmeden env(safe-area-inset-bottom) her zaman
      // 0 döner, o yüzden bu ikisi birlikte çalışıyor.
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
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
