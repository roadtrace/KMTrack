# Phase 13C guarded first-photo cloud protocol

October 3, 2026 (Asia/Manila). User accepted Phase 13B and explicitly authorized Phase 13C implementation behind a disabled gate. Phase 13D, 13E and 14 have not been started. No live photo operation, backend inspection, schema/RLS/Storage change, staging, commit or push occurred.

## Baseline and instructions

Read parent/repository AGENTS.md, .codex/HANDOFF.md (including the preserved Phase 13A read-only findings; no separate Phase 13A report exists), PROJECT_CONTEXT.md, SUPABASE_ARCHITECTURE.md, IMPLEMENTATION_PLAN.md, PHASE13B_LOCAL_PHOTO_VALIDATION.md and PHASE12_FINAL_VALIDATION.md. The user's explicit implementation authorization supersedes the handoff's prior awaiting-scope status. Old phase statuses in planning documents are historical.

Independent Git checks found main at 6e64aefa34cd9c14a59e9aadd8ca32e0e27f65b2 with Phase 13B's nine files committed; read-only GitHub ls-remote returned that exact main SHA. Local tracking divergence was 0/0. Cache baseline was v231. Existing AGENTS.md change, .codex/HANDOFF.md, .codex/skills/handoff/SKILL.md and references workbook preserved unchanged.

## Activation and application integration

photo-sync.js createController defaults to disabled; dispatch returns disabled before verification, storage access, locks or persistence. photo-cloud-api.js independently defaults to disabled. Tests deliberately construct enabled controllers with mocked clients. Application createPhotoCloudController(client) always passes constant PHOTO_CLOUD_TRANSPORT_ENABLED=false. No production setting, UI toggle, dispatch call, timer, startup/reconnect wakeup or connection to the Phase 12 runner exists. The factory is available for subsequent integration but is not invoked automatically. Phase 12 inspection sync remains independent and unchanged.

sw.js is v232 and caches both new modules. index.html loads their dependencies in order. The three legacy tests changed only their cache-version expectations.

## Protocol

Immutable Phase 13B envelope and manifest remain unchanged, including their original prepared-stage counters. Mutable transport fields live separately on the inspection: photo_attempt_count, photo_next_retry_at, photo_sync_status, photo_sync_error and photo_cloud_ack. No new database/store/version or migration. Production persistence uses whole-workspace compare/save/readback before updating the in-memory entry; source bytes and independent envelope are never replaced.

An enabled explicit dispatch requires fresh cached eligibility, durable synced inspection, remote_id=id, account-owned record, bound workspace and approved Inspector/Supervisor with matching team. It rejects Guest originals, held claims, imports/cloud source, local-only, preapproval/submission review and uncertain inspection outcomes. Released claimed account copies use their own UUID and envelope. Supervisor is owner-only.

Each API operation freshly verifies the profile and authenticated user, then validates the complete persisted envelope, manifest, raw source, stamped source and payload hashes. Scope includes user/workspace/team/role/session/scope generations and storage key. Guards run after awaits; stale results do not acknowledge or save into another workspace. Immediately before mutations, the API performs the same fresh authorization and source/payload validation again. No encoder is present in transport.

The dedicated API reads id,user_id,team,created_at,inspected_at,photo_filename,photo_path. Controller checks owner/team/UUID and original creation/inspection timestamps against the durable submission snapshot (or original local mapping for legacy synced entries). It never relaxes Phase 12 snapshot matching or modifies its snapshot/INSERT contracts.

Only null/null or exact intended filename/path is accepted. The only PATCH contains photo_filename and photo_path, filtered by id, user_id, team, photo_filename IS NULL and photo_path IS NULL in one PostgREST request. A zero-row result never authorizes replacement. Reservation responses, including unknown responses, are followed by an authorized reread; exact metadata is required. Conflicts hold review. No clearing/repointing is implemented.

Every attempt/restart downloads the intended object before upload. Only explicit NoSuchKey/ObjectNotFound Storage codes are treated as missing. Generic HTTP 400/404, authentication failure and uncertain reads do not prove absence and never authorize upload. This conservative boundary may require adaptation if the live backend returns only an ambiguous error; do not weaken it without controlled evidence.

On proven absence, row reservation is rechecked and immutable payload is uploaded to inspection-photos at the exact manifest path, contentType=image/jpeg, upsert=false. No UPDATE/DELETE/upsert/public URL method exists. Lost upload responses and collisions download the same path rather than overwriting or creating another variant. Exact path, size and full SHA-256 must match. An explicit missing result after upload is retryable; a different hash holds review. Upload response alone never acknowledges.

Final acknowledgement requires fresh authorization, current source/payload, exact downloaded object proof and a final matching inspection-row read. Source is checked again after the final asynchronous row read. Durable photo_cloud_ack contains version=1, inspection_id, user_id, team, object_path, upload_sha256 and verified_at. Only then are local filename/path and photo_synced saved. Path alone is insufficient. The acknowledgement is local evidence of completed verification, not a guarantee that remote content can never change later.

Normalization conservatively resumes photo_uploading as photo_pending only with a valid manifest; next enabled explicit dispatch reconciles first. Valid durable acknowledgement preserves photo_synced across reload; unproven synced states hold review. Preparation checks no longer reset an acknowledged photo to pending. Existing source-change holds remain authoritative.

## Retry and interruption

One operation per controller plus required global same-origin Web Lock kmtrack-photo-cloud-v1 serialize dispatch across controllers/tabs. No locks means no cloud operation. Phase 13B add-only envelope and original sources are retained on failure. Persistence errors prevent further mutation and return storage-error.

Attempt count is saved before protocol dispatch. Independent next_retry_at uses 30-second exponential base, +/-20% jitter, maximum 30 minutes including jitter and eight attempts. Future explicit dispatch honors backoff; there is no automatic photo scheduler. At exhaustion, permanent/authorization/conflict failures or ambiguous permanent errors hold photo_needs_review. Transient unavailable reads remain retryable but never imply absence. Every retry starts from row/object reconciliation. Photo failure does not affect the inspection runner.

## Verification

- New focused Phase 13C cases: 63 passed, 0 failed. Includes disabled gate, conditional races, identity/owner/team/auth, lost reservation/upload responses, existing/mismatching objects, missing/uncertain reads, restart, sign-out/account switch, raw/stamped/payload divergence including final-read interruption, persisted retry/backoff/exhaustion, quota-style thrown persistence, durable acknowledgement recovery and preparation preservation.
- Pinned supabase-js 2.117.1 SDK exercised with mocked fetch (no network): PATCH serializes both is.null predicates and owner/team filters; upload sends x-upsert:false; private download uses Authorization and exposes NoSuchKey for the synthetic error response. This verifies SDK serialization, not effective live grants or RLS.
- Combined regression: 429 passed, 0 failed, none skipped/cancelled. Command: node --test --test-reporter=tap photo-sync.test.js photo-upload-state.test.js guest-claim.test.js preapproval-review.test.js sync-runner.test.js submission-recovery.test.js entry-model.test.js sync-queue.test.js local-entry-store.test.js auth.test.js inspection-api.test.js inspection-sharing.test.js swipe-actions.test.js
- Syntax: node output/playwright/phase124a-syntax.cjs passed for 24 application JavaScript files and two inline scripts. node --check passed for the new photo-sync test and three modified cache-assertion tests. git diff --check passed.
- No full-suite rerun, browser/device/PWA test or live cloud validation; historical unrelated full-suite debt remains. Mocked locking tests and prior Phase 12 Web Locks evidence do not constitute new live cross-tab photo testing.

No Supabase/backend contact occurred. Read-only external access was GitHub ls-remote and official documentation: https://supabase.com/docs/reference/javascript/is ; https://supabase.com/docs/reference/javascript/storage-from-upload ; https://supabase.com/docs/reference/javascript/storage-from-download . No browser/profile/fixture cleanup or recovery was performed.

## Later requirements and GitHub Desktop

No implementation stop condition found: the pinned SDK expresses conditional reservation, non-overwriting upload and authorized download. Prior Phase 13A policy evidence appears compatible, but effective metadata UPDATE grants, live error codes and RLS/Storage behavior remain unverified. If controlled validation shows these cannot work safely, stop rather than changing backend policies or clearing metadata.

Phase 13D requires separately approved scope; automatic dispatch remains disabled. Phase 13E needs separately approved isolated fixtures and live write scenarios, fresh backend compatibility inspection, effective grants/role/team-denial checks, exact private-download hash proof, response-loss/restart tests and actual cross-tab/device/PWA coverage. Do not reuse or delete preserved Phase 12 fixtures implicitly. No activation or live-validation authorization is implied by this report.

Commit message: Add disabled guarded first-photo cloud protocol

Description: Add owner-scoped conditional photo reservation, immutable Storage upload, exact-byte reconciliation and durable acknowledgement behind a disabled activation gate. Preserve Phase 12 inspection sync and Phase 13B envelopes; add separate bounded photo retries and conservative recovery tests. Bump cached shell to v232 without enabling normal-user photo dispatch.

Select only photo-cloud-api.js, photo-sync.js, photo-sync.test.js, photo-upload-state.js, index.html, sw.js, guest-claim.test.js, preapproval-review.test.js, sync-runner.test.js and this report. Leave AGENTS.md, .codex/ and references/ unselected. Sanitized logs are ignored under output/playwright. Final branch/HEAD unchanged; implementation unstaged with four new files, nothing staged/committed/pushed by the agent.
