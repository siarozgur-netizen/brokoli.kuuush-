# Brokoli Satin Alim Takvimi

Takim bazli, cok kullanicili satin alim takip uygulamasi.

## Stack
- Next.js (App Router) + TypeScript
- Supabase (Auth + Postgres + RLS)
- FullCalendar (Month view)

## Ozellikler
- E-posta ile giris: magic link veya e-posta+sifre
- Ilk giris sonrasi: takim olusturma veya davet kodu ile katilim
- Takima katilan kullanici people listesine otomatik eklenir
- Takim rolleri: `admin`, `member`
- Admin yonetimi:
  - Kisi listesi (`/people`): ekle, yeniden adlandir, pasif yap, sil
  - Davet kodu uretimi (`/team`)
  - Satin alim kayitlarini duzenle/sil
- Takvim ana sayfa (`/`):
  - Ay gorunumu
  - Ayni gunde birden fazla satin alim
  - Ayni gun icin ayri `Munchies` bolumu (satin alim ile ayni kurallar)
  - Gun tiklayinca modalda liste + satin alim formu
- Satin alim formu:
  - `date`, `total_amount` (TRY), katilimci + kisi basi TL dagilimi
  - Kurallar: toplam > 0, en az 1 kisi, kisi basi TL toplami toplam tutara esit olmali
  - "Esit Bol" secenegi ile secili kisilere tutar otomatik esit dagitilir
  - `purchase_splits.amount` dogrudan TL olarak, `percentage` ise server tarafinda hesaplanarak saklanir
- Aylik rapor (`/report`):
  - Ay secimi
  - Toplam harcama
  - Kisi bazli toplamlar

## Rotalar
- `/` Takvim
- `/defter` Tekel Defteri (net borc/alacak + detay)
- `/people` Kisi yonetimi (admin-only)
- `/report` Aylik rapor
- `/auth` Giris/Kayit
- `/join` Takim olusturma veya davet kodu ile katilim
- `/team` Takim ve davet kodu yonetimi

## Kurulum
1. Bagimliliklari yukleyin:
   ```bash
   npm install
   ```
2. Ortam degiskenlerini hazirlayin:
   ```bash
   cp .env.example .env.local
   ```
3. Supabase Auth ayarlari:
   - Authentication > URL Configuration > Site URL: `http://localhost:3000`
   - Redirect URL ekleyin: `http://localhost:3000/auth/callback`
4. SQL migration calistirin:
   - Supabase Dashboard > SQL Editor
   - `supabase/migrations/20260209194000_init.sql` icerigini calistirin
5. Uygulamayi baslatin:
   ```bash
   npm run dev
   ```

## Launch Hazirlik
- Soft launch kontrol listesi: `LAUNCH_CHECKLIST.md`

## Gerekli Env Vars
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Veritabani
Migration dosyasi:
- `supabase/migrations/20260209194000_init.sql`
- `supabase/migrations/20260210120000_add_purchase_type.sql` (mevcut kurulumlar icin)
- `supabase/migrations/20260210133000_allow_zero_percentage.sql` (mevcut kurulumlar icin)
- `supabase/migrations/20260210142000_people_linked_user.sql` (mevcut kurulumlar icin)
- `supabase/migrations/20260210143500_backfill_people_from_team_members.sql` (eski uyeleri people tablosuna toplu eklemek icin)
- `supabase/migrations/20260210150000_settlement_payments.sql` (defterde borc kapatma odeme kayitlari icin)
- `supabase/migrations/20260211120000_settlement_double_approval.sql` (borclu bildirimi + alacakli onayi cift-imza akisi icin)

Olusan tablolar:
- `teams`
- `team_members`
- `team_invites`
- `people`
- `purchases`
- `purchase_splits`

## RLS Kurallari (Ozet)
- Kullanici sadece uye oldugu takim verilerine erisebilir.
- `people`: sadece admin insert/update/delete yapabilir.
- `purchases`: uye insert yapabilir, admin update/delete yapabilir.
- `team_invites`: sadece admin yonetebilir.

## Notlar
- Para birimi sabit: `TRY`
- `team_members` icinde takim basina tek admin rolunu sinirlayan unique partial index vardir.
- Davet kodu katiliminda `SUPABASE_SERVICE_ROLE_KEY` ile sunucu tarafi dogrulama yapilir.
