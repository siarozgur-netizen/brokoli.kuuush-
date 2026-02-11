create table if not exists public.settlement_payments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  from_person_id uuid not null references public.people(id) on delete cascade,
  to_person_id uuid not null references public.people(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  paid_at date not null default current_date,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (from_person_id <> to_person_id)
);

create index if not exists settlement_payments_team_date_idx
  on public.settlement_payments(team_id, paid_at desc);

alter table public.settlement_payments enable row level security;

create policy "settlement_payments_select_member"
  on public.settlement_payments for select
  using (public.is_team_member(team_id));

create policy "settlement_payments_insert_member"
  on public.settlement_payments for insert
  with check (
    public.is_team_member(team_id)
    and created_by = auth.uid()
  );

create policy "settlement_payments_update_admin"
  on public.settlement_payments for update
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));

create policy "settlement_payments_delete_admin"
  on public.settlement_payments for delete
  using (public.is_team_admin(team_id));
