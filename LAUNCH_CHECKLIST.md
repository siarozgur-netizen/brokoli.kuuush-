# Launch Checklist (Soft Launch)

Bu dosya `Brokoli Satın Alım Takvimi` icin soft launch oncesi son kontrol listesidir.

## 1) Ortam ve Konfig (Zorunlu)

- [ ] `.env.local` dolu:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `npm run dev` hatasiz aciliyor.
- [ ] Supabase projesi dogru (app ile ayni URL ve key seti).

## 2) Veritabani Migration (Zorunlu)

- [ ] `supabase/migrations/20260209194000_init.sql`
- [ ] `supabase/migrations/20260210120000_add_purchase_type.sql`
- [ ] `supabase/migrations/20260210133000_allow_zero_percentage.sql`
- [ ] `supabase/migrations/20260210142000_people_linked_user.sql`
- [ ] `supabase/migrations/20260210143500_backfill_people_from_team_members.sql`
- [ ] `supabase/migrations/20260210150000_settlement_payments.sql`
- [ ] `supabase/migrations/20260211120000_settlement_double_approval.sql`

Hizli kontrol SQL:

```sql
select to_regclass('public.teams') as teams,
       to_regclass('public.team_members') as team_members,
       to_regclass('public.people') as people,
       to_regclass('public.purchases') as purchases,
       to_regclass('public.purchase_splits') as purchase_splits,
       to_regclass('public.settlement_payments') as settlement_payments;
```

## 3) Auth ve Team Akisi (Zorunlu)

- [ ] Yeni kullanici email ile giris yapabiliyor.
- [ ] Ilk giriste takim olusturma calisiyor.
- [ ] Admin davet kodu uretebiliyor.
- [ ] Ikinci kullanici kodla takima katilabiliyor.
- [ ] `Takim` sekmesinde uye isimleri gorunuyor.

## 4) Satin Alim ve Takvim (Zorunlu)

- [ ] Ayni gune birden fazla kayit eklenebiliyor.
- [ ] Satin alim ve munchies ayri bolumlerde calisiyor.
- [ ] TL dagitimi + esit bol calisiyor.
- [ ] Kayit silince takvimde aninda dusuyor.
- [ ] Silinen kayit ana ekran ve defterde de aninda dusuyor.

## 5) Defter ve Odeme Onayi (Zorunlu)

- [ ] Borclu odeme bildirimi acabiliyor (`pending`).
- [ ] Alacakli onaylayip/reddedebiliyor.
- [ ] Alacakli isterse tek adimda kapatabiliyor.
- [ ] Pending durumunda borclu butonu `Onay Bekleniyor` oluyor.
- [ ] Sadece `confirmed` odemeler hesaplamayi etkiliyor.

## 6) Rapor ve UI (Onemli)

- [ ] Rapor sayfasi aciliyor, toplamlar dogru.
- [ ] Kisi basi odeme grafigi gorunuyor.
- [ ] Mobil alt menu (`Takvim/Defter/Rapor/Takim`) calisiyor.
- [ ] Navigation progress bari gorunuyor.

## 7) Teknik Kontrol (Zorunlu)

- [ ] `npm run typecheck` geciyor.
- [ ] `npm run lint` geciyor (uyari olabilir, hata olmamali).
- [ ] Join API davet kodunda beklenen mesajlari veriyor.

## 8) Go / No-Go

### Go
- Tum zorunlu maddeler tamam.
- En az 2 hesapla tum kritik akis test edildi.

### No-Go
- Join/Team aksinda hata var.
- Satin alim silme/hesaplasma tutarsizlik var.
- Odeme onay akisi bozuk.

## 9) Launch Sonrasi 24 Saat Izleme

- [ ] Destek icin tek iletisim kanali acik (WhatsApp/Discord vb.).
- [ ] Gun icinde 2 kez hizli smoke test yapildi.
- [ ] Hata bildirimi gelirse `Takim`, `Defter`, `Join` akislarindan tekrarlandi.
