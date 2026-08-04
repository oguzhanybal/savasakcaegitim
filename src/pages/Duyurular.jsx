import { useEffect, useState } from 'react'
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

// Yönetici burada duyuru yazar, hedef rolü (Öğrenci/Veli/Öğretmen/Herkes)
// seçer, isteğe bağlı bir bitiş tarihi girer — o tarih geçince duyuru Ana
// Sayfa'da (Dashboard.jsx) otomatik görünmez olur, ama burada (yönetim
// sayfasında) "süresi geçti" etiketiyle listelenmeye devam eder, silmek
// isteyip istemediğine yönetici kendi karar versin diye.
export default function Duyurular() {
  const { profile } = useAuth()
  const [duyurular, setDuyurular] = useState([])
  const [loading, setLoading] = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const [baslik, setBaslik] = useState('')
  const [icerik, setIcerik] = useState('')
  const [hedefRol, setHedefRol] = useState('herkes')
  const [bitisTarihi, setBitisTarihi] = useState('')

  // Tablodaki "Düzenle"ye basılınca bu, düzenlenen kaydın id'sine ayarlanır —
  // form o zaman "ekleme" değil "güncelleme" moduna geçer (Giderler.jsx'teki
  // aynı desen).
  const [duzenlenenId, setDuzenlenenId] = useState(null)

  function yukle() {
    setLoading(true)
    supabase
      .from('duyurular')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setDuyurular(data || [])
        setLoading(false)
      })
  }

  useEffect(() => {
    yukle()
  }, [])

  function formuSifirla() {
    setDuzenlenenId(null)
    setBaslik('')
    setIcerik('')
    setHedefRol('herkes')
    setBitisTarihi('')
  }

  async function duyuruKaydet(e) {
    e.preventDefault()
    if (!icerik.trim()) return
    setKaydediliyor(true)
    const veri = {
      baslik: baslik.trim() || null,
      icerik: icerik.trim(),
      hedef_rol: hedefRol,
      bitis_tarihi: bitisTarihi || null,
    }
    const { error } = duzenlenenId
      ? await supabase.from('duyurular').update(veri).eq('id', duzenlenenId)
      : await supabase.from('duyurular').insert({ ...veri, olusturan_id: profile?.id || null })
    setKaydediliyor(false)
    if (error) {
      alert(
        'Hata: ' +
          error.message +
          '\n\nEğer "duyurular" tablosu bulunamadı gibi bir hata görüyorsanız, bu özelliğin kurulumu için verilen SQL dosyasını Supabase\'te çalıştırmanız gerekiyor.'
      )
      return
    }
    formuSifirla()
    yukle()
  }

  function duzenlemeyeBasla(d) {
    setDuzenlenenId(d.id)
    setBaslik(d.baslik || '')
    setIcerik(d.icerik)
    setHedefRol(d.hedef_rol)
    setBitisTarihi(d.bitis_tarihi || '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function sil(id) {
    if (!confirm('Bu duyuruyu silmek istediğinize emin misiniz?')) return
    const { error } = await supabase.from('duyurular').delete().eq('id', id)
    if (error) {
      alert('Hata: ' + error.message)
      return
    }
    if (duzenlenenId === id) formuSifirla()
    yukle()
  }

  const bugun = bugunTarihi()

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-1">Duyurular</h1>
      <p className="text-gray-500 mb-6">
        Buraya eklediğiniz duyurular, seçtiğiniz role sahip kullanıcıların Ana Sayfa'sında görünür.
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
            <label className="block text-sm font-medium text-gray-600 mb-1">Kime gösterilsin?</label>
            <select
              value={hedefRol}
              onChange={(e) => setHedefRol(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="herkes">Herkes</option>
              <option value="ogrenci">Sadece Öğrenci</option>
              <option value="veli">Sadece Veli</option>
              <option value="ogretmen">Sadece Öğretmen</option>
            </select>
          </div>
        </div>
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
              return (
                <div key={d.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${HEDEF_RENKLERI[d.hedef_rol]}`}>
                        {HEDEF_ETIKETLERI[d.hedef_rol] || d.hedef_rol}
                      </span>
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
