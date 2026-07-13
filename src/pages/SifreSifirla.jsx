import { useEffect, useState } from 'react'

const ROL_ETIKET = {
  yonetici: 'Yönetici',
  ogretmen: 'Öğretmen',
  veli: 'Veli',
  ogrenci: 'Öğrenci',
  kantin: 'Kantin Görevlisi',
}

const ROL_SIRASI = ['yonetici', 'ogretmen', 'veli', 'ogrenci', 'kantin']

// Kolay okunur, karıştırılması zor (0/O, 1/I gibi harfler çıkarılmış) rastgele
// bir şifre önerir — admin "öner"e basıp direkt kullanabilsin diye.
function rastgeleSifreOner() {
  const harfler = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += harfler[Math.floor(Math.random() * harfler.length)]
  return s
}

// Bir kullanıcının satırdaki "Şifre Sıfırla" akışı: buton -> inline form -> kaydet.
function SifreSifirlaSatiri({ kullanici, onTamamlandi }) {
  const [acik, setAcik] = useState(false)
  const [yeniSifre, setYeniSifre] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [hata, setHata] = useState('')
  const [sonuc, setSonuc] = useState(null) // { kullaniciAdi, sifre } — kaydedilince kalıcı gösterilir

  async function kaydet() {
    setHata('')
    if (!yeniSifre || yeniSifre.length < 6) {
      setHata('Şifre en az 6 karakter olmalı.')
      return
    }
    setGonderiliyor(true)
    try {
      const yanit = await fetch('/api/sifre-sifirla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: kullanici.id, yeniSifre }),
      })
      const veri = await yanit.json()
      if (!yanit.ok) {
        setHata(veri.error || 'Bilinmeyen bir hata oluştu.')
      } else {
        setSonuc({ kullaniciAdi: kullanici.kullanici_adi, sifre: yeniSifre })
        setAcik(false)
        setYeniSifre('')
        onTamamlandi?.()
      }
    } catch (err) {
      setHata('Bağlantı hatası: ' + err.message)
    }
    setGonderiliyor(false)
  }

  if (sonuc) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
        <p className="font-semibold">✓ Şifre değiştirildi — bu bilgiyi şimdi not edin, tekrar gösterilmeyecek:</p>
        <p className="mt-1">
          Kullanıcı adı: <b>{sonuc.kullaniciAdi}</b> · Yeni şifre: <b>{sonuc.sifre}</b>
        </p>
        <button onClick={() => setSonuc(null)} className="text-xs text-green-700 underline mt-1 hover:no-underline">
          Kapat
        </button>
      </div>
    )
  }

  if (!acik) {
    return (
      <button
        type="button"
        onClick={() => { setAcik(true); setYeniSifre(rastgeleSifreOner()) }}
        className="text-navy text-sm font-semibold hover:underline"
      >
        Şifre Sıfırla
      </button>
    )
  }

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Yeni Şifre</label>
          <input
            type="text"
            value={yeniSifre}
            onChange={(e) => setYeniSifre(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
        <button
          type="button"
          onClick={() => setYeniSifre(rastgeleSifreOner())}
          className="text-xs text-navy border border-navy/20 rounded-lg px-2 py-1.5 hover:bg-navy/5 whitespace-nowrap"
        >
          🎲 Öner
        </button>
        <button
          type="button"
          onClick={kaydet}
          disabled={gonderiliyor}
          className="bg-orange text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
        >
          {gonderiliyor ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
        <button
          type="button"
          onClick={() => { setAcik(false); setHata('') }}
          className="text-gray-500 text-sm px-2 py-1.5 hover:text-gray-700 whitespace-nowrap"
        >
          Vazgeç
        </button>
      </div>
      {hata && <p className="text-red-600 text-xs mt-2">{hata}</p>}
    </div>
  )
}

export default function SifreSifirla() {
  const [kullanicilar, setKullanicilar] = useState([])
  const [loading, setLoading] = useState(true)
  const [hata, setHata] = useState('')
  const [rolFiltre, setRolFiltre] = useState('tumu')
  const [arama, setArama] = useState('')

  function yukle() {
    setLoading(true)
    setHata('')
    fetch('/api/kullanicilari-listele')
      .then((r) => r.json())
      .then((veri) => {
        if (veri.error) {
          setHata(veri.error)
        } else {
          setKullanicilar(veri.kullanicilar || [])
        }
        setLoading(false)
      })
      .catch((err) => {
        setHata('Bağlantı hatası: ' + err.message)
        setLoading(false)
      })
  }

  useEffect(() => {
    yukle()
  }, [])

  const filtrelenmis = kullanicilar
    .filter((k) => rolFiltre === 'tumu' || k.rol === rolFiltre)
    .filter((k) => !arama.trim() || k.ad_soyad?.toLocaleLowerCase('tr-TR').includes(arama.trim().toLocaleLowerCase('tr-TR')))

  const rolSayilari = ROL_SIRASI.reduce((acc, rol) => {
    acc[rol] = kullanicilar.filter((k) => k.rol === rol).length
    return acc
  }, {})

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-2">Şifre Sıfırlama</h1>
      <p className="text-sm text-gray-500 mb-6">
        Sistemdeki şifreler güvenlik gereği şifrelenmiş şekilde saklanır — bu yüzden kimsenin (yönetici dahil)
        mevcut şifresini görmek mümkün değil. Bunun yerine, bir kullanıcının şifresini unuttuğunda ya da
        değiştirdiğinde tekrar erişebilmeniz için buradan HERHANGİ bir kullanıcıya (rol fark etmeksizin) anında
        yeni bir şifre atayabilirsiniz.
      </p>

      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setRolFiltre('tumu')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              rolFiltre === 'tumu' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            Tümü ({kullanicilar.length})
          </button>
          {ROL_SIRASI.map((rol) => (
            <button
              key={rol}
              onClick={() => setRolFiltre(rol)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                rolFiltre === rol ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {ROL_ETIKET[rol]} ({rolSayilari[rol] || 0})
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[180px]">
          <input
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="İsimle ara..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
      </div>

      {hata && <p className="text-red-600 text-sm mb-3">{hata}</p>}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead>
            <tr className="bg-navy text-white text-left">
              <th className="px-4 py-3 font-semibold">Ad Soyad</th>
              <th className="px-4 py-3 font-semibold">Kullanıcı Adı</th>
              <th className="px-4 py-3 font-semibold">Rol</th>
              <th className="px-4 py-3 font-semibold">Telefon / Branş</th>
              <th className="px-4 py-3 font-semibold">Durum</th>
              <th className="px-4 py-3 font-semibold">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Yükleniyor...</td></tr>
            )}
            {!loading && filtrelenmis.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Kullanıcı bulunamadı.</td></tr>
            )}
            {!loading && filtrelenmis.map((k, i) => (
              <tr key={k.id} className={i % 2 ? 'bg-gray-50' : ''}>
                <td className="px-4 py-3 font-medium text-gray-800 align-top">{k.ad_soyad}</td>
                <td className="px-4 py-3 text-gray-500 align-top">{k.kullanici_adi || '—'}</td>
                <td className="px-4 py-3 align-top">
                  <span className="text-xs font-semibold bg-navy/10 text-navy px-2 py-1 rounded-full">
                    {ROL_ETIKET[k.rol] || k.rol}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 align-top">{k.brans || k.telefon || '—'}</td>
                <td className="px-4 py-3 align-top">
                  {k.aktif ? (
                    <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-full">Aktif</span>
                  ) : (
                    <span className="text-xs font-semibold bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Pasif</span>
                  )}
                </td>
                <td className="px-4 py-3 align-top min-w-[220px]">
                  <SifreSifirlaSatiri kullanici={k} onTamamlandi={yukle} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Yeni şifreyi kaydettikten sonra sadece o an ekranda gösterilir, sonra tekrar görüntülenemez —
        kullanıcıya iletmeden önce not almayı unutmayın.
      </p>
    </div>
  )
}
