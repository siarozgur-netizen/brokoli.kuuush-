alter table public.settlement_payments
add column if not exists status text not null default 'confirmed'
  check (status in ('pending', 'confirmed', 'rejected'));

alter table public.settlement_payments
add column if not exists requested_by_person_id uuid references public.people(id) on delete set null;

alter table public.settlement_payments
add column if not exists confirmed_by_person_id uuid references public.people(id) on delete set null;

alter table public.settlement_payments
add column if not exists confirmed_at timestamptz;

create or replace function public.current_user_person_id(check_team_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.people p
  where p.team_id = check_team_id
    and p.linked_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_settlement_party(
  check_team_id uuid,
  from_person uuid,
  to_person uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_person_id(check_team_id) in (from_person, to_person);
$$;

drop policy if exists "settlement_payments_update_admin" on public.settlement_payments;

create policy "settlement_payments_update_party"
  on public.settlement_payments for update
  using (
    public.is_team_admin(team_id)
    or public.is_settlement_party(team_id, from_person_id, to_person_id)
  )
  with check (
    public.is_team_admin(team_id)
    or public.is_settlement_party(team_id, from_person_id, to_person_id)
  );
