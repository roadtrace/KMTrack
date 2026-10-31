-- Read-only catalog checks. Does not modify inspection/photo data.
do $$
declare
  t text;
  r text;
  operation text;
begin
  foreach t in array array['inspection_photo_uploads','inspection_photo_cleanup'] loop
    if not exists (select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=t and c.relrowsecurity) then
      raise exception 'Missing table or RLS: %',t;
    end if;
    foreach r in array array['anon','authenticated','service_role'] loop
      foreach operation in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
        if pg_catalog.has_table_privilege(r,'public.'||t,operation) then
          raise exception 'Unexpected % grant for % on %',operation,r,t;
        end if;
      end loop;
    end loop;
  end loop;
  if not pg_catalog.has_table_privilege('authenticated','public.inspection_photo_uploads','SELECT')
    or pg_catalog.has_table_privilege('anon','public.inspection_photo_uploads','SELECT')
    or pg_catalog.has_table_privilege('authenticated','public.inspection_photo_cleanup','SELECT') then
    raise exception 'Unexpected read grants';
  end if;
  if (select count(*) from pg_catalog.pg_policies where schemaname='public'
    and tablename='inspection_photo_uploads' and policyname='inspection_photo_current_read'
    and cmd='SELECT') <> 1
    or (select count(*) from pg_catalog.pg_policies where schemaname='public'
      and tablename in ('inspection_photo_uploads','inspection_photo_cleanup')) <> 1 then
    raise exception 'Unexpected metadata policy set';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where
    tgrelid='public.inspection_photo_uploads'::regclass
    and tgname='queue_deleted_r2_photo' and tgenabled='O' and not tgisinternal) then
    raise exception 'Cleanup trigger missing or disabled';
  end if;
  raise notice 'R2 metadata catalog checks passed; live role and upload tests remain required.';
end;
$$;

select 'inspection_photo_uploads' as table_name, count(*) as row_count
  from public.inspection_photo_uploads
union all
select 'inspection_photo_cleanup', count(*) from public.inspection_photo_cleanup;
