-- ============================================================
-- OKUL SİSTEMİ - VERİTABANI ŞEMASI
-- Bu dosyayı Supabase projenizde "SQL Editor" sekmesine
-- yapıştırıp "Run" ile çalıştırın. Tüm tabloları ve güvenlik
-- kurallarını tek seferde oluşturur.
-- ============================================================

-- ---------- KULLANICI PROFİLLERİ ----------
-- Supabase Auth kendi kullanıcı tablosunu tutar (auth.users).
-- Biz buna ek olarak "rol" bilgisini tutan bir profil tablosu ekliyoruz.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  ad_soyad text not null,
  rol text not null check (rol in ('yonetici', 'ogretmen', 'veli', 'ogrenci')),
  telefon text,
  created_at timestamptz default now()
);

-- ---------- ÖĞRENCİLER ----------
create table ogrenciler (
  id uuid primary key default gen_random_uuid(),
  ad_soyad text not null,
  telefon text,
  veli_profile_id uuid references profiles(id),   -- bu öğrencinin velisi kim (giriş yapan hesap)
  ogrenci_profile_id uuid references profiles(id), -- öğrencinin kendi giriş hesabı (varsa)
  created_at timestamptz default now()
);

-- ---------- SÖZLEŞMELER (Okul/Kurs/Kitap) ----------
create table sozlesmeler (
  id uuid primary key default gen_random_uuid(),
  ogrenci_id uuid references ogrenciler(id) on delete cascade,
  kalem text not null check (kalem in ('Okul', 'Kurs', 'Kitap')),
  toplam_tutar numeric not null default 0,
  ilk_taksit_tarihi date,
  taksit_sayisi int not null default 1,
  devreden_odenen numeric default 0,
  created_at timestamptz default now()
);

-- ---------- AYLIK BORÇLAR (Bire Bir / Yemek / Kantin) ----------
create table aylik_borclar (
  id uuid primary key default gen_random_uuid(),
  ogrenci_id uuid references ogrenciler(id) on delete cascade,
  kalem text not null check (kalem in ('Bire Bir', 'Yemek', 'Kantin')),
  donem date not null,       -- ayın herhangi bir günü, ay/yıl olarak kullanılır
  tutar numeric not null,
  created_at timestamptz default now()
);

-- ---------- ÖDEMELER (Kayıtlar) ----------
create table odemeler (
  id uuid primary key default gen_random_uuid(),
  ogrenci_id uuid references ogrenciler(id) on delete cascade,
  tarih timestamptz not null default now(),
  tutar numeric not null,
  kalem text,                 -- Okul / Kurs / Kitap / Bire Bir / Yemek / Kantin
  odeme_turu text,            -- NAKİT / IBAN vb.
  makbuz_no int,
  created_at timestamptz default now()
);

-- ---------- SINIFLAR / GRUPLAR ----------
create table siniflar (
  id uuid primary key default gen_random_uuid(),
  ad text not null,                              -- örn. "8. Sınıf Matematik"
  ogretmen_profile_id uuid references profiles(id),
  created_at timestamptz default now()
);

-- ---------- SINIF - ÖĞRENCİ EŞLEŞTİRME ----------
create table sinif_ogrenciler (
  sinif_id uuid references siniflar(id) on delete cascade,
  ogrenci_id uuid references ogrenciler(id) on delete cascade,
  primary key (sinif_id, ogrenci_id)
);

-- ---------- DERS PROGRAMI ----------
create table ders_programi (
  id uuid primary key default gen_random_uuid(),
  sinif_id uuid references siniflar(id) on delete cascade,
  gun int not null check (gun between 1 and 7),  -- 1=Pazartesi ... 7=Pazar
  baslangic_saat time not null,
  bitis_saat time not null,
  created_at timestamptz default now()
);

-- ---------- YOKLAMA ----------
create table yoklama (
  id uuid primary key default gen_random_uuid(),
  sinif_id uuid references siniflar(id) on delete cascade,
  ogrenci_id uuid references ogrenciler(id) on delete cascade,
  tarih date not null default current_date,
  geldi boolean not null default true,
  created_at timestamptz default now(),
  unique (sinif_id, ogrenci_id, tarih)
);

-- ============================================================
-- GÜVENLİK KURALLARI (Row Level Security)
-- Her rolün sadece görmesi gereken veriyi görmesini sağlar.
-- ============================================================

alter table profiles enable row level security;
alter table ogrenciler enable row level security;
alter table sozlesmeler enable row level security;
alter table aylik_borclar enable row level security;
alter table odemeler enable row level security;
alter table siniflar enable row level security;
alter table sinif_ogrenciler enable row level security;
alter table ders_programi enable row level security;
alter table yoklama enable row level security;

-- Yardımcı fonksiyon: giriş yapan kullanıcının rolünü döndürür
create or replace function auth_rol() returns text as $$
  select rol from profiles where id = auth.uid();
$$ language sql stable security definer;

-- Profiles: herkes kendi profilini görebilir, yönetici herkesi görür
create policy "kendi profili veya yonetici" on profiles for select
  using (id = auth.uid() or auth_rol() = 'yonetici');

-- Öğrenciler: yönetici + öğretmen tümünü görür, veli/öğrenci sadece kendisini
create policy "ogrenci gorme" on ogrenciler for select
  using (
    auth_rol() in ('yonetici', 'ogretmen')
    or veli_profile_id = auth.uid()
    or ogrenci_profile_id = auth.uid()
  );

create policy "ogrenci yazma" on ogrenciler for all
  using (auth_rol() = 'yonetici');

-- Muhasebe tabloları: SADECE yönetici + ilgili öğrencinin velisi görebilir (öğretmen ve öğrenci GÖREMEZ)
create policy "sozlesme gorme" on sozlesmeler for select
  using (
    auth_rol() = 'yonetici'
    or exists (select 1 from ogrenciler o where o.id = ogrenci_id and o.veli_profile_id = auth.uid())
  );
create policy "sozlesme yazma" on sozlesmeler for all using (auth_rol() = 'yonetici');

create policy "borc gorme" on aylik_borclar for select
  using (
    auth_rol() = 'yonetici'
    or exists (select 1 from ogrenciler o where o.id = ogrenci_id and o.veli_profile_id = auth.uid())
  );
create policy "borc yazma" on aylik_borclar for all using (auth_rol() = 'yonetici');

create policy "odeme gorme" on odemeler for select
  using (
    auth_rol() = 'yonetici'
    or exists (select 1 from ogrenciler o where o.id = ogrenci_id and o.veli_profile_id = auth.uid())
  );
create policy "odeme yazma" on odemeler for all using (auth_rol() = 'yonetici');

-- Sınıflar: yönetici hepsini, öğretmen sadece kendi sınıfını, veli/öğrenci kendi çocuğunun sınıfını
create policy "sinif gorme" on siniflar for select
  using (
    auth_rol() = 'yonetici'
    or ogretmen_profile_id = auth.uid()
    or exists (
      select 1 from sinif_ogrenciler so join ogrenciler o on o.id = so.ogrenci_id
      where so.sinif_id = siniflar.id and (o.veli_profile_id = auth.uid() or o.ogrenci_profile_id = auth.uid())
    )
  );
create policy "sinif yazma" on siniflar for all using (auth_rol() = 'yonetici');

-- Ders programı: sınıfı görebilen herkes programı da görebilir
create policy "program gorme" on ders_programi for select
  using (
    auth_rol() = 'yonetici'
    or exists (select 1 from siniflar s where s.id = sinif_id and s.ogretmen_profile_id = auth.uid())
    or exists (
      select 1 from sinif_ogrenciler so join ogrenciler o on o.id = so.ogrenci_id
      where so.sinif_id = ders_programi.sinif_id and (o.veli_profile_id = auth.uid() or o.ogrenci_profile_id = auth.uid())
    )
  );
create policy "program yazma" on ders_programi for all using (auth_rol() = 'yonetici');

-- Yoklama: yönetici + o sınıfın öğretmeni yazabilir/görebilir; veli/öğrenci sadece kendi çocuğunun yoklamasını görür
create policy "yoklama gorme" on yoklama for select
  using (
    auth_rol() = 'yonetici'
    or exists (select 1 from siniflar s where s.id = sinif_id and s.ogretmen_profile_id = auth.uid())
    or exists (select 1 from ogrenciler o where o.id = ogrenci_id and (o.veli_profile_id = auth.uid() or o.ogrenci_profile_id = auth.uid()))
  );
create policy "yoklama yazma ogretmen" on yoklama for insert
  with check (
    auth_rol() = 'yonetici'
    or exists (select 1 from siniflar s where s.id = sinif_id and s.ogretmen_profile_id = auth.uid())
  );
create policy "yoklama guncelleme ogretmen" on yoklama for update
  using (
    auth_rol() = 'yonetici'
    or exists (select 1 from siniflar s where s.id = sinif_id and s.ogretmen_profile_id = auth.uid())
  );

create policy "sinif_ogrenciler gorme" on sinif_ogrenciler for select
  using (auth_rol() in ('yonetici', 'ogretmen'));
create policy "sinif_ogrenciler yazma" on sinif_ogrenciler for all using (auth_rol() = 'yonetici');
