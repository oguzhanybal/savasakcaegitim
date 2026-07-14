import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { sesSisteminiEtkinlestir, zilSesiCal } from '../lib/zilSesiCal'

// ============================================================================
// ZİL SİSTEMİ — kurumun bilgisayarının saati kayıyor (eski donanım), bu yüzden
// zil yanlış saatte çalıyordu. Çözüm: bu sayfa, bilgisayarın kendi saatine
// DEĞİL, Supabase sunucusundan alınan gerçek saate göre çalışır — bilgisayarın
// saati yanlış olsa bile zil doğru saatte çalar. Sayfa açık kaldığı sürece
// arka planda saat kontrolü yapılır, planlanan saat gelince Web Audio API ile
// zil sesi çalınır (harici bir ses dosyasına ihtiyaç yok).
//
// Bu sayfa hep açık bir sekmede, herkesin ulaşabileceği bir bilgisayarda
// duracağı için, yönetici hesabı o bilgisayarda açık bırakılmasın diye SADECE
// bu sayfayı görebilen ayrı bir "zil" rolü var (bkz. Layout.jsx, App.jsx).
// Yönetici olarak giren biri hem saatleri düzenleyebilir hem zili çalıştırır;
// "zil" rolüyle giren biri sadece çalıştırma/izleme ekranını görür.
// ============================================================================

function saatKisalt(s) {
  return s ? s.slice(0, 5) : s
}

// ÖNEMLİ: Saat dilimi burada "Europe/Istanbul" olarak SABİTLENMİŞTİR — bir
// Date nesnesinin saat/dakika/saniyesini okurken JavaScript'in varsayılan
// davranışı BİLGİSAYARIN AYARLI OLDUĞU saat dilimini kullanmaktır. Sunucudan
// doğru ANI (zamanı) almış olsak bile, eğer bilgisayarın saat dilimi ayarı da
// yanlışsa (Türkiye değilse), yine yanlış saatte zil çalabilirdi. Bu yüzden
// aşağıdaki fonksiyonlar bilgisayarın ayarına HİÇ bakmadan, her zaman
// Türkiye saatini (Europe/Istanbul, UTC+3, DST yok) hesaplar.
const TURKIYE_SAAT_DILIMI = 'Europe/Istanbul'

function turkiyeSaatBilesenleri(d) {
  const parcalar = new Intl.DateTimeFormat('en-GB', {
    timeZone: TURKIYE_SAAT_DILIMI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const bul = (tip) => parcalar.find((p) => p.type === tip)?.value
  return {
    yil: bul('year'),
    ay: bul('month'),
    gun: bul('day'),
    saat: bul('hour'),
    dakika: bul('minute'),
    saniye: bul('second'),
  }
}

function saatMetni(d) {
  const { saat, dakika, saniye } = turkiyeSaatBilesenleri(d)
  return `${saat}:${dakika}:${saniye}`
}

// "YYYY-MM-DD" formatında Türkiye'ye göre bugünün tarih anahtarı (aynı zil
// aynı gün 2 kez çalmasın diye).
function turkiyeTarihAnahtari(d) {
  const { yil, ay, gun } = turkiyeSaatBilesenleri(d)
  return `${yil}-${ay}-${gun}`
}

export default function ZilSistemi() {
  const { profile } = useAuth()
  const isYonetici = profile?.rol === 'yonetici'

  const [zilSaatleri, setZilSaatleri] = useState([])
  const [loading, setLoading] = useState(true)
  const [hata, setHata] = useState('')

  // ---- Sunucu saatiyle senkronizasyon ----
  // sunucuFarki: sunucu saati ile bu bilgisayarın saati arasındaki fark (ms).
  // Gösterilen/kontrol edilen saat her zaman Date.now() + sunucuFarki'dir.
  const [sunucuFarki, setSunucuFarki] = useState(0)
  const [senkronDurumu, setSenkronDurumu] = useState('bekliyor') // 'bekliyor' | 'tamam' | 'hata'
  const [sonSenkronZamani, setSonSenkronZamani] = useState(null)

  const [gosterilenSaat, setGosterilenSaat] = useState(new Date())
  const [etkinMi, setEtkinMi] = useState(false)
  const [sonCalanlar, setSonCalanlar] = useState([])
  const calinanlarRef = useRef(new Set())

  const [yeniEtiket, setYeniEtiket] = useState('')
  const [yeniSaat, setYeniSaat] = useState('')
  const [ekleniyor, setEkleniyor] = useState(false)

  async function zilSaatleriniYukle() {
    const { data, error } = await supabase
      .from('zil_saatleri')
      .select('*')
      .order('saat', { ascending: true })
    if (error) setHata(error.message)
    else setZilSaatleri(data || [])
    setLoading(false)
  }

  // Sunucudan gerçek saati alıp, bu bilgisayarın saatiyle arasındaki farkı
  // hesaplar. İstek gidip gelirken geçen süreyi (gecikme) kabaca telafi etmek
  // için, isteğin başlangıç ve bitiş anlarının ortasını referans alıyoruz.
  async function senkronizeEt() {
    const oncekiAn = Date.now()
    const { data, error } = await supabase.rpc('simdiki_zaman')
    const sonrakiAn = Date.now()
    if (error || !data) {
      setSenkronDurumu('hata')
      return
    }
    const sunucuMs = new Date(data).getTime()
    const tahminiGecikme = (sonrakiAn - oncekiAn) / 2
    const yerelReferansAn = oncekiAn + tahminiGecikme
    setSunucuFarki(sunucuMs - yerelReferansAn)
    setSenkronDurumu('tamam')
    setSonSenkronZamani(new Date())
  }

  useEffect(() => {
    zilSaatleriniYukle()
    senkronizeEt()
    // Bilgisayarın saati zamanla daha da kayabileceği ihtimaline karşı, her
    // 10 dakikada bir sunucuyla yeniden senkronize ediyoruz.
    const senkronId = setInterval(senkronizeEt, 10 * 60 * 1000)
    return () => clearInterval(senkronId)
  }, [])

  // Her saniye: gösterilen saati güncelle, zil zamanı geldiyse çal.
  useEffect(() => {
    const id = setInterval(() => {
      const suanki = new Date(Date.now() + sunucuFarki)
      setGosterilenSaat(suanki)
      if (!etkinMi) return
      const bilesenler = turkiyeSaatBilesenleri(suanki)
      const suankiHHMM = `${bilesenler.saat}:${bilesenler.dakika}`
      const suankiSaniye = Number(bilesenler.saniye)
      // Sadece dakikanın İLK saniyesinde kontrol etmek de yeterli olurdu ama
      // saniye 0-2 arasında kontrol ederek, olası küçük gecikmelerde de zilin
      // kaçırılmamasını garantiliyoruz.
      if (suankiSaniye > 2) return
      const bugunAnahtari = turkiyeTarihAnahtari(suanki)
      zilSaatleri.forEach((z) => {
        if (!z.aktif) return
        if (saatKisalt(z.saat) !== suankiHHMM) return
        const anahtar = `${z.id}_${bugunAnahtari}`
        if (calinanlarRef.current.has(anahtar)) return
        calinanlarRef.current.add(anahtar)
        zilSesiCal()
        setSonCalanlar((liste) => [{ ...z, zaman: suanki }, ...liste].slice(0, 15))
      })
    }, 1000)
    return () => clearInterval(id)
  }, [sunucuFarki, etkinMi, zilSaatleri])

  const siradakiZil = useMemo(() => {
    const b = turkiyeSaatBilesenleri(gosterilenSaat)
    const suankiHHMM = `${b.saat}:${b.dakika}:${b.saniye}`
    const aktifler = zilSaatleri.filter((z) => z.aktif).sort((a, b) => saatKisalt(a.saat).localeCompare(saatKisalt(b.saat)))
    const bugunkuSonraki = aktifler.find((z) => `${saatKisalt(z.saat)}:00` > suankiHHMM)
    return bugunkuSonraki || aktifler[0] || null
  }, [zilSaatleri, gosterilenSaat])

  function zilBaslat() {
    sesSisteminiEtkinlestir()
    setEtkinMi(true)
  }

  function zilDurdur() {
    setEtkinMi(false)
  }

  async function zilEkle(e) {
    e.preventDefault()
    if (!yeniEtiket.trim() || !yeniSaat) return
    setEkleniyor(true)
    const { error } = await supabase.from('zil_saatleri').insert({
      etiket: yeniEtiket.trim(),
      saat: yeniSaat,
      sira: zilSaatleri.length,
    })
    setEkleniyor(false)
    if (error) {
      alert('Hata: ' + error.message)
      return
    }
    setYeniEtiket('')
    setYeniSaat('')
    zilSaatleriniYukle()
  }

  async function zilAktifDegistir(z) {
    const { error } = await supabase.from('zil_saatleri').update({ aktif: !z.aktif }).eq('id', z.id)
    if (error) alert('Hata: ' + error.message)
    else zilSaatleriniYukle()
  }

  async function zilSil(z) {
    if (!confirm(`"${z.etiket}" (${saatKisalt(z.saat)}) saatini silmek istediğinize emin misiniz?`)) return
    const { error } = await supabase.from('zil_saatleri').delete().eq('id', z.id)
    if (error) alert('Hata: ' + error.message)
    else zilSaatleriniYukle()
  }

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-navy mb-1">Zil Sistemi</h1>
      <p className="text-sm text-gray-500 mb-6">
        Bu sayfa açık kaldığı sürece, bilgisayarın kendi saati (hatta saat dilimi ayarı) yanlış olsa bile zil doğru
        saatte çalar — hem saat sunucudan (internetten) alınıyor, hem de her zaman Türkiye saatine (İstanbul, UTC+3)
        göre hesaplanıyor; bilgisayarın kendi saat dilimi ayarına hiç bakılmıyor.
      </p>

      {hata && <p className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{hata}</p>}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6 text-center">
        <p className="text-5xl font-bold text-navy tracking-wide tabular-nums">{saatMetni(gosterilenSaat)}</p>
        <p className="text-xs text-gray-400 mt-2">
          {senkronDurumu === 'tamam' && sonSenkronZamani && (
            <>Saat sunucuyla senkronize edildi (son senkron: {saatMetni(sonSenkronZamani)}).</>
          )}
          {senkronDurumu === 'bekliyor' && 'Sunucuyla senkronize ediliyor...'}
          {senkronDurumu === 'hata' && (
            <span className="text-red-500">
              Sunucuyla senkronize edilemedi — bilgisayarın kendi saati kullanılıyor (yanlış olabilir).
            </span>
          )}
        </p>

        {siradakiZil && (
          <p className="text-sm text-gray-600 mt-3">
            Sıradaki zil: <span className="font-semibold text-navy">{saatKisalt(siradakiZil.saat)}</span> —{' '}
            {siradakiZil.etiket}
          </p>
        )}

        <div className="mt-5">
          {!etkinMi ? (
            <button
              type="button"
              onClick={zilBaslat}
              className="bg-orange text-white font-bold px-8 py-3 rounded-xl hover:opacity-90 transition-opacity text-lg"
            >
              Zili Başlat
            </button>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <span className="inline-flex items-center gap-2 text-green-700 font-semibold text-sm bg-green-50 px-4 py-2 rounded-full">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Zil aktif — planlanan saatlerde
                otomatik çalacak
              </span>
              <button type="button" onClick={zilDurdur} className="text-gray-400 text-xs hover:underline">
                Durdur
              </button>
            </div>
          )}
        </div>
        {!etkinMi && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-4">
            "Zili Başlat" butonuna basılmadan zil çalmaz — tarayıcılar, bir tıklama olmadan otomatik ses çalınmasına
            izin vermiyor. Bu butona SADECE sabah bir kez basmanız yeterli, sayfa açık kaldığı sürece gün boyu çalışır.
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="font-semibold text-gray-700">Zil Saatleri</h2>
        </div>
        {zilSaatleri.length === 0 ? (
          <p className="px-4 py-6 text-center text-gray-400 text-sm">
            {isYonetici ? 'Henüz zil saati eklenmedi, aşağıdan ekleyebilirsiniz.' : 'Henüz zil saati eklenmedi.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Saat</th>
                <th className="px-4 py-2 font-medium">Etiket</th>
                <th className="px-4 py-2 font-medium">Durum</th>
                {isYonetici && <th className="px-4 py-2 font-medium text-right">İşlemler</th>}
              </tr>
            </thead>
            <tbody>
              {zilSaatleri.map((z) => (
                <tr key={z.id} className={`border-t border-gray-50 ${!z.aktif ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-2 font-semibold text-navy">{saatKisalt(z.saat)}</td>
                  <td className="px-4 py-2">{z.etiket}</td>
                  <td className="px-4 py-2">
                    {z.aktif ? (
                      <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-full">Aktif</span>
                    ) : (
                      <span className="text-xs font-semibold bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Pasif</span>
                    )}
                  </td>
                  {isYonetici && (
                    <td className="px-4 py-2 text-right whitespace-nowrap space-x-3">
                      <button onClick={() => zilSesiCal()} className="text-blue text-sm hover:underline">
                        Test Et
                      </button>
                      <button onClick={() => zilAktifDegistir(z)} className="text-navy text-sm hover:underline">
                        {z.aktif ? 'Pasif Yap' : 'Aktif Yap'}
                      </button>
                      <button onClick={() => zilSil(z)} className="text-red-500 text-sm hover:underline">
                        Sil
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {isYonetici && (
          <form onSubmit={zilEkle} className="p-4 border-t border-gray-100 flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Saat</label>
              <input
                type="time"
                value={yeniSaat}
                onChange={(e) => setYeniSaat(e.target.value)}
                required
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Etiket</label>
              <input
                type="text"
                value={yeniEtiket}
                onChange={(e) => setYeniEtiket(e.target.value)}
                placeholder="ör. 1. Ders Başlangıç"
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>
            <button
              type="submit"
              disabled={ekleniyor}
              className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {ekleniyor ? 'Ekleniyor...' : 'Ekle'}
            </button>
          </form>
        )}
      </div>

      {sonCalanlar.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-gray-700">Bugün Çalan Ziller</h2>
          </div>
          <ul className="divide-y divide-gray-50">
            {sonCalanlar.map((z, i) => (
              <li key={i} className="px-4 py-2 text-sm flex items-center justify-between">
                <span className="text-gray-700">{z.etiket}</span>
                <span className="text-gray-400">{saatMetni(z.zaman)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-400">
        Not: Bu sekme kapanırsa, bilgisayar uykuya geçerse ya da tarayıcı yeniden başlatılırsa zil çalmaz — sabah bu
        sayfayı açıp "Zili Başlat" demeyi ve sekmeyi gün boyu açık bırakmayı unutmayın.
      </p>
    </div>
  )
}
