-- Read-only post-install checks. No inspection or photo writes.
select proname,has_function_privilege('authenticated',oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('anon',oid,'EXECUTE') as anon_execute
from pg_proc where pronamespace='public'::regnamespace and proname in
 ('own_inspection_snapshot','apply_inspection_action','legacy_photo_cleanup');
select relname,relrowsecurity,
 has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') as authenticated_table_access
from pg_class where relnamespace='public'::regnamespace and relname in
 ('inspection_action_receipts','inspection_legacy_photo_cleanup');
