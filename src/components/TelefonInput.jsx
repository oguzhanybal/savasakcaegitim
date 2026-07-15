import { telefonGirdiIsle, telefonYerelGoster, telefonUyariGoster } from '../lib/telefonFormat'

// Tüm telefon giriş alanlarında (Öğrenciler, Öğretmenler, Kullanıcı Oluştur)
// kullanılan ortak bileşen: sabit "+90" öneki + kullanıcının sadece 10 haneli
// yerel numarayı (5 ile başlayan) yazdığı, boşluklarla gruplanmış ("532 422 17
// 37") bir giriş kutusu. "value" ve onChange'e giden değer HER ZAMAN
// veritabanı formatındadır ("90XXXXXXXXXX" ya da boş) — çağıran taraf hiçbir
// dönüşüm yapmadan doğrudan Supabase'e yazabilir.
//
// autoComplete="off": tarayıcı (Chrome) bazen bu kutuya, formda başka bir yerde
// (ör. başka bir öğrencinin velisi için) daha önce girilmiş bambaşka bir
// numarayı "öneri" olarak gösteriyordu — kafa karıştırmasın diye kapatıldı.
export default function TelefonInput({ value, onChange, girdiSinifi, placeholder = '532 422 17 37' }) {
  const uyariGoster = telefonUyariGoster(value)
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="px-2.5 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-500 font-medium shrink-0">
          +90
        </span>
        <input
          value={telefonYerelGoster(value)}
          onChange={(e) => onChange(telefonGirdiIsle(e.target.value))}
          className={girdiSinifi}
          placeholder={placeholder}
          inputMode="numeric"
          maxLength={13}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />
      </div>
      {!value && <p className="text-[11px] text-gray-400 mt-0.5">90 yazmanıza gerek yok, doğrudan 5 ile başlayın.</p>}
      {uyariGoster && <p className="text-[11px] text-red-500 mt-0.5">10 haneli olmalı ve 5 ile başlamalı.</p>}
    </div>
  )
}
