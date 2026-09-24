import { useEffect, useState } from 'react'
import { supabase, tumSatirlariGetir } from '../lib/supabase'
import GunlukProgramListesi from '../components/GunlukProgramListesi'

// Daha önce Ders Programı sayfası içinde bir sekme (Günlük Program Listesi)
// olarak gizliydi — artık kendi doğrudan tıklanabilir sayfası var
// (savasakcaportal.com/gunluk), sol menüde ayrı bir link olarak duruyor.
// Veriyi DersProgrami.jsx'teki veriyiYenile() ile AYNI şekilde, bağımsız
// olarak kendisi çekiyor (o sayfaya hiç gitmeden de doğrudan açılabilsin diye).
export default function GunlukProgram() {
  const [program, setProgram] = useState([])
  // ÖNEMLİ DÜZELTME: önceden sadece "aktif=true" satırlar çekiliyordu — bu
  // yüzden GunlukProgramListesi'nin geçmiş tarihler için yaptığı tarihsel
  // yeniden kurma (bkz. o dosyadaki tarihIcinAktifProgram) hiç çalışamıyordu,
  // çünkü pasife çekilmiş (aktif=false) eski satırlar veritabanından hiç
  // istemciye gelmiyordu. Sonuç: bu sayfa HER ZAMAN bugünkü güncel öğretmeni
  // gösteriyordu, seçilen tarih ne olursa olsun (örn. bir sınıf dersi yakın
  // zamanda başka öğretmene devredildiyse, geçmiş bir tarihte bile hep YENİ
  // öğretmen görünüyordu). Artık DersProgrami.jsx'teki "programTum" ile AYNI
  // şekilde TÜM satırlar (aktif + pasif) çekiliyor; "program" (sadece aktif)
  // ayrıca tutulmaya devam ediyor çünkü GunlukProgramListesi, tarihe uygun
  // kayıt bulunamayan (boşluk) durumlarda yedek olarak ona da bakıyor.
  const [programTum, setProgramTum] = useState([])
  const [ogretmenler, setOgretmenler] = useState([])
  const [atamalar, setAtamalar] = useState([])
  const [yoklamalar, setYoklamalar] = useState([])
  const [ogrenciAdMap, setOgrenciAdMap] = useState(new Map())
  const [loading, setLoading] = useState(true)

  function veriyiYenile() {
    Promise.all([
      // ÖNEMLİ HATA DÜZELTMESİ (kullanıcı bildirdi — "sınıf dersleri bazen
      // görünüyor bazen görünmüyor"): bu sorgu, pasif (devredilmiş/silinmiş)
      // satırları da içerecek şekilde ders_programi'nin TÜM satırlarını
      // filtresiz çekiyordu (bkz. aşağıdaki eski not) — ama Supabase/PostgREST,
      // `.range()` ile sayfalanmamış bir sorguda tek seferde EN FAZLA 1000 satır
      // döndürür, tablo 1000'i AŞTIĞINDA bunu hatasız ama SESSİZCE KESİLMİŞ
      // veri olarak döndürür (bkz. lib/supabase.js'teki tumSatirlariGetir
      // açıklaması — bu, kantin_alislar'da yaşanan AYNI hatanın burada da
      // geçerli hâli; hatta bu tablo için DAHA ÖNCE de "Cumartesi/Pazar
      // dersleri kayboluyor" şeklinde yaşanmıştı). Öğretmen değişikliği gibi
      // her düzenleme yeni bir satır ekleyip eskisini pasife çektiği için bu
      // tablo aylar içinde kolayca 1000 satırı geçebiliyor — aşıldığı anda
      // `.order('gun').order('baslangic_saat')` sıralamasına göre EN SONA
      // düşen (haftanın geç günleri / geç saatleri) satırlar sessizce
      // kayboluyordu, toplam satır sayısı zamanla dalgalandıkça da "bazen
      // görünüyor bazen görünmüyor" izlenimi veriyordu. Çözüm: DersProgrami.jsx
      // sayfasındaki gibi elle sayfalamak yerine, zaten test edilmiş olan
      // tumSatirlariGetir yardımcısıyla TÜM satırları (1000'in katları hâlinde
      // sayfalayarak) eksiksiz çekiyoruz — dönen veri şekli aynı kaldığı için
      // aşağıdaki hiçbir satır değişmedi.
      tumSatirlariGetir(() =>
        supabase
          .from('ders_programi')
          .select('*, siniflar(ad), profiles:ogretmen_profile_id(ad_soyad)')
          // NOT: burada artık aktif=true filtresi YOK — pasif (silinmiş/devredilmiş)
          // satırlar da çekiliyor, filtreleme aşağıda JS tarafında yapılıyor
          // (bkz. yukarıdaki not — DersProgrami.jsx'teki veriyiYenile ile aynı desen).
          .order('gun')
          .order('baslangic_saat')
      ),
      supabase.from('profiles').select('*').eq('rol', 'ogretmen').order('ad_soyad'),
      tumSatirlariGetir(() => supabase.from('bire_bir_atamalari').select('*, ogrenciler(ad_soyad)')),
      tumSatirlariGetir(() => supabase.from('bire_bir_yoklama').select('*')),
      tumSatirlariGetir(() => supabase.from('ogrenciler').select('id, ad_soyad')),
    ]).then(([p, og, ba, by, o]) => {
      const dersleriGenislet = (p.data || []).map((d) => ({
        ...d,
        sinif_adi: d.siniflar?.ad,
        ogretmen_adi: d.profiles?.ad_soyad,
      }))
      setProgramTum(dersleriGenislet)
      setProgram(dersleriGenislet.filter((d) => d.aktif !== false))
      setOgretmenler(og.data || [])
      setAtamalar((ba.data || []).map((a) => ({ ...a, ogrenci_adi: a.ogrenciler?.ad_soyad })))
      setYoklamalar(by.data || [])
      setOgrenciAdMap(new Map((o.data || []).map((x) => [x.id, x.ad_soyad])))
      setLoading(false)
    })
  }

  useEffect(() => {
    veriyiYenile()
  }, [])

  // CANLI GÜNCELLEME (kullanıcı isteğiyle — bkz. Yoklama.jsx/DersProgrami.jsx'
  // teki aynı özellik): bu sayfa salt okunur olduğu için özellikle önemli —
  // öğretmenler günlerini planlamak için buna bakıyor, program değişince
  // burada da F5 gerekmeden anında güncellensin diye.
  useEffect(() => {
    const kanal = supabase
      .channel('gunluk-program-degisiklik')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ders_programi' }, () => veriyiYenile())
      .subscribe()
    return () => {
      supabase.removeChannel(kanal)
    }
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-2">Günlük Program</h1>
      <p className="text-sm text-gray-500 mb-6">
        O gün dersi olan öğretmenler — kiminle, kaçta. Salt okunur; bir dersi eklemek/düzenlemek için Ders
        Programı sayfasındaki "Ders Ekleme Aracı"nı kullanın.
      </p>
      {loading ? (
        <p className="text-gray-400">Yükleniyor...</p>
      ) : (
        <GunlukProgramListesi
          program={program}
          programTum={programTum}
          ogretmenler={ogretmenler}
          atamalar={atamalar}
          yoklamalar={yoklamalar}
          ogrenciAdMap={ogrenciAdMap}
        />
      )}
    </div>
  )
}
