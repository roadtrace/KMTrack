-- Steps 7–10. Run AFTER r2_photo_metadata.sql. No existing photo migration.
-- Only the trusted Worker may call these RPCs with its server-side credential.
begin;
alter table public.inspection_photo_uploads
  add column thumb_sha256 text check (thumb_sha256 ~ '^[0-9a-f]{64}$'),
  add column thumb_byte_size integer check (thumb_byte_size between 1 and 524288),
  add column thumb_width integer check (thumb_width between 1 and 400),
  add column thumb_height integer check (thumb_height between 1 and 400);
alter table public.inspection_photo_cleanup
  add column lease_until timestamptz,
  add column lease_id uuid,
  add column last_deleted_at timestamptz;

-- Prevent reuse of an upload UUID after its metadata was deleted.
create table public.inspection_photo_intent_receipts (
  id uuid primary key,
  created_at timestamptz not null default now()
);
alter table public.inspection_photo_intent_receipts enable row level security;
revoke all on public.inspection_photo_intent_receipts from public,anon,authenticated,service_role;

create function public.r2_photo_command(actor uuid, operation text, args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  p public.profiles%rowtype;
  i public.inspections%rowtype;
  u public.inspection_photo_uploads%rowtype;
  cur uuid;
  upload_id uuid := (args->>'upload_id')::uuid;
  env text := args->>'environment';
  bucket text;
begin
  if env not in ('test','production') or env is null then raise exception 'Invalid environment' using errcode='22023'; end if;
  bucket := case env when 'test' then 'spotit-inspection-photos-test' else 'spotit-inspection-photos' end;
  select * into p from public.profiles where id=actor;
  if p.id is null or p.approved is not true or p.role not in ('inspector','supervisor','administrator') then
    raise exception 'Approved account required' using errcode='42501';
  end if;
  -- Same parent lock as permanent deletion; all pointer changes serialize here.
  select * into i from public.inspections where id=(args->>'inspection_id')::uuid for update;
  if i.id is null or (p.role<>'administrator' and (p.team is null or p.team is distinct from i.team)) then
    raise exception 'Inspection unavailable' using errcode='42501';
  end if;
  select id into cur from public.inspection_photo_uploads
    where inspection_id=i.id and environment=env and is_current;
  if operation='current' then
    select * into u from public.inspection_photo_uploads where id=cur;
    return case when u.id is null then 'null'::jsonb else to_jsonb(u) end;
  end if;
  if p.role not in ('inspector','supervisor') or i.user_id is distinct from actor or i.team is distinct from p.team then
    raise exception 'Own inspection required' using errcode='42501';
  end if;
  select * into u from public.inspection_photo_uploads where id=upload_id for update;
  if u.id is not null and (u.inspection_id<>i.id or u.owner_id<>actor or u.team<>i.team or u.environment<>env) then
    raise exception 'Upload identity conflict' using errcode='23514';
  end if;
  if operation='reserve' then
    if u.id is not null then
      if u.sha256 is distinct from args->>'sha256' or u.byte_size is distinct from (args->>'byte_size')::integer
        or u.width is distinct from (args->>'width')::integer or u.height is distinct from (args->>'height')::integer
        or u.thumb_sha256 is distinct from args->>'thumb_sha256'
        or u.thumb_byte_size is distinct from (args->>'thumb_byte_size')::integer
        or u.thumb_width is distinct from (args->>'thumb_width')::integer
        or u.thumb_height is distinct from (args->>'thumb_height')::integer then
        raise exception 'Immutable payload conflict' using errcode='23514';
      end if;
    else
      if upload_id is null or args->>'thumb_sha256' is null or args->>'thumb_byte_size' is null
        or args->>'thumb_width' is null or args->>'thumb_height' is null then
        raise exception 'Complete upload intent required' using errcode='22023';
      end if;
      -- A retry of a deleted UUID fails, even if the inspection still exists.
      insert into public.inspection_photo_intent_receipts(id) values(upload_id);
      if (select count(*) from public.inspection_photo_uploads where inspection_id=i.id
        and environment=env and state in ('reserved','uploaded')) >= 3 then
        raise exception 'Too many outstanding uploads' using errcode='23514';
      end if;
      if cur is distinct from (args->>'expected_current_id')::uuid then
        raise exception 'Current photo changed' using errcode='23514';
      end if;
      insert into public.inspection_photo_uploads(id,inspection_id,owner_id,team,environment,bucket_name,
        object_key,mime_type,byte_size,sha256,width,height,thumb_sha256,thumb_byte_size,thumb_width,thumb_height,
        expected_current_id,expected_legacy_path,expected_legacy_filename)
      values(upload_id,i.id,actor,i.team,env,bucket,'v1/'||i.id||'/'||upload_id||'/evidence.jpg','image/jpeg',
        (args->>'byte_size')::integer,args->>'sha256',(args->>'width')::integer,(args->>'height')::integer,
        args->>'thumb_sha256',(args->>'thumb_byte_size')::integer,(args->>'thumb_width')::integer,(args->>'thumb_height')::integer,
        cur,i.photo_path,i.photo_filename) returning * into u;
    end if;
  elsif operation not in ('status','finalize','abandon','remove') then
    raise exception 'Unsupported operation' using errcode='22023';
  end if;
  if u.id is null then raise exception 'Upload unavailable' using errcode='42501'; end if;
  if operation in ('reserve','status') then
    if u.state not in ('ready','superseded','abandoned') and u.expires_at<=now() then
      raise exception 'Upload expired' using errcode='23514';
    end if;
    return to_jsonb(u);
  end if;
  if operation='finalize' then
    if u.state='ready' and cur=u.id then return to_jsonb(u); end if;
    if u.state not in ('reserved','uploaded') or u.expires_at<=now()
      or cur is distinct from u.expected_current_id
      or i.photo_path is distinct from u.expected_legacy_path
      or i.photo_filename is distinct from u.expected_legacy_filename then
      raise exception 'Photo changed or upload expired' using errcode='23514';
    end if;
    -- Called ONLY after Worker verifies both actual R2 images and checksums.
    update public.inspection_photo_uploads set state='superseded',is_current=false where id=cur;
    if cur is not null then
      insert into public.inspection_photo_cleanup(bucket_name,object_key)
        select bucket_name,object_key from public.inspection_photo_uploads where id=cur on conflict do nothing;
      insert into public.inspection_photo_cleanup(bucket_name,object_key)
        select bucket_name,replace(object_key,'/evidence.jpg','/thumbnail.jpg')
        from public.inspection_photo_uploads where id=cur on conflict do nothing;
    end if;
    update public.inspection_photo_uploads set state='ready',is_current=true,verified_at=now(),finalized_at=now()
      where id=u.id returning * into u;
    return to_jsonb(u);
  end if;
  if operation='remove' and (not u.is_current or cur<>u.id) then
    raise exception 'Current photo changed' using errcode='23514';
  end if;
  if operation='abandon' and u.is_current then raise exception 'Current photo cannot be abandoned' using errcode='23514'; end if;
  -- A current R2 photo cannot be removed while a legacy photo would reappear.
  -- Replace remains supported. Legacy deletion is a separate reviewed workflow.
  if operation='remove' and (i.photo_path is not null or i.photo_filename is not null) then
    raise exception 'Legacy photo still exists; remove the inspection or replace its photo' using errcode='23514';
  end if;
  update public.inspection_photo_uploads set state='abandoned',is_current=false where id=u.id returning * into u;
  insert into public.inspection_photo_cleanup(bucket_name,object_key) values(u.bucket_name,u.object_key),
    (u.bucket_name,replace(u.object_key,'/evidence.jpg','/thumbnail.jpg')) on conflict do nothing;
  return to_jsonb(u);
end;
$$;
revoke all on function public.r2_photo_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.r2_photo_command(uuid,text,jsonb) to service_role;

-- Extend deletion outbox to thumbnails. Existing inspection deletion RPC stays intact.
create or replace function public.queue_deleted_r2_photo()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.inspection_photo_cleanup(bucket_name,object_key) values(old.bucket_name,old.object_key),
    (old.bucket_name,replace(old.object_key,'/evidence.jpg','/thumbnail.jpg')) on conflict do nothing;
  return old;
end;
$$;
revoke all on function public.queue_deleted_r2_photo() from public,anon,authenticated,service_role;

create function public.r2_photo_cleanup(operation text,args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  bucket text := args->>'bucket_name';
  result jsonb;
begin
  if bucket not in ('spotit-inspection-photos-test','spotit-inspection-photos') or bucket is null then
    raise exception 'Invalid bucket' using errcode='22023';
  end if;
  if operation='claim' then
    -- Expiry makes finalization impossible before cleanup is considered.
    update public.inspection_photo_uploads set state='abandoned',is_current=false
      where bucket_name=bucket and state in ('reserved','uploaded') and expires_at<now();
    insert into public.inspection_photo_cleanup(bucket_name,object_key)
      select bucket_name,object_key from public.inspection_photo_uploads
      where bucket_name=bucket and state in ('abandoned','superseded') on conflict do nothing;
    insert into public.inspection_photo_cleanup(bucket_name,object_key)
      select bucket_name,replace(object_key,'/evidence.jpg','/thumbnail.jpg') from public.inspection_photo_uploads
      where bucket_name=bucket and state in ('abandoned','superseded') on conflict do nothing;
    with candidates as (
      select c.bucket_name,c.object_key from public.inspection_photo_cleanup c
      where c.bucket_name=bucket and c.not_before<=now() and (c.lease_until is null or c.lease_until<now())
        and not exists (select 1 from public.inspection_photo_uploads u where u.bucket_name=c.bucket_name
          and (u.object_key=c.object_key or replace(u.object_key,'/evidence.jpg','/thumbnail.jpg')=c.object_key)
          and u.state in ('reserved','uploaded','ready'))
      order by c.not_before limit 20 for update skip locked
    ), claimed as (
      update public.inspection_photo_cleanup c set lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',
        attempts=attempts+1 from candidates x where c.bucket_name=x.bucket_name and c.object_key=x.object_key returning c.*
    ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
    return result;
  elsif operation='ack' then
    -- Retain locators for 7 days to sweep delayed/in-flight writes more than once.
    update public.inspection_photo_cleanup c set lease_id=null,lease_until=null,
      last_deleted_at=case when args->>'ok'='true' then now() else last_deleted_at end,
      last_error_code=case when args->>'ok'='true' then null else 'r2_delete_failed' end,
      not_before=now()+interval '1 day'
      where c.bucket_name=bucket and c.object_key=args->>'object_key' and c.lease_id=(args->>'lease_id')::uuid;
    delete from public.inspection_photo_cleanup c where c.bucket_name=bucket
      and c.queued_at<now()-interval '7 days' and c.last_deleted_at>now()-interval '1 minute'
      and c.lease_id is null;
    -- Remove expired metadata only after cleanup grace; delete trigger requeues
    -- keys once, then the next successful sweep retires those remaining locators.
    delete from public.inspection_photo_uploads u where u.bucket_name=bucket
      and u.state in ('abandoned','superseded') and u.created_at<now()-interval '8 days'
      and not exists(select 1 from public.inspection_photo_cleanup c where c.bucket_name=u.bucket_name
        and c.object_key in (u.object_key,replace(u.object_key,'/evidence.jpg','/thumbnail.jpg')));
    return 'true'::jsonb;
  end if;
  raise exception 'Invalid cleanup operation' using errcode='22023';
end;
$$;
revoke all on function public.r2_photo_cleanup(text,jsonb) from public,anon,authenticated;
grant execute on function public.r2_photo_cleanup(text,jsonb) to service_role;
commit;
