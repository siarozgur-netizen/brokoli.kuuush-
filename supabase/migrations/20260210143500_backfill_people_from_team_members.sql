insert into public.people (team_id, linked_user_id, name, is_active)
select
  tm.team_id,
  tm.user_id,
  coalesce(
    nullif(trim((au.raw_user_meta_data->>'full_name')), ''),
    nullif(trim((au.raw_user_meta_data->>'name')), ''),
    initcap(replace(split_part(au.email, '@', 1), '.', ' ')),
    'Katilimci'
  ) as name,
  true as is_active
from public.team_members tm
join auth.users au on au.id = tm.user_id
left join public.people p
  on p.team_id = tm.team_id
 and p.linked_user_id = tm.user_id
where p.id is null;
