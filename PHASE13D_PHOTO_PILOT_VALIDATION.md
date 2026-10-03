# Phase 13D — pilot photo status and recovery integration

October 3, 2026 (Asia/Manila). Phase 13C accepted by the user. Phase 13D implementation only; stop before Phase 13E/14. No Supabase contact, live reservation/upload/download, backend configuration change, staging, commit or push occurred.

## Baseline and scope

Read parent/repository AGENTS.md, .codex/HANDOFF.md, PROJECT_CONTEXT.md, SUPABASE_ARCHITECTURE.md, IMPLEMENTATION_PLAN.md, PHASE13B_LOCAL_PHOTO_VALIDATION.md, PHASE13C_PHOTO_PROTOCOL_VALIDATION.md and PHASE12_FINAL_VALIDATION.md before implementation. The user's detailed Phase 13D request supplies implementation approval; older pending-phase statements are historical.

Independently verified main at 31d5278d9ebdd7ef40e49ee79a2b4df1d0da55c6, with Phase 13C committed and cache v232. Read-only GitHub ls-remote confirmed that exact pushed main; local tracking divergence was 0/0. The initial restricted-network query failed; the authorized read-only query succeeded. Preserve the pre-existing AGENTS.md addition, .codex handoff/skill and references workbook. HANDOFF.md was not rewritten by this phase.

## User-facing behavior

Inspection acknowledgement remains independent of photo acknowledgement. Header count wording changes from “Synced” to “Submitted”; its description is “Inspection rows are submitted. Check each record for its separate photo status.” No inspection queue/model/INSERT contract or export schema changes.

Exact photo wording:

- Inspection submitted · photo local
- Inspection submitted · photo pending
- Photo uploading
- Inspection submitted · photo synced
- Photo retry scheduled
- Photo retry needed (failed state without a saved schedule)
- Photo needs review
- Photo unavailable / reserved but not yet uploaded (additional reservation/unavailability text)
- Photo local (Guest original, held claim/preapproval or Keep local)

Cards have a compact wrapping photo status/action row. Source-change review explains: “Saved upload evidence no longer matches the current local photo. The saved payload and intent are retained; replacement is unavailable.” Retry review includes the saved photo_next_retry_at verbatim. Reservation details clarify that an object may not yet be uploaded **or verified**; the short availability label is not an absence proof.

Guest originals and held copies never advertise cloud photo work. Keep local never advertises pending/uploading/retry. Released claimed copies and explicit preapproval Submit records can independently show pending after their inspection row is durably synced. Preparation remains explicit and local only, using the existing eligibility guards. It is hidden while the photo controller is busy.

## Recovery and activation

Exact new actions are **Review photo issue** and **Retry photo**. Review displays the status, explanation, saved retry time where present, and “Photo uploads are disabled for this pilot. Retry time and saved upload evidence are retained.” It does not release review, change the manifest or reset counters. Needs-review offers review only; no reset/replacement/delete/overwrite/bulk recovery action exists.

Retry photo is visibly disabled while PHOTO_CLOUD_TRANSPORT_ENABLED=false, accompanied by “Photo uploads disabled for pilot.” The handler independently exits at that gate before verification, local mutation or transport. The app constructs one disabled photo controller; there is no setting/toggle, automatic dispatch, scheduler, startup/reconnect wakeup or Phase 12 runner hook.

For separately enabled **mocked** controllers, retryNow bypasses only the backoff time. It requires photo_failed, retains the schedule until successful authorization/evidence validation and attempt persistence, preserves the same manifest/payload/path, never encodes/regenerates, and keeps all ownership/source/durability/attempt-limit guards. Existing busy protection and same-origin Web Lock serialize photo operations. Review and exhausted attempts cannot be reset through retry. Normal dispatch still honors saved backoff.

After an exact reservation reread, the enabled protocol durably saves photo_reserved_path as a separate local observation hint. It does not set photo_path or photo_synced and is never cleared automatically. The hint survives pending/retry/review; a valid acknowledged synced state suppresses its availability warning. This preserves the Phase 13C rule that inspection photo_path/photo_filename are locally set only after exact object proof and durable acknowledgement. Existing backend reservation remains untouched.

## Photo viewing

View Photo first reads the local stamped blob, including during pending/retry/review, without verification or cloud access. Late local results are rejected after record/source/account/workspace changes.

Only when that local blob is absent and the entry has valid durable photo_synced acknowledgement may the explicit viewer use private cloud retrieval. It freshly verifies profile and authenticated owner, matching account binding/team/Inspector or Supervisor role, scope/current entry/durability, row filename/path, downloaded size/full SHA-256 and a final matching row. Freshness and identity guards run after asynchronous boundaries. Owner-only local acknowledged records qualify; this is not a new team/cloud-photo browsing feature. The retrieved optimized evidence image is shown as-is; local stamped preview and local export behavior are retained.

Unacknowledged metadata never licenses a cloud read or success. Missing/denied/ambiguous/wrong-byte objects and changed row associations are not displayed. Confirmed retrieval failure is durably held as photo_needs_review with retained acknowledgement/manifest/path; no reservation clearing or cloud write occurs. Denied/ambiguous reads are not treated as proven absence. Persistence failure prevents presenting the cloud result. Account/workspace changes close the existing photo modal. No public bucket, public URL or signed-URL workflow was added.

## Tests and checks

Final independent groups: **477 passed, 0 failed**, none skipped/cancelled.

1. `node --test --test-reporter=tap photo-pilot.test.js`: **43/43 passed**. Status matrix, held original/copy/Keep local, preapproval/claim pending, reservation without proof, retry wording, local preview, private viewer/hash/auth/row/stale-result guards, extracted production retry/view/Log handlers, real workbook builder and map scope pipeline.
2. `node --test --test-reporter=tap photo-upload-state.test.js photo-sync.test.js`: **110/110 passed** (42 local preparation; 68 protocol tests, including five new manual-retry cases). Exact identity/payload reuse, no regeneration, gate-before-side-effects, schedule retention, busy guard, review/exhaustion refusal. The existing preparation test now extracts only its target function instead of neighboring newly added handlers.
3. `node --test --test-reporter=tap guest-claim.test.js preapproval-review.test.js sync-runner.test.js submission-recovery.test.js entry-model.test.js sync-queue.test.js local-entry-store.test.js auth.test.js inspection-api.test.js inspection-sharing.test.js swipe-actions.test.js`: **324/324 passed**.
4. Additional six-file surface run (`excel-export`, `map-overlays`, `map-basemaps`, `log-list-view`, `entry-filters`, `photo-zoom` tests): **49 total, 29 passed, 20 failed**. Independently archived committed HEAD into ignored output/playwright/phase13d-baseline and ran the identical command against it: **49 total, 29 passed, 20 failed**. All **20 failing test names exactly match**. Historical formatting/handler/markup expectations remain outside scope. The new focused tests directly execute the current Log renderer, Map/workspace pipeline and workbook builder with status-bearing rows; all pass. Do not describe the legacy surface suite as passing.
5. Syntax helper: **25 application JS files and 2 inline scripts passed**. `node --check` passed for all six changed/new test files. `git diff --check` passed. Cache bumped to **v233**, including photo-pilot.js; three existing Phase 12 tests and the protocol cache assertion updated accordingly.

Real isolated Edge check through the computer-use browser capability used only a new localhost:8784 fixture, production renderer/handlers/modules and local synthetic JPEGs. Seven states rendered; screenshot inspection showed compact status/action rows; disabled Retry photo, source-change review explanation and retained local preview during retry were observed. The fixture never loads index.html/Auth SDK, uses in-memory data only, and CSP connect-src none blocks backend requests. No preserved browser/app session or fixture was opened or changed. The test tab was closed and its server stopped. Offline Playwright CLI was unavailable (package not cached); no package was installed. One review alert was automatically dismissed by browser tooling; a subsequent explicit dismiss found no active dialog. This was harness behavior, not a failed application test.

Ignored evidence is under output/playwright/phase13d-*. Full suite, actual installed PWA/mobile/GPS/camera, deployed v233 shell, actual cross-tab photo contention and live cloud authorization/protocol/viewer behavior are **not verified**. Mocked clients and the isolated browser fixture do not establish live RLS/grants or missing-object error semantics.

## Exact Phase 13E prerequisites

1. Explicit approval of isolated live validation scope: dedicated account/role/team, new labeled inspection UUIDs, synthetic photos, allowed conditional inspection PATCH and immutable Storage INSERT/private GET scenarios. No implicit activation, old fixture recovery/reuse/deletion or account/profile changes.
2. Fresh read-only backend inventory of effective inspection photo-column UPDATE grants, inspection/Storage policies, helper functions/identity triggers and private bucket MIME/size settings. Verify compatibility with atomic null/null reservation and owner-only upsert:false upload; stop if backend changes, overwrite permissions or reservation clearing would be needed.
3. New isolated profile/origin/workspace with tight request guards. Inventory preserved sessions first. Prevent automatic Phase 12 sync from touching unrelated records. Use explicit test-only enabled controller construction; leave the production gate false. Establish committed/deployed test revision and actual cache v233 before claiming runtime coverage.
4. Verify real missing-object error codes. Only explicit NoSuchKey/ObjectNotFound authorizes absence in the protocol; generic 400/404, denial and uncertain reads must stop/hold without upload. Do not weaken the proof based on status alone.
5. Validate null/null conditional reservation, exact reread, temporary unavailable/pending UX with local preview, same immutable path/payload upload, private-download size/full-hash proof, final row match and durable acknowledgement. Exercise lost responses, existing matching/mismatching objects, restart/backoff/manual retry/attempt limits without duplicates or overwrite.
6. Validate owner/team/role denials, source divergence, stale sign-out/account/team results, missing local blob with private-viewer fallback, row/object changes, Guest/held claims/Keep local exclusion, actual cross-tab lock contention and persistence failures. Preserve original blobs/manifest and reserved metadata throughout. Confirm Log/Map/export/workspace isolation and offline/device/PWA behavior within the separately approved scenario set.
7. Any cleanup/deletion or review release requires separate explicit scope. Phase 14, replacement, multiple photos, normal-user activation and schema/RLS/privacy changes remain excluded.

## GitHub Desktop handoff

**Summary / commit message:** Add gated pilot photo status and recovery controls

**Description:** Separate inspection submission from photo status; add reservation/source-change explanations, a disabled manual retry seam and guarded local-first/private photo viewing. Preserve immutable upload evidence and Phase 12 sync, add focused recovery/viewer/Log/Map/export tests, and cache the pilot integration in v233 without enabling uploads.

Select only these Phase 13D files:

- [ ] index.html
- [ ] photo-pilot.js
- [ ] photo-pilot.test.js
- [ ] photo-upload-state.js
- [ ] photo-upload-state.test.js
- [ ] photo-sync.js
- [ ] photo-sync.test.js
- [ ] sharing.css
- [ ] sw.js
- [ ] guest-claim.test.js
- [ ] preapproval-review.test.js
- [ ] sync-runner.test.js
- [ ] PHASE13D_PHOTO_PILOT_VALIDATION.md

Leave AGENTS.md, .codex/ and references/ unselected; exclude ignored logs, baseline archive/extraction and synthetic fixture artifacts. Branch main and HEAD 31d5278 remain unchanged; ten tracked Phase 13D files are unstaged and three new Phase 13D files are untracked. Nothing staged/committed/pushed. Automatic photo activation remains false. Phase 13D stops here.
