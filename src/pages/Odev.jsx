import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { odevBildirimMesajiOlustur, bireBirOzetLinkOlustur } from '../lib/ekstreHesap'
import { resmiSikistir } from '../lib/resimSikistir'

// Bugünün tarihini "YYYY-MM-DD" olarak YEREL saate göre üretir (toISOString
// KULLANMIYORUZ — Türkiye UTC+3 gece yarısına yakın saatlerde bir gün geriye
// kayabiliyor, bkz. Bire Bir'deki aynı sınıftan hata).
function yerelBugunTarihi() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

function dosyaGoruntuleLinki(dosyaYolu) {
  if (!dosyaYolu) return null
  return supabase.storage.from('odev-ekleri').getPublicUrl(dosyaYolu).data.publicUrl
}

// ============================================================================
// YÖNETİCİ / ÖĞRETMEN — Ödev Ver formu. Tek bir öğrenciye ya da (sınıf/grup
// filtrelenip) birden fazla öğrenciye TOPLU ödev girilebilir. Ödev eklendikten
// sonra, ilgili öğrencilerin/velilerin telefonu varsa WhatsApp bildirim
// linkleri gösterilir (mevcut Bire Bir hatırlatma panelindeki mantığın aynısı).
// ============================================================================
function OdevVerForm({ ogrenciler, ogretmenProfileId, varsayilanDers, onEklendi }) {
  const [hedefTuru, setHedefTuru] = useState('tek') // 'tek' | 'toplu'
  const [seciliOgrenci, setSeciliOgrenci] = useState('')
  const [seciliOgrenciler, setSeciliOgrenciler] = useState([])
  const [arama, setArama] = useState('')
  const [ders, setDers] = useState(varsayilanDers || '')
  const [baslik, setBaslik] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [sonTarih, setSonTarih] = useState('')
  const [dosya, setDosya] = useState(null)
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [hata, setHata] = useState('')
  const [basari, setBasari] = useState('')
  const [sonEklenenler, setSonEklenenler] = useState([])
  const [dosyaHatasi, setDosyaHatasi] = useState('')
  const dosyaInputRef = useRef(null)
  const MAKSIMUM_PDF_BOYUTU = 5 * 1024 * 1024 // 5 MB

  // Fotoğraflar zaten otomatik küçültülüyor (resmiSikistir), ama PDF'ler
  // OLDUĞU GİBİ yükleniyor — taranmış (her sayfası yüksek çözünürlüklü resim
  // olan) bir PDF çok büyük olabilir ve ücretsiz depolama kotasını (1 GB)
  // hızla doldurabilir. 5 MB'ı GEÇEN PDF'ler doğrudan REDDEDİLİYOR (yüklemeye
  // izin verilmiyor) — hoca bunun yerine ödev kağıdının fotoğrafını çekip
  // yüklemeli (fotoğraflar otomatik küçültülüyor, boyut sorunu olmuyor).
  function dosyaSecildi(dosya) {
    if (dosya && dosya.type === 'application/pdf' && dosya.size > MAKSIMUM_PDF_BOYUTU) {
      setDosyaHatasi(
        `Bu PDF ${(dosya.size / (1024 * 1024)).toFixed(1)} MB — 5 MB sınırını aşıyor, kabul edilmiyor. Bunun yerine ödev kağıdının fotoğrafını çekip yükleyin (fotoğraflar otomatik küçültülür, sorun olmaz).`
      )
      setDosya(null)
      if (dosyaInputRef.current) dosyaInputRef.current.value = ''
      return
    }
    setDosyaHatasi('')
    setDosya(dosya)
  }

  const filtreliOgrenciler = useMemo(() => {
    const a = arama.trim().toLowerCase()
    if (!a) return ogrenciler
    return ogrenciler.filter(
      (o) => (o.ad_soyad || '').toLowerCase().includes(a) || (o.sinif_ve_alan || '').toLowerCase().includes(a)
    )
  }, [ogrenciler, arama])

  function ogrenciSecimiDegistir(id) {
    setSeciliOgrenciler((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  function tumunuSecFiltrelenen() {
    setSeciliOgrenciler((s) => Array.from(new Set([...s, ...filtreliOgrenciler.map((o) => o.id)])))
  }

  function secimiTemizle() {
    setSeciliOgrenciler([])
  }

  async function gonder(e) {
    e.preventDefault()
    setHata('')
    setBasari('')
    const hedefIdler = hedefTuru === 'tek' ? (seciliOgrenci ? [seciliOgrenci] : []) : seciliOgrenciler
    if (hedefIdler.length === 0) {
      setHata('Lütfen en az bir öğrenci seçin.')
      return
    }
    if (!baslik.trim()) {
      setHata('Lütfen bir başlık girin.')
      return
    }
    // dosyaSecildi zaten 5 MB'ı geçen PDF'leri kabul etmiyor, ama ekstra
    // güvenlik olarak gönderim anında da tekrar kontrol ediyoruz.
    if (dosya && dosya.type === 'application/pdf' && dosya.size > MAKSIMUM_PDF_BOYUTU) {
      setHata('Seçili PDF 5 MB sınırını aşıyor, kabul edilmiyor.')
      return
    }
    setGonderiliyor(true)
    try {
      let dosyaYolu = null
      if (dosya) {
        const sikistirilmis = await resmiSikistir(dosya)
        const yol = `${Date.now()}-${Math.random().toString(36).slice(2)}-${sikistirilmis.name}`
        const { error: yuklemeHatasi } = await supabase.storage.from('odev-ekleri').upload(yol, sikistirilmis)
        if (yuklemeHatasi) throw yuklemeHatasi
        dosyaYolu = yol
      }
      // Birden fazla öğrenciye toplu veriliyorsa, hepsi aynı "atama_grubu_id"yi
      // paylaşır — tek öğrenciye verilen ödevlerde bu alan boş kalır.
      const atamaGrubuId = hedefIdler.length > 1 ? crypto.randomUUID() : null
      const satirlar = hedefIdler.map((ogrenciId) => ({
        ogrenci_id: ogrenciId,
        ogretmen_profile_id: ogretmenProfileId,
        ders: ders.trim() || null,
        baslik: baslik.trim(),
        aciklama: aciklama.trim() || null,
        son_tarih: sonTarih || null,
        dosya_yolu: dosyaYolu,
        atama_grubu_id: atamaGrubuId,
      }))
      const { error } = await supabase.from('odevler').insert(satirlar)
      if (error) throw error

      // WhatsApp bildirim linkleri için öğrencilerin telefon bilgilerini çekiyoruz.
      const { data: ogrDetay } = await supabase
        .from('ogrenciler')
        .select('id, ad_soyad, telefon, anne_telefon, baba_telefon')
        .in('id', hedefIdler)
      setSonEklenenler(
        (ogrDetay || []).map((o) => {
          const mesajOgrenci = odevBildirimMesajiOlustur({
            kimeGonderiliyor: 'ogrenci',
            ogrenciAdi: o.ad_soyad,
            ders,
            baslik,
            aciklama,
            sonTarih,
          })
          const mesajVeli = odevBildirimMesajiOlustur({
            kimeGonderiliyor: 'veli',
            ogrenciAdi: o.ad_soyad,
            ders,
            baslik,
            aciklama,
            sonTarih,
          })
          return {
            ogrenciAdi: o.ad_soyad,
            ogrenciLink: bireBirOzetLinkOlustur(o.telefon, mesajOgrenci),
            anneLink: bireBirOzetLinkOlustur(o.anne_telefon, mesajVeli),
            babaLink: bireBirOzetLinkOlustur(o.baba_telefon, mesajVeli),
          }
        })
      )

      setBasari(`Ödev ${hedefIdler.length > 1 ? `${hedefIdler.length} öğrenciye` : ''} eklendi.`)
      setBaslik('')
      setAciklama('')
      setSonTarih('')
      setDosya(null)
      setDosyaHatasi('')
      if (dosyaInputRef.current) dosyaInputRef.current.value = ''
      setSeciliOgrenci('')
      setSeciliOgrenciler([])
      onEklendi()
    } catch (err) {
      setHata('Hata: ' + err.message)
    } finally {
      setGonderiliyor(false)
    }
  }

  return (
    <form onSubmit={gonder} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
      <p className="font-semibold text-gray-700 mb-3">Ödev Ver</p>

      <div className="flex gap-1.5 mb-3">
        <button
          type="button"
          onClick={() => setHedefTuru('tek')}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            hedefTuru === 'tek' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
          }`}
        >
          Tek Öğrenci
        </button>
        <button
          type="button"
          onClick={() => setHedefTuru('toplu')}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            hedefTuru === 'toplu' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
          }`}
        >
          Birden Fazla Öğrenci (Toplu)
        </button>
      </div>

      {hedefTuru === 'tek' ? (
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Öğrenci</label>
          <select
            value={seciliOgrenci}
            onChange={(e) => setSeciliOgrenci(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            <option value="">Öğrenci seçiniz...</option>
            {ogrenciler.map((o) => (
              <option key={o.id} value={o.id}>
                {o.ad_soyad}
                {o.sinif_ve_alan ? ` — ${o.sinif_ve_alan}` : ''}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Öğrenciler ({seciliOgrenciler.length} seçili)
          </label>
          <input
            type="text"
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="İsim ya da sınıfa göre filtrele (ör. 9-A)..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue mb-2"
          />
          <div className="flex gap-3 mb-2 text-xs">
            <button type="button" onClick={tumunuSecFiltrelenen} className="text-navy font-semibold hover:underline">
              Filtredekilerin Tümünü Seç
            </button>
            <button type="button" onClick={secimiTemizle} className="text-gray-400 font-semibold hover:underline">
              Seçimi Temizle
            </button>
          </div>
          <div className="border border-gray-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-50">
            {filtreliOgrenciler.length === 0 && (
              <p className="px-3 py-3 text-sm text-gray-400">Eşleşen öğrenci bulunamadı.</p>
            )}
            {filtreliOgrenciler.map((o) => (
              <label key={o.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={seciliOgrenciler.includes(o.id)}
                  onChange={() => ogrenciSecimiDegistir(o.id)}
                  className="rounded"
                />
                <span className="text-gray-700">{o.ad_soyad}</span>
                {o.sinif_ve_alan && <span className="text-gray-400">— {o.sinif_ve_alan}</span>}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ders / Branş</label>
          <input
            type="text"
            value={ders}
            onChange={(e) => setDers(e.target.value)}
            placeholder="örn. Matematik"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Son Tarih (opsiyonel)</label>
          <input
            type="date"
            value={sonTarih}
            onChange={(e) => setSonTarih(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-sm font-medium text-gray-700 mb-1">Başlık</label>
        <input
          type="text"
          value={baslik}
          onChange={(e) => setBaslik(e.target.value)}
          placeholder="örn. Sayfa 45-50 test çöz"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
        />
      </div>

      <div className="mb-3">
        <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama (opsiyonel)</label>
        <textarea
          value={aciklama}
          onChange={(e) => setAciklama(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Fotoğraf / Dosya Eki (opsiyonel)</label>
        <input
          ref={dosyaInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => dosyaSecildi(e.target.files?.[0] || null)}
          className="w-full text-sm text-gray-600"
        />
        <p className="text-xs text-gray-400 mt-1">
          Fotoğraflar yüklenmeden önce otomatik olarak küçültülür (depolama alanından tasarruf için). PDF'ler
          5 MB'ı geçemez.
        </p>
        {dosyaHatasi && <p className="text-xs text-red-600 font-medium mt-1">⚠️ {dosyaHatasi}</p>}
      </div>

      {hata && <p className="text-red-600 text-sm mb-3">{hata}</p>}
      {basari && <p className="text-green-600 text-sm mb-3">{basari}</p>}

      <button
        type="submit"
        disabled={gonderiliyor}
        className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {gonderiliyor ? 'Ekleniyor...' : 'Ödev Ver'}
      </button>

      {sonEklenenler.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-sm font-semibold text-gray-700 mb-2">Bildirim göndermek ister misiniz?</p>
          <div className="space-y-1.5">
            {sonEklenenler.map((s, i) => (
              <div key={i} className="flex items-center justify-between flex-wrap gap-2 text-sm">
                <span className="font-medium text-gray-700">{s.ogrenciAdi}</span>
                <div className="flex gap-3 flex-wrap">
                  {s.ogrenciLink ? (
                    <a href={s.ogrenciLink} target="_blank" rel="noreferrer" className="text-green-600 font-medium hover:underline">
                      Öğrenciye Gönder
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400">Öğrenci Telefonu Yok</span>
                  )}
                  {s.anneLink ? (
                    <a href={s.anneLink} target="_blank" rel="noreferrer" className="text-green-600 font-medium hover:underline">
                      Anneye Gönder
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400">Anne Telefonu Yok</span>
                  )}
                  {s.babaLink ? (
                    <a href={s.babaLink} target="_blank" rel="noreferrer" className="text-green-600 font-medium hover:underline">
                      Babaya Gönder
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400">Baba Telefonu Yok</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </form>
  )
}

// ============================================================================
// YÖNETİCİ / ÖĞRETMEN — verilen ödevlerin listesi (yönetici hepsini, öğretmen
// sadece kendi verdiklerini görür — bu ayrım zaten RLS'te de var, burada ekstra
// bir filtreye gerek yok, sorgu zaten doğru satırları döndürüyor).
// ============================================================================
function VerilenOdevlerListesi({ odevler, isYonetici, onDegisti }) {
  async function sil(o) {
    if (!confirm(`"${o.baslik}" ödevini silmek istediğinize emin misiniz?`)) return
    if (o.dosya_yolu) {
      const { error: dosyaHatasi } = await supabase.storage.from('odev-ekleri').remove([o.dosya_yolu])
      if (dosyaHatasi) console.error('Ödev dosyası silinemedi:', dosyaHatasi.message)
    }
    const { error } = await supabase.from('odevler').delete().eq('id', o.id)
    if (error) alert('Hata: ' + error.message)
    else onDegisti()
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto mb-6">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="font-semibold text-gray-700">{isYonetici ? 'Verilen Tüm Ödevler' : 'Verdiğim Ödevler'}</h2>
      </div>
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="px-4 py-2 font-medium">Öğrenci</th>
            <th className="px-4 py-2 font-medium">Ders</th>
            <th className="px-4 py-2 font-medium">Başlık</th>
            {isYonetici && <th className="px-4 py-2 font-medium">Öğretmen</th>}
            <th className="px-4 py-2 font-medium">Son Tarih</th>
            <th className="px-4 py-2 font-medium">Durum</th>
            <th className="px-4 py-2 font-medium">İşlemler</th>
          </tr>
        </thead>
        <tbody>
          {odevler.length === 0 && (
            <tr>
              <td colSpan={isYonetici ? 7 : 6} className="px-4 py-4 text-center text-gray-400">
                Henüz ödev girilmedi.
              </td>
            </tr>
          )}
          {odevler.map((o) => {
            const link = dosyaGoruntuleLinki(o.dosya_yolu)
            return (
              <tr key={o.id} className="border-t border-gray-50">
                <td className="px-4 py-2 font-medium text-gray-800">{o.ogrenci_adi || '—'}</td>
                <td className="px-4 py-2 text-gray-500">{o.ders || '—'}</td>
                <td className="px-4 py-2">
                  {o.baslik}
                  {link && (
                    <>
                      {' '}
                      <a href={link} target="_blank" rel="noreferrer" className="text-blue text-xs hover:underline">
                        (Dosyayı Gör)
                      </a>
                    </>
                  )}
                </td>
                {isYonetici && <td className="px-4 py-2 text-gray-500">{o.ogretmen_adi || '—'}</td>}
                <td className="px-4 py-2 text-gray-500">
                  {o.son_tarih ? new Date(o.son_tarih + 'T12:00:00').toLocaleDateString('tr-TR') : '—'}
                </td>
                <td className="px-4 py-2">
                  {o.tamamlandi ? (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                      Tamamlandı
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                      Bekliyor
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => sil(o)} className="text-red-500 text-sm hover:underline">
                    Sil
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// VELİ / ÖĞRENCİ — kendi (ya da çocuğunun) ödevlerini görme + tamamlandı işaretleme.
// ============================================================================
function OdevlerimListesi({ odevler, birdenFazlaCocukMu, onDegisti }) {
  async function tamamlandiIsaretle(o, yeniDurum) {
    const { error } = await supabase
      .from('odevler')
      .update({ tamamlandi: yeniDurum, tamamlanma_tarihi: yeniDurum ? new Date().toISOString() : null })
      .eq('id', o.id)
    if (error) alert('Hata: ' + error.message)
    else onDegisti()
  }

  const bekleyenler = odevler.filter((o) => !o.tamamlandi)
  const tamamlananlar = odevler.filter((o) => o.tamamlandi)

  function OdevKarti({ o }) {
    const link = dosyaGoruntuleLinki(o.dosya_yolu)
    const bugundenSonraMi = o.son_tarih && o.son_tarih < yerelBugunTarihi() && !o.tamamlandi
    return (
      <div className={`px-4 py-3 flex items-start justify-between gap-3 flex-wrap ${bugundenSonraMi ? 'bg-red-50' : ''}`}>
        <div>
          <p className="font-medium text-gray-800">
            {o.baslik}
            {o.ders && <span className="text-gray-400 font-normal"> — {o.ders}</span>}
            {birdenFazlaCocukMu && <span className="text-gray-400 font-normal"> ({o.ogrenci_adi})</span>}
          </p>
          {o.aciklama && <p className="text-sm text-gray-500 mt-0.5">{o.aciklama}</p>}
          <p className="text-xs text-gray-400 mt-1">
            {o.ogretmen_adi ? `${o.ogretmen_adi} · ` : ''}
            {o.son_tarih
              ? `Son tarih: ${new Date(o.son_tarih + 'T12:00:00').toLocaleDateString('tr-TR')}`
              : 'Son tarih belirtilmemiş'}
            {bugundenSonraMi && <span className="text-red-600 font-semibold"> (Süresi geçti)</span>}
          </p>
          {link && (
            <a href={link} target="_blank" rel="noreferrer" className="text-blue text-xs hover:underline">
              Ödev Dosyasını Gör
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={() => tamamlandiIsaretle(o, !o.tamamlandi)}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
            o.tamamlandi
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {o.tamamlandi ? '✓ Tamamlandı' : 'Tamamlandı Olarak İşaretle'}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="font-semibold text-gray-700">Bekleyen Ödevler ({bekleyenler.length})</h2>
      </div>
      <div className="divide-y divide-gray-50">
        {bekleyenler.length === 0 && <p className="px-4 py-6 text-center text-gray-400 text-sm">Bekleyen ödev yok.</p>}
        {bekleyenler.map((o) => (
          <OdevKarti key={o.id} o={o} />
        ))}
      </div>
      {tamamlananlar.length > 0 && (
        <>
          <div className="px-4 py-3 border-b border-t border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-gray-700">Tamamlanan Ödevler ({tamamlananlar.length})</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {tamamlananlar.map((o) => (
              <OdevKarti key={o.id} o={o} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function Odev() {
  const { profile } = useAuth()
  const isYonetici = profile?.rol === 'yonetici'
  const isOgretmen = profile?.rol === 'ogretmen'
  const isVeliYaDaOgrenci = profile?.rol === 'veli' || profile?.rol === 'ogrenci'

  const [ogrenciler, setOgrenciler] = useState([])
  const [odevler, setOdevler] = useState([])
  const [birdenFazlaCocukMu, setBirdenFazlaCocukMu] = useState(false)
  const [loading, setLoading] = useState(true)
  const ilkYuklemeTamamRef = useRef(false)

  function veriyiYenile() {
    if (!ilkYuklemeTamamRef.current) setLoading(true)
    Promise.all([
      isYonetici || isOgretmen
        ? supabase.from('ogrenciler').select('id, ad_soyad, sinif_ve_alan').order('ad_soyad')
        : Promise.resolve({ data: [] }),
      isYonetici
        ? supabase
            .from('odevler')
            .select('*, ogrenciler(ad_soyad), profiles:ogretmen_profile_id(ad_soyad)')
            .order('olusturma_tarihi', { ascending: false })
        : isOgretmen
        ? supabase
            .from('odevler')
            .select('*, ogrenciler(ad_soyad)')
            .eq('ogretmen_profile_id', profile.id)
            .order('olusturma_tarihi', { ascending: false })
        : isVeliYaDaOgrenci
        ? supabase
            .from('odevler')
            .select('*, ogrenciler(ad_soyad), profiles:ogretmen_profile_id(ad_soyad)')
            .order('son_tarih', { ascending: true, nullsFirst: false })
        : Promise.resolve({ data: [] }),
      // Veli/öğrenci için: birden fazla çocuğu olup olmadığını (kardeşler)
      // anlamak amacıyla — Muhasebe.jsx/DersProgrami.jsx'teki AYNI kanıtlanmış
      // yöntem: tüm kaydı çekip istemci tarafında filtrele (RLS zaten kısıtlıyor).
      isVeliYaDaOgrenci
        ? supabase.from('ogrenciler').select('id, veli_profile_id, ogrenci_profile_id')
        : Promise.resolve({ data: [] }),
    ]).then(([o, od, kendiCocuklarSonuc]) => {
      setOgrenciler(o.data || [])
      setOdevler(
        (od.data || []).map((d) => ({
          ...d,
          ogrenci_adi: d.ogrenciler?.ad_soyad,
          ogretmen_adi: d.profiles?.ad_soyad,
        }))
      )
      if (isVeliYaDaOgrenci) {
        const cocukSayisi = (kendiCocuklarSonuc.data || []).filter(
          (c) => c.veli_profile_id === profile.id || c.ogrenci_profile_id === profile.id
        ).length
        setBirdenFazlaCocukMu(cocukSayisi > 1)
      }
      ilkYuklemeTamamRef.current = true
      setLoading(false)
    })
  }

  useEffect(() => {
    veriyiYenile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">{isVeliYaDaOgrenci ? 'Ödevler' : 'Ödevler'}</h1>

      {(isYonetici || isOgretmen) && (
        <>
          <OdevVerForm
            ogrenciler={ogrenciler}
            ogretmenProfileId={profile.id}
            varsayilanDers={isOgretmen ? profile?.brans || '' : ''}
            onEklendi={veriyiYenile}
          />
          <VerilenOdevlerListesi odevler={odevler} isYonetici={isYonetici} onDegisti={veriyiYenile} />
        </>
      )}

      {isVeliYaDaOgrenci && (
        <OdevlerimListesi odevler={odevler} birdenFazlaCocukMu={birdenFazlaCocukMu} onDegisti={veriyiYenile} />
      )}
    </div>
  )
}
