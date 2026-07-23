import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const ROL_ETIKET = {
  yonetici: 'Yönetici',
  ogretmen: 'Öğretmen',
  veli: 'Veli',
  ogrenci: 'Öğrenci',
  kantin: 'Kantin Görevlisi',
  zil: 'Zil Ekranı',
}

const SAYFA_BOYU = 200

// Tarayıcının gönderdiği ham "user-agent" metni ("Mozilla/5.0 (Windows NT
// 10.0...) AppleWebKit/537.36...") teknik ve okunması zor olduğu için,
// yöneticiye "Chrome, Windows" gibi kısa, anlaşılır bir özet gösteriyoruz.
// Sıralama ÖNEMLİ: ör. Edge'in kendi UA'sı "Chrome" da içerir, bu yüzden Edge
// önce kontrol edilmeli, yoksa yanlış tarayıcı adı çıkar.
function cihazOzetiCikar(ua) {
  if (!ua) return '—'
  let tarayici = 'Bilinmeyen Tarayıcı'
  if (/Edg\//.test(ua)) tarayici = 'Edge'
  else if (/OPR\/|Opera/.test(ua)) tarayici = 'Opera'
  else if (/SamsungBrowser/.test(ua)) tarayici = 'Samsung Internet'
  else if (/Chrome\//.test(ua)) tarayici = 'Chrome'
  else if (/CriOS/.test(ua)) tarayici = 'Chrome (iOS)'
  else if (/Firefox\//.test(ua)) tarayici = 'Firefox'
  else if (/Safari\//.test(ua)) tarayici = 'Safari'

  let cihaz = 'Bilgisayar'
  if (/iPhone/.test(ua)) cihaz = 'iPhone'
  else if (/iPad/.test(ua)) cihaz = 'iPad'
  else if (/Android/.test(ua)) cihaz = /Mobile/.test(ua) ? 'Android Telefon' : 'Android Tablet'
  else if (/Windows/.test(ua)) cihaz = 'Windows'
  else if (/Macintosh|Mac OS X/.test(ua)) cihaz = 'Mac'
  else if (/Linux/.test(ua)) cihaz = 'Linux'

  return `${tarayici}, ${cihaz}`
}

// ============================================================================
// GİRİŞ KAYITLARI — "kim ne zaman nereden girdi" sorusuna cevap veren, sadece
// yöneticinin görebildiği bir denetim listesi. Her satır, Layout.jsx'in her
// yeni tarayıcı oturumunda (sekme kapanana kadar bir kez) çağırdığı
// api/giris-kaydet.js tarafından otomatik eklenir — burada elle bir şey
// eklenmez/değiştirilmez, sadece görüntülenir.
// ============================================================================
export default function GirisKayitlari() {
  const [kayitlar, setKayitlar] = useState([])
  const [loading, setLoading] = useState(true)
  const [dahaYukleniyor, setDahaYukleniyor] = useState(false)
  const [hepsiYuklendi, setHepsiYuklendi] = useState(false)
  const [arama, setArama] = useState('')
  const [rolFiltre, setRolFiltre] = useState('hepsi')

  function sayfaYukle(baslangicOffset) {
    return supabase
      .from('giris_kayitlari')
      .select('*')
      .order('giris_zamani', { ascending: false })
      .range(baslangicOffset, baslangicOffset + SAYFA_BOYU - 1)
  }

  useEffect(() => {
    sayfaYukle(0).then(({ data, error }) => {
      if (error) {
        setLoading(false)
        return
      }
      setKayitlar(data || [])
      setHepsiYuklendi((data || []).length < SAYFA_BOYU)
      setLoading(false)
    })
  }, [])

  function dahaFazlaYukle() {
    setDahaYukleniyor(true)
    sayfaYukle(kayitlar.length).then(({ data }) => {
      setKayitlar((prev) => [...prev, ...(data || [])])
      setHepsiYuklendi((data || []).length < SAYFA_BOYU)
      setDahaYukleniyor(false)
    })
  }

  const gorunenler = kayitlar
    .filter((k) => rolFiltre === 'hepsi' || k.rol === rolFiltre)
    .filter((k) => (k.ad_soyad || '').toLocaleLowerCase('tr-TR').includes(arama.trim().toLocaleLowerCase('tr-TR')))

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-1">Giriş Kayıtları</h1>
      <p className="text-gray-500 mb-6 max-w-2xl">
        Sisteme kim, ne zaman, hangi IP adresinden/konumdan ve hangi cihazdan giriş yaptı — en yeni
        girişten başlayarak listelenir. Sadece yeni girişler kaydedilir (geçmişe dönük veri yok).
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="İsim ara..."
          className="px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue min-w-[200px]"
        />
        <select
          value={rolFiltre}
          onChange={(e) => setRolFiltre(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue"
        >
          <option value="hepsi">Tüm Roller</option>
          {Object.entries(ROL_ETIKET).map(([deger, etiket]) => (
            <option key={deger} value={deger}>{etiket}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-left text-gray-500 bg-gray-50">
              <th className="px-4 py-2 font-medium">Tarih</th>
              <th className="px-4 py-2 font-medium">Kullanıcı</th>
              <th className="px-4 py-2 font-medium">Rol</th>
              <th className="px-4 py-2 font-medium">IP Adresi</th>
              <th className="px-4 py-2 font-medium">Konum</th>
              <th className="px-4 py-2 font-medium">Cihaz</th>
            </tr>
          </thead>
          <tbody>
            {gorunenler.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">Kayıt bulunamadı.</td>
              </tr>
            )}
            {gorunenler.map((k) => (
              <tr key={k.id} className="border-t border-gray-50">
                <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                  {new Date(k.giris_zamani).toLocaleString('tr-TR', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td className="px-4 py-2 font-medium text-gray-800">{k.ad_soyad || '—'}</td>
                <td className="px-4 py-2 text-gray-600">{ROL_ETIKET[k.rol] || k.rol || '—'}</td>
                <td className="px-4 py-2 text-xs font-mono text-gray-500">{k.ip_adresi || '—'}</td>
                <td className="px-4 py-2 text-gray-600">{k.konum || '—'}</td>
                <td className="px-4 py-2 text-gray-600">{cihazOzetiCikar(k.tarayici_bilgisi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!hepsiYuklendi && (
        <div className="text-center mt-4">
          <button
            onClick={dahaFazlaYukle}
            disabled={dahaYukleniyor}
            className="text-navy font-semibold text-sm underline hover:no-underline disabled:opacity-50"
          >
            {dahaYukleniyor ? 'Yükleniyor...' : 'Daha eski kayıtları göster'}
          </button>
        </div>
      )}
    </div>
  )
}
