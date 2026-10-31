-- Step 6 only: empty R2 metadata and a private cleanup outbox.
-- No existing inspection/photo updates, backfill, upload API, or credentials.
-- Apply once, after 20261030_team_log_and_deletion.sql. A rerun fails safely.
begin;

-- Fail the whole transaction if the expected parent schema is absent.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public'
    and table_name='inspections' and column_name='id' and udt_name='uuid') then
    raise exception 'Expected public.inspections.id UUID; inspect the live schema first.';
  end if;
end;
$$;

create table public.inspection_photo_uploads (
  id uuid primary key, -- stable upload intent UUID, reused on retry
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  owner_id uuid not null, -- snapshot; future reserve RPC derives it from auth.uid()
  team text not null check (length(btrim(team)) between 1 and 200),
  provider text not null default 'r2' check (provider = 'r2'),
  environment text not null check (environment in ('test','production')),
  bucket_name text not null,
  object_key text not null,
  mime_type text not null check (mime_type = 'image/jpeg'),
  byte_size integer not null check (byte_size between 1 and 5242880),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  width integer not null check (width between 1 and 1600),
  height integer not null check (height between 1 and 1600),
  state text not null default 'reserved'
    check (state in ('reserved','uploaded','ready','superseded','abandoned')),
  is_current boolean not null default false,
  -- NULL means the reservation expects no existing R2 current photo.
  -- Deliberately not an FK: this records a compare-and-swap expectation.
  expected_current_id uuid,
  expected_legacy_path text,
  expected_legacy_filename text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  verified_at timestamptz,
  finalized_at timestamptz,
  constraint r2_bucket_environment check (
    (environment='test' and bucket_name='spotit-inspection-photos-test') or
    (environment='production' and bucket_name='spotit-inspection-photos')),
  constraint r2_immutable_key check (
    object_key = 'v1/' || inspection_id::text || '/' || id::text || '/evidence.jpg'),
  constraint r2_current_ready check (is_current = (state='ready')),
  constraint r2_verified_state check (
    state not in ('uploaded','ready','superseded') or verified_at is not null),
  constraint r2_finalized_state check (
    state not in ('ready','superseded') or finalized_at is not null),
  constraint r2_expiry check (expires_at > created_at),
  unique (bucket_name, object_key)
);
create unique index inspection_photo_one_current
  on public.inspection_photo_uploads (inspection_id, environment) where is_current;
create index inspection_photo_expiry
  on public.inspection_photo_uploads (expires_at) where state in ('reserved','uploaded');

-- No FK to inspections: cleanup must survive permanent inspection deletion.
-- This contains only the locator needed to erase an object, never image bytes.
create table public.inspection_photo_cleanup (
  bucket_name text not null check (bucket_name in
    ('spotit-inspection-photos-test','spotit-inspection-photos')),
  object_key text not null,
  queued_at timestamptz not null default now(),
  not_before timestamptz not null default (now() + interval '24 hours'),
  attempts integer not null default 0 check (attempts >= 0),
  last_error_code text check (length(last_error_code) <= 100),
  primary key (bucket_name, object_key)
);

alter table public.inspection_photo_uploads enable row level security;
alter table public.inspection_photo_cleanup enable row level security;
-- Explicitly undo Supabase default table grants, including server-role writes.
-- Step 7 must introduce narrowly guarded write RPCs before any upload can work.
revoke all on public.inspection_photo_uploads from public, anon, authenticated, service_role;
revoke all on public.inspection_photo_cleanup from public, anon, authenticated, service_role;
grant select on public.inspection_photo_uploads to authenticated;

create policy inspection_photo_current_read on public.inspection_photo_uploads
for select to authenticated using (
  environment='production' and is_current and state='ready'
  and exists (
    select 1 from public.inspections i
    join public.profiles p on p.id=auth.uid()
    where i.id=inspection_photo_uploads.inspection_id
      and i.user_id=inspection_photo_uploads.owner_id
      and i.team=inspection_photo_uploads.team
      and p.approved is true
      and (p.role='administrator' or
        (p.role in ('inspector','supervisor') and p.team=i.team))
  )
);
-- No INSERT/UPDATE/DELETE policies; no application access to cleanup locators.

create function public.queue_deleted_r2_photo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.inspection_photo_cleanup (bucket_name,object_key)
    values (old.bucket_name,old.object_key) on conflict do nothing;
  return old;
end;
$$;
revoke all on function public.queue_deleted_r2_photo()
  from public, anon, authenticated, service_role;
create trigger queue_deleted_r2_photo after delete on public.inspection_photo_uploads
  for each row execute function public.queue_deleted_r2_photo();

commit;
