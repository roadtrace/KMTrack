-- Unified own-record edits and photo removal. Apply after the R2 operations migration.
-- No existing rows are edited or deleted by installing these functions.
begin;
create table public.inspection_action_receipts (
 id uuid primary key, owner_id uuid not null, inspection_id uuid not null,
 kind text not null, payload_hash text not null, created_at timestamptz not null default now()
);
alter table public.inspection_action_receipts enable row level security;
revoke all on public.inspection_action_receipts from public,anon,authenticated,service_role;
-- Private locators only; physical legacy image removal is retried by the production Worker.
create table public.inspection_legacy_photo_cleanup (
 object_key text primary key, queued_at timestamptz not null default now(),
 lease_id uuid, lease_until timestamptz, not_before timestamptz not null default now()
);
alter table public.inspection_legacy_photo_cleanup enable row level security;
revoke all on public.inspection_legacy_photo_cleanup from public,anon,authenticated,service_role;
create function public.queue_legacy_inspection_photo()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.photo_path is not null and old.photo_path = old.team||'/'||old.id::text||'/'||old.photo_filename
 and old.photo_filename ~ '^photo-v1-[a-f0-9]{64}\.jpg$' then
  insert into public.inspection_legacy_photo_cleanup(object_key) values(old.photo_path) on conflict do nothing;
 end if;
 return old;
end;$$;
revoke all on function public.queue_legacy_inspection_photo() from public,anon,authenticated;
create trigger queue_legacy_inspection_photo before delete on public.inspections for each row execute function public.queue_legacy_inspection_photo();

create function public.own_inspection_snapshot(inspection_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare i public.inspections%rowtype; p public.profiles%rowtype; cur uuid;
begin
 select * into p from public.profiles where id=auth.uid();
 select * into i from public.inspections where id=inspection_id;
 if p.approved is not true or p.role not in ('inspector','supervisor') or p.team is null
 or i.id is null or i.user_id is distinct from p.id or i.team is distinct from p.team then
  raise exception 'Own inspection required' using errcode='42501';
 end if;
 select id into cur from public.inspection_photo_uploads where inspection_photo_uploads.inspection_id=i.id and environment='production' and is_current;
 return jsonb_build_object('record',to_jsonb(i),'photo',jsonb_build_object('current_id',cur,'legacy_path',i.photo_path,'legacy_filename',i.photo_filename));
end;$$;
revoke all on function public.own_inspection_snapshot(uuid) from public,anon;
grant execute on function public.own_inspection_snapshot(uuid) to authenticated;

create function public.apply_inspection_action(action_id uuid,inspection_id uuid,kind text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles%rowtype; i public.inspections%rowtype; changed public.inspections%rowtype;
 r public.inspection_action_receipts%rowtype; actual jsonb; names text[] := array['defect_type','expressway','direction','lane_number','lane_other','km_station','interchange_exit','interchange_segment'];
 cur uuid; photo jsonb; k text;
begin
 select * into p from public.profiles where id=auth.uid();
 if p.id is null or p.approved is not true or p.role not in ('inspector','supervisor') or p.team is null then
  raise exception 'Approved own account required' using errcode='42501'; end if;
 if action_id is null or inspection_id is null or kind not in ('edit','remove_photo','delete') or payload is null then
  raise exception 'Invalid action' using errcode='22023'; end if;
 -- Serialize retries of the same action, including concurrent tabs.
 perform pg_advisory_xact_lock(hashtextextended(action_id::text,0));
 select * into r from public.inspection_action_receipts where id=action_id;
 if r.id is not null then
  if r.owner_id<>p.id or r.inspection_id<>inspection_id or r.kind<>kind or r.payload_hash<>md5(payload::text) then
   raise exception 'Action identity conflict' using errcode='23514'; end if;
  return jsonb_build_object('done',true);
 end if;
 select * into i from public.inspections where id=inspection_id for update;
 if kind='delete' and i.id is null then
  perform public.delete_own_inspection(inspection_id);
 else
  if i.id is null or i.user_id is distinct from p.id or i.team is distinct from p.team then
   raise exception 'Own inspection required' using errcode='42501'; end if;
  if kind='edit' then
   select jsonb_object_agg(key,value) into actual from jsonb_each(to_jsonb(i)) where key=any(names);
   if actual is distinct from payload->'base' then raise exception 'Inspection changed; reopen to review' using errcode='23514'; end if;
   if jsonb_typeof(payload->'changes')<>'object' or (select count(*) from jsonb_object_keys(payload->'changes'))<>8
    or exists(select 1 from jsonb_object_keys(payload->'changes') key where not key=any(names)) then
    raise exception 'Invalid editable fields' using errcode='22023'; end if;
   foreach k in array names loop
    if jsonb_typeof(payload->'changes'->k) not in ('null','string','number') or length(payload->'changes'->>k)>500 then
     raise exception 'Invalid field value' using errcode='22023'; end if;
   end loop;
   changed := jsonb_populate_record(i,payload->'changes');
   if changed.defect_type is null or btrim(changed.defect_type)='' or changed.lane_number is not null and changed.lane_number not between 1 and 4
    or changed.lane_number is not null and changed.lane_other is not null then raise exception 'Invalid inspection' using errcode='22023'; end if;
   update public.inspections set defect_type=changed.defect_type,expressway=changed.expressway,direction=changed.direction,
    lane_number=changed.lane_number,lane_other=changed.lane_other,km_station=changed.km_station,
    interchange_exit=changed.interchange_exit,interchange_segment=changed.interchange_segment where id=i.id;
  elsif kind='remove_photo' then
   select id into cur from public.inspection_photo_uploads where inspection_photo_uploads.inspection_id=i.id and environment='production' and is_current;
   photo := jsonb_build_object('current_id',cur,'legacy_path',i.photo_path,'legacy_filename',i.photo_filename);
   if photo is distinct from payload->'photo' then raise exception 'Photo changed; reopen to review' using errcode='23514'; end if;
   if i.photo_path is not null then
    if i.photo_path is distinct from i.team||'/'||i.id::text||'/'||i.photo_filename or i.photo_filename !~ '^photo-v1-[a-f0-9]{64}\.jpg$' then
     raise exception 'Photo locator needs review' using errcode='23514'; end if;
    insert into public.inspection_legacy_photo_cleanup(object_key) values(i.photo_path) on conflict do nothing;
   end if;
   update public.inspections set photo_path=null,photo_filename=null where id=i.id;
   -- Cancel pre-removal reservations too, so a late finalize cannot restore a removed photo.
   update public.inspection_photo_uploads set state='abandoned',is_current=false
    where inspection_photo_uploads.inspection_id=i.id and environment='production' and state in ('reserved','uploaded');
   insert into public.inspection_photo_cleanup(bucket_name,object_key)
    select bucket_name,object_key from public.inspection_photo_uploads where inspection_photo_uploads.inspection_id=i.id and environment='production' and state='abandoned'
    on conflict do nothing;
   insert into public.inspection_photo_cleanup(bucket_name,object_key)
    select bucket_name,replace(object_key,'/evidence.jpg','/thumbnail.jpg') from public.inspection_photo_uploads where inspection_photo_uploads.inspection_id=i.id and environment='production' and state='abandoned'
    on conflict do nothing;
   if cur is not null then
    perform public.r2_photo_command(p.id,'remove',jsonb_build_object('inspection_id',i.id,'upload_id',cur,'environment','production'));
   end if;
  else perform public.delete_own_inspection(inspection_id);
  end if;
 end if;
 insert into public.inspection_action_receipts(id,owner_id,inspection_id,kind,payload_hash)
 values(action_id,p.id,inspection_id,kind,md5(payload::text));
 return jsonb_build_object('done',true);
end;$$;
revoke all on function public.apply_inspection_action(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.apply_inspection_action(uuid,uuid,text,jsonb) to authenticated;

create function public.legacy_photo_cleanup(operation text,args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if operation='claim' then
  with jobs as (select object_key from public.inspection_legacy_photo_cleanup where not_before<=now()
   and (lease_until is null or lease_until<now())
   and not exists(select 1 from public.inspections i where i.photo_path=inspection_legacy_photo_cleanup.object_key) order by queued_at limit 20 for update skip locked),
  claimed as (update public.inspection_legacy_photo_cleanup c set lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes'
   from jobs j where j.object_key=c.object_key returning c.*) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
  return result;
 elsif operation='ack' then
  if (args->>'ok')::boolean is true then
   delete from public.inspection_legacy_photo_cleanup where object_key=args->>'object_key' and lease_id=(args->>'lease_id')::uuid;
  else update public.inspection_legacy_photo_cleanup set lease_until=null,lease_id=null,not_before=now()+interval '1 hour'
   where object_key=args->>'object_key' and lease_id=(args->>'lease_id')::uuid; end if;
  return '{}'::jsonb;
 end if;
 raise exception 'Invalid cleanup operation' using errcode='22023';
end;$$;
revoke all on function public.legacy_photo_cleanup(text,jsonb) from public,anon,authenticated;
grant execute on function public.legacy_photo_cleanup(text,jsonb) to service_role;
commit;
