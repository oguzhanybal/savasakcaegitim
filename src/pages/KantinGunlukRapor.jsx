import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { paraFormat } from '../lib/ekstreHesap'

// Yönetici için: seçilen GÜNE ait TÜM kantin alışlarını hem kurum geneli
// (toplam tutar + ürün bazında kırılım) hem öğrenci bazında gösterir, ve o
// güne ait satırları (ürün/adet/fiyat) düzeltme veya silme, ya da unutulmuş
// bir satışı sonradan ekleme imkanı verir. YoklamaRaporu.jsx'teki ◀/▶ gün
// gezinme deseniyle aynı mantık.

function bugunTarihi() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

function tarihKaydir(tarihStr, gunSayisi) {
  const d = new Date(tarihStr + 'T12:00:00')
  d.setDate(d.getDate() + gunSayisi)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function KantinGunlukRapor() {
  const [seciliTarih, setSeciliTarih] = useState(bugunTarihi())
  const [alislar, setAlislar] = useState([])
  const [urunler, setUrunler] = useState([])
  const [ogrenciler, setOgrenciler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const [duzenlenenId, setDuzenlenenId] = useState(null)
  const [duzenlemeUrunId, setDuzenlemeUrunId] = useState('')
  const [duzenlemeAdet, setDuzenlemeAdet] = useState('1')
  const [duzenlemeBirimFiyat, setDuzenlemeBirimFiyat] = useState('')

  const [yeniEkleAcik, setYeniEkleAcik] = useState(false)
  const [yeniOgrenciArama, setYeniOgrenciArama] = useState('')
  const [yeniOgrenciId, setYeniOgrenciId] = useState('')
  const [yeniOgrenciAdi, setYeniOgrenciAdi] = useState('')
  const [yeniUrunId, setYeniUrunId] = useState('')
  const [yeniAdet, setYeniAdet] = useState('1')

  async function veriyiYukle() {
    setYukleniyor(true)
    setHata('')
    const [alisRes, urunRes, ogrenciRes] = await Promise.all([
      supabase
        .from('kantin_alislar')
        .select('*, ogrenciler(ad_soyad)')
        .eq('tarih', seciliTarih)
        .order('created_at', { ascending: true }),
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
    setDuzenlenenId(null)
    setYeniEkleAcik(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seciliTarih])

  const bugunMu = seciliTarih === bugunTarihi()

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
      if (!map.has(a.ogrenci_id)) map.set(a.ogrenci_id, { ad, kayitlar: [], toplam: 0 })
      const g = map.get(a.ogrenci_id)
      g.kayitlar.push(a)
      g.toplam += Number(a.tutar)
    }
    return [...map.values()].sort((a, b) => a.ad.localeCompare(b.ad, 'tr-TR'))
  }, [alislar])

  function duzenlemeyeBasla(a) {
    setYeniEkleAcik(false)
    setDuzenlenenId(a.id)
    setDuzenlemeUrunId(a.urun_id || '')
    setDuzenlemeAdet(String(a.adet))
    setDuzenlemeBirimFiyat(String(a.birim_fiyat))
  }

  async function duzenlemeyiKaydet(a) {
    const adet = Number(duzenlemeAdet)
    const birimFiyat = Number(duzenlemeBirimFiyat)
    if (!adet || adet <= 0) return alert('Adet 0\'dan büyük olmalı.')
    if (!(birimFiyat >= 0)) return alert('Birim fiyat geçersiz.')
    const secilenUrun = urunler.find((u) => u.id === duzenlemeUrunId)
    setKaydediliyor(true)
    const { error } = await supabase
      .from('kantin_alislar')
      .update({
        urun_id: duzenlemeUrunId || null,
        urun_adi: secilenUrun ? secilenUrun.ad : a.urun_adi,
        adet,
        birim_fiyat: birimFiyat,
        tutar: adet * birimFiyat,
      })
      .eq('id', a.id)
    setKaydediliyor(false)
    if (error) return alert('Güncellenemedi: ' + error.message)
    setDuzenlenenId(null)
    veriyiYukle()
  }

  async function sil(id) {
    if (!confirm('Bu alışı silmek istediğine emin misin?')) return
    const { error } = await supabase.from('kantin_alislar').delete().eq('id', id)
    if (error) return alert('Silinemedi: ' + error.message)
    veriyiYukle()
  }

  const ogrenciAramaSonuclari = useMemo(() => {
    const aranan = yeniOgrenciArama.trim().toLocaleLowerCase('tr-TR')
    if (!aranan || yeniOgrenciId) return []
    return ogrenciler.filter((o) => o.ad_soyad.toLocaleLowerCase('tr-TR').includes(aranan)).slice(0, 8)
  }, [ogrenciler, yeniOgrenciArama, yeniOgrenciId])

  async function yeniAlisEkle() {
    if (!yeniOgrenciId) return alert('Önce listeden bir öğrenci seçin.')
    if (!yeniUrunId) return alert('Ürün seçin.')
    const adet = Number(yeniAdet)
    if (!adet || adet <= 0) return alert('Adet 0\'dan büyük olmalı.')
    const urun = urunler.find((u) => u.id === yeniUrunId)
    if (!urun) return alert('Ürün bulunamadı.')
    setKaydediliyor(true)
    const { error } = await supabase.from('kantin_alislar').insert({
      ogrenci_id: yeniOgrenciId,
      urun_id: urun.id,
      urun_adi: urun.ad,
      birim_fiyat: urun.fiyat,
      adet,
      tutar: urun.fiyat * adet,
      tarih: seciliTarih,
    })
    setKaydediliyor(false)
    if (error) return alert('Eklenemedi: ' + error.message)
    setYeniOgrenciArama('')
    setYeniOgrenciId('')
    setYeniOgrenciAdi('')
    setYeniUrunId('')
    setYeniAdet('1')
    setYeniEkleAcik(false)
    veriyiYukle()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-2">Kantin Günlük Rapor</h1>
      <p className="text-sm text-gray-500 mb-6">
        Seçilen güne ait kurum geneli kantin satışı ve öğrenci bazında dökümü — hatalı bir satırı düzeltebilir,
        silebilir ya da unutulmuş bir satışı sonradan ekleyebilirsin.
      </p>

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

      {yukleniyor ? (
        <p className="text-gray-400">Yükleniyor...</p>
      ) : hata ? (
        <p className="text-red-600 text-sm">{hata}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm text-gray-500 font-medium">Bu Günün Toplamı</p>
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
          )}

          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-navy">Öğrenci Bazında Dökümü</h2>
            <button
              type="button"
              onClick={() => { setDuzenlenenId(null); setYeniEkleAcik((v) => !v) }}
              className="px-3 py-2 rounded-lg bg-navy text-white text-sm font-semibold"
            >
              {yeniEkleAcik ? 'Vazgeç' : '+ Yeni Alış Ekle'}
            </button>
          </div>

          {yeniEkleAcik && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5">
              <div className="grid sm:grid-cols-4 gap-3 items-end">
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
              </div>
              <div className="flex justify-end mt-3">
                <button
                  type="button"
                  disabled={kaydediliyor}
                  onClick={yeniAlisEkle}
                  className="px-4 py-2 rounded-lg bg-blue text-white text-sm font-semibold disabled:opacity-50"
                >
                  {kaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </div>
          )}

          {ogrenciGruplari.length === 0 ? (
            <p className="text-sm text-gray-400">Bu güne ait kantin alışı yok.</p>
          ) : (
            <div className="space-y-4">
              {ogrenciGruplari.map((g) => (
                <div key={g.ad + g.kayitlar[0].id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <p className="font-semibold text-navy text-sm">{g.ad}</p>
                    <p className="text-sm font-semibold text-gray-600">{paraFormat(g.toplam)}</p>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {g.kayitlar.map((a) => (
                        <tr key={a.id} className="border-b border-gray-50 last:border-0">
                          {duzenlenenId === a.id ? (
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
                                  <option value="">{a.urun_adi}</option>
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
                                  onClick={() => duzenlemeyiKaydet(a)}
                                  className="text-blue text-xs font-semibold mr-3 disabled:opacity-50"
                                >
                                  Kaydet
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDuzenlenenId(null)}
                                  className="text-gray-400 text-xs font-semibold"
                                >
                                  İptal
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-2">{a.urun_adi}</td>
                              <td className="px-2 py-2 text-right text-gray-500">{a.adet} adet</td>
                              <td className="px-2 py-2 text-right font-medium">{paraFormat(a.tutar)}</td>
                              <td className="px-4 py-2 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => duzenlemeyeBasla(a)}
                                  className="text-navy text-xs font-semibold mr-3"
                                >
                                  Düzenle
                                </button>
                                <button
                                  type="button"
                                  onClick={() => sil(a.id)}
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
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
