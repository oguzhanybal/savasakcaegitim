// TYT/AYT müfredatındaki BİLİNEN, standart konu adlarının derse göre
// listesi — SinavKitapciklari.jsx'teki "Konu Adları" panelinde, sistemin
// KENDİ verisinde (henüz doğru yazılmış bir örneği olmayan) konular için de
// öneri/otomatik-düzeltme kaynağı olarak kullanılıyor. Bu liste MEB/ÖSYM'nin
// yıllar içinde nispeten sabit kalan genel müfredat konu başlıklarından
// derlenmiştir; amaç eksiksiz resmi bir doküman olmak değil, PDF'teki font
// kodlama hatasıyla bozulan (ör. "Paragraf" yerine "Paragraa") konu adlarını
// yakalayabilecek kadar geniş bir karşılaştırma havuzu sağlamaktır.
//
// Anahtarlar (ders adları), sinav_soru_sonuclari.ders_adi ile karşılaştırılırken
// KÜÇÜK HARFE çevrilip eşleştirilir (bkz. SinavKitapciklari.jsx), o yüzden
// buradaki yazım biçimi (büyük/küçük harf) önemli değildir, sadece harfler önemli.
export const KONU_REFERANS = {
  Türkçe: [
    'Sözcükte Anlam', 'Cümlede Anlam', 'Paragrafta Anlam', 'Paragrafta Yapı',
    'Paragrafta Düşünceyi Geliştirme Yolları', 'Paragrafta Anlatım Teknikleri',
    'Paragraf Cümle Yorumlama', 'Ses Bilgisi', 'Yazım Kuralları', 'Noktalama İşaretleri',
    'Sözcükte Yapı', 'Ekler', 'İsim (Ad)', 'İsim Tamlaması', 'Sıfat', 'Sıfat Tamlaması',
    'Zamir', 'Zarf', 'Edat', 'Bağlaç', 'Ünlem', 'Fiil', 'Fiilde Anlam (Kip-Kişi)',
    'Ek Fiil', 'Fiilimsi', 'Fiilde Çatı', 'İki Cümleyi Birleştirme', 'Cümlenin Ögeleri',
    'Cümle Türleri', 'Anlatım Bozukluğu', 'Ana Düşünce', 'Yardımcı Düşünce',
  ],
  Matematik: [
    'Temel Kavramlar', 'Sayı Basamakları', 'Bölme ve Bölünebilme', 'EBOB-EKOK',
    'Rasyonel Sayılar', 'Ondalık Sayılar', 'Basit Eşitsizlikler', 'Mutlak Değer',
    'Üslü Sayılar', 'Köklü Sayılar', 'Çarpanlara Ayırma', 'Oran-Orantı',
    'Denklem Çözme', 'Sayı Problemleri', 'Kesir Problemleri', 'Yaş Problemleri',
    'İşçi-Havuz Problemleri', 'Hareket Problemleri', 'Yüzde Problemleri',
    'Kar-Zarar Problemleri', 'Karışım Problemleri', 'Kümeler', 'Fonksiyonlar',
    'Polinomlar', 'İkinci Dereceden Denklemler', 'Permütasyon', 'Kombinasyon',
    'Olasılık', 'İstatistik', 'Mantık', 'Trigonometri', 'Logaritma', 'Diziler',
    'Limit', 'Türev', 'İntegral', 'Karmaşık Sayılar',
  ],
  Geometri: [
    'Doğruda ve Üçgende Açılar', 'Üçgende Açı-Kenar Bağıntıları', 'Özel Üçgenler',
    'Açıortay', 'Kenarortay', 'Eşlik ve Benzerlik', 'Üçgende Alan', 'Çokgenler',
    'Dörtgenler', 'Yamuk', 'Paralelkenar', 'Eşkenar Dörtgen', 'Deltoid',
    'Çember ve Daire', 'Çemberde Açı', 'Çemberde Uzunluk', 'Dairede Alan',
    'Katı Cisimler', 'Prizmalar', 'Piramitler', 'Küre', 'Silindir', 'Koni',
    'Analitik Geometri', 'Noktanın Analitiği', 'Doğrunun Analitiği', 'Vektörler',
    'Dönüşüm Geometrisi',
  ],
  Fizik: [
    'Fizik Bilimine Giriş', 'Madde ve Özellikleri', 'Sıvıların Kaldırma Kuvveti',
    'Basınç', 'Isı ve Sıcaklık', 'Genleşme', 'Hareket', 'Kuvvet ve Hareket',
    "Newton'un Hareket Yasaları", 'İş-Güç-Enerji', 'Momentum ve İtme',
    'Elektrostatik', 'Elektrik Akımı', 'Manyetizma', 'Elektrik ve Manyetizma',
    'Işık ve Aydınlanma', 'Yansıma', 'Kırılma', 'Mercekler', 'Dalgalar',
    'Basit Harmonik Hareket', 'Elektromanyetik İndüksiyon', 'Atom Fiziğine Giriş',
    'Modern Fizik', 'Çembersel Hareket', 'Kütle Merkezi ve Tork',
  ],
  Kimya: [
    'Kimya Bilimi', 'Atom ve Periyodik Sistem', 'Kimyasal Türler Arası Etkileşimler',
    'Maddenin Halleri', 'Kimyasal Hesaplamalar', 'Mol Kavramı', 'Karışımlar',
    'Asitler-Bazlar-Tuzlar', 'Kimya Her Yerde', 'Kimyasal Tepkimeler',
    'Tepkimelerde Enerji', 'Gazlar', 'Sıvı Çözeltiler ve Çözünürlük',
    'Kimyasal Tepkimelerde Hız', 'Kimyasal Tepkimelerde Denge', 'Elektrokimya',
    'Organik Kimya', 'Karbon Kimyasına Giriş', 'Enerji Kaynakları ve Bilimsel Gelişmeler',
  ],
  Biyoloji: [
    'Canlıların Ortak Özellikleri', 'Canlıların Temel Bileşenleri', 'Hücre ve Organelleri',
    'Hücre Zarı', 'Hücre Duvarı', 'Sitoplazma', 'Çekirdek', 'Ribozomlar',
    'Endoplazmik Retikulum', 'Golgi Cisimciği', 'Lizozomlar', 'Mitokondri',
    'Kloroplast', 'Koful', 'Hücre Zarından Madde Geçişi', 'Canlıların Sınıflandırılması',
    'Mitoz', 'Mayoz', 'Mitoz Bölünme', 'Mayoz Bölünme', 'Eşeyli Üreme', 'Eşeysiz Üreme',
    'Kalıtım', 'Kalıtımın Genel İlkeleri', 'Eşeye Bağlı Kalıtım', 'Akraba Evliliği',
    'Çok Genli Kalıtım', 'Eş Baskınlık', 'Kan Grupları Kalıtımı', 'Genetik',
    'DNA ve Genetik Şifre', 'Genden Proteine', 'Protein Sentezi', 'Nükleik Asitler',
    'Ekosistem Ekolojisi', 'Popülasyon Ekolojisi', 'Madde Döngüleri', 'Enerji Akışı',
    'Güncel Çevre Sorunları', 'Sindirim Sistemi', 'Dolaşım Sistemi', 'Solunum Sistemi',
    'Boşaltım Sistemi', 'Sinir Sistemi', 'Endokrin Sistem', 'Üreme Sistemi',
    'Duyu Organları', 'Destek ve Hareket Sistemi', 'Bitki Biyolojisi', 'Bitkilerde Taşıma',
    'İnsan Fizyolojisi', 'Biyoteknoloji ve Gen Mühendisliği', 'Fotosentez',
    'Hücresel Solunum', 'Canlılarda Enerji Dönüşümleri',
  ],
  Tarih: [
    'Tarih ve Zaman', 'İnsanlığın İlk Dönemleri', "Orta Çağ'da Dünya",
    'İlk ve Orta Çağlarda Türk Dünyası', 'İslam Medeniyetinin Doğuşu',
    "Türklerin İslamiyet'i Kabulü", 'Yerleşme ve Devletleşme Sürecinde Selçuklu Türkiyesi',
    'Beylikten Devlete Osmanlı Devleti', 'Devletleşme Sürecinde Savaşçılar ve Askerler',
    'Beylikten Devlete Osmanlı Medeniyeti', 'Dünya Gücü Osmanlı',
    'Sultan ve Osmanlı Merkez Teşkilatı', 'Klasik Çağda Osmanlı Toplum Düzeni',
    'Değişen Dünya Dengeleri Karşısında Osmanlı Siyaseti', 'Değişim Çağında Avrupa ve Osmanlı',
    'Uluslararası İlişkilerde Denge Stratejisi', 'Devrimler Çağında Değişen Devlet-Toplum İlişkileri',
    'Sermaye ve Emek', 'XIX. ve XX. Yüzyılda Değişen Gündelik Hayat',
    'XX. Yüzyıl Başlarında Osmanlı Devleti ve Dünya', 'Milli Mücadele',
    'Atatürkçülük ve Türk İnkılabı', 'İki Savaş Arasındaki Dönemde Türkiye ve Dünya',
    'İkinci Dünya Savaşı Sürecinde Türkiye ve Dünya',
    'İkinci Dünya Savaşı Sonrasında Türkiye ve Dünya', "XXI. Yüzyılın Eşiğinde Türkiye ve Dünya",
    'İşgallerin Başlaması ve Mütarekesi', "İslamiyet'i Kabul Eden İlk Türk Devletleri",
  ],
  Coğrafya: [
    'Doğa ve İnsan', "Dünya'nın Şekli ve Hareketleri", 'Coğrafi Konum', 'Harita Bilgisi',
    'Atmosfer ve İklim', 'İklim Tipleri', 'Basınç ve Rüzgarlar', 'Nem, Yağış ve Buharlaşma',
    'Su, Toprak ve Bitkiler', 'İç Kuvvetler', 'Dış Kuvvetler', 'Nüfus', 'Göç', 'Yerleşme',
    "Türkiye'nin Yer Şekilleri", 'Ekosistem ve Biyoçeşitlilik', 'Nüfus Politikaları',
    'Şehirler ve Etki Alanları', 'Ekonomik Faaliyetler ve Doğal Kaynaklar',
    'Küresel Ortam: Bölgeler ve Ülkeler', 'Çevre ve Toplum', 'Doğal Afetler',
    'Bölge Kavramı ve Türleri', 'Türkiye\'de Göçler',
  ],
  Felsefe: [
    'Felsefenin Konusu', 'Bilgi Felsefesi', 'Varlık Felsefesi', 'Din-Kültür-Felsefe İlişkisi',
    'Ahlak Felsefesi', 'Sanat Felsefesi', 'Din Felsefesi', 'Siyaset Felsefesi',
    'Bilim Felsefesi', 'İlk Çağ Felsefesi', 'Orta Çağ Felsefesi', '15-17. Yüzyıl Felsefesi',
    '18-19. Yüzyıl Felsefesi', '20. Yüzyıl Felsefesi', 'Psikoloji Bilimini Tanıyalım',
    'Psikolojinin Temel Süreçleri', 'Öğrenme, Bellek, Düşünme', 'Ruh Sağlığının Temelleri',
    'Sosyolojiye Giriş', 'Birey ve Toplum', 'Toplumsal Yapı', 'Toplumsal Değişme ve Gelişme',
    'Toplum ve Kültür', 'Mantığa Giriş', 'Klasik Mantık', 'Mantık ve Dil',
  ],
  'Din Kültürü': [
    'Bilgi ve İnanç', 'İslam ve İbadet', 'İslam Düşüncesinde Yorumlar', 'Din ve Hayat',
    'Gençlik ve Değerler', "Kur'an'a Göre Hz. Muhammed", 'Ahiret İnancı', 'Kader İnancı',
    'İslam ve Bilim', "Anadolu'da İslam", 'İslam Düşüncesinde Tasavvufi Yorumlar',
    'İslam Dini ve Değerler', 'Yaşayan Dinler',
  ],
}
