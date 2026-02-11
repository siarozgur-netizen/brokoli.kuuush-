alter table public.people
add column if not exists linked_user_id uuid references auth.users(id) on delete set null;

alter table public.people
drop constraint if exists people_team_user_unique;

alter table public.people
add constraint people_team_user_unique unique (team_id, linked_user_id);
