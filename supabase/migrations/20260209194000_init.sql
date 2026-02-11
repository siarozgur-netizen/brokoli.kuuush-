create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create unique index if not exists team_members_single_admin_idx
  on public.team_members(team_id)
  where role = 'admin';

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  code text not null unique,
  expires_at timestamptz,
  max_uses int,
  used_count int not null default 0,
  created_at timestamptz not null default now(),
  check (max_uses is null or max_uses > 0),
  check (used_count >= 0)
);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  date date not null,
  total_amount numeric(12,2) not null check (total_amount > 0),
  purchase_type text not null default 'satin_alim' check (purchase_type in ('satin_alim', 'munchies')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_splits (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  person_id uuid not null references public.people(id),
  percentage numeric(5,2) not null check (percentage >= 0 and percentage <= 100),
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (purchase_id, person_id)
);

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

create index if not exists purchases_team_date_idx on public.purchases(team_id, date);
create index if not exists people_team_idx on public.people(team_id);
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'people_team_user_unique'
  ) then
    alter table public.people
      add constraint people_team_user_unique unique (team_id, linked_user_id);
  end if;
end;
$$;
create index if not exists invites_team_idx on public.team_invites(team_id);
create index if not exists purchase_splits_purchase_idx on public.purchase_splits(purchase_id);
create index if not exists settlement_payments_team_date_idx on public.settlement_payments(team_id, paid_at desc);

create or replace function public.is_team_member(check_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = check_team_id
      and tm.user_id = auth.uid()
  );
$$;

create or replace function public.is_team_admin(check_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = check_team_id
      and tm.user_id = auth.uid()
      and tm.role = 'admin'
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prevent_team_without_admin()
returns trigger
language plpgsql
as $$
declare
  has_other_admin boolean;
begin
  if old.role <> 'admin' then
    return old;
  end if;

  if tg_op = 'DELETE' then
    select exists (
      select 1
      from public.team_members
      where team_id = old.team_id
        and role = 'admin'
        and user_id <> old.user_id
    ) into has_other_admin;

    if not has_other_admin then
      raise exception 'Team must keep exactly one admin.';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.role <> 'admin' then
    select exists (
      select 1
      from public.team_members
      where team_id = old.team_id
        and role = 'admin'
        and user_id <> old.user_id
    ) into has_other_admin;

    if not has_other_admin then
      raise exception 'Team must keep exactly one admin.';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists purchases_touch_updated_at on public.purchases;
create trigger purchases_touch_updated_at
before update on public.purchases
for each row execute function public.touch_updated_at();

drop trigger if exists team_members_admin_guard on public.team_members;
create trigger team_members_admin_guard
before delete or update on public.team_members
for each row execute function public.prevent_team_without_admin();

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.people enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_splits enable row level security;
alter table public.settlement_payments enable row level security;

create policy "teams_select_member"
  on public.teams for select
  using (public.is_team_member(id));

create policy "teams_insert_owner"
  on public.teams for insert
  with check (owner_id = auth.uid());

create policy "teams_update_admin"
  on public.teams for update
  using (public.is_team_admin(id))
  with check (public.is_team_admin(id));

create policy "team_members_select_member"
  on public.team_members for select
  using (public.is_team_member(team_id));

create policy "team_members_insert_admin_self"
  on public.team_members for insert
  with check (
    user_id = auth.uid()
    and role = 'admin'
    and exists (
      select 1
      from public.teams t
      where t.id = team_id
        and t.owner_id = auth.uid()
    )
  );

create policy "team_members_insert_admin_manage"
  on public.team_members for insert
  with check (
    public.is_team_admin(team_id)
  );

create policy "team_members_update_admin"
  on public.team_members for update
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));

create policy "team_members_delete_admin"
  on public.team_members for delete
  using (public.is_team_admin(team_id));

create policy "team_invites_select_member"
  on public.team_invites for select
  using (public.is_team_member(team_id));

create policy "team_invites_admin_manage"
  on public.team_invites for all
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));

create policy "people_select_member"
  on public.people for select
  using (public.is_team_member(team_id));

create policy "people_admin_modify"
  on public.people for all
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));

create policy "purchases_select_member"
  on public.purchases for select
  using (public.is_team_member(team_id));

create policy "purchases_member_insert"
  on public.purchases for insert
  with check (
    public.is_team_member(team_id)
    and created_by = auth.uid()
  );

create policy "purchases_admin_update"
  on public.purchases for update
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));

create policy "purchases_admin_delete"
  on public.purchases for delete
  using (public.is_team_admin(team_id));

create policy "purchase_splits_select_member"
  on public.purchase_splits for select
  using (
    exists (
      select 1
      from public.purchases p
      where p.id = purchase_id
        and public.is_team_member(p.team_id)
    )
  );

create policy "purchase_splits_member_insert"
  on public.purchase_splits for insert
  with check (
    exists (
      select 1
      from public.purchases p
      where p.id = purchase_id
        and public.is_team_member(p.team_id)
    )
  );

create policy "purchase_splits_admin_update"
  on public.purchase_splits for update
  using (
    exists (
      select 1
      from public.purchases p
      where p.id = purchase_id
        and public.is_team_admin(p.team_id)
    )
  )
  with check (
    exists (
      select 1
      from public.purchases p
      where p.id = purchase_id
        and public.is_team_admin(p.team_id)
    )
  );

create policy "purchase_splits_admin_delete"
  on public.purchase_splits for delete
  using (
    exists (
      select 1
      from public.purchases p
      where p.id = purchase_id
        and public.is_team_admin(p.team_id)
    )
  );

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
