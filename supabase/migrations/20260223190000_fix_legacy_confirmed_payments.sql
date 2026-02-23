-- 1) Legacy confirmed kayitlari duzelt
-- confirmed ama confirmed_by bos ise aliciyi confirmed_by yap
update public.settlement_payments
set
  confirmed_by_person_id = to_person_id,
  confirmed_at = coalesce(confirmed_at, created_at, now())
where status = 'confirmed'
  and confirmed_by_person_id is null;

-- 2) Kalici kural: confirmed kayitta confirmed_by zorunlu
alter table public.settlement_payments
drop constraint if exists settlement_payments_confirmed_requires_confirmer;

alter table public.settlement_payments
add constraint settlement_payments_confirmed_requires_confirmer
check (
  status <> 'confirmed'
  or confirmed_by_person_id is not null
);
