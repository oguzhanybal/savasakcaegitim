import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// "Sınav Sonucu Yükle" sayfasında PDF yükleme/ayrıştırma akışı kalabalıklaşınca
// (özellikle ders dökümü tablo, puan/sıralama satırı ve PDF indirme butonu
// eklenince) admin "bunu orada görmeyelim, ayrı bir sayfa olsun" dedi — bu
// sayfa SADECE veritabanında zaten kayıtlı sonuçları GÖRÜNTÜLEMEK için var,
// yükleme/ayrıştırma burada YOK (o hâlâ Sınav Sonucu Yükle'de).
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

export default function SinavSonuclari() {
  const [sinavlar, setSinavlar] = useState([])
  const [seciliSinavId, setSeciliSinavId] = useState('')
  const [kayitliSonuclar, setKayitliSonuclar] = useState([])
  const [kayitliSonuclarYukleniyor, setKayitliSonuclarYukleniyor] = useState(false)
  const [silinenSonucId, setSilinenSonucId] = useState(null)
  const [karnePdfIndiriliyorId, setKarnePdfIndiriliyorId] = useState(null)

  useEffect(() => {
    supabase
      .from('sinavlar')
      .select('*')
      .order('sinav_tarihi', { ascending: false })
      .then(({ data }) => {
        setSinavlar(data || [])
        // Kullanışlı olsun diye en son sınav otomatik seçili gelsin.
        if (data && data.length > 0) setSeciliSinavId((mevcut) => mevcut || data[0].id)
      })
  }, [])

  async function kayitliSonuclariYukle(sinavId) {
    if (!sinavId) {
      setKayitliSonuclar([])
      return
    }
    setKayitliSonuclarYukleniyor(true)
    const { data } = await supabase
      .from('ogrenci_sinav_sonuclari')
      .select(
        'id, kitapcik, toplam_net, toplam_dogru, toplam_yanlis, toplam_bos, created_at, karne_pdf_yolu, ogrenciler(ad_soyad)'
      )
      .eq('sinav_id', sinavId)
      .order('created_at', { ascending: false })
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
    const { data: puanVerileri } =
      sonucIdleri.length > 0
        ? await supabase.from('sinav_puan_sonuclari').select('*').in('sonuc_id', sonucIdleri)
        : { data: [] }
    const puanMap = new Map()
    for (const p of puanVerileri || []) {
      if (!puanMap.has(p.sonuc_id)) puanMap.set(p.sonuc_id, [])
      puanMap.get(p.sonuc_id).push(p)
    }
    setKayitliSonuclar(
      liste.map((s) => ({
        ...s,
        dersler: (dersMap.get(s.id) || []).slice().sort((a, b) => dersSiraPuani(a.ders_adi) - dersSiraPuani(b.ders_adi)),
        puanlar: puanMap.get(s.id) || [],
      }))
    )
    setKayitliSonuclarYukleniyor(false)
  }

  useEffect(() => {
    kayitliSonuclariYukle(seciliSinavId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seciliSinavId])

  async function sonucSil(k) {
    if (
      !confirm(
        `"${k.ogrenciler?.ad_soyad || 'Bu öğrenci'}" için bu sınavın sonucunu kalıcı olarak silmek istediğinize ` +
          `emin misiniz? Bu işlem GERİ ALINAMAZ.`
      )
    )
      return
    setSilinenSonucId(k.id)
    try {
      await supabase.from('sinav_ders_sonuclari').delete().eq('sonuc_id', k.id)
      await supabase.from('sinav_soru_sonuclari').delete().eq('sonuc_id', k.id)
      await supabase.from('sinav_puan_sonuclari').delete().eq('sonuc_id', k.id)
      const { error } = await supabase.from('ogrenci_sinav_sonuclari').delete().eq('id', k.id)
      if (error) throw error
      setKayitliSonuclar((liste) => liste.filter((s) => s.id !== k.id))
    } catch (e) {
      alert('Silme hatası: ' + e.message)
    } finally {
      setSilinenSonucId(null)
    }
  }

  // Öğrencinin orijinal "Konu Analizli Karne" PDF'ini (2 sayfa, özet + konu
  // analizi + puan/sıralama) indirir — Storage bucket'ı private olduğu için
  // önce kısa ömürlü (60 sn) imzalı bir bağlantı istiyoruz, sonra onu yeni
  // sekmede açıyoruz.
  async function karnePdfIndir(k) {
    if (!k.karne_pdf_yolu) return
    setKarnePdfIndiriliyorId(k.id)
    try {
      const { data, error } = await supabase.storage
        .from('sinav-sonuc-pdfleri')
        .createSignedUrl(k.karne_pdf_yolu, 60)
      if (error) throw error
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (e) {
      alert('PDF indirilemedi: ' + e.message)
    } finally {
      setKarnePdfIndiriliyorId(null)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-2">Sınav Sonuçları</h1>
      <p className="text-sm text-gray-500 mb-6">
        Kaydedilmiş sınav sonuçlarını buradan görüntüleyin — ders bazında döküm, puan/sıralama ve orijinal karne PDF'i.
      </p>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Sınav</label>
        <select
          value={seciliSinavId}
          onChange={(e) => setSeciliSinavId(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
        >
          <option value="">Seçiniz...</option>
          {sinavlar.map((s) => (
            <option key={s.id} value={s.id}>
              {s.sinav_adi}
              {s.sinav_tarihi ? ` (${new Date(s.sinav_tarihi).toLocaleDateString('tr-TR')})` : ''}
            </option>
          ))}
        </select>
      </div>

      {seciliSinavId && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-gray-700">Kaydedilmiş Sonuçlar ({kayitliSonuclar.length})</h2>
          </div>
          {kayitliSonuclarYukleniyor ? (
            <p className="text-sm text-gray-400 p-4">Yükleniyor...</p>
          ) : kayitliSonuclar.length === 0 ? (
            <p className="text-sm text-gray-400 p-4">Bu sınav için henüz kaydedilmiş bir sonuç yok.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {kayitliSonuclar.map((k) => (
                <div key={k.id} className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {k.ogrenciler?.ad_soyad || 'Bilinmeyen öğrenci'}
                        {k.kitapcik && <span className="text-gray-400 font-normal"> · Kitapçık {k.kitapcik}</span>}
                      </p>
                      <p className="text-xs text-gray-500">
                        Genel — Doğru: <b className="text-green-700">{k.toplam_dogru}</b> · Yanlış:{' '}
                        <b className="text-red-700">{k.toplam_yanlis}</b> · Boş: <b className="text-gray-500">{k.toplam_bos}</b> ·
                        Net: <b className="text-navy">{k.toplam_net}</b>
                      </p>
                      {k.puanlar && k.puanlar.length > 0 && (
                        <p className="text-xs text-orange font-medium mt-0.5">
                          {k.puanlar
                            .map(
                              (p) =>
                                `${p.puan_turu} Puan: ${p.puan ?? '-'}` +
                                (p.genel_siralama != null ? ` · Genel Sıralama: ${p.genel_siralama.toLocaleString('tr-TR')}` : '') +
                                (p.kurum_siralama != null ? ` · Kurum: ${p.kurum_siralama}` : '') +
                                (p.sube_siralama != null ? ` · Şube: ${p.sube_siralama}` : '') +
                                (p.sinif_siralama != null ? ` · Sınıf: ${p.sinif_siralama}` : '')
                            )
                            .join('  |  ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {k.karne_pdf_yolu && (
                        <button
                          type="button"
                          onClick={() => karnePdfIndir(k)}
                          disabled={karnePdfIndiriliyorId === k.id}
                          className="inline-flex items-center gap-1.5 text-xs font-bold bg-navy text-white px-3.5 py-1.5 rounded-full shadow-sm hover:opacity-90 disabled:opacity-40"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 20h16" />
                          </svg>
                          {karnePdfIndiriliyorId === k.id ? 'Açılıyor...' : 'Detaylı Karne İndir'}
                        </button>
                      )}
                      <Link
                        to={`/hata-kitapcigi/${k.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold bg-orange text-white px-3 py-1.5 rounded-full hover:opacity-90"
                      >
                        Hata Kitapçığı Oluştur
                      </Link>
                      <button
                        type="button"
                        onClick={() => sonucSil(k)}
                        disabled={silinenSonucId === k.id}
                        className="text-xs font-semibold text-red-600 border border-red-200 px-3 py-1.5 rounded-full hover:bg-red-50 disabled:opacity-40"
                      >
                        {silinenSonucId === k.id ? 'Siliniyor...' : 'Sil'}
                      </button>
                    </div>
                  </div>
                  {k.dersler && k.dersler.length > 0 && (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="text-gray-400 border-b border-gray-100">
                            <th className="text-left font-medium py-1 pr-2">Ders</th>
                            <th className="text-right font-medium py-1 px-2">Soru</th>
                            <th className="text-right font-medium py-1 px-2">Doğru</th>
                            <th className="text-right font-medium py-1 px-2">Yanlış</th>
                            <th className="text-right font-medium py-1 px-2">Boş</th>
                            <th className="text-right font-medium py-1 pl-2">Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {k.dersler.map((d) => (
                            <tr key={d.id} className="border-b border-gray-50 last:border-0">
                              <td className="text-left py-1 pr-2 text-gray-700 font-medium whitespace-nowrap">
                                {d.ders_adi}
                              </td>
                              <td className="text-right py-1 px-2 text-gray-500">
                                {(d.dogru || 0) + (d.yanlis || 0) + (d.bos || 0)}
                              </td>
                              <td className="text-right py-1 px-2 text-green-700">{d.dogru}</td>
                              <td className="text-right py-1 px-2 text-red-700">{d.yanlis}</td>
                              <td className="text-right py-1 px-2 text-gray-500">{d.bos}</td>
                              <td className="text-right py-1 pl-2 text-navy font-semibold">{d.net}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
