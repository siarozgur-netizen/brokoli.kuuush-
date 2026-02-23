create table if not exists public.user_active_teams (
  user_id uuid primary key references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create index if not exists user_active_teams_team_idx
  on public.user_active_teams(team_id);

alter table public.user_active_teams enable row level security;

drop policy if exists "user_active_teams_select_own" on public.user_active_teams;
create policy "user_active_teams_select_own"
  on public.user_active_teams for select
  using (user_id = auth.uid());

drop policy if exists "user_active_teams_insert_own" on public.user_active_teams;
create policy "user_active_teams_insert_own"
  on public.user_active_teams for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.team_members tm
      where tm.team_id = user_active_teams.team_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "user_active_teams_update_own" on public.user_active_teams;
create policy "user_active_teams_update_own"
  on public.user_active_teams for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.team_members tm
      where tm.team_id = user_active_teams.team_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "user_active_teams_delete_own" on public.user_active_teams;
create policy "user_active_teams_delete_own"
  on public.user_active_teams for delete
  using (user_id = auth.uid());
