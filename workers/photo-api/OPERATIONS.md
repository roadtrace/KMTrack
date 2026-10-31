# Private R2 photo API — test pilot

Target: `https://spotit-photo-api-test.mmatriano19.workers.dev`.
The Worker supports reservation, immutable evidence/thumbnail uploads, verified
finalization, private viewing, removal and scheduled cleanup. It deliberately
rejects production environment configuration; production rollout is separate.
`PHOTOS_BUCKET` must remain bound to `spotit-inspection-photos-test`.

## Live update — 2026-10-31

### Signed-in test results

- User explicitly authorized production activation and scoped R2 publication.
  Live production health now reports `production-photo-api` and transport true;
  anonymous private-photo request returns 401 `session_required`. Only the actual
  app origin is allowed; pilot/demo origins remain excluded by production code.
  Reviewed isolated Git-index snapshot excludes pending landscape and legacy
  matcher test edits. Snapshot validation: 261 app/Worker checks, 7 SQL checks,
  production and presentation builds passed. No production photo uploaded by
  the agent. First real production upload still needs field/user verification.
  Checked-in production Wrangler transport default remains false intentionally
  as a safe initial deployment default; live dashboard flag is true.

- Production secret presence verified as `Value encrypted`, without reading or
  copying its value. Production transport remains false. Client production
  endpoint prepared as `https://spotit-photo-api.mmatriano19.workers.dev` with
  explicit upload controls enabled in local source, neutral production button
  text and cache v274. Pilot builder substitutes the test endpoint; presentation
  builder forces R2 off. All three builds passed endpoint/isolation checks.
  Latest focused checks: 261 app/Worker plus 7 isolated SQL checks passed.
  One old foreground cache assertion was updated to its real `src/` path.
  These client changes are not committed, pushed or deployed. Worker activation
  and scoped publishing require user approval before the rollout.

- Production API code now deployed: version `0361b3a5`, replacing Hello World.
  Live `/health` returns authorization-only and `photo_transport_enabled:false`.
  `/pilot` returns 404. Production app preflight returns 204 with its exact origin;
  phone-pilot and presentation origins return 403 without allow-origin.
  Settings tab refreshed after code deployment to prevent stale settings from
  reactivating the placeholder. User secret setup is the next required action.

- Production Worker shell created by user. Settings verified/saved:
  `PHOTO_ENVIRONMENT=production`, `PHOTO_TRANSPORT_ENABLED=false`.
  User explicitly approved binding private `spotit-inspection-photos` as
  `PHOTOS_BUCKET`; dashboard confirms that binding. Bucket is empty and Public
  Access is Disabled. Hourly cron `17 * * * *` added and Save clicked.
  Code editor is stalled loading; the live Worker still runs Hello World.
  DO NOT claim production API deployment or request enabling transport yet.
  No service-role secret entered. Next: replace placeholder with prepared
  `output/photo-api/production.mjs`, verify health disabled, then user adds secret.

- User reported all offline-attempt/reconnect/retry/private-view steps passed on
  the anywhere device pilot. Mid-transfer interruption is not independently proven.
- Separate production entry `production.mjs` and disabled-by-default
  `wrangler.production.toml` prepared. Deployment identity fixes metadata bucket
  selection; test entry still rejects production environment. Production rejects
  both pilot origins and never serves `/pilot`, including if runtime environment
  variables are misconfigured. Focused tests: 43 passed, including production
  cleanup rejecting a returned test-bucket locator.
- Dashboard bundle `output/photo-api/production.mjs` is prepared. Not deployed:
  browser control returned "Local browser use is disabled in Work settings".
  Production Worker creation/binding/secret/cron and online checks remain pending.
  Client still targets the test Worker and the actual application's R2 flag is
  false. Do not enable that flag until the production endpoint and client endpoint
  selection are configured and verified together.

### Production setup still required

Create `spotit-photo-api` independently of `spotit-photo-api-test`, paste the
production bundle, bind `PHOTOS_BUCKET` to `spotit-inspection-photos`, and configure
`PHOTO_ENVIRONMENT=production`, `PHOTO_TRANSPORT_ENABLED=false`. User adds the
encrypted `SUPABASE_SERVICE_ROLE_KEY` personally, preserving their earlier choice
not to have the agent copy it. Set hourly cron `17 * * * *`. Verify private bucket,
disabled health and origin restrictions before enabling any transport. Never copy
the test deployment's binding into production. No new SQL migration is required.

After server verification, configure the actual app's R2 endpoint to the production
Worker while retaining the test endpoint in the isolated pilot, replace test-only
button text for the actual app, then complete focused app/security/build checks.
Publishing the browser app still requires an authorized scoped commit/push or
deployment. Existing Supabase photo references remain intact; do not bulk migrate
or delete old photos as part of activation.

- User reported successful anywhere-device photo upload, private submitted-photo
  viewing, and local-photo availability after airplane-mode reload (2026-10-31).
  Session-key fix uses the same `SPOTITAuth.SESSION_KEY` as the pilot home page;
  deployed device screen and device-test-v2 service worker were publicly verified.
  Latest focused reliability/access/viewer/encoding suite: 115 passed. Automated
  tests cover uncertain finalization recovery with the same immutable intent,
  changed bytes, account changes, revoked approval and disabled transport.
  Offline-attempt/reconnect retry and mid-upload physical interruption are not
  yet reported complete. Production transport is still intentionally disabled;
  the Worker currently rejects production configuration, so a production rollout
  requires an explicit supported configuration and independent production Worker,
  not merely flipping the browser flag.

- Anywhere device screen prepared as `device-test.html`/`device-test.js` in the
  pilot-only build. It reads existing owned inspection references, persists camera
  originals locally in a separate IndexedDB, and uses the existing guarded R2
  controller. It does not load the inspection submission runner, create fake GPS,
  or write inspection rows. Its Supabase client blocks database mutations.
  Browser QA with mocked account reads passed photo-file save, reload recovery,
  reconnect gating and 390px overflow checks without page errors. Physical camera,
  actual offline service-worker reload and live upload still need verification.
  Updated ZIP is prepared but not deployed. User must upload it to the existing
  direct-upload pilot project because extension file upload is blocked.

- Phone pilot published by the user at `https://spotit-photo-pilot.pages.dev/`.
  Public HTML verification confirms its visible pilot banner, R2 flag enabled,
  and restored legacy resolver. Production flags remain unchanged.
- Test Worker version `59d67cf8` deployed to add only that exact HTTPS origin
  in the test environment. Live preflight returned 204 with the exact pilot
  allow-origin; the presentation origin still returns 403 without allow-origin.
  Health reports enabled test transport. No secrets or binding settings changed.
  User reports signing in. The agent's browser tab still displayed Sign in, so
  authenticated phone-pilot operation has not yet been independently observed.
  Physical iPhone photo/offline recovery remains the next user-operated check.

- Scheduled cleanup verified on 2026-10-31 at 02:17 UTC (10:17 Manila).
  Evidence and thumbnail for approved synthetic intent
  `60cd271a-1048-4226-80cd-83fb0b5814a6` each have attempts=1, a successful
  `last_deleted_at`, and no error. An exact-prefix R2 dashboard search returned
  no matching objects. This supersedes the earlier pending-cleanup notes below.
- `node scripts/build-r2-pilot.cjs` prepares a separate phone QA package in
  `output/r2-phone-pilot` with test transport enabled, visible pilot labeling,
  separate manifest/cache naming, and the intended exact hostname
  `spotit-photo-pilot.pages.dev`. It does not publish or enable the main app.
  Hosting and the Worker's exact allowed origin remain unconfigured; there is
  no usable phone-test URL yet. Do not share the intended hostname as live.
  This is the actual account-connected app: inspection submission still uses
  the existing database, so use valid inspections rather than fictional records.
  No source flags or production data were changed by the build.

- Fixed a real Cloudflare runtime incompatibility: Worker subrequests must use
  `redirect:'manual'`, not the unsupported Fetch `error` mode. Non-success/redirect
  responses still fail closed without forwarding credentials. Current deployed
  code version is `2886c6e7`. Browser-side fetch behavior is unchanged.
- Signed-in synthetic evidence upload/finalization/private viewing passed: 1600×1200
  JPEG, 36,541 bytes; 400×300 thumbnail, 6,525 bytes. Browser decoded both images.
- Retrying the same completed intent passed. A fresh replacement passed; a live
  read-only SQL check found exactly two intents, one superseded and one current,
  with both superseded object locators queued for cleanup.
- User explicitly approved removing the current synthetic test pair. Removal
  succeeded, private viewing returns no current photo, and SQL confirms neither
  intent is current; four object locators are queued. No production reference or
  inspection content was changed.
- Only the approved current synthetic pair's outbox timing was made due for a
  live cleaner test; normal 24-hour grace defaults and the older pair's timing
  remain unchanged. The dashboard preview trigger did not produce a cleanup
  acknowledgement. Physical R2 deletion remains unverified and must be checked
  after the next hourly live Cron run. Do not describe queueing as physical erasure.
- The test Worker is enabled; the production browser app remains disabled for R2.
  No commit or push. A regression test now checks Worker-compatible redirect
  rejection, and a scheduled-handler test checks private RPC/delete/ack flow.

### Earlier setup notes

- User added/deployed `SUPABASE_SERVICE_ROLE_KEY` personally. Cloudflare shows
  `Value encrypted`; the agent did not read or copy its value.
- Test console `/pilot` is deployed and visibly serves its sign-in form. Tested
  console code version `77b8a2ae` was reactivated after a stale settings deployment
  selected older code. Fresh Settings shows `PHOTO_ENVIRONMENT=test` and
  `PHOTO_TRANSPORT_ENABLED=true`, with the test R2 binding unchanged.
- The production browser app's `R2_PHOTO_PILOT_ENABLED` remains false, and no
  production app deployment, commit or push has been performed.
- These initial setup notes predate the signed-in results above; physical cleanup
  is the remaining live storage verification item.
- New console security/CORS tests and focused photo tests: 38 passed on resume.
  Prior simulated-browser console test passed login, password-field clearing,
  actual Worker image handling with in-memory storage, viewing and removal.

The console generates synthetic JPEGs; it creates no inspection rows. Its login
goes directly to Supabase using the existing public key. Session stays in memory,
and passwords/tokens are never rendered or persisted by the console. Only the
exact test Worker origin is additionally allowed for this console, and only in
the test environment. CORS is not an authorization substitute.

The checked-in Wrangler default stays disabled intentionally. A later CLI deploy
using those defaults will pause the live pilot; do not confuse it with the live
test flag. Dashboard deployment uses the single-file bundle from:

```powershell
node scripts/build-photo-worker.mjs
```

Paste `output/photo-api/worker.mjs`, not the unbundled source with a module import,
into Cloudflare's dashboard editor. Refresh settings before changing variables to
avoid activating an older source version from a stale dashboard page.

## Initial setup — 2026-10-30

- Metadata migration applied by the user, initially zero rows in both tables.
- `20261030_r2_photo_operations.sql` and its read-only verification applied through
  Supabase SQL Editor successfully. Existing inspection/photo content was untouched.
- Worker code version `8bbffa20` deployed, followed by a settings deployment with
  `PHOTO_ENVIRONMENT=test`, `PHOTO_TRANSPORT_ENABLED=false`.
- Hourly cleanup Cron configured: `17 * * * *` UTC. The handler remains inert
  while transport is disabled. Configuration matches `wrangler.toml`.
- User chose to configure the encrypted secret personally. No secret was read,
  copied or configured by the agent. Signed-in live image operations remain pending.
- No live photo objects were created/deleted by these checks. Production app
  changes were not deployed. No commit or push was performed.

## Secret setup

In the test Worker's Settings → Runtime variables and secrets → Add variable:
name `SUPABASE_SERVICE_ROLE_KEY`, value the project's existing legacy service-role
JWT, with **Secret** checked. Do not send it in chat or put it in source, command
arguments, screenshots, browser assets or a plaintext variable. Do not create a
new API key unnecessarily. This privileged credential is used only for server-only
RPC calls; ordinary authorization reads still use the caller's session and RLS.

The app flag `R2_PHOTO_PILOT_ENABLED` remains false. The Worker test flag was
enabled for the controlled console pilot described above. Browser origins are
exactly `https://kmtrack.pages.dev` and (test environment only) the test Worker
itself. Arbitrary previews, localhost and the isolated presentation app are
excluded. Do not loosen CORS to `*` for testing.

## API

All following routes are under `/v1/inspections/{inspection UUID}/` and require a
bearer Supabase session. Tokens never go in URLs. Responses use no-store.

| Method/path | Purpose |
|---|---|
| GET `permissions` | Live account/inspection access; works with transport off |
| GET `current-info` | Current upload identity/checksums, or null |
| GET `current` | Verified full evidence JPEG, or null |
| GET `current-thumbnail` | Verified thumbnail JPEG, or null |
| POST `uploads` | Reserve a stable immutable upload intent |
| GET `uploads/{upload UUID}` | Reconcile an intent |
| PUT `uploads/{upload UUID}/evidence` | Upload exact bounded JPEG bytes |
| PUT `uploads/{upload UUID}/thumbnail` | Upload exact bounded thumbnail bytes |
| POST `uploads/{upload UUID}/finalize` | Verify both actual images, atomically switch current |
| POST `uploads/{upload UUID}/abandon` | Abandon a non-current intent |
| POST `uploads/{upload UUID}/remove` | Remove current R2 photo if no legacy photo would reappear |

`GET /health` provides public stage information, not authenticated readiness.
No public object URLs, signing, arbitrary-key or HTTP cleanup routes exist.
The scheduled handler uses private RPCs and the test binding only. Inspectors and
supervisors attach/remove only on their own inspection in their current team.
View authorization rechecks current approval/team and inspection access.
Errors are sanitized; the Worker emits no custom token/request logs.

## Integrity, replacement and cleanup

The client reuses browser canvas JPEG encoding at quality 0.80: max 1600px evidence,
400px thumbnail. Limits are 5 MiB and 512 KiB respectively. Server validation checks
JPEG container structure/dimensions and actual SHA-256, not filename/MIME/ETag alone.
It is not a general-purpose image decoder or malware scanner. Actual R2 bytes for
both variants must verify before finalization. Writes are create-only; uncertain
retries reconcile immutable IDs. Retry exhaustion still allows recovery of an
already completed final attempt. Originals remain on the phone.

Legacy Supabase photos/references are preserved. When the pilot is explicitly
enabled, private viewing prefers R2 and falls back only on absence, not denial.
Thumbnails are generated and privately retrievable; Log does not automatically
download every thumbnail. Upload is an explicit pilot action, with no background
sync or inspection-runner side effect.

Replacement queues old evidence and thumbnail. Permanent inspection deletion
cascades metadata into the private cleanup outbox; the existing deletion RPC is
unchanged. Access ends when the current reference disappears. Physical deletion
waits for the scheduled cleaner and grace period. Repeated sweeps catch delayed
writes. UUID-only intent receipts prevent resurrection and retain no image content.
Cleanup handles up to 20 objects per run; backlog/usage monitoring is Step 11.

## Verification

### Monitoring and iPhone preparation

Run [R2_PHOTO_HEALTH.sql](../../docs/supabase/R2_PHOTO_HEALTH.sql) as an operator
for read-only test-pilot counts. Investigate first deletions overdue by more than
two hours, deletion errors, or expired unfinished intents persisting across runs.
Retained cleanup locators are repeated-sweep receipts, not a count of live files.
Declared metadata bytes are not actual billed storage: use Cloudflare R2 Metrics
for storage/operation usage and Worker invocation errors for scheduler health.
No automated alerts have been configured by this checklist.

The [iPhone checklist](IPHONE_QA.md) describes the remaining physical-device tests.
It requires an isolated app pilot; the synthetic console cannot verify camera or
offline persistence. Production remains disabled until these checks pass.

- Focused app/Worker tests: 241 passed.
- Isolated PostgreSQL migration/permission/protocol tests: 7 passed. Temporary
  Apache-2.0 PGlite 0.5.13 test runtime outside the repository, no app dependency.
  Source: https://github.com/electric-sql/pglite. No source code was borrowed.
- Real browser synthetic-image encoding: 3200×2400 → 1600×1200 evidence (50,336
  bytes), 400×300 thumbnail (9,658 bytes). Both pass Worker JPEG validation. Sizes
  apply to that synthetic image and do not predict field-photo compression.
- App-only and isolated presentation builds pass; offline shell v271.
- Live SQL success verified. Signed-in live uploads, viewing, replacement, cleanup
  and real iPhone interrupted/offline recovery still required before activation.

```powershell
node --test tests/photo-worker.test.mjs tests/r2-photo-worker.test.mjs tests/r2-photos.test.js
# Optional: PGLITE_MODULE_PATH points at an isolated runtime's dist/index.js.
node --test tests/r2-photo-database.test.mjs
node scripts/build-cloudflare.cjs
node scripts/build-presentation.cjs
```

Do not rerun successful migrations. See the [protocol](../../docs/supabase/R2_PHOTO_PROTOCOL.md).
Prepared commit: `Add private R2 photo upload, viewing and cleanup pilot`.

References: [R2 Worker API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/),
[Supabase database functions](https://supabase.com/docs/guides/database/functions).
