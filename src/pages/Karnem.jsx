import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// Karnede dersler HANGİ SIRAYLA görünsün — sinav_ders_sonuclari tablosu
// kendi başına bir sıra garanti etmediğinden (veritabanı ORDER BY olmadan
// rastgele dönebilir), gerçek bir TYT/AYT karnesindeki sırayla aynı, sabit
// bir öncelik listesiyle diziyoruz (bkz. SinavKitapciklari.jsx'teki Toplu
// Ders Ataması'nda kullanılan aynı grup mantığı).
const DERS_SIRASI = [
  'Türkçe', 'Matematik', 'Geometri',
  'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü',
  'Fizik', 'Kimya', 'Biyoloji',
  'Sosyal Bilimler', 'Fen Bilimleri',
]
function dersSiraPuani(dersAdi) {
  const i = DERS_SIRASI.indexOf(dersAdi)
  return i === -1 ? 999 : i
}

// Öğrenci/veli için "kendi sınav sonuçlarını görme" sayfası — SinavYukle.jsx'te
// yöneticinin kaydettiği ogrenci_sinav_sonuclari + sinav_ders_sonuclari
// verilerini, admin panelinden ayrı, sade bir "karne" görünümünde gösterir.
// Hata Kitapçığı (yanlış soruların kitapçıktan kesilmiş hali) burada YOK —
// o hâlâ sadece yönetici tarafında, "Sınav Sonucu Yükle" sayfasından üretiliyor.
export default function Karnem() {
  const { profile } = useAuth()
  const [ogrenciler, setOgrenciler] = useState([])
  const [seciliId, setSeciliId] = useState('')
  const [sonuclar, setSonuclar] = useState([])
  const [loading, setLoading] = useState(true)
  const [pdfIndiriliyorId, setPdfIndiriliyorId] = useState(null)
  // Akordeon: sınav sayısı arttıkça sayfa çok uzayıp karışmasın diye SADECE
  // en son sınav (liste zaten created_at'e göre en yeniden en eskiye sıralı,
  // bkz. aşağıdaki .order('created_at', {ascending:false})) varsayılan
  // olarak açık geliyor, diğerleri başlığa tıklanınca açılıyor.
  const [acikId, setAcikId] = useState(null)

  async function karnePdfIndir(s) {
    if (!s.karne_pdf_yolu) return
    setPdfIndiriliyorId(s.id)
    try {
      const { data, error } = await supabase.storage
        .from('sinav-sonuc-pdfleri')
        .createSignedUrl(s.karne_pdf_yolu, 60)
      if (error) throw error
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (e) {
      alert('PDF indirilemedi: ' + e.message)
    } finally {
      setPdfIndiriliyorId(null)
    }
  }

  useEffect(() => {
    if (!profile) return
    supabase
      .from('ogrenciler')
      .select('id, ad_soyad, veli_profile_id, ogrenci_profile_id')
      .order('ad_soyad')
      .then(({ data }) => {
        const tumu = data || []
        // GÜVENLİK: Muhasebe/Odev/DersProgrami'ndeki AYNI kanıtlanmış yöntem —
        // sunucudaki RLS'ye körü körüne güvenmek yerine, İSTEMCİ TARAFINDA da
        // sadece kendi bağlı olduğu öğrenci(ler)i listeye/otomatik seçime alıyoruz.
        const liste = tumu.filter(
          (o) => o.veli_profile_id === profile.id || o.ogrenci_profile_id === profile.id
        )
        setOgrenciler(liste)
        if (liste.length > 0) {
          setSeciliId(liste[0].id)
        } else {
          setLoading(false)
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  useEffect(() => {
    if (!seciliId) return
    setLoading(true)
    supabase
      .from('ogrenci_sinav_sonuclari')
      .select('*, sinavlar(sinav_adi, sinav_tarihi)')
      .eq('ogrenci_id', seciliId)
      .order('created_at', { ascending: false })
      .then(async ({ data }) => {
        const liste = data || []
        const sonucIdleri = liste.map((s) => s.id)
        const { data: dersVerileri } =
          sonucIdleri.length > 0
            ? await supabase.from('sinav_ders_sonuclari').select('*').in('sonuc_id', sonucIdleri)
            : { data: [] }
        const dersMap = new Map()
        for (const d of dersVerileri || []) {
          if (!dersMap.has(d.sonuc_id)) dersMap.set(d.sonuc_id, [])
          dersMap.get(d.sonuc_id).push(d)
        }
        setSonuclar(
          liste.map((s) => ({
            ...s,
            dersler: (dersMap.get(s.id) || [])
              .slice()
              .sort((a, b) => dersSiraPuani(a.ders_adi) - dersSiraPuani(b.ders_adi)),
          }))
        )
        // En son sınav (liste zaten en yeniden en eskiye sıralı) varsayılan
        // olarak açık gelsin, geri kalanlar kapalı.
        setAcikId(liste.length > 0 ? liste[0].id : null)
        setLoading(false)
      })
  }, [seciliId])

  const seciciGoster = ogrenciler.length > 1
  const seciliOgrenci = ogrenciler.find((o) => o.id === seciliId)

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-2">{seciciGoster ? 'Sınav Karneleri' : 'Sınav Karnem'}</h1>
      <p className="text-sm text-gray-500 mb-6">
        Girdiğiniz sınavların sonuçları ve ders bazında doğru/yanlış/boş dökümü.
      </p>

      {seciciGoster && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Çocuğunuzu Seçin</label>
          <select
            value={seciliId}
            onChange={(e) => setSeciliId(e.target.value)}
            className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            {ogrenciler.map((o) => (
              <option key={o.id} value={o.id}>{o.ad_soyad}</option>
            ))}
          </select>
        </div>
      )}

      {ogrenciler.length === 0 && !loading && (
        <p className="text-gray-400">
          Size bağlı bir öğrenci kaydı bulunamadı. Lütfen okul yönetimiyle iletişime geçin.
        </p>
      )}

      {loading && <p className="text-gray-400">Yükleniyor...</p>}

      {!loading && seciliId && sonuclar.length === 0 && (
        <p className="text-gray-400">
          {seciliOgrenci?.ad_soyad ? `${seciliOgrenci.ad_soyad} için ` : ''}henüz kaydedilmiş bir sınav sonucu yok.
        </p>
      )}

      {!loading && sonuclar.length > 0 && (
        <div className="space-y-5">
          {sonuclar.map((s) => {
            const acikMi = acikId === s.id
            return (
            <div key={s.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div
                onClick={() => setAcikId(acikMi ? null : s.id)}
                className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2 cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"
                    className={`shrink-0 text-gray-400 transition-transform duration-150 ${acikMi ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <div>
                    <p className="font-semibold text-navy">{s.sinavlar?.sinav_adi || 'Sınav'}</p>
                    <p className="text-xs text-gray-400">
                      {s.sinavlar?.sinav_tarihi && new Date(s.sinavlar.sinav_tarihi).toLocaleDateString('tr-TR')}
                      {s.kitapcik && ` · Kitapçık ${s.kitapcik}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="text-sm flex gap-4 flex-wrap">
                    <span>
                      Doğru: <b className="text-green-700">{s.toplam_dogru}</b>
                    </span>
                    <span>
                      Yanlış: <b className="text-red-700">{s.toplam_yanlis}</b>
                    </span>
                    <span>
                      Boş: <b className="text-gray-500">{s.toplam_bos}</b>
                    </span>
                    <span>
                      Net: <b className="text-navy">{s.toplam_net}</b>
                    </span>
                  </div>
                  {s.karne_pdf_yolu && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); karnePdfIndir(s) }}
                      disabled={pdfIndiriliyorId === s.id}
                      className="text-xs font-semibold text-navy border border-navy/20 px-3 py-1.5 rounded-full hover:bg-navy/5 disabled:opacity-40"
                    >
                      {pdfIndiriliyorId === s.id ? 'Açılıyor...' : 'Karne PDF İndir'}
                    </button>
                  )}
                </div>
              </div>
              {acikMi && s.dersler.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="px-5 py-2 font-medium">Ders</th>
                        <th className="px-5 py-2 font-medium text-center">Soru</th>
                        <th className="px-5 py-2 font-medium text-center">Doğru</th>
                        <th className="px-5 py-2 font-medium text-center">Yanlış</th>
                        <th className="px-5 py-2 font-medium text-center">Boş</th>
                        <th className="px-5 py-2 font-medium text-center">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.dersler.map((d) => (
                        <tr key={d.id} className="border-t border-gray-50">
                          <td className="px-5 py-2 font-medium text-gray-800">{d.ders_adi}</td>
                          <td className="px-5 py-2 text-center text-gray-500">{d.soru_sayisi}</td>
                          <td className="px-5 py-2 text-center text-green-700">{d.dogru}</td>
                          <td className="px-5 py-2 text-center text-red-700">{d.yanlis}</td>
                          <td className="px-5 py-2 text-center text-gray-500">{d.bos}</td>
                          <td className="px-5 py-2 text-center font-semibold text-navy">{d.net}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
