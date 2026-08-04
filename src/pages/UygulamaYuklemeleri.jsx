import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ============================================================================
// UYGULAMA İNDİRMELERİ — yönetici için, "Uygulama olarak yükle" teklifini
// kabul edip GERÇEKTEN yükleyen (appinstalled olayı tetiklenen) kullanıcıların
// listesi (bkz. src/components/UygulamaYukleBanner.jsx).
// ============================================================================

const ROL_ETIKETLERI = {
  yonetici: 'Yönetici',
  ogretmen: 'Öğretmen',
  veli: 'Veli',
  ogrenci: 'Öğrenci',
  kantin: 'Kantin',
  zil: 'Zil Ekranı',
}

function tarihSaatUzunFormat(tarihStr) {
  if (!tarihStr) return '—'
  return new Date(tarihStr).toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Ham user-agent metninden basit bir cihaz özeti çıkarır — tam bir
// user-agent ayrıştırıcısı değil, yöneticinin "hangi cihazdan" fikrini
// hızlıca edinmesi için kaba bir tahmin.
function cihazOzeti(ua) {
  if (!ua) return '—'
  if (/android/i.test(ua)) return 'Android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'iPhone/iPad'
  if (/windows/i.test(ua)) return 'Windows'
  if (/mac os/i.test(ua)) return 'Mac'
  return 'Bilinmeyen cihaz'
}

export default function UygulamaYuklemeleri() {
  const [kayitlar, setKayitlar] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('pwa_yuklemeleri')
      .select('id, cihaz_bilgisi, created_at, profiles(ad_soyad, rol)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('Uygulama yüklemeleri sorgusu hatası:', error.message)
        setKayitlar(data || [])
        setLoading(false)
      })
  }, [])

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-navy mb-1">Uygulama İndirmeleri</h1>
      <p className="text-sm text-gray-500 mb-6">
        "Uygulama olarak yükle" teklifini kabul edip uygulamayı ana ekranına ekleyen kullanıcılar. iPhone'da
        (Safari) yüklemeler tarayıcı kısıtı yüzünden burada görünmez — sadece Android/Chrome/Edge'den yapılan
        yüklemeler izlenebiliyor.
      </p>

      {loading ? (
        <p className="text-gray-400">Yükleniyor...</p>
      ) : kayitlar.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-gray-500">
          Henüz kimse uygulamayı yüklemedi.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50 overflow-hidden">
          {kayitlar.map((k) => (
            <div key={k.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-medium text-gray-800">{k.profiles?.ad_soyad || 'Bilinmeyen kullanıcı'}</p>
                <p className="text-xs text-gray-400">
                  {ROL_ETIKETLERI[k.profiles?.rol] || k.profiles?.rol || ''} · {cihazOzeti(k.cihaz_bilgisi)}
                </p>
              </div>
              <span className="text-sm text-gray-500 shrink-0">{tarihSaatUzunFormat(k.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
