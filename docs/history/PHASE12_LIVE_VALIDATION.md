# Phase 12.3B live validation — continuation results

Date: 2026-10-02 (Asia/Manila). Continuation validation is complete under the requested rule permitting explicit partial/unverified limitations. The contained offline-capture fix is locally validated and awaits user commit/push. Initial-stop and Fix 1 evidence below is historical; the continuation section at the end is current. This does not claim every live path passed.

## Repository and isolation

- main and origin/main both point to f501b20; tracking comparison 0 / 0 after the user's remote refresh. Phase 12.3A runner is connected; source/cache v226.
- Read applicable AGENTS.md, handoff and three Supabase planning documents. Older roadmap status is stale.
- Published origin presented 153 existing local inspections at its binding gate. No binding was performed; user was instructed to leave them unchanged. Do not use that workspace for disposable tests.
- Tested committed source on http://127.0.0.1:8765/ with a separate headed Playwright Edge session `phase12-live`. It began with zero persisted inspections. Private sign-in was performed by the user. Active service worker and cache spotit-shell-v226 verified.
- User explicitly authorized Playwright after connected browser control failed. Test harness/scripts/evidence are ignored files under output/playwright/. They contain no passwords, auth tokens or auth headers. No tracing/session export was used.
- Capture used emulated browser geolocation; this is not physical GPS/device coverage. A stale fix first prevented capture correctly and created no record.

## Initial-stop / Fix 1 results (historical; current continuation below)

| Area | Result | Evidence / limitation |
| --- | --- | --- |
| 1. Backend compatibility | PARTIALLY VERIFIED | Columns/types, primary key, RLS, complete policy set, helpers and enabled triggers match. The initial float JSON mismatch is resolved by Fix 1 below; remaining live coverage is pending. |
| 2. First automatic INSERT | PASSED AFTER FIX 1 | Original single POST / 201 preserved. One authorized GET / 200 recovered the existing row to durable synced state; no second INSERT. |
| 3. Offline/reconnect | NOT VERIFIED | Stopped before this scenario. |
| 4. Restart/foreground | NOT VERIFIED | No recovery scenario executed. |
| 5. Uncertain response recovery | NOT VERIFIED | No fault injection/reconciliation performed after the first acknowledgement mismatch. |
| 6. Authorization/workspace | PARTIALLY VERIFIED | Approved Inspector/profile/binding verified; 153-record binding gate preserved. Live excluded-role/account-switch/late-result paths not exercised. |
| 7. Manual/automatic overlap | NOT VERIFIED | No manual submission action used. |
| 8. Retry/failure | PARTIALLY VERIFIED | Local deterministic suite passes; live mismatch safely held without a second POST or transient loop. |
| 9. Device/PWA | PARTIALLY VERIFIED | Desktop Edge, active v226 worker/cache, empty initial persisted workspace and successful local Save verified. Offline, PWA reopen, physical mobile, photo preservation and foreground recovery untested. |

## Read-only backend inventory

Project matches auth-config.js. public.inspections has expected UUID, timestamptz, text, float8 coordinates, smallint lane and integer KM columns; UUID is client-supplied primary key and user_id references auth.users.

RLS enabled on inspections and profiles. Complete inspections policy inventory: Admin SELECT; approved team SELECT; INSERT requires approved Inspector/Supervisor plus auth.uid owner/current team; Inspector UPDATE own/current team; Supervisor UPDATE current team; no DELETE/ALL policy. Admin is excluded from engineering writes. Profiles have own SELECT plus Admin SELECT/UPDATE, no ordinary self-update.

Enabled identity trigger protects id/user_id/team/created_at. Enabled updated_at trigger assigns now(). Authorization helper definitions require approved profiles and the expected roles/team. Five Inspectors, one Supervisor and one Admin are currently approved in roadway; there is no pending/unapproved profile fixture. No profile changes made to manufacture one.

Actual app account and binding: Inspector `8546d12a-5112-441c-badd-822591dcc526`, approved roadway; app userId equals workspaceUserId and cloudVerified true.

Historical Phase 11 row `1982ca8f-0411-4420-b4d2-4de62b618c6b` was read-only verified and preserved, with label PHASE 11 TEST - SUPERVISOR UPDATED and updated_at 2026-09-28T09:39:31.703462+00:00.

## First test record and evidence

Preserve UUID `ec802180-55c1-4c7d-b1d7-cb7c804d72c1` in cloud and the isolated local browser. Do not delete, overwrite, regenerate its snapshot or clear its review hold automatically.

The capture UI supports fixed defect types, not custom defect labels. The unmistakable label `PHASE 12.3B TEST 1 - AUTO SYNC - DO NOT DELETE` was entered through the normal edit sheet into lane/position before submission; cloud defect_type is Others and lane_other contains that label. No custom app state/record mutation was used.

A test-only network gate delayed the normal fresh authorization request, leaving the runner's validation intact. The normal capture saved the entry synchronously. Storage readback showed pending, original UUID/time, zero attempts, blank remote_id and no snapshot or inspection request. The normal edit sheet saved the label; storage was checked again before releasing authorization. No manual submit was used. Runner then persisted its original submission intent and issued one POST.

- created_at: 2026-10-02T06:07:53.194Z; local inspected timestamp 2026-10-02 14:07:53, mapped inspected_at 2026-10-02T06:07:53.000Z.
- POST /rest/v1/inspections?select=* at 2026-10-02T06:09:54.986Z; response 201 at 2026-10-02T06:09:55.268Z. Times here are UTC.
- Sanitized observed request counts: POST 1; inspection GET/PATCH/DELETE 0; Storage 0. No upsert/conflict query; implementation uses plain insert. No second INSERT observed through final readback.
- Owner matches Inspector above; team roadway; defect Others; NLEX; KM 12008 metres; lane_number null and lane_other label; direction/interchange fields null; both cloud photo columns null. DMM strings match intended values.
- Read-only SQL UUID count is exactly 1. Cloud created/inspection times, identity and mapped content verified.
- Initial stopped local state: needs_review, sync_outcome_unknown true, submission_review_required true, submission_retry_allowed false, remote_id empty, sync_attempts 0, no scheduled retry. Snapshot retained. Error: Server acknowledgement differs from the submission snapshot.
- Normal local capture/log display showed the single local entry. Map/export behavior and cloud-view separation were not live exercised.
- Sanitized evidence saved to ignored output/playwright/phase12-first-insert-evidence.txt; harness state remains in the open isolated browser session. Preserve this session until explicit completion/cleanup instructions; its profile is not a persistent user profile.

## Defect / compatibility blocker

Strict numeric comparison in inspection-api.js canonicalRow/matchesSnapshot rejects the successful row acknowledgement because server JSON shortens float8 values:

| Field | Submitted snapshot | Live row JSON |
| --- | --- | --- |
| latitude | 14.679362999296158 | 14.6793629992962 |
| longitude | 121.00064099999909 | 121.000640999999 |

Dashboard SQL current_setting('extra_float_digits') returned 0. Read-only float8send checks show PostgreSQL stored the EXACT submitted binary values: latitude 402d5bd577902dcf, longitude 405e400a808c821a. Node Buffer.writeDoubleBE of the original values produces those identical bits. Stored coordinates are not altered; shortened JSON representation fails the client's exact JavaScript-number equality. Original POST body and status were recorded; its response body was not captured, so the returned live JSON comparison uses a subsequent read-only SQL serialization.

At the initial stop, no code fix had been made. Per the user's stop rule, further live writes stopped upon discovering this compatibility mismatch. Do not silently add a broad numeric tolerance, regenerate old intent, auto-clear review or modify backend serialization/schema settings. Resolve the representation contract with a focused, reviewable change and safety tests before resuming writes. The first cloud row must remain preserved. This phase must not be called complete.

## Initial-stop tests and checks (historical)

- Focused nine-file regression suite: 204 passed, 0 failed, none skipped/cancelled.
- Full node --test: 332 total, 275 passed, 57 failed, none skipped/cancelled; matches previously recorded Phase 12.3A counts. Previous phase independently established identical failing names against baseline. No unrelated legacy fixes made.
- JavaScript syntax: 14 files passed. Inline scripts: 2 passed. git diff --check passed.
- These local checks predate the live scenario; no application source changed afterward. No tests claim live scenario success.

## Initial-stop backend / code changes and next gate (historical)

No schema, RLS, trigger, role, profile, Storage or Realtime changes; no inspection UPDATE/DELETE, photo upload, source edit, cache bump, staging, commit or push. Only the disposable INSERT described above occurred. This report is the only newly tracked-scope document created; unrelated AGENTS.md and untracked handoff/skill/reference workbook preserved.

Next work is to resolve the float serialization contract within a separately reviewed continuation of Phase 12.3B, then safely rerun acknowledgement and remaining scenarios. Pending-account/device limitations must remain explicit. Do not expand into 12.4, claims, photo sync or automatic PATCH. Never bind the published 153-record workspace as part of these tests.

## Fix 1 — coordinate acknowledgement compatibility

The actual authorized REST GET also returned latitude 14.6793629992962 and longitude 121.000640999999 as JSON numbers. PostgreSQL columns are double precision / float8; the original snapshot coordinates are JavaScript numbers. SQL float8send and original Node binary representations agree exactly (hex values above), so this is shortened output representation rather than altered stored coordinates. With extra_float_digits=0 PostgreSQL emits 15 significant digits for float8 ([official numeric type documentation](https://www.postgresql.org/docs/current/datatype-numeric.html)).

inspection-api.js now uses one directional coordinate-only comparison: both values must be finite numbers, and the returned coordinate must equal either the original intended number or Number(intended.toPrecision(15)). This accepts exactly the observed serialization output, without a broad epsilon interval or rounding both sides into a common bucket. Other UUID/identity/team/content/time/photo fields retain strict canonical equality. Null, invalid, non-finite and numeric-string coordinates remain rejected; the live float8 JSON contract supplied numbers, not strings. Original snapshots, mapping and full-precision local-content comparison are unchanged, so local edits cannot be hidden by serialization rounding.

The explicit syncRunner.reconcileAcknowledgement seam shares existing runner/API locks and fresh authorization, scope, durability and snapshot guards. Only the exact acknowledgement-mismatch hold can be reconsidered. It calls SELECT-only reconciliation and clears the hold only after a complete matching row and durable local save. Automatic wakes still exclude held records. No-row, RLS/transient failures, unrelated review reasons, scope changes and local edits cannot authorize an INSERT or release the hold. No UI or backend changes were added. sw.js cache is bumped to v227.

## Preserved-row recovery — completed

- Existing UUID: ec802180-55c1-4c7d-b1d7-cb7c804d72c1. No replacement record or snapshot was created.
- Patched v227 source was loaded by normal service-worker update/reload in the isolated test session. This necessary code update does not establish the pending restart/foreground scenario.
- Explicit runner reconciliation made exactly one inspection GET filtered to this UUID. Request 2026-10-02T06:33:24.500Z; HTTP 200 response 2026-10-02T06:33:24.725Z (UTC).
- Response contained exactly one row with the preserved UUID. Owner, team, every inspection field and both null photo columns matched the snapshot under the coordinate rule. Together with the prior UUID primary-key/count check, exactly one cloud row exists.
- Recovery traffic: inspection POST 0, PATCH 0, DELETE 0; Storage requests 0; blocked write attempts 0. The original POST / 201 remains the only INSERT.
- Result: matching, retryAllowed false. Durable local readback: sync_status synced; remote_id equals preserved UUID; sync_outcome_unknown false; submission_review_required false; submission_retry_allowed false; sync_attempts 0; sync_next_retry_at null; sync_error empty; synced_at 2026-10-02T06:33:24.725Z. Normal status display reads Submitted.
- Original submission snapshot remained byte-for-byte unchanged. Full-precision coordinates and original capture/inspection timestamps remained unchanged. No photo was attached to this test record; cloud photo fields remain null.
- Sanitized evidence: ignored output/playwright/phase12-fix-recovery-evidence.txt and phase12-fix-final-proof.txt. Existing isolated browser/session and all other records remain preserved.

## Fix 1 validation and scope boundary

- Focused inspection API, submission recovery and runner suites: 155 tests, 155 passed, 0 failed, 0 skipped/cancelled.
- Broader nine-file regression suite: 238 tests, 238 passed, 0 failed, 0 skipped/cancelled.
- Full node --test: 366 tests, 309 passed, 57 failed, 0 skipped/cancelled. The failure count remains the previously recorded 57; no unrelated legacy fixes were attempted. This fix adds 34 tests.
- JavaScript syntax: 14 files passed; inline index scripts: 2 passed. git diff --check passed.
- Tests cover exact/serialized coordinates, changed coordinates including smaller differences in the same rounded bucket, invalid/non-finite/null/string values, strict non-coordinate fields, unchanged snapshots, strict local edits, matching held-row recovery, no-row/failure holds, authorization/review exclusions, serialization locks, scope changes and durable-save rollback.

Fix 1 resolves the compatibility blocker and requested area 2 only. Offline/reconnect, restart/foreground, uncertain-response fault injection, manual/automatic overlap and the remaining authorization/device coverage are still incomplete as listed above. No remaining Phase 12.3B scenarios were resumed. No schema/RLS/profile/Storage/Realtime changes, inspection PATCH/DELETE, new INSERT, staging, commit or push occurred during Fix 1. No Phase 12.4, claims, photo sync or unrelated UI work. Await separately authorized continuation; preserve the existing test row and the published 153-record workspace.

## Items 3-9 continuation - current results

Starting verification: main and origin/main both 4920434 (0 / 0), committed coordinate fix present, cache v227. Nothing staged. Applicable instructions, handoff, planning documents and this report read first. Existing AGENTS.md, handoff/skill and reference workbook preserved. Explicit continuation approval supersedes the stale handoff scope. Accepted first-INSERT/matching recovery was not repeated.

| Item | Status | Evidence / limitation |
| --- | --- | --- |
| 3. Offline/reconnect | PASSED AFTER CONTAINED FIX | Durable offline Save, zero inspection requests offline, local Log/Map/Excel, automatic POST / 201, correct mapped row and durable synced acknowledgement. |
| 4. Restart/foreground | PARTIALLY VERIFIED | Offline pending reload, synced reload exclusion, saved retry count/time survived. Tab switching emitted no visibility events; live foreground wake NOT VERIFIED. |
| 5. Uncertain recovery | PARTIALLY VERIFIED | Actual successful no-row GET preceded INSERT. Persistent simulated read failures retained uncertainty and prohibited INSERT. Safe live mismatching-UUID fixture NOT VERIFIED. |
| 6. Authorization/workspace | PARTIALLY VERIFIED | Approved Inspector, Guest/review exclusion, sign-out and late-response isolation passed. Additional roles, different account/team, expired verification and direct live RLS denial NOT VERIFIED. |
| 7. Manual/automatic overlap | PASSED | Automatic POST held; actual manual handler returned busy, no second POST; release produced one POST / 201 and one row. |
| 8. Retry/failure | PARTIALLY VERIFIED | Browser failures 1/2, persisted backoff/restart, success reset, permanent validation hold and unrelated later submission passed. Cap/jitter/eight-failure budget tested deterministically. Direct RLS/conflict denial NOT VERIFIED live. |
| 9. Device/PWA | PARTIALLY VERIFIED | Desktop reload/offline/reconnect/local persistence and synthetic-input photo retention passed; v227 initially, v228 after fix. Installed PWA, true foreground and physical mobile/GPS/camera NOT VERIFIED. |

### Contained offline-capture defect and fix

Three capture paths set preapproval_review_required whenever display mode differed from approved. Going offline changes a recently verified approved account to offline-recent, so normal offline Save incorrectly acquired a sticky preapproval hold. Reproduced UUID 2d13ed58-9bbf-4fcf-9e46-079df8b53c91 remains preserved and held; its existing flag was not cleared.

index.html now uses captureNeedsPreapproval in standard, continuous-photo and single-photo new-record creation. Only an unlocked approved-profile workspace in approved or offline-recent mode avoids a new hold. Auth already limits offline-recent to recent cached approval. Pending, Guest, expired/local-only and locked/mismatched states remain held. Fresh online authorization, role/team, durability and snapshot requirements for cloud writes are unchanged. Existing flags/snapshots are untouched. Cache bumped to v228. Regression runs actual logDefect across eight authorization cases and checks all three capture sites; extracted capture tests include the helper.

A labeling mistake selected the older TEST 1 card; its original label was restored through the normal edit form before proceeding. Snapshot/cloud row remained unchanged and no PATCH occurred. Guest lane reset generated an extra local capture; it was labeled and preserved too. No production UI changes were made for these harness issues.

### Scenario evidence

All account writes used approved Inspector 8546d12a-5112-441c-badd-822591dcc526 in its bound roadway workspace. GPS inputs were emulated desktop positions. Photo input was a synthetic canvas video stream through normal camera/capture/Save code. No application authorization, durability, snapshot or RLS protection was bypassed.

- Fixed TEST 2: persisted pending offline with no review flag and no inspection requests. Local Log displayed its label; Map exposed a labeled accessible marker. Normal offline Excel export downloaded successfully with five local data rows plus headers in both worksheets. Reconnect automatically sent one POST / 201 without manual Submit. Authorized cloud loading confirmed one UUID row, owner/team and all snapshot fields matching, null photos. Durable synced state, remote_id same UUID, attempts 0, schedule null.
- TEST 3 pending survived offline reload. A POST deliberately aborted before backend dispatch produced failed/unknown, attempt 1, original snapshot and sync_next_retry_at 2026-10-02T06:59:18.459Z. Reload retained count/schedule and made no immediate inspection request. Already-synced records were not resubmitted during reloads.
- TEST 3 no-row sequence: aborted POST; simulated GET / 503; actual GET / 200 returning no row; actual POST / 201 using original snapshot. SDK internally retried the transient read. INSERT occurred only after successful absence proof. One backend INSERT/cloud row; success reset retry metadata. The aborted request is not a backend INSERT.
- TEST 5 persistent failure: initial POST aborted pre-backend; normal Retry now triggered four SDK GET attempts, all simulated 503. Final read-failure state: attempts 2, unknown true, retry_allowed false, original snapshot retained, next_retry_at 2026-10-02T07:08:49.143Z. No INSERT followed failed reads. Later Retry now received actual GET / 200 no-row then simulated POST / 400 (23514), producing sticky needs_review, review_required true, attempts 2, schedule null. Both POST attempts intercepted before backend execution; cloud count 0. This is simulated validation rejection, not a live RLS denial.
- Browser states established failure counts 1 -> 2 and saved schedule. Deterministic tests establish increasing exponential delays, +/-20% jitter, 30-minute cap and eight failures. No record metadata or clock was edited to force eligibility; normal Retry now avoided long waits.
- TEST 4 automatic POST held before dispatch; actual submitLocalInspection handler invoked by approved harness with a temporary button returned the normal busy message while activeId matched. No second POST. Release gave POST / 201, synced/reset metadata; authorized cloud load verified one row. In-flight UI excludes submit, hence handler harness used. Real tab switching/bringToFront emitted no visibilitychange events and does not establish foreground wake.
- Held-record independence: TEST 5 stayed needs_review while later TEST 6 automatically submitted under the same valid scope. Original preapproval-held TEST 2 stayed excluded. Local-only/imported/already-synced and other review exclusions additionally passed deterministic tests; no fake persisted flags manufactured in live workspace.
- TEST 6 photo: normal offline Save stored stamped image 32,885 bytes and raw image 7,645 bytes. Offline reload retained the same photoId/image size and durable pending record. Reconnect metadata POST / 201 succeeded; local image remained 32,885 bytes. Both cloud photo fields null, Storage requests 0. This does not imply physical-camera coverage.
- TEST 7: actual backend INSERT / 201 with correct owner/team/content; response held while normal Settings Sign out completed and normal Continue without signing in entered separate Guest workspace. Releasing the response did not acknowledge the old account or populate Guest entries. Account remains durably syncing/unknown with original snapshot, blank remote_id, attempts 0; one cloud row exists. This intentionally preserved interrupted attempt awaits future same-account reconciliation, not an additional INSERT or repeated accepted matching-recovery test.
- Guest TEST 8 and control-reset record carry guest_claim_required and preapproval_review_required, remain pending with blank remote_id, survive reload, and send no inspection requests. Guest displays only its two records; eight account records remain preserved separately. Loaded cloud rows were never imported into local Entries/Map/export.

### Preserved record ledger

All labels below are complete. No cleanup authorized. Counts for loaded rows use authorized GET; photo and delayed-response counts use successful single INSERT representation plus UUID primary key, without post-sign-out SELECT. Local-only absence follows no backend INSERT and/or actual no-row read.

| UUID | Label | Methods/statuses | Backend INSERTs / cloud rows | Final local state / retry |
| --- | --- | --- | --- | --- |
| ec802180-55c1-4c7d-b1d7-cb7c804d72c1 | PHASE 12.3B TEST 1 - AUTO SYNC - DO NOT DELETE | Loaded GET / 200 only | 0 new / 1 existing | synced, remote_id same UUID, attempts 0, no schedule |
| 2d13ed58-9bbf-4fcf-9e46-079df8b53c91 | PHASE 12.3B TEST 2 - OFFLINE RECONNECT - DO NOT DELETE | No record write | 0 / 0 | pending, preapproval hold, remote_id blank, attempts 0 |
| 52c45d89-da88-4418-9389-b5de8c9713b9 | PHASE 12.3B TEST 2 - OFFLINE RECONNECT - DO NOT DELETE - FIXED CAPTURE | POST / 201; loaded GET / 200 | 1 / 1 | synced, remote_id same UUID, attempts 0, schedule null |
| 7fd63adf-6840-40f2-8fd5-e98d1c1162ab | PHASE 12.3B TEST 3 - RESTART RETRY NO ROW - DO NOT DELETE | POST aborted; simulated GET / 503; actual GET / 200 no-row; POST / 201; loaded GET / 200 | 1 / 1 | synced, remote_id same UUID, attempts 0, schedule null |
| 6b87c156-a5b7-4a47-a15c-22f098b6fd9a | PHASE 12.3B TEST 4 - MANUAL AUTO FOREGROUND - DO NOT DELETE | Delayed POST / 201; loaded GET / 200 | 1 / 1 | synced, remote_id same UUID, attempts 0, schedule null |
| 3773a001-b6f3-4436-a8e1-27e4a1c65b24 | PHASE 12.3B TEST 5 - READ FAILURE PERMANENT HOLD - DO NOT DELETE | POST aborted; four simulated GET / 503; actual GET / 200 no-row; simulated POST / 400 | 0 / 0 | needs_review/unknown, remote_id blank, attempts 2, schedule null |
| 0ae76e19-15c3-44e1-9db9-002158c55d2d | PHASE 12.3B TEST 6 - LOCAL PHOTO - DO NOT DELETE | POST / 201 | 1 / 1 | synced, remote_id same UUID, attempts 0, schedule null; photo retained |
| 0587f99f-c674-46a3-9424-6192517e6d24 | PHASE 12.3B TEST 7 - SIGNOUT LATE RESPONSE - DO NOT DELETE | POST / 201, response delayed until Guest | 1 / 1 | account storage syncing/unknown, remote_id blank, attempts 0, no schedule |
| 3941470e-d566-45c7-89f9-4c14a1f2c638 | PHASE 12.3B TEST 8 - GUEST CONTROL RESET - DO NOT DELETE | None | 0 / 0 | Guest pending/review+claim, remote_id blank, attempts 0 |
| 0d14c9ba-be37-485d-b669-65c98e9f435c | PHASE 12.3B TEST 8 - GUEST EXCLUDED - DO NOT DELETE | None | 0 / 0 | Guest pending/review+claim, remote_id blank, attempts 0 |

Totals: five actual backend INSERTs, all 201 with unique labeled UUIDs; three additional POST attempts intercepted pre-backend (two aborted, one simulated 400). No duplicate cloud row/INSERT, wrong owner/team write, inspection PATCH, DELETE or Storage request. No schema/RLS/trigger/profile/role/Storage/Realtime changes. Existing TEST 1/Phase 11 rows preserved; published 153-record workspace never bound or modified.

### Explicit limitations and final checks

- Additional Supervisor, other Inspector, Admin and pending-account private sign-in not supplied. Earlier inventory has no pending fixture; no profile changed. No prohibited backend write sent to prove direct RLS denial. Deterministic role exclusions are not fresh live RLS evidence.
- No safe live mismatching-UUID fixture manufactured; no legitimate-row PATCH/RLS bypass. Expired verification, different account/team transition and sign-out before otherwise eligible runner work remain NOT VERIFIED live. Live sign-out during work/Guest isolation passed; deterministic authorization/session/scope tests passed.
- Live foreground visibility events unavailable; installed-PWA reopening and physical mobile/GPS/camera NOT VERIFIED. No claim of running while closed. Cap/jitter/eight failures tested deterministically, not long real-time waits. Direct backend RLS/conflict denial unverified.
- Focused API/recovery/runner: 156 passed, 0 failed, 0 skipped/cancelled. Nine-file regression: 239 passed, 0 failed, 0 skipped/cancelled.
- Full node --test: 367 total, 310 passed, 57 failed, 0 skipped/cancelled. Same recorded baseline failure count; unrelated failures not fixed. One regression test added.
- 14 JavaScript syntax checks and 2 inline scripts passed. git diff --check passed.
- Sanitized ignored artifacts: output/playwright/continuation-*-evidence.txt, scripts and phase12-offline-export.xlsx. No auth headers, tokens, cookies or passwords captured.
- Isolated browser left open in Guest mode with two Guest/eight account records preserved. Final guard permits inspection GET only; inspection writes and Storage blocked. Remove test-only routes before separately authorized future writes. Do not close its in-memory session or clear storage until preservation/recovery arranged.
- Source changes: index.html helper, sw.js v228, sync-runner.test.js capture regression/dependency/cache assertion, local-entry-store.test.js extracted helper dependency; this report updated. Nothing staged/committed/pushed. No Phase 12.4 or unrelated features.

Phase 12.3B validation is complete with these explicit partial/unverified limitations under the requested completion rule. No architectural/schema blocker found. Contained fix awaits user review/commit/push. This does not claim universal device, role or backend-denial coverage.
