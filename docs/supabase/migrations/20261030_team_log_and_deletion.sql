-- Run after 20261030_inspection_owner_names.sql. No inspection/photo content is retained by deletion.
-- The receipt prevents an old device or uncertain retry from re-inserting a deleted UUID.
begin;
create table if not exists public.inspection_deletion_receipts (
  inspection_id uuid primary key,
  owner_id uuid not null,
  team text not null,
  deleted_at timestamptz not null default now()
);
alter table public.inspection_deletion_receipts enable row level security;
revoke all on public.inspection_deletion_receipts from public, anon, authenticated;

create or replace function public.reject_deleted_inspection()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.inspection_deletion_receipts d where d.inspection_id = new.id) then
    raise exception 'This inspection was permanently deleted. Create a new inspection if needed.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.reject_deleted_inspection() from public, anon, authenticated;
drop trigger if exists reject_deleted_inspection on public.inspections;
create trigger reject_deleted_inspection before insert on public.inspections
for each row execute function public.reject_deleted_inspection();

create or replace function public.delete_own_inspection(inspection_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  viewer public.profiles%rowtype;
  target public.inspections%rowtype;
begin
  select * into viewer from public.profiles where id = auth.uid();
  if viewer.id is null or viewer.approved is not true or viewer.role not in ('inspector','supervisor')
    or viewer.team is null then
    raise exception 'An approved inspector or supervisor with an assigned team is required.' using errcode = '42501';
  end if;
  select * into target from public.inspections where id = inspection_id for update;
  if target.id is null then
    if exists (select 1 from public.inspection_deletion_receipts d where d.inspection_id = delete_own_inspection.inspection_id
      and d.owner_id = viewer.id and d.team = viewer.team) then return inspection_id; end if;
    raise exception 'Inspection unavailable or not owned by this account.' using errcode = '42501';
  end if;
  if target.user_id is distinct from viewer.id or target.team is distinct from viewer.team then
    raise exception 'Only your own submitted inspections can be deleted.' using errcode = '42501';
  end if;
  insert into public.inspection_deletion_receipts (inspection_id, owner_id, team)
    values (target.id, viewer.id, target.team);
  delete from public.inspections where id = target.id;
  return target.id;
end;
$$;
revoke all on function public.delete_own_inspection(uuid) from public, anon;
grant execute on function public.delete_own_inspection(uuid) to authenticated;

create or replace function public.team_inspection_summary()
returns table (owner_id uuid, display_name text, inspection_count bigint, last_inspected_at timestamptz, active_inspector boolean)
language sql stable security definer set search_path = '' as $$
  with viewer as (
    select p.team from public.profiles p where p.id = auth.uid() and p.approved is true
      and p.role in ('inspector','supervisor','administrator') and p.team is not null
  ), counts as (
    select i.user_id, count(*) as total, max(i.inspected_at) as latest
    from public.inspections i join viewer v on i.team = v.team group by i.user_id
  ), active as (
    select p.id, p.full_name from public.profiles p join viewer v on p.team = v.team
    where p.approved is true and p.role in ('inspector','supervisor')
  )
  select a.id, coalesce(nullif(btrim(a.full_name),''),'Name unavailable'), coalesce(c.total,0), c.latest, true
    from active a left join counts c on c.user_id = a.id
  union all
  select c.user_id, coalesce(nullif(btrim(p.full_name),''),'Name unavailable'), c.total, c.latest, false
    from counts c left join public.profiles p on p.id = c.user_id
    where not exists (select 1 from active a where a.id = c.user_id);
$$;
revoke all on function public.team_inspection_summary() from public, anon;
grant execute on function public.team_inspection_summary() to authenticated;

create or replace function public.team_inspection_page(filters jsonb default '{}'::jsonb,
  after_time timestamptz default null, after_id uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with viewer as (
    select p.team from public.profiles p where p.id = auth.uid() and p.approved is true
      and p.role in ('inspector','supervisor','administrator') and p.team is not null
  ), matched as materialized (
    select i.*, coalesce(nullif(btrim(p.full_name),''),'') as inspector_display_name
    from public.inspections i join viewer v on i.team = v.team
    left join public.profiles p on p.id = i.user_id
    where (nullif(filters->>'from','') is null or i.inspected_at >= ((filters->>'from')::date::text || 'T00:00:00+08:00')::timestamptz)
      and (nullif(filters->>'to','') is null or i.inspected_at < (((filters->>'to')::date + 1)::text || 'T00:00:00+08:00')::timestamptz)
      and (nullif(filters->>'type','') is null or i.defect_type = filters->>'type')
      and (nullif(filters->>'corridor','') is null or i.expressway = filters->>'corridor')
      and (nullif(filters->>'bound','') is null or i.direction = filters->>'bound')
      and (nullif(filters->>'lane','') is null or coalesce(i.lane_number::text,i.lane_other) = filters->>'lane')
      and (nullif(filters->>'inspector','') is null
        or (filters->>'inspector' = '__unassigned' and i.user_id is null)
        or i.user_id::text = filters->>'inspector')
      and (nullif(btrim(filters->>'search'),'') is null or position(lower(btrim(filters->>'search')) in
        lower(concat_ws(' ',i.defect_type,i.expressway,i.direction,i.lane_other,i.interchange_exit,i.interchange_segment,
          p.full_name,i.km_station::text,case when i.km_station is not null then
            'KM ' || (i.km_station / 1000)::integer::text || '+' || lpad(mod(i.km_station::integer,1000)::text,3,'0') end))) > 0)
  ), page as (
    select m.* from matched m where after_id is null
      or (after_time is null and m.inspected_at is null and m.id < after_id)
      or (after_time is not null and (m.inspected_at < after_time or m.inspected_at is null
        or (m.inspected_at = after_time and m.id < after_id)))
    order by m.inspected_at desc nulls last, m.id desc limit 51
  ), visible as (select * from page order by inspected_at desc nulls last,id desc limit 50)
  select jsonb_build_object('authorized',exists(select 1 from viewer),'total',(select count(*) from matched),
    'has_more',(select count(*) > 50 from page),
    'records',coalesce((select jsonb_agg(to_jsonb(r) order by r.inspected_at desc nulls last,r.id desc) from visible r),'[]'::jsonb));
$$;
revoke all on function public.team_inspection_page(jsonb,timestamptz,uuid) from public, anon;
grant execute on function public.team_inspection_page(jsonb,timestamptz,uuid) to authenticated;
commit;
