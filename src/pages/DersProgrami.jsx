import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { ilkHarfleriBuyukYap } from '../lib/adSoyadFormat'
import MusaitlikTablosu from '../components/MusaitlikTablosu'

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const GUNLER_KISA = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const DERS_ONERILERI = [
  'Matematik', 'Geometri', 'Türkçe/Edebiyat', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya',
  'Felsefe', 'İngilizce', 'Din Kültürü ve Ahlak Bilgisi', 'Beden Eğitimi', 'Fen Bilimleri', 'Sosyal Bilgiler',
]

function saatKisalt(s) {
  return s ? s.slice(0, 5) : s
}

// Bugünün tarihini "YYYY-MM-DD" olarak YEREL saate göre üretir (toISOString
// KULLANMIYORUZ — Türkiye UTC+3 gece yarısına yakın saatlerde bir gün geriye
// kayabiliyor). Aynı desen BireBirDersDokumu.jsx'te de kullanılıyor.
function yerelBugunTarihi() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

function araliklarCakisiyorMu(b1, s1, b2, s2) {
  return saatKisalt(b1) < saatKisalt(s2) && saatKisalt(b2) < saatKisalt(s1)
}

// "HH:MM" formatındaki bir saate dakika ekler — başlangıç saati girilince/
// doldurulunca bitiş saatini otomatik +45 dakika önermek için kullanılır.
function saateDakikaEkle(saat, dakika) {
  if (!saat) return ''
  const [h, m] = saat.split(':').map(Number)
  const toplamDakika = (((h * 60 + m + dakika) % (24 * 60)) + 24 * 60) % (24 * 60)
  const yeniSaat = Math.floor(toplamDakika / 60)
  const yeniDakika = toplamDakika % 60
  return `${String(yeniSaat).padStart(2, '0')}:${String(yeniDakika).padStart(2, '0')}`
}

// Yeni eklenmek istenen ders saatinin, mevcut programla (aynı sınıf ya da aynı
// öğretmen üzerinden — öğretmen artık ders_programi satırından okunuyor) çakışıp
// çakışmadığını kontrol eder.
function cakismaBul({ sinifId, gun, baslangic, bitis, ogretmenId }, program) {
  if (!sinifId || !baslangic || !bitis) return null

  for (const p of program) {
    if (p.gun !== gun) continue
    const ayniSinif = p.sinif_id === sinifId
    const ayniOgretmen = !!ogretmenId && p.ogretmen_profile_id === ogretmenId
    if (!ayniSinif && !ayniOgretmen) continue
    if (!araliklarCakisiyorMu(baslangic, bitis, p.baslangic_saat, p.bitis_saat)) continue

    return {
      tur: ayniSinif ? 'sinif' : 'ogretmen',
      sinifAdi: p.sinif_adi,
      dersAdi: p.ders_adi,
      saat: `${saatKisalt(p.baslangic_saat)}–${saatKisalt(p.bitis_saat)}`,
      gun: GUNLER[p.gun],
    }
  }
  return null
}

function DersEkleForm({ siniflar, ogretmenler, program, onEklendi, doldurBilgisi }) {
  const { profile } = useAuth()
  const [sinifId, setSinifId] = useState('')
  const [dersAdi, setDersAdi] = useState('')
  const [ogretmenId, setOgretmenId] = useState('')
  const [gun, setGun] = useState(1)
  const [baslangic, setBaslangic] = useState('')
  const [bitis, setBitis] = useState('')
  const [hata, setHata] = useState('')
  const [basari, setBasari] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const sinifSelectRef = useRef(null)

  // Müsaitlik tablosunda boş bir hücreye tıklanınca, üstten gelen öğretmen/gün/
  // saat bilgisiyle formu otomatik doldurur ve sınıf seçimine odaklanır (sınıf
  // bilgisi müsaitlik tablosundan gelmediği için elle seçilmesi gerekiyor).
  useEffect(() => {
    if (!doldurBilgisi) return
    setOgretmenId(doldurBilgisi.ogretmenId)
    setGun(doldurBilgisi.gun)
    setBaslangic(doldurBilgisi.baslangic)
    // Müsaitlik tablosundaki hücreler 30dk'lık dilimler olsa da, dersler genelde
    // 45dk sürdüğü için tıklanan dilimin kendi bitişini değil, her zaman
    // başlangıç + 45dk'yı öneriyoruz.
    setBitis(saateDakikaEkle(doldurBilgisi.baslangic, 45))
    setHata('')
    setBasari('')
    sinifSelectRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doldurBilgisi])

  async function ekle(e) {
    e.preventDefault()
    setHata('')
    if (!sinifId || !baslangic || !bitis) {
      setHata('Lütfen sınıf, gün ve saat aralığını doldurun.')
      return
    }
    if (baslangic >= bitis) {
      setHata('Başlangıç saati bitiş saatinden önce olmalı.')
      return
    }

    const cakisma = cakismaBul({ sinifId, gun: Number(gun), baslangic, bitis, ogretmenId }, program)
    if (cakisma) {
      if (cakisma.tur === 'ogretmen') {
        setHata(
          `Çakışma var: bu öğretmen ${cakisma.gun} günü ${cakisma.saat} arasında zaten "${cakisma.dersAdi || cakisma.sinifAdi}" dersinde.`
        )
      } else {
        setHata(`Çakışma var: bu sınıfın ${cakisma.gun} günü ${cakisma.saat} arasında zaten "${cakisma.dersAdi || 'başka bir'}" dersi var.`)
      }
      return
    }

    setGonderiliyor(true)
    const { error } = await supabase.from('ders_programi').insert({
      sinif_id: sinifId,
      gun: Number(gun),
      baslangic_saat: baslangic,
      bitis_saat: bitis,
      ders_adi: dersAdi.trim() ? ilkHarfleriBuyukYap(dersAdi.trim()) : null,
      ogretmen_profile_id: ogretmenId || null,
    })
    setGonderiliyor(false)
    if (error) {
      setHata('Hata: ' + error.message)
    } else {
      setBaslangic('')
      setBitis('')
      setDersAdi('')
      onEklendi()
    }
  }

  // Formu doldurup henüz kesinleşmemiş bir ders saati için "Taslağa Kaydet" —
  // gerçek programa hemen eklemez, taslaklar tablosuna kaydeder. Çakışma kontrolü
  // burada YAPILMAZ; yayınlanırken (Taslaklarım listesinden) kontrol edilir.
  async function taslagaKaydet() {
    setHata('')
    setBasari('')
    if (!sinifId || !baslangic || !bitis) {
      setHata('Lütfen sınıf, gün ve saat aralığını doldurun.')
      return
    }
    setGonderiliyor(true)
    const { error } = await supabase.from('taslaklar').insert({
      tur: 'sinif',
      veri: {
        sinif_id: sinifId,
        gun: Number(gun),
        baslangic_saat: baslangic,
        bitis_saat: bitis,
        ders_adi: dersAdi.trim() ? ilkHarfleriBuyukYap(dersAdi.trim()) : null,
        ogretmen_profile_id: ogretmenId || null,
      },
      olusturan_profile_id: profile?.id,
    })
    setGonderiliyor(false)
    if (error) setHata('Hata: ' + error.message)
    else {
      setBasari('✓ Taslağa kaydedildi — aşağıdaki "Taslaklarım" listesinden yayınlayabilirsiniz.')
      onEklendi()
    }
  }

  return (
    <form id="ders-ekle-formu" onSubmit={ekle} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
      <p className="font-semibold text-gray-700 mb-3">Yeni Ders Saati Ekle</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Sınıf</label>
          <select
            ref={sinifSelectRef}
            value={sinifId}
            onChange={(e) => setSinifId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
          >
            <option value="">Seçiniz...</option>
            {siniflar.map((s) => (
              <option key={s.id} value={s.id}>{s.ad}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Ders Adı</label>
          <input
            list="ders-onerileri-global"
            value={dersAdi}
            onChange={(e) => setDersAdi(e.target.value)}
            placeholder="örn. Matematik"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
          />
          <datalist id="ders-onerileri-global">
            {DERS_ONERILERI.map((d) => <option key={d} value={d} />)}
          </datalist>
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
          {gonderiliyor ? 'Ekleniyor...' : 'Ekle'}
        </button>
        <button
          type="button"
          onClick={taslagaKaydet}
          disabled={gonderiliyor}
          className="bg-white border border-gray-200 text-gray-600 font-semibold px-5 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Taslağa Kaydet
        </button>
      </div>
      {hata && <p className="text-red-600 text-sm mt-3">{hata}</p>}
      {!hata && basari && <p className="text-green-600 text-sm mt-3">{basari}</p>}
    </form>
  )
}

// ============================================================================
// TASLAKLARIM (Ders Programı) — "Yeni Ders Saati Ekle" formundan "Taslağa
// Kaydet" ile biriktirilen, henüz gerçek programa eklenmemiş sınıf dersleri.
// Yönetici tek tek ya da hepsini birden "Yayınla" diyerek ders_programi
// tablosuna aktarabilir. Yayınlarken çakışma kontrolü TEKRAR çalıştırılır —
// taslak kaydedildikten sonra program değişmiş olabilir.
// ============================================================================
function TaslaklarimDersProgrami({ taslaklar, siniflar, ogretmenler, program, onDegisti }) {
  const [gonderiliyorId, setGonderiliyorId] = useState(null)
  const [tumuGonderiliyor, setTumuGonderiliyor] = useState(false)
  const [hataMap, setHataMap] = useState({})

  const sinifAdi = (id) => siniflar.find((s) => s.id === id)?.ad || 'Bilinmeyen sınıf'
  const ogretmenAdi = (id) => ogretmenler.find((o) => o.id === id)?.ad_soyad || null

  async function yayinla(t) {
    const v = t.veri
    const cakisma = cakismaBul(
      { sinifId: v.sinif_id, gun: v.gun, baslangic: v.baslangic_saat, bitis: v.bitis_saat, ogretmenId: v.ogretmen_profile_id },
      program
    )
    if (cakisma) {
      const mesaj =
        cakisma.tur === 'ogretmen'
          ? `Çakışma var: bu öğretmen ${cakisma.gun} günü ${cakisma.saat} arasında zaten "${cakisma.dersAdi || cakisma.sinifAdi}" dersinde.`
          : `Çakışma var: bu sınıfın ${cakisma.gun} günü ${cakisma.saat} arasında zaten "${cakisma.dersAdi || 'başka bir'}" dersi var.`
      setHataMap((h) => ({ ...h, [t.id]: mesaj }))
      return false
    }
    const { error } = await supabase.from('ders_programi').insert({
      sinif_id: v.sinif_id,
      gun: v.gun,
      baslangic_saat: v.baslangic_saat,
      bitis_saat: v.bitis_saat,
      ders_adi: v.ders_adi,
      ogretmen_profile_id: v.ogretmen_profile_id,
    })
    if (error) {
      setHataMap((h) => ({ ...h, [t.id]: 'Hata: ' + error.message }))
      return false
    }
    await supabase.from('taslaklar').delete().eq('id', t.id)
    setHataMap((h) => {
      const yeni = { ...h }
      delete yeni[t.id]
      return yeni
    })
    return true
  }

  async function tekYayinla(t) {
    setGonderiliyorId(t.id)
    await yayinla(t)
    setGonderiliyorId(null)
    onDegisti()
  }

  async function sil(id) {
    if (!confirm('Bu taslağı silmek istediğinize emin misiniz?')) return
    await supabase.from('taslaklar').delete().eq('id', id)
    onDegisti()
  }

  async function tumunuYayinla() {
    setTumuGonderiliyor(true)
    let basarili = 0
    let basarisiz = 0
    for (const t of taslaklar) {
      const sonuc = await yayinla(t)
      if (sonuc) basarili++
      else basarisiz++
    }
    setTumuGonderiliyor(false)
    onDegisti()
    if (basarisiz > 0) {
      alert(`${basarili} taslak yayınlandı, ${basarisiz} tanesi çakışma/hata nedeniyle yayınlanamadı (listede kırmızı olarak görünüyor).`)
    }
  }

  if (taslaklar.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-gray-700">Taslaklarım ({taslaklar.length})</h2>
          <p className="text-xs text-gray-400 mt-0.5">Henüz gerçek programa eklenmemiş ders saatleri. Hazır olduğunda yayınlayın.</p>
        </div>
        <button
          type="button"
          onClick={tumunuYayinla}
          disabled={tumuGonderiliyor}
          className="bg-navy text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {tumuGonderiliyor ? 'Yayınlanıyor...' : 'Tümünü Yayınla'}
        </button>
      </div>
      <div className="divide-y divide-gray-50">
        {taslaklar.map((t) => (
          <div key={t.id} className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-medium text-gray-800">
                {t.veri.ders_adi || sinifAdi(t.veri.sinif_id)} <span className="text-gray-400 font-normal">— {sinifAdi(t.veri.sinif_id)}</span>
              </p>
              <p className="text-xs text-gray-400">
                {GUNLER[t.veri.gun]} · {saatKisalt(t.veri.baslangic_saat)}–{saatKisalt(t.veri.bitis_saat)}
                {ogretmenAdi(t.veri.ogretmen_profile_id) ? ` · ${ogretmenAdi(t.veri.ogretmen_profile_id)}` : ''}
              </p>
              {hataMap[t.id] && <p className="text-xs text-red-600 mt-1">{hataMap[t.id]}</p>}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => tekYayinla(t)}
                disabled={gonderiliyorId === t.id || tumuGonderiliyor}
                className="text-navy text-sm font-semibold hover:underline disabled:opacity-50"
              >
                {gonderiliyorId === t.id ? 'Yayınlanıyor...' : 'Yayınla'}
              </button>
              <button onClick={() => sil(t.id)} className="text-gray-400 text-sm hover:underline">Sil</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Veli ("çocuğumun") ya da öğrenci ("benim") rolüyle giriş yapan kullanıcıya,
// sınıf ders programının YANINDA, çocuğun/kendisinin HAFTALIK BİRE BİR ders
// atamalarını (öğretmen + gün + saat) gösterir. ÖNCEDEN bu bilgi hiçbir yerde
// veliye/öğrenciye gösterilmiyordu — Bire Bir dersleri sadece Ekstre'de,
// ders GERÇEKLEŞİP faturalandıktan SONRA (geçmişe dönük, mali bir kayıt
// olarak) görünüyordu. Burası ise "bu hafta hangi gün/saat dersim var"
// sorusuna cevap veren, ileriye dönük bir program görünümü.
// ÖNEMLİ: bu okulda bire bir derslerin ÇOĞU "Hayır, sadece bu sefer" (tek
// seferlik) olarak giriliyor — yani sabit haftalık bir atama (bire_bir_atamalari)
// DEĞİL, belirli bir TARİHE bağlı tek kayıt (bire_bir_yoklama, atama_id boş)
// olarak kaydediliyor. İlk sürümde bu bölüm SADECE haftalık sabit atamalara
// bakıyordu — tek seferlik dersi olan (ki çoğunluk bu) öğrenciler/veliler
// hiçbir şey göremiyordu. Şimdi ikisini de ayrı ayrı gösteriyoruz.
// tekSeferlikDersler zaten tarihe (sonra saate) göre sıralı geldiği için, art
// arda gelen AYNI tarihli dersleri tek bir grupta topluyoruz — her ders
// satırında tarihi tekrar tekrar yazmak yerine, admin'in "Tüm Bire Bir Dersler
// — Arşiv" tablosundaki gibi tek bir gün başlığı altında gösterilsin diye.
function gunGrupla(dersler) {
  const gruplar = []
  let sonTarih = null
  for (const d of dersler) {
    if (d.tarih !== sonTarih) {
      gruplar.push({ tarih: d.tarih, dersler: [] })
      sonTarih = d.tarih
    }
    gruplar[gruplar.length - 1].dersler.push(d)
  }
  return gruplar
}

function BireBirDerslerimBolumu({ haftalikDersler, tekSeferlikDersler, birdenFazlaCocukMu }) {
  const hicBirSeyYok = (!haftalikDersler || haftalikDersler.length === 0) && (!tekSeferlikDersler || tekSeferlikDersler.length === 0)
  if (hicBirSeyYok) return null
  const gunlereGore = GUNLER.map((_, gun) => (haftalikDersler || []).filter((d) => d.gun === gun)).slice(1)
  const tekSeferlikGunlereGore = tekSeferlikDersler ? gunGrupla(tekSeferlikDersler) : []

  return (
    <div className="space-y-4 mb-6">
      {haftalikDersler && haftalikDersler.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-navy text-white font-semibold">
            {birdenFazlaCocukMu ? 'Bire Bir Dersleri (Her Hafta Tekrarlanan)' : 'Bire Bir Derslerim (Her Hafta Tekrarlanan)'}
          </div>
          <div className="divide-y divide-gray-50">
            {gunlereGore.map((gunDersleri, i) =>
              gunDersleri.length === 0 ? null : (
                <div key={i} className="px-4 py-3">
                  <p className="text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">{GUNLER[i + 1]}</p>
                  <div className="space-y-1.5">
                    {gunDersleri.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-start justify-between gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2"
                      >
                        <div>
                          <p className="font-medium text-navy text-sm">
                            {d.ogretmen_adi}
                            {d.ogretmen_brans && <span className="text-gray-400 font-normal"> — {d.ogretmen_brans}</span>}
                          </p>
                          {birdenFazlaCocukMu && <p className="text-xs text-gray-400">{d.ogrenci_adi}</p>}
                        </div>
                        <p className="text-sm font-bold text-navy whitespace-nowrap shrink-0">
                          {saatKisalt(d.baslangic_saat)}–{saatKisalt(d.bitis_saat)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {tekSeferlikDersler && tekSeferlikDersler.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-navy text-white font-semibold">
            {birdenFazlaCocukMu ? 'Yaklaşan Bire Bir Dersleri (Tekil)' : 'Yaklaşan Bire Bir Derslerim (Tekil)'}
          </div>
          {tekSeferlikGunlereGore.map((grup) => {
            const bugunMu = grup.tarih === yerelBugunTarihi()
            return (
              <div key={grup.tarih}>
                <div className="px-4 py-2.5 bg-slate-100 border-b-2 border-navy flex items-center gap-2">
                  <span className="text-base font-extrabold text-navy">
                    {new Date(grup.tarih + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                  {bugunMu && (
                    <span className="text-[10px] font-bold bg-orange text-white px-2 py-0.5 rounded-full">Bugün</span>
                  )}
                </div>
                <div className="divide-y divide-gray-50">
                  {grup.dersler.map((d) => (
                    // Ad/branş kesilmesin diye truncate KULLANMIYORUZ — gerekirse
                    // alt satıra sarabilir. Ama saat HER ZAMAN satırın sağ üstünde,
                    // ilk satırda sabit kalsın diye "items-start" + saat için
                    // "shrink-0 whitespace-nowrap" kullanılıyor — isim ister tek
                    // satıra sığsın ister sarsın, saatin yeri hiç değişmiyor.
                    <div key={d.id} className="px-4 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium text-gray-800 text-sm">
                          {d.ogretmen_adi}
                          {d.ogretmen_brans ? ` — ${d.ogretmen_brans}` : ''}
                        </p>
                        <p className="text-base font-bold text-navy whitespace-nowrap shrink-0">
                          {d.baslangic_saat ? `${saatKisalt(d.baslangic_saat)}${d.bitis_saat ? '–' + saatKisalt(d.bitis_saat) : ''}` : 'Saat belirtilmemiş'}
                        </p>
                      </div>
                      {birdenFazlaCocukMu && <p className="text-xs text-gray-400 mt-0.5">{d.ogrenci_adi}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function DersProgrami() {
  const { profile } = useAuth()
  const isYonetici = profile?.rol === 'yonetici'
  const isVeliYaDaOgrenci = profile?.rol === 'veli' || profile?.rol === 'ogrenci'

  const [program, setProgram] = useState([])
  const [siniflar, setSiniflar] = useState([])
  const [ogretmenler, setOgretmenler] = useState([])
  const [bireBirAtamalar, setBireBirAtamalar] = useState([])
  const [bireBirYoklamalar, setBireBirYoklamalar] = useState([])
  const [ogrenciler, setOgrenciler] = useState([])
  const [bireBirDerslerim, setBireBirDerslerim] = useState([])
  const [tekSeferlikDerslerim, setTekSeferlikDerslerim] = useState([])
  const [birdenFazlaCocukMu, setBirdenFazlaCocukMu] = useState(false)
  const [taslaklar, setTaslaklar] = useState([])
  const [loading, setLoading] = useState(true)
  const [gorunum, setGorunum] = useState('tablo')
  // Veli/öğrenci için: "Bire Bir" ve "Ders Programı" bölümleri alt alta uzun
  // uzun sıralanmak yerine, sekme (tab) ile geçilerek gösterilir — tıklayınca
  // Bire Bir'e, tıklayınca Ders Programı'na geçer. Sadece veli/öğrenci
  // rolünde anlamlı; yönetici/öğretmen için ikisi zaten ayrı gösteriliyor.
  const [veliSekme, setVeliSekme] = useState('program') // 'birebir' | 'program'
  // Müsaitlik tablosunda boş bir hücreye tıklanınca buraya { ogretmenId, gun,
  // baslangic, bitis } yazılır; DersEkleForm bunu izleyip kendini otomatik doldurur.
  const [doldurBilgisi, setDoldurBilgisi] = useState(null)
  // Tıklanan hücreyi tablo üzerinde koyu işaretlemek için — ders eklenene/
  // taslağa kaydedilene kadar kullanıcı "hangi saate ekliyordum" diye
  // unutmasın diye. dersEklendiVeyaTaslaklandi() içinde temizlenir.
  const [seciliHucre, setSeciliHucre] = useState(null)
  const ilkYuklemeTamamRef = useRef(false)

  function veriyiYenile() {
    if (!ilkYuklemeTamamRef.current) setLoading(true)
    Promise.all([
      supabase
        .from('ders_programi')
        .select('*, siniflar(ad), profiles:ogretmen_profile_id(ad_soyad)')
        .order('gun')
        .order('baslangic_saat'),
      isYonetici ? supabase.from('siniflar').select('*').order('ad') : Promise.resolve({ data: [] }),
      isYonetici ? supabase.from('profiles').select('*').eq('rol', 'ogretmen').order('ad_soyad') : Promise.resolve({ data: [] }),
      // Günlük Müsaitlik tablosunda sınıf derslerinin yanında bire bir dersleri de
      // gösterebilmek için (öğretmen tam olarak boş mu, doluysa neyle dolu).
      isYonetici ? supabase.from('bire_bir_atamalari').select('*, ogrenciler(ad_soyad)') : Promise.resolve({ data: [] }),
      isYonetici ? supabase.from('bire_bir_yoklama').select('*') : Promise.resolve({ data: [] }),
      isYonetici ? supabase.from('ogrenciler').select('id, ad_soyad') : Promise.resolve({ data: [] }),
      // Veli/öğrenci için: kendi çocuğu/kendisi hangi öğrenci kaydına bağlı —
      // bire bir atamalarını bu öğrenci id'si üzerinden çekeceğiz. Muhasebe.jsx
      // ile AYNI, kanıtlanmış yöntem: filtreyi sunucu tarafında ".or()" ile
      // değil, tüm kaydı çekip İSTEMCİ TARAFINDA veli_profile_id/ogrenci_profile_id
      // eşleşmesine göre süzerek yapıyoruz (RLS zaten satırları kısıtlıyor).
      isVeliYaDaOgrenci
        ? supabase.from('ogrenciler').select('id, ad_soyad, veli_profile_id, ogrenci_profile_id')
        : Promise.resolve({ data: [] }),
      isYonetici ? supabase.from('taslaklar').select('*').eq('tur', 'sinif').order('created_at') : Promise.resolve({ data: [] }),
    ]).then(([p, s, og, ba, by, o, kendiCocuklarSonuc, t]) => {
      setTaslaklar(t.data || [])
      setProgram(
        (p.data || []).map((d) => ({
          ...d,
          sinif_adi: d.siniflar?.ad,
          ogretmen_adi: d.profiles?.ad_soyad,
        }))
      )
      setSiniflar(s.data || [])
      setOgretmenler(og.data || [])
      setBireBirAtamalar(
        (ba.data || []).map((a) => ({ ...a, ogrenci_adi: a.ogrenciler?.ad_soyad }))
      )
      setBireBirYoklamalar(by.data || [])
      setOgrenciler(o.data || [])

      if (kendiCocuklarSonuc.error) console.error('Kendi çocuk sorgusu hatası:', kendiCocuklarSonuc.error.message)
      const cocukListesi = (kendiCocuklarSonuc.data || []).filter(
        (c) => c.veli_profile_id === profile.id || c.ogrenci_profile_id === profile.id
      )
      const cocukIdleri = cocukListesi.map((c) => c.id)
      if (isVeliYaDaOgrenci && cocukIdleri.length > 0) {
        setBirdenFazlaCocukMu(cocukIdleri.length > 1)
        const cocukAdMap = new Map(cocukListesi.map((c) => [c.id, c.ad_soyad]))
        Promise.all([
          supabase
            .from('bire_bir_atamalari')
            .select('*, profiles:ogretmen_profile_id(ad_soyad, brans)')
            .in('ogrenci_id', cocukIdleri)
            .eq('aktif', true),
          // ÖNEMLİ: bu okulda bire bir derslerin ÇOĞU "tek seferlik" olarak
          // (atama_id BOŞ, belirli bir tarihe bağlı) bire_bir_yoklama tablosuna
          // giriliyor — sadece yukarıdaki sabit haftalık atamalara bakmak
          // yetmiyordu. Bugünden itibaren (geçmiş dersler zaten Ekstre'de
          // görünüyor) yaklaşan tek seferlik dersleri de ayrıca çekiyoruz.
          supabase
            .from('bire_bir_yoklama')
            .select('*, profiles:ogretmen_profile_id(ad_soyad, brans)')
            .in('ogrenci_id', cocukIdleri)
            .is('atama_id', null)
            .gte('tarih', yerelBugunTarihi())
            // Sadece tarihe göre sıralamak yetmiyor — aynı gün içindeki dersler
            // saat sırasına göre değil, veritabanının döndürdüğü rastgele sırayla
            // geliyordu (ör. 14:55'lik ders 12:00'lik dersten önce görünüyordu).
            // Saati de ikinci sıralama ölçütü olarak eklemek gerekiyor.
            .order('tarih')
            .order('baslangic_saat'),
        ]).then(([atamaSonuc, yoklamaSonuc]) => {
          if (atamaSonuc.error) console.error('Bire bir atamaları sorgusu hatası:', atamaSonuc.error.message)
          if (yoklamaSonuc.error) console.error('Tek seferlik bire bir sorgusu hatası:', yoklamaSonuc.error.message)
          setBireBirDerslerim(
            (atamaSonuc.data || []).map((a) => ({
              ...a,
              ogretmen_adi: a.profiles?.ad_soyad,
              ogretmen_brans: a.profiles?.brans,
              ogrenci_adi: cocukAdMap.get(a.ogrenci_id),
            }))
          )
          setTekSeferlikDerslerim(
            (yoklamaSonuc.data || [])
              .map((a) => ({
                ...a,
                ogretmen_adi: a.profiles?.ad_soyad,
                ogretmen_brans: a.profiles?.brans,
                ogrenci_adi: cocukAdMap.get(a.ogrenci_id),
              }))
              // Sunucudan gelen sıralamaya güvenmek yerine burada da garanti
              // altına alıyoruz: önce tarih, sonra saat.
              .sort(
                (x, y) =>
                  (x.tarih || '').localeCompare(y.tarih || '') ||
                  (x.baslangic_saat || '').localeCompare(y.baslangic_saat || '')
              )
          )
          ilkYuklemeTamamRef.current = true
          setLoading(false)
        })
      } else {
        ilkYuklemeTamamRef.current = true
        setLoading(false)
      }
    })
  }

  useEffect(() => {
    veriyiYenile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Müsaitlik tablosunda boş bir hücreye tıklanınca çağrılır: hücrenin
  // öğretmen/gün/saat bilgisini forma iletir ve forma doğru yumuşak kaydırır.
  function hucreTiklandi(bilgi) {
    // Aynı öğretmen/tarih için, az önce seçilen hücrenin HEMEN YANINDAKİ
    // (bir sonraki 30dk'lık) sütuna tıklanırsa, bunu "arka arkaya bir ders daha"
    // isteği olarak yorumluyoruz: yeni dersin başlangıcını, önceki dersin
    // bitişinden (başlangıç+45dk) 10 dakika sonrasına otomatik ayarlıyoruz —
    // Bire Bir sayfasındaki "45 dakika ders + 10 dakika ara" düzeniyle tutarlı
    // olsun diye. Art arda (3., 4. kutu...) tıklanırsa da aynı mantık zincirlenir.
    const ardisikMi =
      seciliHucre &&
      seciliHucre.ogretmenId === bilgi.ogretmenId &&
      seciliHucre.tarih === bilgi.tarih &&
      bilgi.baslangic === saateDakikaEkle(seciliHucre.baslangic, 30)
    const formBaslangic = ardisikMi ? saateDakikaEkle(seciliHucre.hesaplananBaslangic, 45 + 10) : bilgi.baslangic

    setDoldurBilgisi({ ...bilgi, baslangic: formBaslangic })
    // "baslangic" burada tıklanan GERÇEK kutu (vurgu/işaretleme için),
    // "hesaplananBaslangic" ise forma yazılan (bir sonraki zincirleme hesap için).
    setSeciliHucre({ ogretmenId: bilgi.ogretmenId, tarih: bilgi.tarih, baslangic: bilgi.baslangic, hesaplananBaslangic: formBaslangic })
    requestAnimationFrame(() => {
      document.getElementById('ders-ekle-formu')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  // Ders eklendiğinde ya da taslağa kaydedildiğinde hem veriyi yeniler hem de
  // müsaitlik tablosundaki koyu işareti kaldırır.
  function dersEklendiVeyaTaslaklandi() {
    setSeciliHucre(null)
    veriyiYenile()
  }

  const ogrenciAdMap = useMemo(() => new Map(ogrenciler.map((o) => [o.id, o.ad_soyad])), [ogrenciler])

  async function sil(id) {
    if (!confirm('Bu ders saatini silmek istediğinize emin misiniz? Bu ders saatine ait yoklama kayıtları da (varsa) birlikte silinecek.')) return
    // Bir ders saati silinirken, o ders saatine bağlı yoklama kayıtları da
    // silinmezse veritabanında "sahipsiz" (hangi derse ait olduğu belli
    // olmayan) kayıtlar kalır. Önce yoklamayı, sonra ders saatini siliyoruz.
    const { error: yoklamaHata } = await supabase.from('yoklama').delete().eq('ders_programi_id', id)
    if (yoklamaHata) {
      alert('Hata (yoklama kayıtları silinirken): ' + yoklamaHata.message)
      return
    }
    const { error } = await supabase.from('ders_programi').delete().eq('id', id)
    if (error) alert('Hata: ' + error.message)
    else veriyiYenile()
  }

  const gunlereGore = GUNLER.map((_, gun) => program.filter((p) => p.gun === gun)).slice(1)

  // Tablo görünümü için: programdaki tüm benzersiz başlangıç saatleri, sıralı satırlar olarak.
  const saatSatirlari = [...new Set(program.map((p) => saatKisalt(p.baslangic_saat)))].sort()

  function hucreDersleri(gun, saat) {
    return program.filter((p) => p.gun === gun && saatKisalt(p.baslangic_saat) === saat)
  }

  // Veli/öğrenci için sınıf ders programı (tablo/liste) sadece bu sekme
  // seçiliyken gösterilir; yönetici/öğretmen için sekme hiç yok, her zaman gösterilir.
  const sinifProgramiGoster = !isVeliYaDaOgrenci || veliSekme === 'program'

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-navy">Ders Programı</h1>
        <div className="flex items-center gap-3 flex-wrap">
          {isVeliYaDaOgrenci && (
            <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden text-sm">
              <button
                onClick={() => setVeliSekme('birebir')}
                className={`px-3 py-1.5 font-medium transition-colors ${veliSekme === 'birebir' ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Bire Bir
              </button>
              <button
                onClick={() => setVeliSekme('program')}
                className={`px-3 py-1.5 font-medium transition-colors ${veliSekme === 'program' ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Ders Programı
              </button>
            </div>
          )}
          {sinifProgramiGoster && (
            <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden text-sm">
              <button
                onClick={() => setGorunum('tablo')}
                className={`px-3 py-1.5 font-medium transition-colors ${gorunum === 'tablo' ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Tablo
              </button>
              <button
                onClick={() => setGorunum('liste')}
                className={`px-3 py-1.5 font-medium transition-colors ${gorunum === 'liste' ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Liste
              </button>
            </div>
          )}
        </div>
      </div>

      {isYonetici && (
        <>
          <MusaitlikTablosu
            ogretmenler={ogretmenler}
            dersProgrami={program}
            atamalar={bireBirAtamalar}
            yoklamalar={bireBirYoklamalar}
            ogrenciAdMap={ogrenciAdMap}
            onHucreTikla={hucreTiklandi}
            secili={seciliHucre}
          />
          <DersEkleForm
            siniflar={siniflar}
            ogretmenler={ogretmenler}
            program={program}
            onEklendi={dersEklendiVeyaTaslaklandi}
            doldurBilgisi={doldurBilgisi}
          />
          <TaslaklarimDersProgrami
            taslaklar={taslaklar}
            siniflar={siniflar}
            ogretmenler={ogretmenler}
            program={program}
            onDegisti={veriyiYenile}
          />
        </>
      )}

      {isVeliYaDaOgrenci && veliSekme === 'birebir' && (
        <BireBirDerslerimBolumu
          haftalikDersler={bireBirDerslerim}
          tekSeferlikDersler={tekSeferlikDerslerim}
          birdenFazlaCocukMu={birdenFazlaCocukMu}
        />
      )}

      {loading && <p className="text-gray-400">Yükleniyor...</p>}

      {sinifProgramiGoster && !loading && program.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-gray-400">Görüntülenecek ders programı bulunamadı.</p>
        </div>
      )}

      {sinifProgramiGoster && !loading && program.length > 0 && gorunum === 'tablo' && (
        // touch-pan-x + overscroll-x-contain: mobil tarayıcılarda sayfa dikey
        // kaydırılabilirken bu tablonun YATAY kaydırılabilir olduğunu tarayıcıya
        // açıkça belirtiyoruz. Bazı mobil tarayıcılarda iç içe bir yatay kaydırma
        // alanı, dokunma hareketinin dikey mi yatay mı olduğuna karar verirken
        // "kaymıyor" gibi davranabiliyor; bu class'lar o belirsizliği kaldırıyor.
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto touch-pan-x overscroll-x-contain">
          <table className="border-collapse text-sm min-w-[900px] w-full">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-navy text-white px-3 py-2.5 text-left font-semibold w-24">Saat</th>
                {GUNLER.slice(1).map((g, i) => (
                  <th key={i + 1} className="bg-navy text-white px-3 py-2.5 text-left font-semibold min-w-[150px] border-l border-white/10">
                    {GUNLER_KISA[i + 1]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {saatSatirlari.map((saat, ri) => (
                <tr key={saat} className={ri % 2 ? 'bg-gray-50/60' : ''}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 font-semibold text-gray-600 whitespace-nowrap border-t border-gray-100 text-xs">
                    {saat}
                  </td>
                  {GUNLER.slice(1).map((_, i) => {
                    const gun = i + 1
                    const dersler = hucreDersleri(gun, saat)
                    return (
                      <td key={gun} className="px-1.5 py-1.5 align-top border-t border-l border-gray-100">
                        <div className="space-y-1">
                          {dersler.map((d) => (
                            <div key={d.id} className="bg-blue-50 border border-blue-100 rounded-lg px-2 py-1 relative group">
                              <p className="font-semibold text-navy text-xs leading-tight">{d.ders_adi || d.sinif_adi}</p>
                              <p className="text-[11px] text-gray-500 leading-tight">{d.sinif_adi}</p>
                              {d.ogretmen_adi && <p className="text-[11px] text-gray-400 leading-tight">{d.ogretmen_adi}</p>}
                              <p className="text-[10px] text-gray-400 leading-tight">
                                {saatKisalt(d.baslangic_saat)}–{saatKisalt(d.bitis_saat)}
                              </p>
                              {isYonetici && (
                                <button
                                  onClick={() => sil(d.id)}
                                  className="absolute top-0.5 right-1 text-[10px] text-red-400 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  Sil
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sinifProgramiGoster && !loading && program.length > 0 && gorunum === 'liste' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {gunlereGore.map((dersler, i) =>
            dersler.length === 0 ? null : (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-navy text-white font-semibold">{GUNLER[i + 1]}</div>
                <div className="divide-y divide-gray-50">
                  {dersler.map((d) => (
                    <div key={d.id} className="px-4 py-3 flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-800">{d.ders_adi || d.sinif_adi}</p>
                        <p className="text-xs text-gray-400">
                          {d.sinif_adi}
                          {d.ogretmen_adi ? ` · ${d.ogretmen_adi}` : ''}
                        </p>
                        <p className="text-sm text-gray-500">
                          {saatKisalt(d.baslangic_saat)} – {saatKisalt(d.bitis_saat)}
                        </p>
                      </div>
                      {isYonetici && (
                        <button
                          onClick={() => sil(d.id)}
                          className="text-xs text-red-500 hover:text-red-700 hover:underline shrink-0"
                        >
                          Sil
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
