import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

const HEDEF_ETIKETLERI = {
  ogrenci: 'Öğrenci',
  veli: 'Veli',
  ogretmen: 'Öğretmen',
  herkes: 'Herkes',
}

const HEDEF_RENKLERI = {
  ogrenci: 'bg-purple-100 text-purple-700',
  veli: 'bg-blue-100 text-blue-700',
  ogretmen: 'bg-amber-100 text-amber-700',
  herkes: 'bg-green-100 text-green-700',
}

function bugunTarihi() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// Öğrenci arama + çoklu seçim kutusu — "Ekstra Kişi Ekle" ve "Sınıftan Kişi
// Çıkar" bölümlerinde AYNI bileşen iki farklı öğrenci listesiyle kullanılıyor
// (Muhasebe.jsx'teki "Öğrenci Seç" arama kutusuyla aynı mantık: odaklanınca
// açılır, yazınca filtrelenir, seçilenler altta rozet/chip olarak görünür).
function OgrenciCoklSecici({ ogrenciler, ogrenciSinifAdi, secilenIdler, setSecilenIdler, placeholder, bosMesaj }) {
  const [arama, setArama] = useState('')
  const [acik, setAcik] = useState(false)

  const filtreli = arama.trim()
    ? ogrenciler.filter((o) => o.ad_soyad.toLocaleLowerCase('tr-TR').includes(arama.trim().toLocaleLowerCase('tr-TR')))
    : ogrenciler
  const secilenSet = new Set(secilenIdler)
  const seciliOlmayanlar = filtreli.filter((o) => !secilenSet.has(o.id))

  function ekle(id) {
    setSecilenIdler((prev) => [...prev, id])
    setArama('')
  }
  function cikar(id) {
    setSecilenIdler((prev) => prev.filter((x) => x !== id))
  }

  return (
    <div>
      <div className="relative">
        <input
          value={arama}
          onChange={(e) => {
            setArama(e.target.value)
            setAcik(true)
          }}
          onFocus={() => setAcik(true)}
          onBlur={() => setTimeout(() => setAcik(false), 150)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        {acik && (
          <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
            {seciliOlmayanlar.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">{bosMesaj || 'Sonuç yok.'}</p>
            ) : (
              seciliOlmayanlar.slice(0, 50).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => ekle(o.id)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors"
                >
                  {o.ad_soyad}
                  {ogrenciSinifAdi.get(o.id) && <span className="text-gray-400"> · {ogrenciSinifAdi.get(o.id)}</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {secilenIdler.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {secilenIdler.map((id) => {
            const o = ogrenciler.find((x) => x.id === id)
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs font-medium pl-2.5 pr-1.5 py-1 rounded-full"
              >
                {o?.ad_soyad || 'Bilinmeyen öğrenci'}
                <button
                  type="button"
                  onClick={() => cikar(id)}
                  className="text-gray-400 hover:text-red-500 font-bold leading-none"
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Yönetici burada duyuru yazar, hedef rolü (Öğrenci/Veli/Öğretmen/Herkes)
// seçer, isteğe bağlı bir bitiş tarihi girer — o tarih geçince duyuru Ana
// Sayfa'da (Dashboard.jsx) otomatik görünmez olur, ama burada (yönetim
// sayfasında) "süresi geçti" etiketiyle listelenmeye devam eder, silmek
// isteyip istemediğine yönetici kendi karar versin diye.
//
// HEDEFLİ GÖNDERİM: yönetici "Role Göre" (eski davranış — hedef_rol'e göre
// TÜM okula) yerine "Özel (Sınıf/Kişi Seç)" seçebilir — o zaman bir/birkaç
// SINIF seçebilir, o sınıf(lar)dan bazı öğrencileri ÇIKARABİLİR, sınıf
// dışından ekstra öğrenci EKLEYEBİLİR, ya da hiç sınıf seçmeden sadece
// bir/birkaç öğrenciye özel gönderebilir (bkz. duyuru_hedef_siniflar /
// duyuru_hedef_ogrenciler tabloları — SQL migration'da açıklandı).
export default function Duyurular() {
  const { profile } = useAuth()
  const [duyurular, setDuyurular] = useState([])
  const [siniflar, setSiniflar] = useState([])
  const [ogrenciler, setOgrenciler] = useState([])
  const [sinifOgrenciler, setSinifOgrenciler] = useState([])
  const [hedefSiniflarTum, setHedefSiniflarTum] = useState([])
  const [hedefOgrencilerTum, setHedefOgrencilerTum] = useState([])
  const [loading, setLoading] = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState('')

  const [baslik, setBaslik] = useState('')
  const [icerik, setIcerik] = useState('')
  const [hedefRol, setHedefRol] = useState('herkes')
  const [bitisTarihi, setBitisTarihi] = useState('')
  const [hedefTur, setHedefTur] = useState('rol')
  const [seciliSiniflar, setSeciliSiniflar] = useState([])
  const [ekstraOgrenciler, setEkstraOgrenciler] = useState([])
  const [haricOgrenciler, setHaricOgrenciler] = useState([])

  // Tablodaki "Düzenle"ye basılınca bu, düzenlenen kaydın id'sine ayarlanır —
  // form o zaman "ekleme" değil "güncelleme" moduna geçer (Giderler.jsx'teki
  // aynı desen).
  const [duzenlenenId, setDuzenlenenId] = useState(null)

  function yukle() {
    setLoading(true)
    Promise.all([
      supabase.from('duyurular').select('*').order('created_at', { ascending: false }),
      supabase.from('siniflar').select('id, ad').order('ad'),
      supabase.from('ogrenciler').select('id, ad_soyad').or('durum.eq.aktif,durum.is.null').order('ad_soyad'),
      supabase.from('sinif_ogrenciler').select('ogrenci_id, sinif_id'),
      supabase.from('duyuru_hedef_siniflar').select('duyuru_id, sinif_id'),
      supabase.from('duyuru_hedef_ogrenciler').select('duyuru_id, ogrenci_id, tur'),
    ]).then(([d, s, o, so, hs, ho]) => {
      setDuyurular(d.data || [])
      setSiniflar(s.data || [])
      setOgrenciler(o.data || [])
      setSinifOgrenciler(so.data || [])
      setHedefSiniflarTum(hs.data || [])
      setHedefOgrencilerTum(ho.data || [])
      setLoading(false)
    })
  }

  useEffect(() => {
    yukle()
  }, [])

  // Arama listesinde "Ahmet Yılmaz · 9-A" gibi göstermek için — bir öğrenci
  // genelde tek sınıfa kayıtlı olduğundan ilk eşleşme yeterli.
  const ogrenciSinifAdi = useMemo(() => {
    const sinifAdMap = new Map(siniflar.map((s) => [s.id, s.ad]))
    const harita = new Map()
    sinifOgrenciler.forEach((so) => {
      if (!harita.has(so.ogrenci_id)) harita.set(so.ogrenci_id, sinifAdMap.get(so.sinif_id) || null)
    })
    return harita
  }, [siniflar, sinifOgrenciler])

  // "Sınıftan Kişi Çıkar" listesi SADECE seçilen sınıf(lar)daki öğrencilerden
  // oluşsun — mantık olarak zaten sadece o sınıftakileri çıkarabilirsiniz.
  const seciliSiniflardakiOgrenciler = useMemo(() => {
    if (seciliSiniflar.length === 0) return []
    const seciliSet = new Set(seciliSiniflar)
    const ogrenciIdSet = new Set(
      sinifOgrenciler.filter((so) => seciliSet.has(so.sinif_id)).map((so) => so.ogrenci_id)
    )
    return ogrenciler.filter((o) => ogrenciIdSet.has(o.id))
  }, [seciliSiniflar, sinifOgrenciler, ogrenciler])

  function sinifToggle(id) {
    setSeciliSiniflar((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function formuSifirla() {
    setDuzenlenenId(null)
    setBaslik('')
    setIcerik('')
    setHedefRol('herkes')
    setBitisTarihi('')
    setHedefTur('rol')
    setSeciliSiniflar([])
    setEkstraOgrenciler([])
    setHaricOgrenciler([])
    setHata('')
  }

  async function duyuruKaydet(e) {
    e.preventDefault()
    setHata('')
    if (!icerik.trim()) return
    if (hedefTur === 'ozel' && seciliSiniflar.length === 0 && ekstraOgrenciler.length === 0) {
      setHata('Özel hedefleme için en az bir sınıf ya da en az bir öğrenci seçin.')
      return
    }
    setKaydediliyor(true)
    const veri = {
      baslik: baslik.trim() || null,
      icerik: icerik.trim(),
      hedef_rol: hedefRol,
      bitis_tarihi: bitisTarihi || null,
      hedef_tur: hedefTur,
    }

    let duyuruId = duzenlenenId
    let error = null
    if (duzenlenenId) {
      ;({ error } = await supabase.from('duyurular').update(veri).eq('id', duzenlenenId))
    } else {
      const sonuc = await supabase
        .from('duyurular')
        .insert({ ...veri, olusturan_id: profile?.id || null })
        .select()
        .single()
      error = sonuc.error
      duyuruId = sonuc.data?.id
    }

    if (error) {
      setKaydediliyor(false)
      alert(
        'Hata: ' +
          error.message +
          '\n\nEğer bir tablo bulunamadı gibi bir hata görüyorsanız, bu özelliğin kurulumu için verilen SQL dosyasını Supabase\'te çalıştırmanız gerekiyor.'
      )
      return
    }

    // Hedef sınıf/kişi listelerini her zaman baştan senkronize ediyoruz —
    // önce bu duyuruya ait eski kayıtları silip, güncel seçimi ekliyoruz.
    // Hem yeni ekleme hem düzenleme için aynı kod yolu, basit ve güvenli.
    if (duyuruId) {
      await supabase.from('duyuru_hedef_siniflar').delete().eq('duyuru_id', duyuruId)
      await supabase.from('duyuru_hedef_ogrenciler').delete().eq('duyuru_id', duyuruId)
      if (hedefTur === 'ozel') {
        if (seciliSiniflar.length > 0) {
          await supabase
            .from('duyuru_hedef_siniflar')
            .insert(seciliSiniflar.map((sinif_id) => ({ duyuru_id: duyuruId, sinif_id })))
        }
        const kayitlar = [
          ...ekstraOgrenciler.map((ogrenci_id) => ({ duyuru_id: duyuruId, ogrenci_id, tur: 'ekle' })),
          ...haricOgrenciler.map((ogrenci_id) => ({ duyuru_id: duyuruId, ogrenci_id, tur: 'haric' })),
        ]
        if (kayitlar.length > 0) {
          await supabase.from('duyuru_hedef_ogrenciler').insert(kayitlar)
        }
      }
    }

    setKaydediliyor(false)
    formuSifirla()
    yukle()
  }

  function duzenlemeyeBasla(d) {
    setDuzenlenenId(d.id)
    setBaslik(d.baslik || '')
    setIcerik(d.icerik)
    setHedefRol(d.hedef_rol)
    setBitisTarihi(d.bitis_tarihi || '')
    setHedefTur(d.hedef_tur || 'rol')
    setSeciliSiniflar(hedefSiniflarTum.filter((r) => r.duyuru_id === d.id).map((r) => r.sinif_id))
    setEkstraOgrenciler(
      hedefOgrencilerTum.filter((r) => r.duyuru_id === d.id && r.tur === 'ekle').map((r) => r.ogrenci_id)
    )
    setHaricOgrenciler(
      hedefOgrencilerTum.filter((r) => r.duyuru_id === d.id && r.tur === 'haric').map((r) => r.ogrenci_id)
    )
    setHata('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function sil(id) {
    if (!confirm('Bu duyuruyu silmek istediğinize emin misiniz?')) return
    // duyuru_hedef_siniflar / duyuru_hedef_ogrenciler satırları "on delete
    // cascade" ile otomatik silinir, ayrıca silmeye gerek yok.
    const { error } = await supabase.from('duyurular').delete().eq('id', id)
    if (error) {
      alert('Hata: ' + error.message)
      return
    }
    if (duzenlenenId === id) formuSifirla()
    yukle()
  }

  // Liste görünümünde "özel" duyurular için "9-A, 9-B · +2 kişi · -1 kişi"
  // gibi kısa bir özet üretir.
  function hedefOzeti(d) {
    if (d.hedef_tur !== 'ozel') return null
    const sinifAdMap = new Map(siniflar.map((s) => [s.id, s.ad]))
    const sinifAdlari = hedefSiniflarTum
      .filter((r) => r.duyuru_id === d.id)
      .map((r) => sinifAdMap.get(r.sinif_id))
      .filter(Boolean)
    const ekleSayisi = hedefOgrencilerTum.filter((r) => r.duyuru_id === d.id && r.tur === 'ekle').length
    const haricSayisi = hedefOgrencilerTum.filter((r) => r.duyuru_id === d.id && r.tur === 'haric').length
    const parcalar = []
    if (sinifAdlari.length > 0) parcalar.push(sinifAdlari.join(', '))
    if (ekleSayisi > 0) parcalar.push(`+${ekleSayisi} kişi`)
    if (haricSayisi > 0) parcalar.push(`-${haricSayisi} kişi`)
    return parcalar.length > 0 ? parcalar.join(' · ') : 'Kişi seçilmedi'
  }

  const bugun = bugunTarihi()

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-1">Duyurular</h1>
      <p className="text-gray-500 mb-6">
        Buraya eklediğiniz duyurular, hedeflediğiniz kullanıcıların Ana Sayfa'sında görünür.
      </p>

      <form onSubmit={duyuruKaydet} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <h2 className="font-semibold text-gray-700 mb-4">{duzenlenenId ? 'Duyuruyu Düzenle' : 'Yeni Duyuru'}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Başlık (opsiyonel)</label>
            <input
              value={baslik}
              onChange={(e) => setBaslik(e.target.value)}
              placeholder="ör. Cuma günü ders yoktur"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Kime gösterilsin? {hedefTur === 'ozel' && <span className="text-gray-400 font-normal">(seçilenler içinde)</span>}
            </label>
            <select
              value={hedefRol}
              onChange={(e) => setHedefRol(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="herkes">Herkes</option>
              <option value="ogrenci">Sadece Öğrenci</option>
              <option value="veli">Sadece Veli</option>
              {/* "Özel" hedeflemede sınıf/öğrenci teması öğretmenle ilgisiz
                  olduğu için bu seçenek sadece "Role Göre" modunda gösterilir. */}
              {hedefTur === 'rol' && <option value="ogretmen">Sadece Öğretmen</option>}
            </select>
          </div>
        </div>

        {/* Hedefleme türü: eski "Role Göre" (tüm okula/role) ya da yeni
            "Özel" (sınıf/kişi seç) — kullanıcı isteğiyle eklendi. */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 mb-1.5">Hedefleme</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHedefTur('rol')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                hedefTur === 'rol' ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-200 hover:border-navy'
              }`}
            >
              Role Göre (tüm okul)
            </button>
            <button
              type="button"
              onClick={() => {
                setHedefTur('ozel')
                if (hedefRol === 'ogretmen') setHedefRol('herkes')
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                hedefTur === 'ozel' ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-200 hover:border-navy'
              }`}
            >
              Özel (Sınıf / Kişi Seç)
            </button>
          </div>
        </div>

        {hedefTur === 'ozel' && (
          <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-4">
            <div>
              <p className="block text-sm font-medium text-gray-700 mb-1.5">
                Sınıf(lar) <span className="text-gray-400 font-normal">(birden fazla seçilebilir, hiç seçmeyebilirsiniz)</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {siniflar.length === 0 ? (
                  <p className="text-xs text-gray-400">Henüz sınıf yok.</p>
                ) : (
                  siniflar.map((s) => {
                    const secili = seciliSiniflar.includes(s.id)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => sinifToggle(s.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          secili ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-200 hover:border-navy'
                        }`}
                      >
                        {s.ad}
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <div>
              <p className="block text-sm font-medium text-gray-700 mb-1.5">
                Ekstra Kişi Ekle{' '}
                <span className="text-gray-400 font-normal">
                  (seçilen sınıf(lar)ın dışından, ya da hiç sınıf seçmeden "sadece bu kişi(ler)e" göndermek için)
                </span>
              </p>
              <OgrenciCoklSecici
                ogrenciler={ogrenciler}
                ogrenciSinifAdi={ogrenciSinifAdi}
                secilenIdler={ekstraOgrenciler}
                setSecilenIdler={setEkstraOgrenciler}
                placeholder="Öğrenci adı yazarak arayın..."
              />
            </div>

            {seciliSiniflar.length > 0 && (
              <div>
                <p className="block text-sm font-medium text-gray-700 mb-1.5">
                  Sınıftan Kişi Çıkar <span className="text-gray-400 font-normal">(seçilen sınıf(lar)dan bu öğrenci(ler)e gitmesin)</span>
                </p>
                <OgrenciCoklSecici
                  ogrenciler={seciliSiniflardakiOgrenciler}
                  ogrenciSinifAdi={ogrenciSinifAdi}
                  secilenIdler={haricOgrenciler}
                  setSecilenIdler={setHaricOgrenciler}
                  placeholder="Çıkarmak istediğiniz öğrenciyi arayın..."
                  bosMesaj="Seçilen sınıf(lar)da başka öğrenci yok."
                />
              </div>
            )}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 mb-1">İçerik</label>
          <textarea
            value={icerik}
            onChange={(e) => setIcerik(e.target.value)}
            required
            rows={3}
            placeholder="Duyuru metni..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Bitiş Tarihi (opsiyonel)</label>
            <input
              type="date"
              value={bitisTarihi}
              onChange={(e) => setBitisTarihi(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Boş bırakılırsa duyuru siz silene kadar gösterilmeye devam eder.</p>
          </div>
        </div>
        {hata && <p className="text-red-600 text-sm mb-3">{hata}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={kaydediliyor}
            className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {kaydediliyor ? 'Kaydediliyor...' : duzenlenenId ? 'Güncelle' : 'Duyuru Ekle'}
          </button>
          {duzenlenenId && (
            <button type="button" onClick={formuSifirla} className="text-sm text-gray-500 hover:underline">
              Vazgeç
            </button>
          )}
        </div>
      </form>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="font-semibold text-gray-700">Mevcut Duyurular</h2>
        </div>
        {loading ? (
          <p className="p-6 text-gray-400">Yükleniyor...</p>
        ) : duyurular.length === 0 ? (
          <p className="p-6 text-gray-400">Henüz duyuru eklenmedi.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {duyurular.map((d) => {
              const suresiGecti = d.bitis_tarihi && d.bitis_tarihi < bugun
              const ozet = hedefOzeti(d)
              return (
                <div key={d.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${HEDEF_RENKLERI[d.hedef_rol]}`}>
                        {HEDEF_ETIKETLERI[d.hedef_rol] || d.hedef_rol}
                      </span>
                      {ozet && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                          {ozet}
                        </span>
                      )}
                      {suresiGecti && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          Süresi geçti
                        </span>
                      )}
                      {d.baslik && <p className="font-semibold text-gray-800">{d.baslik}</p>}
                    </div>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{d.icerik}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(d.created_at).toLocaleDateString('tr-TR')} tarihinde eklendi
                      {d.bitis_tarihi ? ` · Bitiş: ${new Date(d.bitis_tarihi).toLocaleDateString('tr-TR')}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => duzenlemeyeBasla(d)} className="text-xs text-blue-600 hover:text-blue-800 hover:underline">
                      Düzenle
                    </button>
                    <button onClick={() => sil(d.id)} className="text-xs text-red-500 hover:text-red-700 hover:underline">
                      Sil
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
