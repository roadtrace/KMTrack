# R2 photo storage — Step 6

## Implementation update — Steps 7–10

Metadata migration succeeded (user confirmed both initial tables empty).
`20261030_r2_photo_operations.sql` and its verification subsequently succeeded
through Supabase SQL Editor. Worker/app pilot implementation and current setup
are recorded in `workers/photo-api/OPERATIONS.md`. This supersedes initial
"not applied" status below. Do not rerun either successful migration.

The operations migration adds thumbnail metadata, server-only RPCs, UUID-only
intent receipts and cleanup leases. Client metadata writes remain forbidden.
The user will configure the encrypted server credential. Transport remains off;
live signed-in/device verification is still required before activation.

## Scope and deployment

Apply `migrations/20261030_r2_photo_metadata.sql` once in the Supabase SQL Editor,
after the existing team-log/deletion migration. It runs in one transaction and
creates two empty tables, indexes, one read policy and a cleanup trigger. It does
not update existing inspections, move photos, change Storage policies, or enable
the application's transport. No browser cache bump is needed for SQL/docs only.

The old `inspections.photo_path` / `photo_filename` and private Supabase bucket
remain authoritative for existing photos. R2 references live separately. Do not
copy R2 keys into `photo_path`: existing readers interpret that as Supabase Storage.
The eventual viewer must choose a current production R2 photo first, then fall
back to the existing Supabase reference. Test metadata never appears to ordinary
app reads. Test upload/view checks will use explicit server endpoints, not a
production SELECT-policy exception.

The source inspection schema was inspected in the repository. This migration has
not been applied or tested against the live database by this change. The migration
checks the parent UUID column; SQL execution and the verification below are still
required. It intentionally fails rather than silently accepting existing tables
with an unknown definition. If any statement fails, roll back and inspect the
error; do not run selected remaining statements independently.

## Metadata and access

`inspection_photo_uploads` records one immutable evidence upload intent: stable
UUID, parent inspection, owner/team, provider, environment/bucket/key, compressed
JPEG SHA-256, bytes/dimensions, lifecycle timestamps, and current status. The
limits match the existing local preparation: JPEG, 5 MiB maximum, 1600px maximum
dimension. Thumbnails will have a separate explicit addition during Step 8.

Keys are `v1/{inspection UUID}/{upload UUID}/evidence.jpg`. They contain no name,
email, coordinates or user filename. The Worker must derive the bucket from its
deployment binding, never accept a client-selected bucket or arbitrary key.
Stable intent IDs make uncertain retries resumable; a repeated ID with different
inspection/hash/size/dimensions must fail rather than overwrite.

Authenticated clients can SELECT only current, ready, production metadata for an
inspection visible through existing inspection RLS, with a current approved
profile and matching ownership/team association. This does not grant object access.
No client or service-role table write grants are introduced. Cleanup has no client
grants or policies. Step 7 must add reviewed, narrowly guarded server operations;
do not solve this by granting general authenticated writes or exposing a service
key. Current Step 5's public configuration cannot mutate these tables.

`inspection_photo_cleanup` retains only bucket/key and retry timing. Deleting an
inspection cascades its R2 metadata into this outbox in the same transaction.
The existing permanent-deletion RPC is unchanged. Object deletion is asynchronous:
inspection deletion hides access immediately, but physical R2 erasure requires the
future cleanup worker. No R2 uploads may be enabled before that path is implemented.
Do not delete old Supabase objects through this new R2 queue.

## Required Step 7 protocol (not implemented by this migration)

1. Save capture and compressed payload durably on the phone. Reuse the existing
   local eligibility/review checks, raw image handling, and SHA-256 preparation.
   Preserve local photos on failure. Do not mark a photo synced from a path alone.
2. Reserve through the Worker. Revalidate the session, live approval/role/team,
   inspection visibility and ownership on every operation. Derive identity on
   the server. Lock the parent inspection and record expected current R2 ID
   (including NULL), legacy Supabase reference, and immutable payload identity.
   Store the legacy expectation in `expected_legacy_path` and
   `expected_legacy_filename`; NULL means an absent reference. No additional
   inspection columns are needed.
3. Upload to the private test binding only during the pilot. Stream with an
   enforced byte ceiling; validate real image format/dimensions and checksum.
   Use an immutable create-only R2 write. A retry must compare the existing object
   against the intent, not assume an object with that name is valid. R2 ETag is
   not a substitute for the SHA-256 of the actual bytes.
4. Verify R2 object bytes/hash/size/type and mark `uploaded` through a server-only
   operation. A client cannot assert verification. Recheck authorization before
   accepting a completion after a long upload or an approval/team change.
5. Finalize in one database transaction, locking the same inspection as deletion.
   Compare the expected current ID and legacy reference; reject concurrent changes.
   Transition old ready -> superseded, new uploaded -> ready and set timestamps.
   The unique partial index permits only one current photo per environment.
   Finalization retries return the same result only for the same immutable intent.
6. Read back authoritative current metadata before saving the local acknowledgement.
   Recover interrupted requests by querying the intent; do not create new intent
   IDs automatically. Never resurrect a deleted inspection or deleted intent.
7. View through an authenticated Worker that rereads current metadata and live
   inspection authorization. No public bucket, permanent public URL or query JWT.
8. Queue superseded/abandoned objects and expired reservations, with a grace period
   for requests already in flight. Cleanup rechecks the key is not current and
   serializes against finalization. Repeat sweeps must catch a delayed upload that
   finishes after inspection deletion; do not discard a deletion locator on the
   first missing-object response. Remove completed queue locators after confirmed
   safe cleanup. Bound retries and report failures without logging tokens/images.

## Verification after applying

Run `migrations/20261030_r2_photo_metadata_verify.sql` in the same project. It
checks the new tables, restrictive grants, RLS, policy and cleanup trigger without
inserting/deleting inspections or photos. Then retain the SQL result. The initial
tables should be empty. Constraint behavior, cascading cleanup, concurrent
finalization, real role/team access and interrupted upload/deletion races still
need integration tests before enabling transport; catalog checks do not prove them.

No rollback that drops populated tables is provided: once uploads exist, deleting
the locators could orphan private objects. Before rollout, an unused failed setup
can be reviewed and removed separately; do not blindly rerun destructive SQL.

References: [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html),
[PostgreSQL trigger behavior](https://www.postgresql.org/docs/current/trigger-definition.html),
[Cloudflare R2 Worker API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
