-- Read-only operator checks. Run in Supabase SQL Editor as the project operator.
-- No migration, credential, image data, or permission changes.
-- Intentionally test-only; do not interpret retained cleanup receipts as live files.
select now() as checked_at,
  count(*) as retained_cleanup_locators,
  count(*) filter (where last_deleted_at is null) as never_confirmed_deleted,
  count(*) filter (where not_before <= now() and last_deleted_at is null) as due_first_deletions,
  count(*) filter (where not_before < now()-interval '2 hours' and last_deleted_at is null) as overdue_first_deletions,
  count(*) filter (where last_error_code is not null) as latest_delete_failures,
  count(*) filter (where lease_until > now()) as active_leases,
  min(not_before) filter (where last_deleted_at is null) as earliest_unconfirmed_due,
  max(last_deleted_at) as latest_successful_delete
from public.inspection_photo_cleanup
where bucket_name='spotit-inspection-photos-test';

select state, is_current, count(*) as intents,
  coalesce(sum(byte_size + coalesce(thumb_byte_size,0)),0) as declared_image_bytes,
  count(*) filter (where state in ('reserved','uploaded') and expires_at < now()) as expired_unfinished
from public.inspection_photo_uploads
where environment='test' and bucket_name='spotit-inspection-photos-test'
group by state,is_current order by state,is_current;

-- Sanitized diagnostics: no object keys, inspector identities, or photo URLs.
select last_error_code,count(*) as locators,max(attempts) as maximum_attempts
from public.inspection_photo_cleanup
where bucket_name='spotit-inspection-photos-test' and last_error_code is not null
group by last_error_code;
