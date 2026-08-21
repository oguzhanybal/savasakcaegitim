import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { saatGoster } from '../lib/saatFormat'

// ============================================================================
// YOKLAMALARIM — veli/öğrenci için, SADECE KENDİ çocuğunun/kendisinin sınıf
// dersi yoklama geçmişini gösteren salt-okunur sayfa. Yoklama Raporu (tüm
// öğrenciler/sınıflar) ve Öğrenci Zaman Çizelgesi (tam hikaye) sayfaları
// sadece yönetici/öğretmene açık — bu sayfa onların veli/öğrenci karşılığı,
// ama SADECE kendi öğrencisiyle sınırlı. Erişim App.jsx'te izinliRoller
// ['veli','ogrenci'] ile kısıtlanıyor; veri tarafında da (Karnem.jsx/
// Muhasebe.jsx/DersProgrami.jsx'teki AYNI kanıtlanmış yöntem) sunucudaki
// RLS'ye körü körüne güvenmek yerine istemci tarafında da sadece
// veli_profile_id/ogrenci_profile_id kendisiyle eşleşen öğrenci(ler) alınıyor.
// ============================================================================

function tarihUzunFormat(tarihStr) {
  if (!tarihStr) return '—'
  return new Date(tarihStr + 'T12:00:00').toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function ayBasligi(tarihStr) {
  if (!tarihStr) return ''
  return new Date(tarihStr + 'T12:00:00')
    .toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
    .replace(/^./, (c) => c.toUpperCase())
}

// Başlıkta önce ders adı, o da yoksa öğretmenin branşı gösterilir (ör.
// "Türkçe/Edebiyat") — Ders Programı sayfasındaki AYNI kural. Sınıf adı
// ("12-Eşit Ağırlık" gibi) tek başına bir ders adı değil, o yüzden en son
// çare olarak kullanılıyor.
function dersBasligi(k) {
  return k.ders_programi?.ders_adi || k.ders_programi?.profiles?.brans || k.ders_programi?.siniflar?.ad || 'Ders'
}

function DevamsizlikOzeti({ kayitlar }) {
  // Sınav yoklamaları (ders_programi.sinav_mi) normal ders devamsızlığından
  // AYRI sayılıyor — kullanıcı isteğiyle: eskiden "82 ders" gibi tek bir
  // toplam, aslında 80 gerçek ders + 2 sınavı birbirine karıştırıyordu,
  // öğrenci/veli kaç sınava girdiğini/girmediğını ayrı göremiyordu.
  const dersKayitlari = kayitlar.filter((y) => !y.ders_programi?.sinav_mi)
  const sinavKayitlari = kayitlar.filter((y) => y.ders_programi?.sinav_mi)

  function ozetHesapla(liste) {
    const geldi = liste.filter((y) => y.geldi).length
    const gelmedi = liste.length - geldi
    const oran = liste.length > 0 ? Math.round((gelmedi / liste.length) * 100) : 0
    return { geldi, gelmedi, oran, toplam: liste.length }
  }
  const dersOzet = ozetHesapla(dersKayitlari)
  const sinavOzet = ozetHesapla(sinavKayitlari)

  // Kartta ders adı büyük/belirgin, öğretmen adı küçük — ama aynı dersi
  // (ör. "Matematik") farklı öğretmenler veriyorsa (dönem içinde öğretmen
  // değişmiş olabilir) bunları TEK satırda birleştirmiyoruz, her öğretmen
  // kendi satırında ayrı ayrı görünüyor. Bu yüzden grup anahtarı ders adı +
  // öğretmen adı ikilisi. Sınavlar burada YOK — aşağıda ayrı listeleniyor.
  const dersMap = new Map()
  for (const y of dersKayitlari) {
    const baslik = dersBasligi(y)
    const ogretmen = y.ders_programi?.profiles?.ad_soyad || ''
    const anahtar = `${baslik}||${ogretmen}`
    if (!dersMap.has(anahtar)) dersMap.set(anahtar, { baslik, ogretmen, geldi: 0, gelmedi: 0 })
    const s = dersMap.get(anahtar)
    if (y.geldi) s.geldi += 1
    else s.gelmedi += 1
  }
  const dersListesi = [...dersMap.values()].sort(
    (a, b) => a.baslik.localeCompare(b.baslik, 'tr') || a.ogretmen.localeCompare(b.ogretmen, 'tr')
  )

  // Sınav adına göre grup (ör. "TYT Deneme Sınavı") — öğretmen bilgisi
  // sınavlarda genelde anlamsız, o yüzden sadece sınav adına göre birleşiyor.
  const sinavMap = new Map()
  for (const y of sinavKayitlari) {
    const baslik = dersBasligi(y)
    if (!sinavMap.has(baslik)) sinavMap.set(baslik, { baslik, geldi: 0, gelmedi: 0 })
    const s = sinavMap.get(baslik)
    if (y.geldi) s.geldi += 1
    else s.gelmedi += 1
  }
  const sinavListesi = [...sinavMap.values()].sort((a, b) => a.baslik.localeCompare(b.baslik, 'tr'))

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
      <h2 className="font-semibold text-gray-700 mb-3">Devamsızlık Özeti</h2>

      <div className="flex flex-wrap gap-4 text-sm">
        <span className="text-gray-500">
          Toplam <span className="font-semibold text-gray-800">{dersOzet.toplam}</span> ders
        </span>
        <span className="text-green-600 font-semibold">{dersOzet.geldi} geldi</span>
        <span className="text-red-500 font-semibold">{dersOzet.gelmedi} gelmedi</span>
        {dersOzet.toplam > 0 && (
          <span className={`font-semibold ${dersOzet.oran > 20 ? 'text-red-500' : 'text-gray-400'}`}>
            (%{dersOzet.oran} devamsızlık)
          </span>
        )}
      </div>

      {sinavOzet.toplam > 0 && (
        <div className="flex flex-wrap gap-4 text-sm mt-2 pt-2 border-t border-gray-50">
          <span className="text-gray-500">
            Toplam <span className="font-semibold text-gray-800">{sinavOzet.toplam}</span> sınav
          </span>
          <span className="text-green-600 font-semibold">{sinavOzet.geldi} girdi</span>
          <span className="text-red-500 font-semibold">{sinavOzet.gelmedi} girmedi</span>
          <span className={`font-semibold ${sinavOzet.oran > 20 ? 'text-red-500' : 'text-gray-400'}`}>
            (%{sinavOzet.oran} girmedi)
          </span>
        </div>
      )}

      {dersListesi.length > 0 && (
        <div className="divide-y divide-gray-50 border-t border-gray-100 mt-4">
          {dersListesi.map((s) => {
            const toplam = s.geldi + s.gelmedi
            const oran = toplam > 0 ? Math.round((s.gelmedi / toplam) * 100) : 0
            return (
              <div key={`${s.baslik}||${s.ogretmen}`} className="py-2.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 text-sm">{s.baslik}</p>
                  {s.ogretmen && <p className="text-xs text-gray-400">{s.ogretmen}</p>}
                </div>
                <span className="text-sm text-gray-500 shrink-0">
                  <span className={`font-semibold ${s.gelmedi > 0 ? 'text-red-500' : 'text-green-600'}`}>{s.gelmedi}</span>/{toplam} derse gelmedi{' '}
                  <span className={`font-semibold ${oran > 20 ? 'text-red-500' : 'text-gray-400'}`}>(%{oran})</span>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {sinavListesi.length > 0 && (
        <>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4 mb-1 px-1">Sınavlar</h3>
          <div className="divide-y divide-gray-50 border-t border-gray-100">
            {sinavListesi.map((s) => {
              const toplam = s.geldi + s.gelmedi
              const oran = toplam > 0 ? Math.round((s.gelmedi / toplam) * 100) : 0
              return (
                <div key={s.baslik} className="py-2.5 flex items-center justify-between gap-3 flex-wrap">
                  <p className="font-medium text-gray-800 text-sm">{s.baslik}</p>
                  <span className="text-sm text-gray-500 shrink-0">
                    <span className={`font-semibold ${s.geldi === toplam ? 'text-green-600' : 'text-red-500'}`}>{s.geldi}</span>/{toplam} sınava girdi{' '}
                    <span className={`font-semibold ${oran > 20 ? 'text-red-500' : 'text-gray-400'}`}>(%{oran} girmedi)</span>
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default function Yoklamalarim() {
  const { profile } = useAuth()
  const [ogrenciler, setOgrenciler] = useState([])
  const [seciliId, setSeciliId] = useState('')
  const [kayitlar, setKayitlar] = useState([])
  const [loading, setLoading] = useState(true)
  const [ilkYuklemeTamam, setIlkYuklemeTamam] = useState(false)

  useEffect(() => {
    if (!profile) return
    supabase
      .from('ogrenciler')
      .select('id, ad_soyad, veli_profile_id, ogrenci_profile_id')
      .order('ad_soyad')
      .then(({ data }) => {
        const liste = (data || []).filter(
          (o) => o.veli_profile_id === profile.id || o.ogrenci_profile_id === profile.id
        )
        setOgrenciler(liste)
        if (liste.length > 0) {
          setSeciliId(liste[0].id)
        } else {
          setIlkYuklemeTamam(true)
          setLoading(false)
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  useEffect(() => {
    if (!seciliId) return
    setLoading(true)
    supabase
      .from('yoklama')
      .select(
        '*, ders_programi(ders_adi, baslangic_saat, bitis_saat, sinav_mi, siniflar(ad), profiles:ogretmen_profile_id(ad_soyad, brans))'
      )
      .eq('ogrenci_id', seciliId)
      .order('tarih', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('Yoklama sorgusu hatası:', error.message)
        setKayitlar(data || [])
        setIlkYuklemeTamam(true)
        setLoading(false)
      })
  }, [seciliId])

  const seciciGoster = ogrenciler.length > 1
  const seciliOgrenci = ogrenciler.find((o) => o.id === seciliId)

  // Kronolojik listeyi ay başlıklarına göre grupluyoruz — tek bir uzun tarih
  // listesi yerine (Ders Hatırlatma paneli / Giriş Kayıtları'ndaki aynı
  // "gruplayıp ayır" mantığı), okunması çok daha kolay oluyor.
  const aylikGruplar = useMemo(() => {
    const gruplar = new Map()
    for (const k of kayitlar) {
      const anahtar = (k.tarih || '').slice(0, 7)
      if (!gruplar.has(anahtar)) gruplar.set(anahtar, [])
      gruplar.get(anahtar).push(k)
    }
    return [...gruplar.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [kayitlar])

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <h1 className="text-xl font-bold text-navy">Yoklamalarım</h1>
        {seciciGoster && (
          <select
            value={seciliId}
            onChange={(e) => setSeciliId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            {ogrenciler.map((o) => (
              <option key={o.id} value={o.id}>
                {o.ad_soyad}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading && !ilkYuklemeTamam && <p className="text-gray-400">Yükleniyor...</p>}

      {ilkYuklemeTamam && ogrenciler.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-gray-500">
          Bağlı bir öğrenci kaydı bulunamadı.
        </div>
      )}

      {ilkYuklemeTamam && ogrenciler.length > 0 && (
        <>
          {seciliOgrenci && !seciciGoster && (
            <p className="text-sm text-gray-500 mb-4">{seciliOgrenci.ad_soyad}</p>
          )}

          {kayitlar.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-gray-500">
              Henüz kaydedilmiş bir sınıf dersi yoklaması yok.
            </div>
          ) : (
            <>
              <DevamsizlikOzeti kayitlar={kayitlar} />

              <div className="space-y-6">
                {aylikGruplar.map(([ay, ayKayitlari]) => (
                  <div key={ay}>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
                      {ayBasligi(ayKayitlari[0]?.tarih)}
                    </h3>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50 overflow-hidden">
                      {ayKayitlari.map((k) => (
                        <div
                          key={k.id}
                          className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            {(() => {
                              // Ders adı büyük/belirgin, sınıf adı + öğretmen
                              // adı küçük ve silik bir alt satırda — sınıf
                              // adı başlıktan farklıysa gösterilir (bkz.
                              // dersBasligi ve Ders Programı'ndaki aynı kural).
                              const baslik = dersBasligi(k)
                              const sinifAdiGoster = k.ders_programi?.siniflar?.ad && k.ders_programi.siniflar.ad !== baslik
                              return (
                                <>
                                  <p className="font-medium text-gray-800 break-words">{baslik}</p>
                                  <p className="text-xs text-gray-400">
                                    {sinifAdiGoster ? k.ders_programi.siniflar.ad : ''}
                                    {k.ders_programi?.profiles?.ad_soyad
                                      ? `${sinifAdiGoster ? ' · ' : ''}${k.ders_programi.profiles.ad_soyad}`
                                      : ''}
                                    {k.ders_programi?.baslangic_saat && (
                                      <>
                                        {sinifAdiGoster || k.ders_programi?.profiles?.ad_soyad ? ' · ' : ''}
                                        {saatGoster(k.ders_programi.baslangic_saat)}
                                        {k.ders_programi.bitis_saat ? ` – ${saatGoster(k.ders_programi.bitis_saat)}` : ''}
                                      </>
                                    )}
                                  </p>
                                </>
                              )
                            })()}
                            <p className="text-sm text-gray-500">{tarihUzunFormat(k.tarih)}</p>
                          </div>
                          <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full self-start sm:self-center shrink-0 ${
                              k.geldi ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                            }`}
                          >
                            {k.ders_programi?.sinav_mi
                              ? k.geldi
                                ? 'Girdi'
                                : 'Girmedi'
                              : k.geldi
                              ? 'Geldi'
                              : 'Gelmedi'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
