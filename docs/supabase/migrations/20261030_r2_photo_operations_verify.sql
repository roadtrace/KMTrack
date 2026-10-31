-- Read-only checks after r2_photo_operations.sql.
do $$
declare sig text; r text;
begin
  foreach sig in array array['public.r2_photo_command(uuid,text,jsonb)','public.r2_photo_cleanup(text,jsonb)'] loop
    if not has_function_privilege('service_role',sig,'EXECUTE') then raise exception 'Missing server RPC grant: %',sig; end if;
    foreach r in array array['anon','authenticated'] loop
      if has_function_privilege(r,sig,'EXECUTE') then raise exception 'Unexpected client RPC grant: % %',r,sig; end if;
    end loop;
  end loop;
  foreach r in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(r,'public.inspection_photo_intent_receipts','SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'Intent receipts must be private: %',r;
    end if;
  end loop;
  if not exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='inspection_photo_uploads' and column_name='thumb_sha256') then raise exception 'Missing thumbnail metadata'; end if;
  raise notice 'R2 operation ACL checks passed. Signed-in Worker/device tests still required.';
end;
$$;
