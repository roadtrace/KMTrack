-- Read-only display names for at most one loaded inspection page.
-- No profile SELECT policy changes; no inspection or profile writes.
create or replace function public.inspection_owner_names(inspection_ids uuid[])
returns table (inspection_id uuid, owner_id uuid, display_name text)
language sql stable security definer
set search_path = ''
as $$
  select i.id, i.user_id, nullif(btrim(owner.full_name), '')
  from public.inspections i
  join public.profiles owner on owner.id = i.user_id
  join public.profiles viewer on viewer.id = auth.uid()
  where cardinality(inspection_ids) between 1 and 50
    and i.id = any(inspection_ids)
    and viewer.approved is true
    and (viewer.role = 'administrator'
      or (viewer.role in ('inspector', 'supervisor') and viewer.team is not null and i.team = viewer.team));
$$;
revoke all on function public.inspection_owner_names(uuid[]) from public, anon;
grant execute on function public.inspection_owner_names(uuid[]) to authenticated;
