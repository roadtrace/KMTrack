# Supabase architecture and security contract

**Status:** Backend design and prior security tests, plus completed Phase 10 browser authentication (commit `2571c4f`; Phase 11 is next). Verify live schema/policies before coding against them. Repository `docs/supabase/*.csv` may predate later Phase 8 `ALTER POLICY` changes. Phase 10 did not enable inspection/photo sync.

## Data model

`public.profiles`: `id` UUID linked to Auth user; `created_at`; `full_name`; `role` (`inspector`, `supervisor`, `administrator`); `approved` boolean (new accounts default false); `team` text (new accounts default null). The live `handle_new_user()` trigger was inspected for Phase 10: it copies `new.raw_user_meta_data ->> 'full_name'` (or empty text) and explicitly inserts `role='inspector'`, `approved=false`, `team=null`. Registration cannot set these controlled fields. Approved profiles determine future cloud permissions; the browser reads its own profile after authentication.

`public.inspections`: `id` UUID primary key supplied by client (no server-generated ID); `created_at`; `user_id` Auth UUID; `team`; `inspected_at`; `defect_type`; `latitude`, `longitude`; `latitude_dmm`, `longitude_dmm`; `expressway`, `direction`; `lane_number`, `lane_other`; `km_station` integer metres; `interchange_exit`, `interchange_segment`; `photo_filename`, `photo_path`; `updated_at`. Check actual types/nullability live before mapping. Local-only sync fields do not automatically belong in server table.

Helpers: `public.is_admin()`, `public.is_inspector()`, `public.is_supervisor()`, `public.current_user_team()`. `current_user_team()` returns verified approved team; `is_inspector()` was created in Phase 8. Triggers: `handle_new_user`, `set_updated_at`, `protect_inspection_identity`. The identity trigger prevents changes to `id`, `user_id`, `team`, `created_at` on UPDATE, even for otherwise authorized editors.

## Intended RLS behavior

| Operation | Inspector | Supervisor | Administrator | Unapproved |
|---|---|---|---|---|
| Read inspections | Own team | Own team | All teams | None |
| Insert inspection | Own user ID + verified team | Own user ID + verified team | No | No |
| Update inspection | Own rows, same team | Team rows | No | No |
| Delete inspection | No | No | No normal client DELETE | No |
| View/manage profiles | Own profile | Own profile | View/update all | Own profile only, no self-approval |

The Phase 8 inspection INSERT policy explicitly requires `is_inspector() OR is_supervisor()` plus `user_id=auth.uid()` and `team=current_user_team()`. Inspector UPDATE explicitly requires `is_inspector()` plus owner/team. Supervisor UPDATE uses `is_supervisor()` plus team. Admin SELECT uses `is_admin()`. PostgreSQL permissive policies combine with OR: audit the entire live policy set, not just one policy. No ordinary inspection DELETE policy.

The inspected `profiles` policies allow users to SELECT their own row and administrators to SELECT/UPDATE all rows using `is_admin()`. No ordinary self-UPDATE or self-approval policy was present in the inspected policy screenshots. Do not broaden these permissions for registration; the trigger supplies `full_name` and safe defaults.

## Completed Phase 10 browser boundary

- Email/password sign-in, persistent sessions, public registration with required email confirmation, and online profile verification are implemented. The local Supabase JS browser SDK is pinned at v2.117.1. Browser assets use only the public project URL and publishable key; no service-role/secret key is included.
- A device has one account-bound local workspace. Existing inspections require explicit confirmation before first binding. Sign-out retains local inspections/photos. A mismatched authenticated account cannot open, modify, transfer, or rebind that workspace and can sign out of the protected state.
- Guest / Local Mode uses a separate local record workspace. Guest can use local GPS/KM, map, inspection capture, photos, records, and Excel export, but has no Supabase/team access. Pending users can likewise record locally without team/cloud access. Imported team records are hidden from these local-only views and exports.
- The seven-day online-verification window limits cloud/team eligibility, not local recording. After expiry, the bound account can continue local inspection and photo capture until online verification succeeds again.
- Entry creation while pending sets `preapproval_review_required=true`; Guest creation also sets `guest_claim_required=true`. Entry normalization preserves these fields. Approval/re-verification does not clear them. Phase 12 must enforce explicit review of pending-created records and explicit review/claim of Guest records before sync eligibility; neither may auto-sync or auto-bind to a later account.
- The inspection queue is instantiated without a transport, and no photo upload transport is connected. No Phase 10 inspection/photo synchronization or team Realtime connection exists.
- Live browser checks passed for approved Inspector and Supervisor authentication, local capture, persistent session, sign-out preservation, Guest isolation/export, public registration/email confirmation, pending local capture, and pending-to-approved verification. Final focused tests: 47/47 passed. Final full suite: 123 passed, 59 existing legacy failures (not demonstrated Phase 10 regressions). Service-worker cache: v217.

## Private photo Storage

Bucket: `inspection-photos`; private; 5 MB ceiling; `image/jpeg`, `image/png` allowed. Path convention: `{team}/{inspection_uuid}/{filename}`. SELECT policy requires matching visible inspection with `i.id::text=(storage.foldername(name))[2]` and `i.photo_path=name`; inspection RLS restricts visibility. INSERT policy requires correct bucket, `is_inspector() OR is_supervisor()`, matching owned inspection UUID/team/path, and verified team. No normal Storage UPDATE or DELETE policy.

**Known integration blocker:** current upload INSERT policy requires `inspections.photo_path` to reference the new object **before** upload. Desired safe synced-photo replacement is upload new immutable object first, then switch current reference after success. Also current SELECT sees only the currently referenced object. Do not claim this is solved or overwrite a synced photo. Design a secure staging/replacement protocol in Phase 13 and retest RLS. Avoid unlimited version retention without a storage-budget decision.

## Tests previously passed

Unapproved cannot view/create/edit/upload; cannot self-approve or self-promote. Inspector own create/edit succeeds; wrong owner/team create and another user's edit fail. Supervisor team edit succeeds, cross-team edit fails. Admin sees all but cannot create/edit engineering rows. Identity changes blocked. Private photo access own/team/admin succeeds, cross-team fails. Normal photo deletion blocked. Non-image `.txt` upload rejected. Test objects and records were subsequently cleaned.

## Security and implementation rules

Never use service-role key in browser/PWA. Supabase Auth session is not itself proof of approval; retrieve/recheck profile. Server RLS is authoritative; UI restrictions are additional. Do not allow stale cached approval to authorize uploads. Keep local pending records separate from cloud-visible team records; do not assign unapproved drafts a guessed team. Use a durable local store for photos (existing IndexedDB); do not put image blobs in localStorage. Phase 10 uses single-account local binding; multi-account local workspaces may be considered later. Preserve original `inspected_at` when delayed sync occurs. Review collision/conflict handling rather than silently overwriting teammates' edits. Do not weaken database or Storage RLS.
