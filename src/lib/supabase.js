import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ============================================================================
// TÜM SATIRLARI SAYFALAYARAK GETİR — Supabase/PostgREST, filtrelenmemiş
// (`.eq`/`.in` ile küçük bir alt kümeye indirilmemiş) bir `.select('*')`
// isteğinde tek seferde EN FAZLA 1000 satır döndürür — tablo 1000'i AŞTIĞINDA
// bunu bir HATA olarak değil, SESSİZCE KESİLMİŞ (eksik) veri olarak döndürür.
//
// GERÇEK OLAY (kullanıcı tarafından bulundu — "Tural iki aydır ödeme yapmıyor
// ama kantin borcunu ödemiş gibi görünüyor"): AylikOzet.jsx'teki "Aylık Özet"
// sayfası, kümülatif bakiye hesaplayabilmek için `kantin_alislar` tablosunun
// TÜM ZAMANLARDAKİ tüm satırlarını (sadece o ay değil — geçmiş borç/ödeme
// karşılaştırması için hepsi gerekli) filtresiz çekiyordu. Kurum genelinde
// SADECE Eylül ayı içinde 960 kantin alışı varken (çok öğrenci + POS'tan
// gelen tek tek satırlar), tablo toplamda kolayca 1000'i geçiyor — bu yüzden
// sorgu, en son (en güncel) satırların BÜYÜK KISMINI hiç getirmiyordu. Sonuç:
// bir öğrencinin o ayki kantin tutarı olduğundan ÇOK DÜŞÜK hesaplanıyor, bu da
// "ödenmemiş borç" ile "gerçek borç" birbirine karışıp yanlışlıkla "ödenmiş"
// gibi görünen satırlar üretiyordu. Bu, DAHA ÖNCE `ders_programi` tablosunda
// (Cumartesi/Pazar derslerinin kaybolması) yaşanan AYNI kökten hatanın farklı
// bir tabloda tekrarı — oradaki çözüm "gereksiz eski satırları hiç çekme"
// idi, ama burada TÜM geçmiş veri gerçekten gerekli olduğu için (kümülatif
// bakiye hesabı geçmişe bağımlı), doğru çözüm sayfalama: 1000'er satırlık
// gruplar hâlinde, boş bir sayfa gelene kadar tekrar tekrar iste.
//
// Kullanım: eskiden `supabase.from('kantin_alislar').select('*')` olan bir
// yer, `tumSatirlariGetir(() => supabase.from('kantin_alislar').select('*'))`
// olur — dönen `{ data, error }` şekli AYNI kalır (Promise.all([...]) içinde
// `.data` ile okuyan mevcut kodun HİÇBİRİNİN değişmesine gerek kalmaz),
// sadece `data` artık kesilmeden TÜM satırları içerir. `sorguUret` bir
// FONKSİYON olmalı (hazır bir query nesnesi değil) — her sayfa için sıfırdan
// yeni bir sorgu nesnesi üretilmesi gerekiyor, aksi halde `.range()` üst üste
// binip yanlış sonuç verir.
// ============================================================================
const SAYFALAMA_BOYUTU = 1000

export async function tumSatirlariGetir(sorguUret) {
  let tumVeri = []
  let sayfa = 0
  while (true) {
    const bas = sayfa * SAYFALAMA_BOYUTU
    const bit = bas + SAYFALAMA_BOYUTU - 1
    const { data, error } = await sorguUret().range(bas, bit)
    if (error) return { data: tumVeri, error }
    tumVeri = tumVeri.concat(data || [])
    if (!data || data.length < SAYFALAMA_BOYUTU) break
    sayfa++
  }
  return { data: tumVeri, error: null }
}
