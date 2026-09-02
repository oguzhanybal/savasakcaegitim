import { tutarYaziyla } from '../lib/sayiYaziyla'

function paraFormat(n) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n || 0)
}

// Bir sözleşmenin GERÇEK 2 sayfalık (taraf bilgileri + mali hükümler / genel
// şartlar) görsel içeriği — Sozlesme.jsx'ten (/sozlesme/:id sayfası)
// AYNEN taşındı, TEK KELİME DEĞİŞTİRİLMEDEN (sadece hesaplanan değerler artık
// props olarak geliyor). İki kullanım yeri var:
//   1) Sozlesme.jsx — admin'in tarayıcıda görüp "Yazdır/PDF Kaydet" ile
//      bastığı interaktif sayfa.
//   2) Muhasebe.jsx — "WhatsApp'tan Gönder" tıklanınca, EKRANA hiç
//      basılmadan (bkz. containerRef ve position:fixed;left:-9999px
//      kullanan çağıran kod), html2canvas ile görsel PDF'e çevrilmek üzere
//      görünmez şekilde render edilir.
// Bu yüzden burada TEK BİR MADDE METNİ bile değiştirilmemeli — hukuki metin
// iki yerde de birebir aynı kalmalı.
export default function SozlesmeSayfalari({
  sozlesme,
  ogrenci,
  veliAdSoyad,
  iletisim,
  finalSinif,
  sozlesmeTarihiMetni,
  egitimDonemi,
  taksitler,
  kitapDahil,
  genelToplam,
  yayinBedeli,
  egitimBedeli,
  containerRef,
}) {
  return (
    <div ref={containerRef}>
      {/* SAYFA 1 — Taraf bilgileri + mali hükümler */}
      <div className="sozlesme-sayfa bg-white rounded-2xl print:rounded-none shadow-sm print:shadow-none border border-gray-100 print:border-0 p-8 mb-6 print:mb-0">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-white border border-gray-100 rounded-xl p-1.5 shrink-0">
              <img src="/logo.png" alt="Savaş Akça Eğitim" className="w-14 h-14 object-contain" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-navy tracking-wide">SAVAŞ AKÇA EĞİTİM</h1>
              <p className="text-lg font-semibold text-gray-700 mt-1">Öğrenci Sözleşmesi</p>
            </div>
          </div>
          <div className="text-right text-sm text-gray-500">
            <p>Sözleşme Tarihi: <span className="font-medium text-gray-800">{sozlesmeTarihiMetni}</span></p>
            <p>Eğitim Dönemi: <span className="font-medium text-gray-800">{egitimDonemi}</span></p>
          </div>
        </div>

        <div className="mb-6">
          <div className="bg-navy text-white text-sm font-semibold px-3 py-2 rounded-t-lg">1. TARAF BİLGİLERİ</div>
          <table className="w-full text-sm border border-t-0 border-gray-200 rounded-b-lg overflow-hidden">
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50 w-1/4">Öğrenci Ad Soyad</td>
                <td className="px-3 py-2 font-bold text-gray-800" colSpan={3}>{ogrenci.ad_soyad}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50">T.C. Kimlik No</td>
                <td className="px-3 py-2">{ogrenci.tc_kimlik_no || '—'}</td>
                <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50 w-1/6">Sınıf</td>
                <td className="px-3 py-2">{finalSinif}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50">Veli Adı Soyadı</td>
                <td className="px-3 py-2" colSpan={3}>{veliAdSoyad || '—'}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50">İletişim</td>
                <td className="px-3 py-2" colSpan={3}>{iletisim || '—'}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-semibold text-gray-600 bg-gray-50">Adres</td>
                <td className="px-3 py-2" colSpan={3}>{ogrenci.adres || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mb-8">
          <div className="bg-navy text-white text-sm font-semibold px-3 py-2 rounded-t-lg">2. MALİ HÜKÜMLER VE ÖDEME TABLOSU</div>
          <table className="w-full text-sm border border-t-0 border-gray-200 rounded-b-lg overflow-hidden">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-600">
                <th className="px-3 py-2 font-semibold w-16">Taksit</th>
                {kitapDahil && <th className="px-3 py-2 font-semibold w-24">Kalem</th>}
                <th className="px-3 py-2 font-semibold text-right">Ödeme Tutarı</th>
                <th className="px-3 py-2 font-semibold text-right">Vade Tarihi</th>
              </tr>
            </thead>
            <tbody>
              {taksitler.length === 0 && (
                <tr>
                  <td colSpan={kitapDahil ? 4 : 3} className="px-3 py-2 text-center text-gray-400">Peşin ödeme — taksit planı yok.</td>
                </tr>
              )}
              {taksitler.map((t) => (
                <tr key={`${t.kaynak}-${t.taksitNo}`} className="border-t border-gray-100">
                  <td className="px-3 py-1.5">
                    {t.taksitNo}
                    {kitapDahil && t.toplamSayi ? `/${t.toplamSayi}` : ''}
                  </td>
                  {kitapDahil && (
                    <td className="px-3 py-1.5">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          t.kaynak === 'kitap' ? 'bg-blue-100 text-blue-700' : 'bg-orange/10 text-orange'
                        }`}
                      >
                        {t.kaynak === 'kitap' ? 'Kitap' : sozlesme.kalem}
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-1.5 text-right">{paraFormat(t.tutar)}</td>
                  <td className="px-3 py-1.5 text-right">{t.vade.toLocaleDateString('tr-TR')}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-200 bg-orange/10">
                <td colSpan={kitapDahil ? 2 : 1} className="px-3 py-2 font-bold text-orange">TOPLAM</td>
                <td className="px-3 py-2 font-bold text-orange text-right">{paraFormat(genelToplam)}</td>
                <td className="px-3 py-2 font-bold text-orange text-right">
                  {taksitler.length > 1 ? 'TAKSİTLİ SATIŞ' : 'PEŞİN'}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-sm text-gray-600 mt-2">{tutarYaziyla(genelToplam)}</p>
        </div>

        <div className="grid grid-cols-2 gap-8 mt-16 text-sm">
          <div>
            <p className="font-semibold text-gray-700">SAVAŞ AKÇA EĞİTİM</p>
            <p className="text-gray-400 text-xs">(Kaşe - İmza)</p>
            <div className="border-b border-gray-300 mt-10" />
          </div>
          <div>
            <p className="font-semibold text-gray-700">VELİ / MÜTESELSİL KEFİL</p>
            <p className="text-gray-400 text-xs">{veliAdSoyad || 'Ad Soyad'} — (İmza)</p>
            <div className="border-b border-gray-300 mt-10" />
          </div>
        </div>
      </div>

      {/* SAYFA 2 — Genel şartlar (aynı 23 madde, sadece görünüm iyileştirildi) */}
      <div className="sozlesme-sayfa bg-white rounded-2xl print:rounded-none shadow-sm print:shadow-none border border-gray-100 print:border-0 p-8 print:p-5 text-[11.5px] leading-relaxed text-gray-700 text-justify">
        <h2 className="text-center text-lg font-bold text-navy mb-4 print:text-[14.5px] print:mb-1">KAYIT SÖZLEŞMESİ GENEL ŞARTLARI</h2>
        <p className="text-center text-xs text-gray-400 mb-1 print:text-[8.5px]">{egitimDonemi !== '—' ? egitimDonemi : ''} ÖĞRETİM YILI</p>
        <p className="text-center font-semibold text-gray-800 mb-4 print:text-[9.2px] print:mb-1">
          SAVAŞ AKÇA ÖZEL KİŞİSEL GELİŞİM KURSU ÖĞRENCİ KAYIT SÖZLEŞMESİ
        </p>
        <p className="mb-4 print:text-[8.8px] print:leading-snug print:mb-1.5">
          Savaş Akça Özel Kişisel Gelişim Kursu (bundan sonra "Kurs" olarak anılacaktır), işbu kayıt sözleşmesinin
          sonunda adı, soyadı ve adresi bulunan kursta öğrenim görmek isteyen öğrencinin velisi (bundan sonra
          "Veli" olarak anılacaktır) ile; kurs tarafından veliye sunulan bu sözleşme konusu işlem ve hizmetlere
          aşağıdaki hükümlerin uygulanacağı konusunda anlaşmışlardır.
        </p>

        <div className="sozlesme-maddeler">
        <h3 className="font-bold text-navy mt-4 mb-1">TANIMLAR</h3>
        <p className="mb-1"><b>Madde 1:</b> Bu sözleşmede adı geçen;</p>
        <p className="mb-1"><b>Kurs:</b> Savaş Akça Özel Kişisel Gelişim Kursu.</p>
        <p className="mb-1"><b>Öğrenci:</b> Savaş Akça Özel Kişisel Gelişim Kursunda öğrenim görmek isteyen ve sözleşmenin sonunda adı ve soyadı belirtilen kişi.</p>
        <p className="mb-1">
          <b>Program:</b> Öğrencinin öğrenim görmek istediği, içeriğin hangi ders ve konulardan oluşacağı kurumca
          belirlenecek olan "Lise ara sınıf takviye" ile "Üniversite" hazırlık amacıyla açılan program.
        </p>
        <p className="mb-3">
          <b>Mevzuat:</b> Kurs içerisindeki her türlü faaliyeti düzenleyen ilgili kanun, yönetmelik, yönerge,
          genelge ve diğer düzenlemeler.
        </p>

        <h3 className="font-bold text-navy mt-4 mb-1">GENEL ESASLAR</h3>
        <p className="mb-1">
          <b>Madde 2:</b> Öğrencinin kayıt olduğu program, kurs tarafından belirlenecek tarihler arasında
          uygulanacaktır. İlgili program başlamadan önce kurs tarafından öğrenciye program başlama tarihi
          duyurulacaktır.
        </p>
        <p className="mb-3">
          <b>Madde 3:</b> Öğrencinin kayıt olduğu program içeriği tamamen kurs tarafından belirlenir. Kurs
          tarafından belirlenen program, ilgili Milli Eğitim Müdürlüğü onayı ile yürürlüğe girer. Öğrenci veya
          velisinin ilgili program içeriğine müdahale hakkı yoktur; öğrenci bu zaman çizelgesine uymak zorundadır.
        </p>

        <h3 className="font-bold text-navy mt-4 mb-1">KAYIT İLE İLGİLİ ESASLAR</h3>
        <p className="mb-1">
          <b>Madde 4:</b> Özel Kişisel Gelişim Kursuna öğrenci kaydı, öğrenci velisinin müracaatı ile yapılır.
          Yapılan görüşmeler sonrasında Kurs ile Veli arasında sözleşme yapılır.
        </p>
        <p className="mb-3">
          <b>Madde 5:</b> Veli, kurs tarafından gönderilecek her türlü bilgilendirme mesajını almayı kabul eder;
          telefon ve GSM ayarlarını kurstan gelen sistem mesajlarına açık tutmaktan sorumludur.
        </p>

        <h3 className="font-bold text-navy mt-4 mb-1">DİSİPLİN İLE İLGİLİ ESASLAR</h3>
        <p className="mb-1"><b>Madde 6:</b> Kursumuzda disiplin ile ilgili esaslar mevzuat doğrultusunda yürütülür.</p>
        <p className="mb-1"><b>Madde 7:</b> Kursumuzda toplumca etik karşılanmayan hiçbir tutum ve davranışa yer verilmez.</p>
        <p className="mb-1">
          <b>Madde 8:</b> Kurs içerisinde işlenmiş suça göre disiplin kurulu mevzuatı gereğince öğrenciye ceza
          verilir; gerekirse öğrencinin kaydı kurs tarafından tek taraflı feshedilir.
        </p>
        <p className="mb-1"><b>Madde 9:</b> Kurs binası içerisinde öğrencilerin sigara içmesi yasaktır. Yasağa aykırı davranan öğrencilere ilgili mevzuat çerçevesinde işlem yapılır.</p>
        <p className="mb-3"><b>Madde 10:</b> Kurs binamız içerisinde her türlü alkollü içecek, gayri ahlaki yayın, siyasi bölücü yayın bulundurulamaz.</p>

        <h3 className="font-bold text-navy mt-4 mb-1">KAYIT SONRASI ÜCRET İADESİ</h3>
        <p className="mb-1"><b>Madde 11:</b> Kursumuz mali planlarını öğrenci kayıt sayısına göre yaptığından, kayıtlı öğrencilerin öğretim yılı boyunca kayıtlarını sildirmemeleri esastır.</p>
        <p className="mb-1">
          <b>Madde 12:</b> Öğretim dönemi içinde zorunlu bir sebeple kayıt sildirmek isteyen öğrenci için,
          velisinin yazılı müracaatı gereklidir. Müracaat sonrası kurs müdürü tarafından kayıt silme gerekçesi
          incelenerek kayıt silinir.
        </p>
        <p className="mb-1"><b>Madde 13:</b> Kaydı silinecek öğrencinin kursa herhangi bir borcunun bulunmaması gerekir. Borçlu öğrencinin borcu tahsil edildikten sonra kaydı silinir.</p>
        <p className="mb-1">
          <b>Madde 14:</b> Aşağıda belirtilen sebeplerden biri veya birkaçı dolayısıyla kurstan ayrılan öğrencilerin,
          ayrılış tarihinden sonraki aylara/günlere/saatlere isabet eden ödenmiş ücretleri iade edilir:
        </p>
        <p className="mb-1 pl-4">a) Öğrencinin il dışında başka bir kuruma nakil olması,</p>
        <p className="mb-1 pl-4">b) Öğrencinin sağlık sebebiyle kurumdan ayrılması,</p>
        <p className="mb-1 pl-4">c) Kursun kapatılması,</p>
        <p className="mb-3 pl-4">d) Kursun öğretime başlamasından önceki bir tarihte öğrencinin herhangi bir sebeple kurumdan ayrılması ve müracaat etmesi.</p>
        <p className="mb-1">
          <b>Madde 15:</b> Yayın bedeli (kitap, test, deneme sınavları vs.) {finalSinif} sınıfı için{' '}
          {yayinBedeli !== null ? paraFormat(yayinBedeli) : '……………………………'}'dir; eğitim bedeli ise{' '}
          {egitimBedeli !== null ? paraFormat(egitimBedeli) : '……………………………'}'dir. Toplam kurs ücreti{' '}
          {kitapDahil ? paraFormat(genelToplam) : '……………………………'}'dir. Eğitim programları sınıf düzeyinde farklılık göstermektedir. Kayıt iptali
          gerektiren durumlarda, her öğrenci için yayın ücreti ve eğitim ücreti ayrı hesaplanır; eğitim ücreti
          verilen eğitim süresi doğrultusunda hesaplanarak veliden tahsil edilir. Yayın bedeli peşin tahsil edilir
          ve iadesi kesinlikle yapılamaz.
        </p>
        <p className="mb-1"><b>Madde 16:</b> 1 Ocak 2027 tarihinden itibaren kayıt sildirme bedeli, kayıt ücretinin %40'ı olarak alınır.</p>
        <p className="mb-1"><b>Madde 17:</b> 1 Nisan 2027 tarihinde tüm konuların biteceği göz önünde bulundurularak, bu tarihten sonra kayıt iptali durumunda veliden kayıt ücretinin tamamı tahsil edilir.</p>
        <p className="mb-3">
          <b>Madde 18:</b> Kayıt esnasında ya da sonrasında yapılan peşin ödemelerin iadesi — yayın ücreti ve
          eğitim ücreti hesaplandıktan sonra kalan miktar, kayıt silme tarihi göz önüne alınarak 3 (üç) taksit
          şeklinde yapılacaktır.
        </p>

        <h3 className="font-bold text-navy mt-4 mb-1">MALİ YÜKÜMLÜLÜKLER İLE İLGİLİ ESASLAR</h3>
        <p className="mb-1"><b>Madde 19:</b> Kurs ücretinin peşin veya banka aracılığıyla aylık taksitler halinde ödenmesi esastır. Peşin ödemeler kayıt sırasında nakit olarak yapılır.</p>
        <p className="mb-1"><b>Madde 20:</b> Taksitli ödemelerde ödeme planı kurs tarafından belirlenir. Taksitler, kursun anlaştığı banka aracılığıyla tahsil edilir.</p>
        <p className="mb-3">
          <b>Madde 21:</b> Zamanında yapılmayan ödemeler için veliye 15 gün süre verilir. Bu süre sonunda ödeme
          yapılmamışsa öğretim hizmeti durdurulur ve veli hakkında yasal takibat yapılır.
        </p>

        <h3 className="font-bold text-navy mt-4 mb-1">SÜRE</h3>
        <p className="mb-3">
          <b>Madde 22:</b> Kursumuzun eğitim öğretim dönemi …………… ayında başlayıp{' '}
          …………… ayında sona erecektir.
        </p>

        <h3 className="font-bold text-navy mt-4 mb-1">TAAHHÜT</h3>
        <p className="mb-3">
          <b>Madde 23:</b> Savaş Akça Özel Kişisel Gelişim Kursuna, yukarıdaki tarihler arasında verilecek öğretim
          programı hizmeti karşılığında (……………………………………………) borcumuzdur.
        </p>

        <p className="font-semibold text-gray-800 mb-3">
          Bu sözleşme Savaş Akça Özel Kişisel Gelişim Kursu için geçerlidir. Bu sözleşmedeki bazı önemli hükümler
          koyu harfle yazılmıştır; bu hükümleri özellikle okumanız tavsiye olunur.
        </p>
        <p className="mb-3">
          Üst üste 2 taksiti vadesinde ödemediğimiz takdirde, bu tarihten itibaren geciken taksitlerin kanuni
          gecikme bedelinin tarafımıza ait olacağını; ihtilaf vukuunda bu sözleşmeden doğabilecek tüm
          anlaşmazlıklara Ankara Mahkemeleri ve İcra Dairelerinin yetkili olduğunu kabul ederim. İşbu kayıt
          sözleşmesinin tüm hükümlerini tarafımca eksiksiz olarak okumuş ve herhangi bir tereddüt olmaksızın
          anlamış olup, tamamen hür irade ve arzumla yukarıdaki ikaz çerçevesinde sözleşme şartlarını kesin
          olarak kabul ediyorum. İşbu sözleşmenin bir nüshası tarafıma teslim edilmiştir.
        </p>
        <p className="mb-6">İşbu sözleşmeden doğacak mükellefiyette Ankara Mahkemeleri ve İcra Daireleri yetkilidir.</p>
        </div>

        <div className="sozlesme-imza grid grid-cols-2 gap-8 mt-8 text-sm">
          <div>
            <p className="font-semibold text-gray-800">{ogrenci.ad_soyad}</p>
            <p className="text-xs text-gray-400">Öğrenci Adı Soyadı</p>
            <div className="border-b border-gray-300 mt-8" />
            <p className="text-xs text-gray-400 mt-1">İmza</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800">{veliAdSoyad || '—'}</p>
            <p className="text-xs text-gray-400">Veli Adı Soyadı</p>
            <div className="border-b border-gray-300 mt-8" />
            <p className="text-xs text-gray-400 mt-1">İmza</p>
          </div>
        </div>
      </div>
    </div>
  )
}
