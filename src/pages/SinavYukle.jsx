import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { sinavSonucPdfIndenTumOgrencileriCikar } from '../lib/sinavPdfParse'

// Bir sınavı giren TÜM öğrencilerin sonuç PDF'lerini TEK SEFERDE yükleyip
// otomatik ayrıştırmayı sağlayan sayfa. Okulun tarama/analiz yazılımı "tüm
// sınıfın" sonuçlarını TEK PDF olarak dışa aktarınca, her öğrencinin 2
// sayfalık karnesi ART ARDA birleştirilmiş oluyor (22 sayfalık dosya = 11
// öğrenci gibi) — bu yüzden burada seçilen HER dosya, içindeki TÜM
// öğrencilere ayrıştırılıyor (sinavSonucPdfIndenTumOgrencileriCikar), tek
// dosyadan birden fazla satır (öğrenci) çıkabiliyor. Sistem her öğrenciyi
// isimden eşleştirmeye çalışır — siz eşleşmeyi kontrol edip onayladıktan
// sonra sonuçlar kaydedilir.
// Sayfadan çıkıp geri dönüldüğünde (ör. "Hata Kitapçığı Oluştur" yeni
// sekmede açılınca, ya da yanlışlıkla başka bir menüye tıklanınca) henüz
// "Kaydet"e basılmamış satırların TAMAMEN kaybolup PDF'lerin en baştan
// yüklenmesi gerekmesin diye, ayrıştırma sonuçları localStorage'a da
// yazılıyor. Kaydedilen (veritabanına yazılmış) satırlar zaten kalıcı; bu
// sadece "henüz kaydedilmemiş ama ayrıştırılmış" satırlar için bir güvenlik ağı.
const SATIRLAR_ANAHTARI = 'sinavYukleSatirlari'
const SINAV_ANAHTARI = 'sinavYukleSeciliSinavId'

export default function SinavYukle() {
  const [sinavlar, setSinavlar] = useState([])
  const [seciliSinavId, setSeciliSinavId] = useState(() => {
    try {
      return localStorage.getItem(SINAV_ANAHTARI) || ''
    } catch {
      return ''
    }
  })
  const [ogrenciler, setOgrenciler] = useState([])
  const [satirlar, setSatirlar] = useState(() => {
    try {
      const kayitli = localStorage.getItem(SATIRLAR_ANAHTARI)
      return kayitli ? JSON.parse(kayitli) : []
    } catch {
      return []
    }
  }) // her biri bir yüklenen PDF'in durumu
  const [ayikliyor, setAyikliyor] = useState(false)
  const [genelHata, setGenelHata] = useState('')

  // Seçili sınav için VERİTABANINDA zaten kayıtlı olan sonuçlar — yukarıdaki
  // "Yüklenen Dosyalar" listesinin aksine bu, tarayıcı hafızasına/localStorage'a
  // değil doğrudan veritabanına bakar. Admin "kaydete basmıştım ama nerede o"
  // diye endişelendiğinde (ör. sayfa/tarayıcı state'i bir şekilde sıfırlansa
  // BİLE) kaydedilmiş bir sonucun kaybolmadığını buradan görebilir, ayrıca
  // buradan da doğrudan Hata Kitapçığı oluşturabilir.
  const [kayitliSonuclar, setKayitliSonuclar] = useState([])
  const [kayitliSonuclarYukleniyor, setKayitliSonuclarYukleniyor] = useState(false)
  const [silinenSonucId, setSilinenSonucId] = useState(null)

  useEffect(() => {
    supabase.from('sinavlar').select('*').order('sinav_tarihi', { ascending: false }).then(({ data }) => setSinavlar(data || []))
    supabase.from('ogrenciler').select('id, ad_soyad').order('ad_soyad').then(({ data }) => setOgrenciler(data || []))
  }, [])

  function kayitliSonuclariYukle(sinavId) {
    if (!sinavId || sinavId === '__yeni__') {
      setKayitliSonuclar([])
      return
    }
    setKayitliSonuclarYukleniyor(true)
    supabase
      .from('ogrenci_sinav_sonuclari')
      .select('id, kitapcik, toplam_net, toplam_dogru, toplam_yanlis, toplam_bos, created_at, ogrenciler(ad_soyad)')
      .eq('sinav_id', sinavId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setKayitliSonuclar(data || [])
        setKayitliSonuclarYukleniyor(false)
      })
  }

  useEffect(() => {
    kayitliSonuclariYukle(seciliSinavId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seciliSinavId])

  // Kaydedilmiş bir sonucu (ör. deneme/test amaçlı yüklenmiş, yanlış öğrenciye
  // bağlanmış vb.) kalıcı olarak siler — önce ona bağlı ders/soru detaylarını,
  // sonra sonuç satırının kendisini kaldırır.
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
      const { error } = await supabase.from('ogrenci_sinav_sonuclari').delete().eq('id', k.id)
      if (error) throw error
      setKayitliSonuclar((liste) => liste.filter((s) => s.id !== k.id))
    } catch (e) {
      alert('Silme hatası: ' + e.message)
    } finally {
      setSilinenSonucId(null)
    }
  }

  // satirlar/seciliSinavId her değiştiğinde localStorage'a yaz — böylece
  // sayfadan çıkıp geri dönüldüğünde (hatta sekme kapatılıp yeniden
  // açıldığında) liste olduğu gibi durur.
  useEffect(() => {
    try {
      localStorage.setItem(SATIRLAR_ANAHTARI, JSON.stringify(satirlar))
    } catch {
      // localStorage dolu/erişilemez olsa bile uygulama çalışmaya devam etsin
    }
  }, [satirlar])

  useEffect(() => {
    try {
      localStorage.setItem(SINAV_ANAHTARI, seciliSinavId || '')
    } catch {
      // yok say
    }
  }, [seciliSinavId])

  // PDF'ten çıkan ismi mevcut öğrenci listesiyle eşleştirmeye çalışır —
  // önce tam eşleşme, olmazsa "içeriyor" bazlı yaklaşık eşleşme dener.
  // Hiçbiri kesin değilse boş döner, admin elle seçer.
  function ogrenciEslestir(pdfAdSoyad) {
    if (!pdfAdSoyad) return ''
    const normalize = (s) => s.toLocaleLowerCase('tr-TR').trim()
    const hedef = normalize(pdfAdSoyad)
    const tamEslesme = ogrenciler.find((o) => normalize(o.ad_soyad) === hedef)
    if (tamEslesme) return tamEslesme.id
    const yaklasik = ogrenciler.filter((o) => normalize(o.ad_soyad).includes(hedef) || hedef.includes(normalize(o.ad_soyad)))
    if (yaklasik.length === 1) return yaklasik[0].id
    return ''
  }

  async function dosyalariAyikla(dosyaListesi) {
    if (!dosyaListesi || dosyaListesi.length === 0) return
    setGenelHata('')
    setAyikliyor(true)

    for (const dosya of Array.from(dosyaListesi)) {
      // Dosya seçilir seçilmez, o dosya için TEK bir "ayrıştırılıyor" satırı
      // gösteriyoruz — içinde kaç öğrenci olduğunu henüz bilmiyoruz. Sonuçlar
      // gelince bu tek satırı, bulunan öğrenci sayısı kadar gerçek satıra
      // bölüyoruz (aşağıda geciciId ile değiştiriliyor).
      const geciciId = `${dosya.name}-${Date.now()}-${Math.random()}`
      setSatirlar((liste) => [
        ...liste,
        { id: geciciId, dosyaAdi: dosya.name, durum: 'ayikliyor', hata: '', veri: null, ogrenciId: '', kaydedildi: false },
      ])

      try {
        const sonuclar = await sinavSonucPdfIndenTumOgrencileriCikar(dosya)
        const cokluMu = sonuclar.length > 1
        const yeniSatirlar = sonuclar.map((s) => {
          const id = `${dosya.name}-s${s.baslangicSayfa}-${Date.now()}-${Math.random()}`
          const dosyaAdi = cokluMu ? `${dosya.name} — sayfa ${s.baslangicSayfa}-${s.baslangicSayfa + 1}` : dosya.name
          if (!s.basariliMi) {
            return { id, dosyaAdi, durum: 'hata', hata: s.hata, veri: null, ogrenciId: '', kaydedildi: false }
          }
          return {
            id,
            dosyaAdi,
            durum: 'hazir',
            hata: '',
            veri: s.veri,
            ogrenciId: ogrenciEslestir(s.veri.ogrenciAdSoyad),
            kaydedildi: false,
          }
        })
        setSatirlar((liste) => [...liste.filter((s) => s.id !== geciciId), ...yeniSatirlar])
      } catch (e) {
        setSatirlar((liste) => liste.map((s) => (s.id === geciciId ? { ...s, durum: 'hata', hata: e.message } : s)))
      }
    }
    setAyikliyor(false)
  }

  function satirGuncelle(id, alanlar) {
    setSatirlar((liste) => liste.map((s) => (s.id === id ? { ...s, ...alanlar } : s)))
  }

  function satirKaldir(id) {
    setSatirlar((liste) => liste.filter((s) => s.id !== id))
  }

  async function satirKaydet(satir) {
    if (!seciliSinavId) {
      satirGuncelle(satir.id, { durum: 'hata', hata: 'Önce üstten bu sonuçların ait olduğu sınavı seçin.' })
      return
    }
    if (!satir.ogrenciId) {
      satirGuncelle(satir.id, { durum: 'hata', hata: 'Bu PDF için bir öğrenci seçilmedi.' })
      return
    }
    satirGuncelle(satir.id, { durum: 'kaydediliyor', hata: '' })
    try {
      const veri = satir.veri
      const { data: sonucVerisi, error: sonucHatasi } = await supabase
        .from('ogrenci_sinav_sonuclari')
        .upsert(
          {
            ogrenci_id: satir.ogrenciId,
            sinav_id: seciliSinavId,
            kitapcik: veri.kitapcik || null,
            toplam_soru: veri.ozet.toplamSoru,
            toplam_dogru: veri.ozet.toplamDogru,
            toplam_yanlis: veri.ozet.toplamYanlis,
            toplam_bos: veri.ozet.toplamBos,
            toplam_net: veri.ozet.toplamNet,
            yuklenen_pdf_adi: satir.dosyaAdi,
          },
          { onConflict: 'ogrenci_id,sinav_id' }
        )
        .select()
        .single()
      if (sonucHatasi) throw sonucHatasi

      // Bu öğrenci bu sınav için daha önce kaydedilmişse (ör. PDF yanlışlıkla
      // iki kere yüklendi), eski ders/soru satırlarını silip yeniden yazıyoruz.
      await supabase.from('sinav_ders_sonuclari').delete().eq('sonuc_id', sonucVerisi.id)
      await supabase.from('sinav_soru_sonuclari').delete().eq('sonuc_id', sonucVerisi.id)

      if (veri.dersSonuclari.length > 0) {
        const { error } = await supabase.from('sinav_ders_sonuclari').insert(
          veri.dersSonuclari.map((d) => ({
            sonuc_id: sonucVerisi.id,
            ders_adi: d.ders_adi,
            soru_sayisi: d.soru_sayisi,
            dogru: d.dogru,
            yanlis: d.yanlis,
            bos: d.bos,
            net: d.net,
          }))
        )
        if (error) throw error
      }

      if (veri.soruSonuclari.length > 0) {
        const { error } = await supabase.from('sinav_soru_sonuclari').insert(
          veri.soruSonuclari.map((s) => ({
            sonuc_id: sonucVerisi.id,
            ders_adi: s.ders_adi,
            soru_no: s.soru_no,
            konu: s.konu,
            dogru_cevap: s.dogru_cevap,
            ogrenci_cevap: s.ogrenci_cevap,
            sonuc: s.sonuc,
          }))
        )
        if (error) throw error
      }

      satirGuncelle(satir.id, { durum: 'kaydedildi', kaydedildi: true, sonucId: sonucVerisi.id })
      kayitliSonuclariYukle(seciliSinavId)
    } catch (e) {
      satirGuncelle(satir.id, { durum: 'hata', hata: 'Kayıt hatası: ' + e.message })
    }
  }

  async function hepsiniKaydet() {
    const kaydedilecekler = satirlar.filter((s) => s.durum === 'hazir' && s.ogrenciId)
    for (const satir of kaydedilecekler) {
      await satirKaydet(satir)
    }
  }

  // Listeyi tamamen temizler (ör. bambaşka bir sınavın dosyalarını yüklemeye
  // başlamadan önce eski listeyi silmek için). Zaten "Kaydet"e basılmış
  // satırlar veritabanında güvende kalır, sadece bu ekrandaki liste temizlenir.
  function listeyiTemizle() {
    if (satirlar.length === 0) return
    const kaydedilmemis = satirlar.filter((s) => s.durum !== 'kaydedildi').length
    if (
      kaydedilmemis > 0 &&
      !confirm(
        `Listede henüz kaydedilmemiş ${kaydedilmemis} satır var — temizlerseniz bunlar için PDF'i tekrar ` +
          `yüklemeniz gerekir. Kaydedilmiş olanlar zaten güvende. Yine de listeyi temizlemek istiyor musunuz?`
      )
    ) {
      return
    }
    setSatirlar([])
  }

  const hazirSayisi = satirlar.filter((s) => s.durum === 'hazir' && s.ogrenciId).length

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-2">Sınav Sonucu Yükle</h1>
      <p className="text-sm text-gray-500 mb-6">
        Bir sınavı giren öğrencilerin bireysel sonuç PDF'lerini (karne raporlarını) buradan aynı anda yükleyin.
        Sistem her PDF'i otomatik ayrıştırır, öğrenciyi isimden eşleştirmeye çalışır — siz eşleşmeyi kontrol edip
        onayladıktan sonra sonuçlar kaydedilir.
      </p>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Bu sonuçlar hangi sınava ait?</label>
            <select
              value={seciliSinavId}
              onChange={(e) => setSeciliSinavId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue bg-white"
            >
              <option value="">Seçiniz...</option>
              {sinavlar.map((s) => (
                <option key={s.id} value={s.id}>{s.sinav_adi}</option>
              ))}
            </select>
            {sinavlar.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Henüz kayıtlı sınav yok — önce "Sınav Kitapçıkları" sayfasından bir kitapçık kaydedin, sınav orada
                otomatik oluşur.
              </p>
            )}
          </div>
          <div className="flex-1 min-w-[240px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sonuç PDF'leri (birden fazla seçilebilir)</label>
            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={(e) => dosyalariAyikla(e.target.files)}
              className="w-full text-sm"
            />
          </div>
        </div>
        {ayikliyor && <p className="text-sm text-blue">PDF'ler okunuyor...</p>}
        {genelHata && <p className="text-sm text-red-600">{genelHata}</p>}
      </div>

      {/* Bu, YUKARIDAKİ "Yüklenen Dosyalar" listesinden FARKLI — o liste
          tarayıcı hafızasında/localStorage'da tutulan, henüz bu oturumda
          yüklenmiş dosyaların durumu. Bu bölüm ise doğrudan veritabanına
          bakıyor: "Kaydet"e basılmış her sonuç burada KALICI olarak görünür,
          tarayıcı/sekme durumu ne olursa olsun kaybolmaz. Admin "kaydettim
          ama nerede" diye endişelenirse buradan kontrol edip, gerekirse
          doğrudan Hata Kitapçığı da oluşturabilir. */}
      {seciliSinavId && seciliSinavId !== '__yeni__' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-gray-700">
              Bu Sınav İçin Daha Önce Kaydedilmiş Sonuçlar ({kayitliSonuclar.length})
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Bu liste veritabanından geliyor — "Kaydet"e bastığınız her sonuç burada kalıcı olarak durur, sayfadan
              çıkıp geri dönseniz de kaybolmaz.
            </p>
          </div>
          {kayitliSonuclarYukleniyor ? (
            <p className="text-sm text-gray-400 p-4">Yükleniyor...</p>
          ) : kayitliSonuclar.length === 0 ? (
            <p className="text-sm text-gray-400 p-4">Bu sınav için henüz kaydedilmiş bir sonuç yok.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {kayitliSonuclar.map((k) => (
                <div key={k.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {k.ogrenciler?.ad_soyad || 'Bilinmeyen öğrenci'}
                      {k.kitapcik && <span className="text-gray-400 font-normal"> · Kitapçık {k.kitapcik}</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      Doğru: <b className="text-green-700">{k.toplam_dogru}</b> · Yanlış:{' '}
                      <b className="text-red-700">{k.toplam_yanlis}</b> · Boş: <b className="text-gray-500">{k.toplam_bos}</b> ·
                      Net: <b className="text-navy">{k.toplam_net}</b>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
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
              ))}
            </div>
          )}
        </div>
      )}

      {satirlar.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold text-gray-700">Yüklenen Dosyalar ({satirlar.length})</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={listeyiTemizle}
                className="text-xs text-gray-400 font-semibold hover:text-gray-600 hover:underline px-2"
              >
                Listeyi Temizle
              </button>
              {hazirSayisi > 0 && (
                <button
                  type="button"
                  onClick={hepsiniKaydet}
                  className="bg-orange text-white font-semibold px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity"
                >
                  Hazır Olan {hazirSayisi} Sonucu Kaydet
                </button>
              )}
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {satirlar.map((s) => (
              <div key={s.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[200px]">
                    <p className="text-sm font-medium text-gray-800">{s.dosyaAdi}</p>
                    {s.veri && (
                      <p className="text-xs text-gray-400">
                        PDF'te yazan isim: <span className="font-medium text-gray-600">{s.veri.ogrenciAdSoyad}</span>
                        {s.veri.kitapcik && ` · Kitapçık ${s.veri.kitapcik}`}
                      </p>
                    )}
                  </div>

                  {s.durum === 'ayikliyor' && <span className="text-xs font-semibold text-blue">Ayrıştırılıyor...</span>}
                  {s.durum === 'hata' && (
                    <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-1 rounded-full">{s.hata}</span>
                  )}
                  {s.durum === 'kaydediliyor' && <span className="text-xs font-semibold text-blue">Kaydediliyor...</span>}
                  {s.durum === 'kaydedildi' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-full">✓ Kaydedildi</span>
                      {s.sonucId && (
                        <Link
                          to={`/hata-kitapcigi/${s.sonucId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold bg-orange text-white px-2 py-1 rounded-full hover:opacity-90"
                        >
                          Hata Kitapçığı Oluştur
                        </Link>
                      )}
                    </div>
                  )}
                </div>

                {s.veri && s.durum !== 'kaydedildi' && (
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <div className="min-w-[220px]">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Öğrenci</label>
                      <select
                        value={s.ogrenciId}
                        onChange={(e) => satirGuncelle(s.id, { ogrenciId: e.target.value })}
                        className={`w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue bg-white ${
                          s.ogrenciId ? 'border-gray-200' : 'border-yellow-300 bg-yellow-50'
                        }`}
                      >
                        <option value="">Öğrenci seçin...</option>
                        {ogrenciler.map((o) => (
                          <option key={o.id} value={o.id}>{o.ad_soyad}</option>
                        ))}
                      </select>
                      {!s.ogrenciId && (
                        <p className="text-xs text-yellow-700 mt-1">
                          Otomatik eşleşme bulunamadı (PDF'teki isim "{s.veri.ogrenciAdSoyad}" listedeki hiçbir
                          öğrenciyle birebir uyuşmuyor) — doğru öğrenciyi elle seçin. Buradaki soru/doğru/yanlış
                          verileri PDF'ten geldiği için değişmez, bu kutu sadece o veriyi HANGİ öğrenci kaydına
                          bağlayacağınızı belirler.
                        </p>
                      )}
                    </div>

                    <div className="text-xs text-gray-500 flex gap-3 flex-wrap">
                      <span>Soru: <b className="text-gray-700">{s.veri.ozet.toplamSoru}</b></span>
                      <span>Doğru: <b className="text-green-700">{s.veri.ozet.toplamDogru}</b></span>
                      <span>Yanlış: <b className="text-red-700">{s.veri.ozet.toplamYanlis}</b></span>
                      <span>Boş: <b className="text-gray-500">{s.veri.ozet.toplamBos}</b></span>
                      <span>Net: <b className="text-navy">{s.veri.ozet.toplamNet}</b></span>
                    </div>

                    <div className="flex gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={() => satirKaydet(s)}
                        disabled={!s.ogrenciId || !seciliSinavId}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-navy text-white hover:opacity-90 disabled:opacity-40"
                      >
                        Kaydet
                      </button>
                      <button
                        type="button"
                        onClick={() => satirKaldir(s.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50"
                      >
                        Kaldır
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
