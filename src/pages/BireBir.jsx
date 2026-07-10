import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { paraFormat } from '../lib/ekstreHesap'

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const GUNLER_KISA = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

function saatKisalt(s) {
  return s ? s.slice(0, 5) : s
}

function araliklarCakisiyorMu(b1, s1, b2, s2) {
  return saatKisalt(b1) < saatKisalt(s2) && saatKisalt(b2) < saatKisalt(s1)
}

// Verilen haftanın gününe (1=Pzt...7=Paz) denk gelen, İÇİNDE BULUNULAN HAFTAdaki
// tarihi hesaplar — yoklama alırken tarih kutusunun varsayılan değeri bu olsun diye.
function buHaftaGunTarihi(hedefGun) {
  const bugun = new Date()
  const bugunGun = bugun.getDay() === 0 ? 7 : bugun.getDay()
  const fark = hedefGun - bugunGun
  const tarih = new Date(bugun)
  tarih.setDate(bugun.getDate() + fark)
  return tarih.toISOString().slice(0, 10)
}

// Yeni bir bire bir atamasının (öğretmen + gün + saat), o öğretmenin sınıf ders
// programıyla ya da başka bir bire bir dersiyle çakışıp çakışmadığını kontrol eder.
function cakismaBul({ ogretmenId, gun, baslangic, bitis, haricAtamaId }, dersProgrami, atamalar) {
  if (!ogretmenId || !baslangic || !bitis) return null

  for (const d of dersProgrami) {
    if (d.gun !== gun || d.ogretmen_profile_id !== ogretmenId) continue
    if (!araliklarCakisiyorMu(baslangic, bitis, d.baslangic_saat, d.bitis_saat)) continue
    return {
      aciklama: `bu öğretmenin ${GUNLER[d.gun]} günü ${saatKisalt(d.baslangic_saat)}–${saatKisalt(d.bitis_saat)} arası "${d.ders_adi || d.sinif_adi}" sınıf dersi var`,
    }
  }

  for (const a of atamalar) {
    if (a.id === haricAtamaId) continue
    if (!a.aktif || a.gun !== gun || a.ogretmen_profile_id !== ogretmenId) continue
    if (!araliklarCakisiyorMu(baslangic, bitis, a.baslangic_saat, a.bitis_saat)) continue
    return {
      aciklama: `bu öğretmenin ${GUNLER[a.gun]} günü ${saatKisalt(a.baslangic_saat)}–${saatKisalt(a.bitis_saat)} arası "${a.ogrenci_adi}" ile bire bir dersi var`,
    }
  }

  return null
}

function AtamaEkleForm({ ogrenciler, ogretmenler, atamalar, dersProgrami, onEklendi }) {
  const [ogrenciId, setOgrenciId] = useState('')
  const [ogretmenId, setOgretmenId] = useState('')
  const [dersUcreti, setDersUcreti] = useState('')
  const [gun, setGun] = useState(1)
  const [baslangic, setBaslangic] = useState('')
  const [bitis, setBitis] = useState('')
  const [hata, setHata] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)

  async function ekle(e) {
    e.preventDefault()
    setHata('')
    if (!ogrenciId || !ogretmenId || !dersUcreti || !baslangic || !bitis) {
      setHata('Lütfen tüm alanları doldurun.')
      return
    }
    if (baslangic >= bitis) {
      setHata('Başlangıç saati bitiş saatinden önce olmalı.')
      return
    }

    const cakisma = cakismaBul({ ogretmenId, gun: Number(gun), baslangic, bitis }, dersProgrami, atamalar)
    if (cakisma) {
      setHata(`Çakışma var: ${cakisma.aciklama}.`)
      return
    }

    setGonderiliyor(true)
    const { error } = await supabase.from('bire_bir_atamalari').insert({
      ogrenci_id: ogrenciId,
      ogretmen_profile_id: ogretmenId,
      ders_ucreti: Number(dersUcreti),
      gun: Number(gun),
      baslangic_saat: baslangic,
      bitis_saat: bitis,
    })
    setGonderiliyor(false)
    if (error) {
      setHata('Hata: ' + error.message)
    } else {
      setOgrenciId('')
      setOgretmenId('')
      setDersUcreti('')
      setBaslangic('')
      setBitis('')
      onEklendi()
    }
  }

  return (
    <form onSubmit={ekle} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
      <p className="font-semibold text-gray-700 mb-3">Yeni Bire Bir Ataması</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Öğrenci</label>
          <select
            value={ogrenciId}
            onChange={(e) => setOgrenciId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            <option value="">Seçiniz...</option>
            {ogrenciler.map((o) => (
              <option key={o.id} value={o.id}>{o.ad_soyad}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Öğretmen</label>
          <select
            value={ogretmenId}
            onChange={(e) => setOgretmenId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            <option value="">Seçiniz...</option>
            {ogretmenler.map((o) => (
              <option key={o.id} value={o.id}>{o.brans ? `${o.ad_soyad} — ${o.brans}` : o.ad_soyad}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[130px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Ders Ücreti (₺)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={dersUcreti}
            onChange={(e) => setDersUcreti(e.target.value)}
            placeholder="1500"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
        <div className="min-w-[130px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Gün</label>
          <select
            value={gun}
            onChange={(e) => setGun(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            {GUNLER.slice(1).map((g, i) => (
              <option key={i + 1} value={i + 1}>{g}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[110px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Başlangıç</label>
          <input
            type="time"
            value={baslangic}
            onChange={(e) => setBaslangic(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
        <div className="min-w-[110px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Bitiş</label>
          <input
            type="time"
            value={bitis}
            onChange={(e) => setBitis(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
        <button
          type="submit"
          disabled={gonderiliyor}
          className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {gonderiliyor ? 'Ekleniyor...' : 'Ata'}
        </button>
      </div>
      {hata && <p className="text-red-600 text-sm mt-3">{hata}</p>}
    </form>
  )
}

function AtamaDuzenleSatiri({ a, ogretmenler, atamalar, dersProgrami, onKaydedildi, onVazgec }) {
  const [ogretmenId, setOgretmenId] = useState(a.ogretmen_profile_id)
  const [dersUcreti, setDersUcreti] = useState(String(a.ders_ucreti))
  const [gun, setGun] = useState(a.gun)
  const [baslangic, setBaslangic] = useState(saatKisalt(a.baslangic_saat))
  const [bitis, setBitis] = useState(saatKisalt(a.bitis_saat))
  const [hata, setHata] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)

  async function kaydet() {
    setHata('')
    if (!ogretmenId || !dersUcreti || !baslangic || !bitis) {
      setHata('Lütfen tüm alanları doldurun.')
      return
    }
    if (baslangic >= bitis) {
      setHata('Başlangıç saati bitiş saatinden önce olmalı.')
      return
    }

    const cakisma = cakismaBul(
      { ogretmenId, gun: Number(gun), baslangic, bitis, haricAtamaId: a.id },
      dersProgrami,
      atamalar
    )
    if (cakisma) {
      setHata(`Çakışma var: ${cakisma.aciklama}.`)
      return
    }

    setGonderiliyor(true)
    const { error } = await supabase
      .from('bire_bir_atamalari')
      .update({
        ogretmen_profile_id: ogretmenId,
        ders_ucreti: Number(dersUcreti),
        gun: Number(gun),
        baslangic_saat: baslangic,
        bitis_saat: bitis,
      })
      .eq('id', a.id)
    setGonderiliyor(false)
    if (error) setHata('Hata: ' + error.message)
    else onKaydedildi()
  }

  return (
    <tr className="border-t border-gray-50 bg-blue-50">
      <td className="px-4 py-2 font-medium text-gray-800 align-top">{a.ogrenci_adi}</td>
      <td className="px-4 py-2 align-top" colSpan={4}>
        <div className="flex flex-wrap gap-2 items-end">
          <select
            value={ogretmenId}
            onChange={(e) => setOgretmenId(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            {ogretmenler.map((o) => (
              <option key={o.id} value={o.id}>{o.brans ? `${o.ad_soyad} — ${o.brans}` : o.ad_soyad}</option>
            ))}
          </select>
          <select
            value={gun}
            onChange={(e) => setGun(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            {GUNLER.slice(1).map((g, i) => (
              <option key={i + 1} value={i + 1}>{g}</option>
            ))}
          </select>
          <input
            type="time"
            value={baslangic}
            onChange={(e) => setBaslangic(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
          <input
            type="time"
            value={bitis}
            onChange={(e) => setBitis(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={dersUcreti}
            onChange={(e) => setDersUcreti(e.target.value)}
            placeholder="Ders Ücreti"
            className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        {hata && <p className="text-red-600 text-xs mt-2">{hata}</p>}
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap align-top space-x-3">
        <button onClick={kaydet} disabled={gonderiliyor} className="text-green-600 text-sm font-semibold hover:underline disabled:opacity-50">
          {gonderiliyor ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
        <button onClick={onVazgec} className="text-gray-500 text-sm hover:underline">Vazgeç</button>
      </td>
    </tr>
  )
}

function AtamaListesi({ atamalar, ogretmenler, dersProgrami, onDegisti }) {
  const [duzenlenenId, setDuzenlenenId] = useState(null)

  async function aktiflikDegistir(a) {
    const { error } = await supabase.from('bire_bir_atamalari').update({ aktif: !a.aktif }).eq('id', a.id)
    if (error) alert('Hata: ' + error.message)
    else onDegisti()
  }

  async function sil(id) {
    if (!confirm('Bu atamayı ve tüm yoklama geçmişini silmek istediğinize emin misiniz?')) return
    const { error } = await supabase.from('bire_bir_atamalari').delete().eq('id', id)
    if (error) alert('Hata: ' + error.message)
    else onDegisti()
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="font-semibold text-gray-700">Atamalar</h2>
        <p className="text-xs text-gray-400 mt-0.5">Öğretmen yanlış girildiyse "Düzenle" ile gün/saat/öğretmen/ücreti düzeltebilirsiniz.</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="px-4 py-2 font-medium">Öğrenci</th>
            <th className="px-4 py-2 font-medium">Öğretmen</th>
            <th className="px-4 py-2 font-medium">Gün / Saat</th>
            <th className="px-4 py-2 font-medium">Ders Ücreti</th>
            <th className="px-4 py-2 font-medium">Durum</th>
            <th className="px-4 py-2 font-medium text-right">İşlemler</th>
          </tr>
        </thead>
        <tbody>
          {atamalar.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-4 text-center text-gray-400">Henüz atama yok.</td></tr>
          )}
          {atamalar.map((a) =>
            duzenlenenId === a.id ? (
              <AtamaDuzenleSatiri
                key={a.id}
                a={a}
                ogretmenler={ogretmenler}
                atamalar={atamalar}
                dersProgrami={dersProgrami}
                onKaydedildi={() => { setDuzenlenenId(null); onDegisti() }}
                onVazgec={() => setDuzenlenenId(null)}
              />
            ) : (
              <tr key={a.id} className="border-t border-gray-50">
                <td className="px-4 py-2 font-medium text-gray-800">{a.ogrenci_adi}</td>
                <td className="px-4 py-2">{a.ogretmen_adi}</td>
                <td className="px-4 py-2">{GUNLER_KISA[a.gun]} {saatKisalt(a.baslangic_saat)}–{saatKisalt(a.bitis_saat)}</td>
                <td className="px-4 py-2">{paraFormat(a.ders_ucreti)}</td>
                <td className="px-4 py-2">
                  {a.aktif ? (
                    <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-full">Aktif</span>
                  ) : (
                    <span className="text-xs font-semibold bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Pasif</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap space-x-3">
                  <button onClick={() => setDuzenlenenId(a.id)} className="text-navy text-sm hover:underline">
                    Düzenle
                  </button>
                  <button onClick={() => aktiflikDegistir(a)} className="text-blue text-sm hover:underline">
                    {a.aktif ? 'Pasif Yap' : 'Aktif Yap'}
                  </button>
                  <button onClick={() => sil(a.id)} className="text-red-500 text-sm hover:underline">
                    Sil
                  </button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  )
}

function YoklamaSatiri({ atama, yoklamalar, onDegisti, ucretGorunur }) {
  const [tarih, setTarih] = useState(() => buHaftaGunTarihi(atama.gun))
  const [gonderiliyor, setGonderiliyor] = useState(false)

  const mevcutKayit = yoklamalar.find((y) => y.atama_id === atama.id && y.tarih === tarih)
  const gecmis = yoklamalar
    .filter((y) => y.atama_id === atama.id)
    .sort((a, b) => (a.tarih < b.tarih ? 1 : -1))
    .slice(0, 5)

  async function isaretle(durum) {
    setGonderiliyor(true)
    const { error } = await supabase
      .from('bire_bir_yoklama')
      .upsert({ atama_id: atama.id, tarih, durum }, { onConflict: 'atama_id,tarih' })
    setGonderiliyor(false)
    if (error) alert('Hata: ' + error.message)
    else onDegisti()
  }

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-800">{atama.ogrenci_adi}</p>
          <p className="text-xs text-gray-400">
            {atama.ogretmen_adi ? `${atama.ogretmen_adi} · ` : ''}
            {GUNLER[atama.gun]} {saatKisalt(atama.baslangic_saat)}–{saatKisalt(atama.bitis_saat)}
            {ucretGorunur ? ` · ${paraFormat(atama.ders_ucreti)} / ders` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={tarih}
            onChange={(e) => setTarih(e.target.value)}
            className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
          />
          <button
            onClick={() => isaretle('geldi')}
            disabled={gonderiliyor}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
              mevcutKayit?.durum === 'geldi' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            Geldi
          </button>
          <button
            onClick={() => isaretle('gelmedi')}
            disabled={gonderiliyor}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
              mevcutKayit?.durum === 'gelmedi' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'
            }`}
          >
            Gelmedi
          </button>
        </div>
      </div>
      {gecmis.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {gecmis.map((y) => (
            <span
              key={y.id}
              className={`text-[11px] px-1.5 py-0.5 rounded ${y.durum === 'geldi' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}
            >
              {new Date(y.tarih + 'T12:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}: {y.durum === 'geldi' ? 'Geldi' : 'Gelmedi'}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// Asıl atanan öğrenci o gün gelmediğinde, öğretmenin boşta kalan saatinde
// BAŞKA bir öğrenciye verdiği tek seferlik dersi kaydeder — haftalık atama
// kurmaya gerek yoktur, öğrenci hesabına o an borç olarak eklenir.
function EkDersEkleForm({ ogrenciler, ogretmenler, onEklendi }) {
  const [ogrenciId, setOgrenciId] = useState('')
  const [ogretmenId, setOgretmenId] = useState('')
  const [tutar, setTutar] = useState('')
  const [tarih, setTarih] = useState(() => new Date().toISOString().slice(0, 10))
  const [hata, setHata] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)

  async function ekle(e) {
    e.preventDefault()
    setHata('')
    if (!ogrenciId || !ogretmenId || !tutar || !tarih) {
      setHata('Lütfen tüm alanları doldurun.')
      return
    }
    setGonderiliyor(true)
    const { error } = await supabase.from('bire_bir_yoklama').insert({
      ogrenci_id: ogrenciId,
      ogretmen_profile_id: ogretmenId,
      tutar: Number(tutar),
      tarih,
      durum: 'geldi',
    })
    setGonderiliyor(false)
    if (error) {
      setHata('Hata: ' + error.message)
    } else {
      setOgrenciId('')
      setOgretmenId('')
      setTutar('')
      onEklendi()
    }
  }

  return (
    <form onSubmit={ekle} className="bg-white rounded-2xl border border-orange/30 shadow-sm p-5 mb-6">
      <p className="font-semibold text-gray-700 mb-1">Ek Ders Ekle</p>
      <p className="text-xs text-gray-400 mb-3">
        Asıl atanan öğrenci gelmediğinde, o boşta kalan saatte başka bir öğrenciye verilen tek seferlik dersi
        buradan kaydedin — bunun için haftalık atama kurmanıza gerek yok, öğrencinin hesabına anında borç eklenir.
      </p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Öğrenci</label>
          <select
            value={ogrenciId}
            onChange={(e) => setOgrenciId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            <option value="">Seçiniz...</option>
            {ogrenciler.map((o) => (
              <option key={o.id} value={o.id}>{o.ad_soyad}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Öğretmen</label>
          <select
            value={ogretmenId}
            onChange={(e) => setOgretmenId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            <option value="">Seçiniz...</option>
            {ogretmenler.map((o) => (
              <option key={o.id} value={o.id}>{o.brans ? `${o.ad_soyad} — ${o.brans}` : o.ad_soyad}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[130px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Tarih</label>
          <input
            type="date"
            value={tarih}
            onChange={(e) => setTarih(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
        <div className="min-w-[130px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Ders Ücreti (₺)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={tutar}
            onChange={(e) => setTutar(e.target.value)}
            placeholder="1500"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
        <button
          type="submit"
          disabled={gonderiliyor}
          className="bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {gonderiliyor ? 'Ekleniyor...' : 'Ekle'}
        </button>
      </div>
      {hata && <p className="text-red-600 text-sm mt-3">{hata}</p>}
    </form>
  )
}

function EkDerslerListesi({ yoklamalar, ogrenciAdMap, ogretmenAdMap, onDegisti }) {
  const ekDersler = yoklamalar
    .filter((y) => !y.atama_id)
    .sort((a, b) => (a.tarih < b.tarih ? 1 : -1))
    .slice(0, 15)

  async function sil(id) {
    if (!confirm('Bu ek ders kaydını silmek istediğinize emin misiniz?')) return
    const { error } = await supabase.from('bire_bir_yoklama').delete().eq('id', id)
    if (error) alert('Hata: ' + error.message)
    else onDegisti()
  }

  if (ekDersler.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="font-semibold text-gray-700">Son Ek Dersler</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="px-4 py-2 font-medium">Tarih</th>
            <th className="px-4 py-2 font-medium">Öğrenci</th>
            <th className="px-4 py-2 font-medium">Öğretmen</th>
            <th className="px-4 py-2 font-medium">Tutar</th>
            <th className="px-4 py-2 font-medium text-right">İşlemler</th>
          </tr>
        </thead>
        <tbody>
          {ekDersler.map((y) => (
            <tr key={y.id} className="border-t border-gray-50">
              <td className="px-4 py-2">{new Date(y.tarih + 'T12:00:00').toLocaleDateString('tr-TR')}</td>
              <td className="px-4 py-2 font-medium text-gray-800">{ogrenciAdMap.get(y.ogrenci_id) || '—'}</td>
              <td className="px-4 py-2">{ogretmenAdMap.get(y.ogretmen_profile_id) || '—'}</td>
              <td className="px-4 py-2">{paraFormat(y.tutar)}</td>
              <td className="px-4 py-2 text-right">
                <button onClick={() => sil(y.id)} className="text-red-500 text-sm hover:underline">Sil</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function BireBir() {
  const { profile } = useAuth()
  const isYonetici = profile?.rol === 'yonetici'

  const [ogrenciler, setOgrenciler] = useState([])
  const [ogretmenler, setOgretmenler] = useState([])
  const [dersProgrami, setDersProgrami] = useState([])
  const [atamalar, setAtamalar] = useState([])
  const [yoklamalar, setYoklamalar] = useState([])
  const [loading, setLoading] = useState(true)
  const [sadeceAktif, setSadeceAktif] = useState(true)

  function veriyiYenile() {
    setLoading(true)
    Promise.all([
      isYonetici ? supabase.from('ogrenciler').select('*').order('ad_soyad') : Promise.resolve({ data: [] }),
      isYonetici ? supabase.from('profiles').select('*').eq('rol', 'ogretmen').order('ad_soyad') : Promise.resolve({ data: [] }),
      isYonetici ? supabase.from('ders_programi').select('*') : Promise.resolve({ data: [] }),
      supabase
        .from('bire_bir_atamalari')
        .select('*, ogrenciler(ad_soyad), profiles:ogretmen_profile_id(ad_soyad)')
        .order('gun')
        .order('baslangic_saat'),
      supabase.from('bire_bir_yoklama').select('*'),
    ]).then(([o, og, dp, a, y]) => {
      setOgrenciler(o.data || [])
      setOgretmenler(og.data || [])
      setDersProgrami(dp.data || [])
      setAtamalar(
        (a.data || []).map((d) => ({
          ...d,
          ogrenci_adi: d.ogrenciler?.ad_soyad,
          ogretmen_adi: d.profiles?.ad_soyad,
        }))
      )
      setYoklamalar(y.data || [])
      setLoading(false)
    })
  }

  useEffect(() => {
    veriyiYenile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const gorunenAtamalar = useMemo(
    () => atamalar.filter((a) => !sadeceAktif || a.aktif),
    [atamalar, sadeceAktif]
  )

  const ogrenciAdMap = useMemo(() => new Map(ogrenciler.map((o) => [o.id, o.ad_soyad])), [ogrenciler])
  const ogretmenAdMap = useMemo(() => new Map(ogretmenler.map((o) => [o.id, o.ad_soyad])), [ogretmenler])

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">{isYonetici ? 'Bire Bir Dersler' : 'Bire Bir Derslerim'}</h1>

      {isYonetici && (
        <>
          <AtamaEkleForm
            ogrenciler={ogrenciler}
            ogretmenler={ogretmenler}
            atamalar={atamalar}
            dersProgrami={dersProgrami}
            onEklendi={veriyiYenile}
          />
          <AtamaListesi
            atamalar={atamalar}
            ogretmenler={ogretmenler}
            dersProgrami={dersProgrami}
            onDegisti={veriyiYenile}
          />
          <EkDersEkleForm ogrenciler={ogrenciler} ogretmenler={ogretmenler} onEklendi={veriyiYenile} />
          <EkDerslerListesi
            yoklamalar={yoklamalar}
            ogrenciAdMap={ogrenciAdMap}
            ogretmenAdMap={ogretmenAdMap}
            onDegisti={veriyiYenile}
          />
        </>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-semibold text-gray-700">Yoklama Al</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              "Geldi" işaretlenince ilgili öğrencinin hesabına o dersin ücreti otomatik borç olarak eklenir.
              {!isYonetici && ' Ders ücretleri sadece yönetim tarafından görülür.'}
            </p>
          </div>
          {isYonetici && (
            <label className="flex items-center gap-2 text-sm text-gray-600 select-none">
              <input type="checkbox" checked={sadeceAktif} onChange={(e) => setSadeceAktif(e.target.checked)} />
              Sadece aktif atamalar
            </label>
          )}
        </div>
        <div className="divide-y divide-gray-50">
          {gorunenAtamalar.length === 0 && (
            <p className="px-4 py-4 text-center text-gray-400 text-sm">Gösterilecek atama yok.</p>
          )}
          {gorunenAtamalar.map((a) => (
            <YoklamaSatiri
              key={a.id}
              atama={a}
              yoklamalar={yoklamalar}
              onDegisti={veriyiYenile}
              ucretGorunur={isYonetici}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
