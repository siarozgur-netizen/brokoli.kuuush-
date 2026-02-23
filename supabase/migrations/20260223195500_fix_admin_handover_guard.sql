create or replace function public.prevent_team_without_admin()
returns trigger
language plpgsql
as $$
declare
  has_other_admin boolean;
  has_other_member boolean;
  team_exists boolean;
begin
  if old.role <> 'admin' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.role <> 'admin') then
    select exists (
      select 1
      from public.team_members
      where team_id = old.team_id
        and role = 'admin'
        and user_id <> old.user_id
    ) into has_other_admin;

    if has_other_admin then
      return case when tg_op = 'DELETE' then old else new end;
    end if;

    -- Allow temporary no-admin state only if there are other members.
    -- Application layer immediately promotes next admin in this case.
    select exists (
      select 1
      from public.team_members
      where team_id = old.team_id
        and user_id <> old.user_id
    ) into has_other_member;

    if has_other_member then
      return case when tg_op = 'DELETE' then old else new end;
    end if;

    -- Allow cascade deletes while team is being removed.
    select exists (
      select 1
      from public.teams
      where id = old.team_id
    ) into team_exists;

    if not team_exists then
      return case when tg_op = 'DELETE' then old else new end;
    end if;

    raise exception 'Team must keep exactly one admin.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
