import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { paraFormat, ayBaslangici, ayEtiketi } from '../lib/ekstreHesap'

// Yönetici VE kantin rolü için: seçilen dönem (Günlük / Aylık / Tüm Zamanlar)
// için TÜM kantin alışlarını hem kurum geneli (toplam tutar + ürün bazında
// kırılım) hem öğrenci bazında gösterir, ve satırları (ürün/adet/fiyat)
// düzeltme veya silme, ya da unutulmuş bir satışı sonradan ekleme imkanı
// verir — geçmiş gün/aylara da ◀/▶ ile gidilebilir (bkz. YoklamaRaporu.jsx'teki
// aynı gezinme deseni). Kantin rolünün kantin_alislar üzerinde UPDATE
// yapabilmesi için migration_kantin_gunluk_rapor_guncelleme.sql'in
// çalıştırılmış olması gerekir (eski migration_kantin.sql'de kantin rolü
// için sadece INSERT/SELECT/DELETE politikaları vardı, UPDATE yoktu).

function bugunTarihi() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

function tarihKaydir(tarihStr, gunSayisi) {
  const d = new Date(tarihStr + 'T12:00:00')
  d.setDate(d.getDate() + gunSayisi)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ayKaydir(ayBaslangicStr, adet) {
  const d = new Date(ayBaslangicStr + 'T12:00:00')
  d.setMonth(d.getMonth() + adet)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function KantinGunlukRapor() {
  const [donem, setDonem] = useState('gun') // 'gun' | 'ay' | 'hepsi'
  const [seciliTarih, setSeciliTarih] = useState(bugunTarihi())
  const [seciliAy, setSeciliAy] = useState(ayBaslangici(bugunTarihi()))
  const [alislar, setAlislar] = useState([])
  const [urunler, setUrunler] = useState([])
  const [ogrenciler, setOgrenciler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)

  // Düzenlenen satır artık tek bir kantin_alislar id'si değil, aynı gün
  // aynı öğrencinin aynı ürününe ait TÜM kayıtları temsil eden bir grup
  // ({ anahtar, urun_adi, urun_id, adet, tutar, idler: [id, id, ...] }) —
  // bkz. gunlukGrupla. Tek kayıt varsa idler tek elemanlı olur, davranış
  // aynı kalır; birden fazla varsa Kaydet/Sil hepsine birden uygulanır.
  const [duzenlenenGrup, setDuzenlenenGrup] = useState(null)
  const [duzenlemeUrunId, setDuzenlemeUrunId] = useState('')
  const [duzenlemeAdet, setDuzenlemeAdet] = useState('1')
  const [duzenlemeBirimFiyat, setDuzenlemeBirimFiyat] = useState('')

  // null: hiçbir ekleme formu açık değil. 'yeni': üstteki genel "+ Yeni Alış
  // Ekle" formu (isim aramalı, henüz o dönemde hiç alışverişi olmayan bir
  // öğrenci için). Bir öğrenci id'si: o öğrencinin kartının altındaki
  // aramasız/hızlı ekleme formu (öğrenci zaten belli, sadece ürün+adet sorar).
  const [ekleHedefi, setEkleHedefi] = useState(null)
  const [yeniOgrenciArama, setYeniOgrenciArama] = useState('')
  const [yeniOgrenciId, setYeniOgrenciId] = useState('')
  const [yeniOgrenciAdi, setYeniOgrenciAdi] = useState('')
  const [yeniUrunId, setYeniUrunId] = useState('')
  const [yeniAdet, setYeniAdet] = useState('1')
  const [yeniTarih, setYeniTarih] = useState(bugunTarihi())

  async function veriyiYukle() {
    setYukleniyor(true)
    setHata('')
    let sorgu = supabase
      .from('kantin_alislar')
      .select('*, ogrenciler(ad_soyad)')
      .order('tarih', { ascending: true })
      .order('created_at', { ascending: true })
    if (donem === 'gun') {
      sorgu = sorgu.eq('tarih', seciliTarih)
    } else if (donem === 'ay') {
      sorgu = sorgu.gte('tarih', seciliAy).lt('tarih', ayKaydir(seciliAy, 1))
    }
    const [alisRes, urunRes, ogrenciRes] = await Promise.all([
      sorgu,
      supabase.from('kantin_urunler').select('*').order('ad'),
      supabase.from('ogrenciler').select('id, ad_soyad').order('ad_soyad'),
    ])
    if (alisRes.error) setHata(alisRes.error.message)
    setAlislar(alisRes.data || [])
    setUrunler(urunRes.data || [])
    setOgrenciler(ogrenciRes.data || [])
    setYukleniyor(false)
  }

  useEffect(() => {
    veriyiYukle()
    setDuzenlenenGrup(null)
    setEkleHedefi(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donem, seciliTarih, seciliAy])

  const bugunMu = seciliTarih === bugunTarihi()
  const buAyMi = seciliAy === ayBaslangici(bugunTarihi())

  // Ekleme formunu açarken önerilecek varsayılan tarih: Günlük'te seçili
  // gün, Aylık'ta (seçili ay bugünü içeriyorsa bugün, yoksa ayın 1'i),
  // Tüm Zamanlar'da bugün — sonrasında dönem 'gun' değilse kullanıcı bunu
  // formdaki tarih alanından değiştirebilir.
  function varsayilanYeniTarih() {
    if (donem === 'gun') return seciliTarih
    if (donem === 'ay') return buAyMi ? bugunTarihi() : seciliAy
    return bugunTarihi()
  }

  const genelToplam = useMemo(() => alislar.reduce((t, a) => t + Number(a.tutar), 0), [alislar])

  const urunKirilimi = useMemo(() => {
    const map = new Map()
    for (const a of alislar) {
      const k = a.urun_adi || 'Belirtilmemiş'
      const mevcut = map.get(k) || { adet: 0, tutar: 0 }
      mevcut.adet += a.adet
      mevcut.tutar += Number(a.tutar)
      map.set(k, mevcut)
    }
    return [...map.entries()].sort((a, b) => b[1].tutar - a[1].tutar)
  }, [alislar])

  const ogrenciGruplari = useMemo(() => {
    const map = new Map()
    for (const a of alislar) {
      const ad = a.ogrenciler?.ad_soyad || 'Bilinmeyen Öğrenci'
      if (!map.has(a.ogrenci_id)) map.set(a.ogrenci_id, { id: a.ogrenci_id, ad, kayitlar: [], toplam: 0 })
      const g = map.get(a.ogrenci_id)
      g.kayitlar.push(a)
      g.toplam += Number(a.tutar)
    }
    return [...map.values()].sort((a, b) => a.ad.localeCompare(b.ad, 'tr-TR'))
  }, [alislar])

  // Aylık/Tüm Zamanlar gibi BİRDEN FAZLA günü kapsayan görünümlerde, aynı
  // ürün birden çok kez alınmışsa (ör. bir öğrenci ayda 3 kere su almışsa)
  // her alışı ayrı satır olarak göstermek yerine ürün bazında TOPLAYIP tek
  // satırda adediyle gösteriyoruz. Salt görüntüleme amaçlı olduğundan (bu
  // görünümlerde Düzenle/Sil yok) burada işlem id'lerini taşımaya gerek yok.
  function urunBazindaGrupla(kayitlar) {
    const map = new Map()
    for (const a of kayitlar) {
      const k = a.urun_adi || 'Belirtilmemiş'
      const mevcut = map.get(k) || { adet: 0, tutar: 0 }
      mevcut.adet += a.adet
      mevcut.tutar += Number(a.tutar)
      map.set(k, mevcut)
    }
    return [...map.entries()].sort((a, b) => b[1].tutar - a[1].tutar)
  }

  // Günlük görünümde de aynı öğrencinin aynı gün içinde aynı ürünü birden
  // fazla kez alması durumunda (ör. 3 kere su) TEK satırda toplam adediyle
  // gösteriliyor — ama burada (aylık/genelin aksine) satır hâlâ düzenlenebilir/
  // silinebilir kalması gerektiğinden, her grup kendi altındaki kantin_alislar
  // id'lerini (idler) de taşıyor: Kaydet o grubun TÜM kayıtlarını tek kayda
  // indirger (fazlalıkları siler, kalanı yeni değerlerle günceller), Sil
  // grubun tüm kayıtlarını birden siler.
  function gunlukGrupla(ogrenciId, kayitlar) {
    const map = new Map()
    for (const a of kayitlar) {
      const urunAdi = a.urun_adi || 'Belirtilmemiş'
      const anahtar = `${ogrenciId}|${urunAdi}`
      if (!map.has(anahtar)) {
        map.set(anahtar, { anahtar, urun_adi: a.urun_adi, urun_id: a.urun_id, adet: 0, tutar: 0, idler: [] })
      }
      const g = map.get(anahtar)
      g.adet += a.adet
      g.tutar += Number(a.tutar)
      g.idler.push(a.id)
    }
    return [...map.values()].sort((a, b) => b.tutar - a.tutar)
  }

  function duzenlemeyeBasla(g) {
    setEkleHedefi(null)
    setDuzenlenenGrup(g)
    setDuzenlemeUrunId(g.urun_id || '')
    setDuzenlemeAdet(String(g.adet))
    // Birden fazla kayıt aynı ürünse fiyat da normalde aynıdır; olası bir
    // farklılıkta (ör. üründe fiyat güncellemesi arada yapıldıysa) ortalama
    // birim fiyat varsayılan olarak gösteriliyor, kullanıcı isterse düzeltir.
    setDuzenlemeBirimFiyat(g.adet ? String(Math.round((g.tutar / g.adet) * 100) / 100) : '0')
  }

  async function duzenlemeyiKaydet(g) {
    const adet = Number(duzenlemeAdet)
    const birimFiyat = Number(duzenlemeBirimFiyat)
    if (!adet || adet <= 0) return alert('Adet 0\'dan büyük olmalı.')
    if (!(birimFiyat >= 0)) return alert('Birim fiyat geçersiz.')
    const secilenUrun = urunler.find((u) => u.id === duzenlemeUrunId)
    setKaydediliyor(true)
    const [ilkId, ...digerIdler] = g.idler
    if (digerIdler.length > 0) {
      const { error: silmeHatasi } = await supabase.from('kantin_alislar').delete().in('id', digerIdler)
      if (silmeHatasi) {
        setKaydediliyor(false)
        return alert('Güncellenemedi: ' + silmeHatasi.message)
      }
    }
    const { error } = await supabase
      .from('kantin_alislar')
      .update({
        urun_id: duzenlemeUrunId || null,
        urun_adi: secilenUrun ? secilenUrun.ad : g.urun_adi,
        adet,
        birim_fiyat: birimFiyat,
        tutar: adet * birimFiyat,
      })
      .eq('id', ilkId)
    setKaydediliyor(false)
    if (error) return alert('Güncellenemedi: ' + error.message)
    setDuzenlenenGrup(null)
    veriyiYukle()
  }

  async function sil(idler) {
    const idListesi = Array.isArray(idler) ? idler : [idler]
    const mesaj = idListesi.length > 1 ? 'Bu ürüne ait tüm alışları (aynı gün içindeki hepsini) silmek istediğine emin misin?' : 'Bu alışı silmek istediğine emin misin?'
    if (!confirm(mesaj)) return
    const { error } = await supabase.from('kantin_alislar').delete().in('id', idListesi)
    if (error) return alert('Silinemedi: ' + error.message)
    veriyiYukle()
  }

  const ogrenciAramaSonuclari = useMemo(() => {
    const aranan = yeniOgrenciArama.trim().toLocaleLowerCase('tr-TR')
    if (!aranan || yeniOgrenciId) return []
    return ogrenciler.filter((o) => o.ad_soyad.toLocaleLowerCase('tr-TR').includes(aranan)).slice(0, 8)
  }, [ogrenciler, yeniOgrenciArama, yeniOgrenciId])

  // hedefOgrenciId verilirse (bir öğrencinin kartındaki hızlı ekleme
  // formundan çağrılırsa) isim aramasına gerek yok — direkt o öğrenciye
  // eklenir. Verilmezse üstteki genel formdaki (isimle aranıp seçilen)
  // yeniOgrenciId kullanılır.
  async function yeniAlisEkle(hedefOgrenciId) {
    const ogrenciId = hedefOgrenciId || yeniOgrenciId
    if (!ogrenciId) return alert('Önce listeden bir öğrenci seçin.')
    if (!yeniUrunId) return alert('Ürün seçin.')
    if (!yeniTarih) return alert('Tarih seçin.')
    const adet = Number(yeniAdet)
    if (!adet || adet <= 0) return alert('Adet 0\'dan büyük olmalı.')
    const urun = urunler.find((u) => u.id === yeniUrunId)
    if (!urun) return alert('Ürün bulunamadı.')
    setKaydediliyor(true)
    const { error } = await supabase.from('kantin_alislar').insert({
      ogrenci_id: ogrenciId,
      urun_id: urun.id,
      urun_adi: urun.ad,
      birim_fiyat: urun.fiyat,
      adet,
      tutar: urun.fiyat * adet,
      tarih: yeniTarih,
    })
    setKaydediliyor(false)
    if (error) return alert('Eklenemedi: ' + error.message)
    setYeniOgrenciArama('')
    setYeniOgrenciId('')
    setYeniOgrenciAdi('')
    setYeniUrunId('')
    setYeniAdet('1')
    setEkleHedefi(null)
    veriyiYukle()
  }

  const donemEtiketi = donem === 'gun' ? 'Günün' : donem === 'ay' ? 'Ayın' : 'Genel'
  const bosMesaji =
    donem === 'gun' ? 'Bu güne ait kantin alışı yok.' : donem === 'ay' ? 'Bu aya ait kantin alışı yok.' : 'Hiç kantin alışı kaydı yok.'

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-2">Kantin Günlük Rapor</h1>
      <p className="text-sm text-gray-500 mb-6">
        Seçilen döneme ait kurum geneli kantin satışı ve öğrenci bazında dökümü — hatalı bir satırı düzeltebilir,
        silebilir ya da unutulmuş bir satışı sonradan ekleyebilirsin.
      </p>

      <div className="flex gap-1.5 mb-3 flex-wrap">
        <button
          type="button"
          onClick={() => setDonem('gun')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            donem === 'gun' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
          }`}
        >
          Günlük
        </button>
        <button
          type="button"
          onClick={() => setDonem('ay')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            donem === 'ay' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
          }`}
        >
          Aylık
        </button>
        <button
          type="button"
          onClick={() => setDonem('hepsi')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            donem === 'hepsi' ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
          }`}
        >
          Tüm Zamanlar
        </button>
      </div>

      {donem === 'gun' && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <button
            type="button"
            onClick={() => setSeciliTarih((t) => tarihKaydir(t, -1))}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 font-semibold"
          >
            ◀
          </button>
          <input
            type="date"
            value={seciliTarih}
            onChange={(e) => setSeciliTarih(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-navy focus:outline-none focus:ring-2 focus:ring-blue"
          />
          <button
            type="button"
            onClick={() => setSeciliTarih((t) => tarihKaydir(t, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 font-semibold"
          >
            ▶
          </button>
          {!bugunMu && (
            <button
              type="button"
              onClick={() => setSeciliTarih(bugunTarihi())}
              className="px-3 py-2 rounded-lg bg-navy text-white text-sm font-semibold"
            >
              Bugün
            </button>
          )}
          <span className="text-sm text-gray-500 ml-1">
            {new Date(seciliTarih + 'T12:00:00').toLocaleDateString('tr-TR', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </span>
        </div>
      )}

      {donem === 'ay' && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <button
            type="button"
            onClick={() => setSeciliAy((a) => ayKaydir(a, -1))}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 font-semibold"
          >
            ◀
          </button>
          <span className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-navy capitalize min-w-[10rem] text-center">
            {ayEtiketi(seciliAy)}
          </span>
          <button
            type="button"
            onClick={() => setSeciliAy((a) => ayKaydir(a, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 font-semibold"
          >
            ▶
          </button>
          {!buAyMi && (
            <button
              type="button"
              onClick={() => setSeciliAy(ayBaslangici(bugunTarihi()))}
              className="px-3 py-2 rounded-lg bg-navy text-white text-sm font-semibold"
            >
              Bu Ay
            </button>
          )}
        </div>
      )}

      {donem === 'hepsi' && <p className="text-sm text-gray-500 mb-6">Kayıtlı tüm zamanlardaki kantin alışları.</p>}

      {yukleniyor ? (
        <p className="text-gray-400">Yükleniyor...</p>
      ) : hata ? (
        <p className="text-red-600 text-sm">{hata}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm text-gray-500 font-medium">{donemEtiketi} Toplamı</p>
              <p className="text-2xl font-bold text-navy mt-1">{paraFormat(genelToplam)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm text-gray-500 font-medium">Toplam Alış</p>
              <p className="text-2xl font-bold text-navy mt-1">{alislar.length}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm text-gray-500 font-medium">Alışveriş Yapan Öğrenci</p>
              <p className="text-2xl font-bold text-navy mt-1">{ogrenciGruplari.length}</p>
            </div>
          </div>

          {urunKirilimi.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
              <p className="px-4 pt-4 pb-1 font-semibold text-navy text-sm">Ürün Bazında Kırılım (Kurum Geneli)</p>
              <div className="overflow-x-auto" style={{ touchAction: 'pan-x pan-y' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="px-4 py-2 font-medium">Ürün</th>
                      <th className="px-4 py-2 font-medium text-right">Adet</th>
                      <th className="px-4 py-2 font-medium text-right">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {urunKirilimi.map(([ad, v]) => (
                      <tr key={ad} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-2">{ad}</td>
                        <td className="px-4 py-2 text-right">{v.adet}</td>
                        <td className="px-4 py-2 text-right font-medium">{paraFormat(v.tutar)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-navy">Öğrenci Bazında Dökümü</h2>
            <button
              type="button"
              onClick={() => {
                setDuzenlenenGrup(null)
                setEkleHedefi((v) => {
                  if (v === 'yeni') return null
                  setYeniTarih(varsayilanYeniTarih())
                  return 'yeni'
                })
              }}
              className="px-3 py-2 rounded-lg bg-navy text-white text-sm font-semibold"
            >
              {ekleHedefi === 'yeni' ? 'Vazgeç' : '+ Yeni Alış Ekle'}
            </button>
          </div>

          {ekleHedefi === 'yeni' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5">
              <div className="grid sm:grid-cols-5 gap-3 items-end">
                <div className="sm:col-span-2 relative">
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Öğrenci</label>
                  <input
                    type="text"
                    value={yeniOgrenciAdi || yeniOgrenciArama}
                    onChange={(e) => {
                      setYeniOgrenciId('')
                      setYeniOgrenciAdi('')
                      setYeniOgrenciArama(e.target.value)
                    }}
                    placeholder="İsim yazmaya başla..."
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                  />
                  {ogrenciAramaSonuclari.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      {ogrenciAramaSonuclari.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => {
                            setYeniOgrenciId(o.id)
                            setYeniOgrenciAdi(o.ad_soyad)
                            setYeniOgrenciArama('')
                          }}
                          className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                        >
                          {o.ad_soyad}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Ürün</label>
                  <select
                    value={yeniUrunId}
                    onChange={(e) => setYeniUrunId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                  >
                    <option value="">Seçin...</option>
                    {urunler.map((u) => (
                      <option key={u.id} value={u.id}>{u.ad} · {paraFormat(u.fiyat)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Adet</label>
                  <input
                    type="number"
                    min="1"
                    value={yeniAdet}
                    onChange={(e) => setYeniAdet(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                  />
                </div>
                {donem !== 'gun' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Tarih</label>
                    <input
                      type="date"
                      value={yeniTarih}
                      onChange={(e) => setYeniTarih(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-end mt-3">
                <button
                  type="button"
                  disabled={kaydediliyor}
                  onClick={() => yeniAlisEkle()}
                  className="px-4 py-2 rounded-lg bg-blue text-white text-sm font-semibold disabled:opacity-50"
                >
                  {kaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </div>
          )}

          {ogrenciGruplari.length === 0 ? (
            <p className="text-sm text-gray-400">{bosMesaji}</p>
          ) : (
            <div className="space-y-4">
              {ogrenciGruplari.map((g) => (
                <div key={g.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <p className="font-semibold text-navy text-sm">{g.ad}</p>
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-semibold text-gray-600">{paraFormat(g.toplam)}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setDuzenlenenGrup(null)
                          setYeniUrunId('')
                          setYeniAdet('1')
                          setEkleHedefi((v) => {
                            if (v === g.id) return null
                            setYeniTarih(varsayilanYeniTarih())
                            return g.id
                          })
                        }}
                        className="px-3 py-1.5 rounded-lg bg-navy text-white text-xs font-semibold"
                      >
                        {ekleHedefi === g.id ? 'Vazgeç' : '+ Alış Ekle'}
                      </button>
                    </div>
                  </div>
                  {ekleHedefi === g.id && (
                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap items-end gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Ürün</label>
                        <select
                          value={yeniUrunId}
                          onChange={(e) => setYeniUrunId(e.target.value)}
                          className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                        >
                          <option value="">Seçin...</option>
                          {urunler.map((u) => (
                            <option key={u.id} value={u.id}>{u.ad} · {paraFormat(u.fiyat)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Adet</label>
                        <input
                          type="number"
                          min="1"
                          value={yeniAdet}
                          onChange={(e) => setYeniAdet(e.target.value)}
                          className="w-20 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                        />
                      </div>
                      {donem !== 'gun' && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Tarih</label>
                          <input
                            type="date"
                            value={yeniTarih}
                            onChange={(e) => setYeniTarih(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue"
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        disabled={kaydediliyor}
                        onClick={() => yeniAlisEkle(g.id)}
                        className="px-4 py-2 rounded-lg bg-blue text-white text-sm font-semibold disabled:opacity-50"
                      >
                        {kaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
                      </button>
                    </div>
                  )}
                  <div className="overflow-x-auto" style={{ touchAction: 'pan-x pan-y' }}>
                    {donem === 'gun' ? (
                      <table className="w-full text-sm">
                        <tbody>
                          {gunlukGrupla(g.id, g.kayitlar).map((grup) => (
                            <tr key={grup.anahtar} className="border-b border-gray-50 last:border-0">
                              {duzenlenenGrup?.anahtar === grup.anahtar ? (
                                <>
                                  <td className="px-4 py-2">
                                    <select
                                      value={duzenlemeUrunId}
                                      onChange={(e) => {
                                        setDuzenlemeUrunId(e.target.value)
                                        const u = urunler.find((x) => x.id === e.target.value)
                                        if (u) setDuzenlemeBirimFiyat(String(u.fiyat))
                                      }}
                                      className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm w-full"
                                    >
                                      <option value="">{grup.urun_adi}</option>
                                      {urunler.map((u) => (
                                        <option key={u.id} value={u.id}>{u.ad}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-2 py-2 text-right w-20">
                                    <input
                                      type="number"
                                      min="1"
                                      value={duzenlemeAdet}
                                      onChange={(e) => setDuzenlemeAdet(e.target.value)}
                                      className="w-16 px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-right"
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-right w-28">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={duzenlemeBirimFiyat}
                                      onChange={(e) => setDuzenlemeBirimFiyat(e.target.value)}
                                      className="w-24 px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-right"
                                    />
                                  </td>
                                  <td className="px-4 py-2 text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      disabled={kaydediliyor}
                                      onClick={() => duzenlemeyiKaydet(grup)}
                                      className="text-blue text-xs font-semibold mr-3 disabled:opacity-50"
                                    >
                                      Kaydet
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDuzenlenenGrup(null)}
                                      className="text-gray-400 text-xs font-semibold"
                                    >
                                      İptal
                                    </button>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-4 py-2">{grup.urun_adi}</td>
                                  <td className="px-2 py-2 text-right text-gray-500">{grup.adet} adet</td>
                                  <td className="px-2 py-2 text-right font-medium">{paraFormat(grup.tutar)}</td>
                                  <td className="px-4 py-2 text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => duzenlemeyeBasla(grup)}
                                      className="text-navy text-xs font-semibold mr-3"
                                    >
                                      Düzenle
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => sil(grup.idler)}
                                      className="text-red-600 text-xs font-semibold"
                                    >
                                      Sil
                                    </button>
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      // Aylık/Tüm Zamanlar: aynı ürün birden fazla kez alınmışsa
                      // tek satırda toplam adediyle gösteriliyor (bkz.
                      // urunBazindaGrupla) — bu yüzden tek bir işleme
                      // eşlenemediğinden Düzenle/Sil yok; o satırı düzeltmek
                      // için Günlük'te ilgili günü bulup oradan yapılabilir.
                      <table className="w-full text-sm">
                        <tbody>
                          {urunBazindaGrupla(g.kayitlar).map(([ad, v]) => (
                            <tr key={ad} className="border-b border-gray-50 last:border-0">
                              <td className="px-4 py-2">{ad}</td>
                              <td className="px-2 py-2 text-right text-gray-500">{v.adet} adet</td>
                              <td className="px-4 py-2 text-right font-medium">{paraFormat(v.tutar)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
