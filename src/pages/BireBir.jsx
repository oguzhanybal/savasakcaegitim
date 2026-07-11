import { useEffect, useMemo, useRef, useState } from 'react'
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

// "HH:MM" formatındaki bir saate dakika ekler (gece yarısını taşırsa 00:00'a sarar) —
// başlangıç saati girilince bitiş saatini otomatik +45 dakika önermek için kullanılır.
function saateDakikaEkle(saat, dakika) {
  if (!saat) return ''
  const [h, m] = saat.split(':').map(Number)
  const toplamDakika = (((h * 60 + m + dakika) % (24 * 60)) + 24 * 60) % (24 * 60)
  const yeniSaat = Math.floor(toplamDakika / 60)
  const yeniDakika = toplamDakika % 60
  return `${String(yeniSaat).padStart(2, '0')}:${String(yeniDakika).padStart(2, '0')}`
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

// "YYYY-MM-DD" formatındaki bir tarihe gün ekler/çıkarır — tarih kutusunun
// yanındaki "Önceki hafta / Sonraki hafta" butonları için kullanılır.
function gunEkle(tarihStr, gunSayisi) {
  const t = new Date(tarihStr + 'T12:00:00')
  t.setDate(t.getDate() + gunSayisi)
  return t.toISOString().slice(0, 10)
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

// ============================================================================
// BİRE BİR DERS EKLE — Tek form: öğrenci, öğretmen, ücret girilir, sonra
// "her hafta tekrarlansın mı?" sorusuna Evet/Hayır cevabı verilir.
//  - Evet  -> haftalık tekrar eden bir "atama" kurulur (gün + saat aralığı ister,
//             çakışma kontrolü yapılır, sonsuza kadar her hafta geçerli olur).
//  - Hayır -> sadece o tarihe özel, tek seferlik bir ders kaydı (bire_bir_yoklama,
//             atama_id boş) oluşturulur, hemen "Geldi" olarak borç eklenir.
// ============================================================================
function BireBirDersEkleForm({ ogrenciler, ogretmenler, atamalar, dersProgrami, onEklendi }) {
  const [ogrenciId, setOgrenciId] = useState('')
  const [ogretmenId, setOgretmenId] = useState('')
  const [dersUcreti, setDersUcreti] = useState('')
  // Çoğu öğrencinin sabit haftalık programı olmadığı için varsayılan (öncelikli)
  // seçenek "Hayır, sadece bu sefer" — sabit programı olanlar için elle "Evet"e geçilir.
  const [tekrarlansin, setTekrarlansin] = useState(false)

  // Haftalık tekrar (Evet) alanları
  const [gun, setGun] = useState(1)
  const [baslangic, setBaslangic] = useState('')
  const [bitis, setBitis] = useState('')

  // Tek seferlik (Hayır) alanları — saat opsiyonel: girilirse kayda saat de damgalanır,
  // girilmezse boş bırakılabilir.
  const [tarih, setTarih] = useState(() => new Date().toISOString().slice(0, 10))
  const [tekBaslangic, setTekBaslangic] = useState('')
  const [tekBitis, setTekBitis] = useState('')

  const [hata, setHata] = useState('')
  const [basari, setBasari] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const ogrenciSelectRef = useRef(null)

  // Seçilen öğretmenin, seçilen gündeki tüm dolu saatlerini (hem sınıf dersleri hem
  // diğer bire bir dersleri) tek listede gösterir — sadece "Evet, tekrarlansın"
  // seçiliyken anlamlı, çünkü tek seferlik derste gün bazlı çakışma aranmıyor.
  const buGunMesgulSaatler = useMemo(() => {
    if (!ogretmenId || !tekrarlansin) return []
    const gunNum = Number(gun)
    const sinifDersleri = dersProgrami
      .filter((d) => d.ogretmen_profile_id === ogretmenId && d.gun === gunNum)
      .map((d) => ({
        baslangic: d.baslangic_saat,
        bitis: d.bitis_saat,
        etiket: `Sınıf: ${d.ders_adi || d.sinif_adi || 'Ders'}`,
      }))
    const bireBirDersleri = atamalar
      .filter((a) => a.ogretmen_profile_id === ogretmenId && a.gun === gunNum && a.aktif)
      .map((a) => ({
        baslangic: a.baslangic_saat,
        bitis: a.bitis_saat,
        etiket: `Bire Bir: ${a.ogrenci_adi || 'Öğrenci'}`,
      }))
    return [...sinifDersleri, ...bireBirDersleri].sort((x, y) =>
      saatKisalt(x.baslangic) < saatKisalt(y.baslangic) ? -1 : 1
    )
  }, [ogretmenId, gun, dersProgrami, atamalar, tekrarlansin])

  // Bu öğrenci-öğretmen ikilisi için daha önce girilmiş bir ücret varsa (haftalık
  // bir atamada zaten kayıtlıysa) otomatik dolduruyoruz — elle tekrar yazmaya
  // gerek kalmasın diye. Kullanıcı isterse üzerine yazıp değiştirebilir.
  function fiyatiOner(ogrenciIdParam, ogretmenIdParam) {
    if (!ogrenciIdParam || !ogretmenIdParam) return
    const eslesen = atamalar.find(
      (a) => a.ogrenci_id === ogrenciIdParam && a.ogretmen_profile_id === ogretmenIdParam
    )
    if (eslesen) setDersUcreti(String(eslesen.ders_ucreti))
  }

  async function ekle(e) {
    e.preventDefault()
    setHata('')
    setBasari('')

    if (!ogrenciId || !ogretmenId || !dersUcreti) {
      setHata('Lütfen öğrenci, öğretmen ve ders ücretini girin.')
      return
    }

    if (tekrarlansin) {
      if (!baslangic || !bitis) {
        setHata('Lütfen başlangıç ve bitiş saatini girin.')
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
        // Aynı öğrenci/öğretmene haftanın birden çok gününe art arda ders eklerken
        // öğrenci, öğretmen ve ücret korunuyor, sadece saatleri temizliyoruz ve gün
        // otomatik bir sonraki güne geçiyor.
        setBaslangic('')
        setBitis('')
        setGun((g) => (Number(g) < 7 ? Number(g) + 1 : 1))
        setBasari('✓ Her hafta tekrarlanacak şekilde eklendi — devam edebilirsiniz.')
        onEklendi()
      }
    } else {
      if (!tarih) {
        setHata('Lütfen tarihi girin.')
        return
      }
      if (tekBaslangic && tekBitis && tekBaslangic >= tekBitis) {
        setHata('Başlangıç saati bitiş saatinden önce olmalı.')
        return
      }

      setGonderiliyor(true)
      const { error } = await supabase.from('bire_bir_yoklama').insert({
        ogrenci_id: ogrenciId,
        ogretmen_profile_id: ogretmenId,
        tutar: Number(dersUcreti),
        tarih,
        durum: 'geldi',
        baslangic_saat: tekBaslangic || null,
        bitis_saat: tekBitis || null,
      })
      setGonderiliyor(false)
      if (error) {
        setHata('Hata: ' + error.message)
      } else {
        // Art arda çok sayıda tek seferlik ders eklerken (aynı gün / aynı öğretmen
        // / aynı ücret sık tekrar ettiği için) sadece öğrenciyi sıfırlıyoruz.
        setOgrenciId('')
        setBasari('✓ Tek seferlik ders eklendi — devam edebilirsiniz.')
        ogrenciSelectRef.current?.focus()
        onEklendi()
      }
    }
  }

  return (
    <form onSubmit={ekle} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
      <p className="font-semibold text-gray-700 mb-3">Bire Bir Ders Ekle</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Öğrenci</label>
          <select
            ref={ogrenciSelectRef}
            value={ogrenciId}
            onChange={(e) => {
              const v = e.target.value
              setOgrenciId(v)
              fiyatiOner(v, ogretmenId)
            }}
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
            onChange={(e) => {
              const v = e.target.value
              setOgretmenId(v)
              fiyatiOner(ogrenciId, v)
            }}
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
      </div>

      <div className="mt-4 bg-gray-50 border border-gray-100 rounded-lg p-3">
        <p className="text-sm font-medium text-gray-700 mb-2">Bu ders her hafta aynı gün tekrarlansın mı?</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTekrarlansin(true)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              tekrarlansin ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            Evet, her hafta tekrarlansın
          </button>
          <button
            type="button"
            onClick={() => setTekrarlansin(false)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              !tekrarlansin ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            Hayır, sadece bu sefer
          </button>
        </div>

        {tekrarlansin ? (
          <div className="flex flex-wrap gap-3 items-end mt-3">
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
                onChange={(e) => {
                  const yeniBaslangic = e.target.value
                  setBaslangic(yeniBaslangic)
                  setBitis(saateDakikaEkle(yeniBaslangic, 45))
                }}
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
              <p className="text-[11px] text-gray-400 mt-0.5">Otomatik +45dk önerilir, değiştirilebilir.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 items-end mt-3">
            <div className="min-w-[150px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tarih</label>
              <input
                type="date"
                value={tarih}
                onChange={(e) => setTarih(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>
            <div className="min-w-[110px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Başlangıç (opsiyonel)</label>
              <input
                type="time"
                value={tekBaslangic}
                onChange={(e) => {
                  const yeniBaslangic = e.target.value
                  setTekBaslangic(yeniBaslangic)
                  setTekBitis(yeniBaslangic ? saateDakikaEkle(yeniBaslangic, 45) : '')
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>
            <div className="min-w-[110px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Bitiş</label>
              <input
                type="time"
                value={tekBitis}
                onChange={(e) => setTekBitis(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
              />
              <p className="text-[11px] text-gray-400 mt-0.5">Girerseniz otomatik +45dk önerilir, değiştirilebilir.</p>
            </div>
            <p className="text-xs text-gray-400 pb-2 basis-full">
              Bu ders sadece seçtiğiniz tarihte geçerli olur, tekrar etmez. Öğrencinin hesabına hemen borç eklenir.
            </p>
          </div>
        )}

        {tekrarlansin && ogretmenId && (
          <div className="mt-3 bg-white border border-gray-100 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-600 mb-1.5">
              {ogretmenler.find((o) => o.id === ogretmenId)?.ad_soyad} — {GUNLER[Number(gun)]} günü dolu saatler:
            </p>
            {buGunMesgulSaatler.length === 0 ? (
              <p className="text-xs text-green-600">Bu gün için kayıtlı ders yok, tüm saatler boş.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {buGunMesgulSaatler.map((s, i) => (
                  <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-700">
                    {saatKisalt(s.baslangic)}–{saatKisalt(s.bitis)} · {s.etiket}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={gonderiliyor}
        className="mt-4 bg-orange text-white font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {gonderiliyor ? 'Ekleniyor...' : 'Ekle'}
      </button>

      {hata && <p className="text-red-600 text-sm mt-3">{hata}</p>}
      {!hata && basari && <p className="text-green-600 text-sm mt-3">{basari}</p>}
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
            onChange={(e) => {
              const yeniBaslangic = e.target.value
              setBaslangic(yeniBaslangic)
              setBitis(saateDakikaEkle(yeniBaslangic, 45))
            }}
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
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto mb-6">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="font-semibold text-gray-700">Haftalık Tekrar Eden Dersler (Atamalar)</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Bunlar "Evet, her hafta tekrarlansın" ile eklenen, sabit programı olan öğrenciler. Öğretmen yanlış
          girildiyse "Düzenle" ile gün/saat/öğretmen/ücreti düzeltebilirsiniz.
        </p>
      </div>
      <table className="w-full text-sm min-w-[760px]">
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
            <tr><td colSpan={6} className="px-4 py-4 text-center text-gray-400">Henüz haftalık tekrar eden bir atama yok.</td></tr>
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
    // Mevcut kayıt varsa ve durum gerçekten değişiyorsa (ör. yanlışlıkla "Geldi"
    // işaretlenmiş kaydı "Gelmedi"ye çevirmek gibi) onay iste — bu, öğrencinin
    // borcunu da etkileyen bir değişiklik olduğu için yanlışlıkla tıklamaya karşı.
    if (mevcutKayit && mevcutKayit.durum !== durum) {
      const mesaj =
        mevcutKayit.durum === 'geldi'
          ? 'Bu kayıt "Geldi" olarak işaretliydi ve öğrenciye ders ücreti borç olarak eklenmişti. "Gelmedi" yapmak istediğinize emin misiniz? (borç kaydı kaldırılacak)'
          : 'Bu kaydın durumunu değiştirmek istediğinize emin misiniz?'
      if (!confirm(mesaj)) return
    }
    setGonderiliyor(true)
    // O anki ders ücretini de kayda "damgalıyoruz" (tutar alanı) — ileride ücret
    // zam görürse, geçmişte zaten "Geldi" işaretlenmiş kayıtların borcu değişmesin,
    // sadece o günkü fiyatla sabit kalsın diye.
    const { error } = await supabase
      .from('bire_bir_yoklama')
      .upsert(
        { atama_id: atama.id, tarih, durum, tutar: atama.ders_ucreti },
        { onConflict: 'atama_id,tarih' }
      )
    setGonderiliyor(false)
    if (error) alert('Hata: ' + error.message)
    else onDegisti()
  }

  async function kaydiSil() {
    if (!mevcutKayit) return
    const mesaj =
      mevcutKayit.durum === 'geldi'
        ? 'Bu "Geldi" kaydını tamamen silmek istediğinize emin misiniz? Öğrenciye eklenen ders ücreti borcu da kaldırılacak.'
        : 'Bu yoklama kaydını silmek istediğinize emin misiniz?'
    if (!confirm(mesaj)) return
    setGonderiliyor(true)
    const { error } = await supabase.from('bire_bir_yoklama').delete().eq('id', mevcutKayit.id)
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
          <button
            type="button"
            onClick={() => setTarih((t) => gunEkle(t, -7))}
            title="Önceki hafta"
            className="px-2 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100"
          >
            ◀
          </button>
          <input
            type="date"
            value={tarih}
            onChange={(e) => setTarih(e.target.value)}
            className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
          />
          <button
            type="button"
            onClick={() => setTarih((t) => gunEkle(t, 7))}
            title="Sonraki hafta"
            className="px-2 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100"
          >
            ▶
          </button>
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
          {mevcutKayit && (
            <button
              onClick={kaydiSil}
              disabled={gonderiliyor}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              title="Bu tarihteki yoklama kaydını tamamen sil"
            >
              Kaydı Sil
            </button>
          )}
        </div>
      </div>
      {gecmis.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {gecmis.map((y) => (
            <button
              key={y.id}
              type="button"
              onClick={() => setTarih(y.tarih)}
              title="Bu kaydı düzenlemek veya silmek için tıklayın"
              className={`text-[11px] px-1.5 py-0.5 rounded hover:ring-1 hover:ring-offset-1 transition-shadow ${
                y.durum === 'geldi'
                  ? 'bg-green-50 text-green-700 hover:ring-green-300'
                  : 'bg-red-50 text-red-600 hover:ring-red-300'
              } ${y.tarih === tarih ? 'ring-1 ring-offset-1 ring-navy' : ''}`}
            >
              {new Date(y.tarih + 'T12:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}: {y.durum === 'geldi' ? 'Geldi' : 'Gelmedi'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TekSeferlikDerslerListesi({ yoklamalar, ogrenciAdMap, ogretmenAdMap, onDegisti }) {
  const tekSeferlikler = yoklamalar
    .filter((y) => !y.atama_id)
    .sort((a, b) => (a.tarih < b.tarih ? 1 : -1))
    .slice(0, 15)

  async function sil(id) {
    if (!confirm('Bu tek seferlik ders kaydını silmek istediğinize emin misiniz?')) return
    const { error } = await supabase.from('bire_bir_yoklama').delete().eq('id', id)
    if (error) alert('Hata: ' + error.message)
    else onDegisti()
  }

  if (tekSeferlikler.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto mb-6">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="font-semibold text-gray-700">Son Tek Seferlik Dersler</h2>
        <p className="text-xs text-gray-400 mt-0.5">"Hayır, sadece bu sefer" ile eklenen, tekrar etmeyen dersler.</p>
      </div>
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="px-4 py-2 font-medium">Tarih</th>
            <th className="px-4 py-2 font-medium">Saat</th>
            <th className="px-4 py-2 font-medium">Öğrenci</th>
            <th className="px-4 py-2 font-medium">Öğretmen</th>
            <th className="px-4 py-2 font-medium">Tutar</th>
            <th className="px-4 py-2 font-medium text-right">İşlemler</th>
          </tr>
        </thead>
        <tbody>
          {tekSeferlikler.map((y) => (
            <tr key={y.id} className="border-t border-gray-50">
              <td className="px-4 py-2">{new Date(y.tarih + 'T12:00:00').toLocaleDateString('tr-TR')}</td>
              <td className="px-4 py-2 text-gray-500">
                {y.baslangic_saat ? `${saatKisalt(y.baslangic_saat)}${y.bitis_saat ? '–' + saatKisalt(y.bitis_saat) : ''}` : '—'}
              </td>
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
  const [sadeceBugun, setSadeceBugun] = useState(true)
  const [yoklamaArama, setYoklamaArama] = useState('')

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

  const bugunGun = useMemo(() => {
    const g = new Date().getDay()
    return g === 0 ? 7 : g
  }, [])

  const gorunenAtamalar = useMemo(() => {
    const aranan = yoklamaArama.trim().toLowerCase()
    return atamalar
      .filter((a) => !sadeceAktif || a.aktif)
      .filter((a) => !sadeceBugun || a.gun === bugunGun)
      .filter((a) => {
        if (!aranan) return true
        return (
          (a.ogrenci_adi || '').toLowerCase().includes(aranan) ||
          (a.ogretmen_adi || '').toLowerCase().includes(aranan)
        )
      })
  }, [atamalar, sadeceAktif, sadeceBugun, yoklamaArama, bugunGun])

  const ogrenciAdMap = useMemo(() => new Map(ogrenciler.map((o) => [o.id, o.ad_soyad])), [ogrenciler])
  const ogretmenAdMap = useMemo(() => new Map(ogretmenler.map((o) => [o.id, o.ad_soyad])), [ogretmenler])

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6">{isYonetici ? 'Bire Bir Dersler' : 'Bire Bir Derslerim'}</h1>

      {isYonetici && (
        <>
          <BireBirDersEkleForm
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
          <TekSeferlikDerslerListesi
            yoklamalar={yoklamalar}
            ogrenciAdMap={ogrenciAdMap}
            ogretmenAdMap={ogretmenAdMap}
            onDegisti={veriyiYenile}
          />
        </>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-semibold text-gray-700">Yoklama Al</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              "Geldi" işaretlenince ilgili öğrencinin hesabına o dersin ücreti otomatik borç olarak eklenir.
              {!isYonetici && ' Ders ücretleri sadece yönetim tarafından görülür.'}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="text"
              value={yoklamaArama}
              onChange={(e) => setYoklamaArama(e.target.value)}
              placeholder="Öğrenci / öğretmen ara..."
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue min-w-[160px]"
            />
            <label className="flex items-center gap-2 text-sm text-gray-600 select-none">
              <input type="checkbox" checked={sadeceBugun} onChange={(e) => setSadeceBugun(e.target.checked)} />
              Sadece bugünün dersleri
            </label>
            {isYonetici && (
              <label className="flex items-center gap-2 text-sm text-gray-600 select-none">
                <input type="checkbox" checked={sadeceAktif} onChange={(e) => setSadeceAktif(e.target.checked)} />
                Sadece aktif atamalar
              </label>
            )}
          </div>
        </div>
        <div className="divide-y divide-gray-50">
          {gorunenAtamalar.length === 0 && (
            <p className="px-4 py-4 text-center text-gray-400 text-sm">
              Gösterilecek atama yok.{' '}
              {sadeceBugun && (
                <button onClick={() => setSadeceBugun(false)} className="text-blue hover:underline">
                  Tüm haftayı göster
                </button>
              )}
            </p>
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
