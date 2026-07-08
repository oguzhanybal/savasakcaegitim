# Savaş Akça Eğitim - Sistem

## Kurulum Adımları

### 1) Supabase (veritabanı) kurulumu
1. https://supabase.com adresinden ücretsiz hesap açın
2. "New Project" ile yeni proje oluşturun
3. Sol menüden "SQL Editor"a girin, `supabase_schema.sql` dosyasının içeriğini yapıştırıp "Run" deyin
4. Sol menüden "Project Settings > API"ye girin, "Project URL" ve "anon public" anahtarını kopyalayın

### 2) Kodu GitHub'a yükleme
1. https://github.com adresinden ücretsiz hesap açın
2. Yeni bir repo (depo) oluşturun, örn. "okul-sistemi"
3. Bu klasördeki tüm dosyaları GitHub'ın web arayüzünden sürükle-bırak ile yükleyin

### 3) Vercel ile yayına alma
1. https://vercel.com adresinden GitHub hesabınızla giriş yapın
2. "Add New Project" ile GitHub'daki "okul-sistemi" reposunu seçin
3. "Environment Variables" kısmına şunları ekleyin:
   - VITE_SUPABASE_URL = (Supabase'den kopyaladığınız Project URL)
   - VITE_SUPABASE_ANON_KEY = (Supabase'den kopyaladığınız anon key)
4. "Deploy" butonuna basın, birkaç dakika içinde siteniz yayında olur

### 4) İlk kullanıcıları oluşturma
Supabase Dashboard > Authentication > Users kısmından yönetici hesabınızı manuel ekleyin,
sonra SQL Editor'den profiles tablosuna rol='yonetici' olarak bir satır ekleyin.
