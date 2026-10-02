# Phase 12.4B — explicit Guest inspection claim

Implemented 2026-10-02 within the user's approved final Phase 12 implementation increment. Applicable AGENTS instructions, handoff, Phase 12.4A report and architecture/planning documents read first. Git/source verification found main at c33b08d0172aae1e8b4fc7b5c40419a9505f1e98, containing accepted Phase 12.4A and cache v229. A read-only GitHub `ls-remote` confirmed that exact pushed main. No staging, commit or push. Existing unrelated AGENTS.md, handoff, handoff skill and reference workbook preserved.

## Local copy and durable recovery

The Log has a separate Guest-review panel for a freshly verified, bound approved Inspector/Supervisor. It reads durable Guest records for explicit review without adding them to account Entries, Map, record counts or exports. Review shows saved details, local photo and destination team, with Claim to my workspace and Keep as Guest / Cancel. Cancel leaves the source untouched. Authorization/scope changes, offline events and relevant cross-tab storage events close the dialog. Sign-in, render, restart and runner wake do not claim anything.

Guest originals retain their UUID, content, photo ID and blocking flags byte-for-byte. Claim creates an account-workspace record with a new UUID, original inspection content/time/creation time, current verified owner/team and separate local photo IDs. No original move, deletion or flag clearing occurs. Claimed copies use dedicated guest_claim_source_id/guest_claim_source_record fields rather than overloading export/import originId.

The single new localStorage key kmtrack_guest_claims_v1 stores a versioned ledger associating source UUID/full saved source with owner, team, reserved copy UUID/photo ID and reserved/complete status. Account and Guest record arrays keep their existing format. Existing normalization preserves the copy's additional origin fields. No Supabase schema change.

Explicit claim takes an origin-wide Web Lock, reverifies online, and checks scope/session/user/team/binding, source identity/content and the complete saved destination before each metadata mutation. It then:

1. Durably reserves a new UUID and origin intent in the ledger.
2. Copies local photo evidence, if present, to independent IDs and confirms source/copy bytes.
3. Durably appends the account copy with guest_claim_required=true and guest_claim_pending=true, keeping it excluded from sync.
4. Durably marks the ledger complete before releasing either blocking flag.
5. Durably releases the copy and wakes the existing runner.

There is no await between destination creation, completion marking and release; each mutation still rechecks scope/source/workspace. Completion precedes eligibility, so interruption cannot submit an unregistered copy. Failed destination write/readback rolls back the destination and disables further storage-dependent claim/sync in that session; Guest source is never written. Failed ledger completion or release leaves the account copy held. Explicit recovery finds the same reserved UUID/existing copy. A complete ledger entry survives local copy deletion and refuses a second claim. Already-released/synced/local_only copies are returned as already claimed without overwriting, clearing holds, new UUIDs or another wake.

Changed Guest source content, different prior owner/team, missing previously completed copy, conflicting/corrupt history or unsaved/externally changed destination are held/reported. No automatic overwrite, re-claim or implicit migration. If Web Locks is unavailable, explicit claim fails closed before local writes. This browser dependency requires confirmation in live/mobile testing.

Recovery also checks the incomplete account copy against the reviewed source content and verifies its independent photo bytes without rewriting them. Edited incomplete copies or missing evidence remain held; this prevents releasing content that was never shown in the Guest review.

## Local photos

Separate stamped and optional raw blobs are saved through existing IndexedDB functions under reserved-copy photo IDs. Current remove/replace/stamp actions operate by photo ID and can delete or overwrite blobs, so sharing the source ID would be unsafe. Independent IDs preserve the other record's photo when either record is later edited or removed. Photo copy verifies bytes and fails closed on missing evidence, changed source or corrupt readback. It never deletes either source blob. Aborted attempts can leave unattached copied blobs/reservations; these are excluded from sync and explicit recovery reuses the same IDs. No cleanup implemented or authorized.

The runner/API remain the only inspection transport. Local-first eligibility, fresh authorization, snapshots, locks, reconciliation, retry and exact acknowledgement are reused unchanged. Origin/ledger metadata and photos are not mapped to cloud rows; both cloud photo fields remain null.

## Checks

- `node --test --test-reporter=tap guest-claim.test.js`: 51 passed, 0 failed.
- `node --test --test-reporter=tap preapproval-review.test.js`: 34 passed, 0 failed.
- `node --test --test-reporter=tap guest-claim.test.js preapproval-review.test.js sync-runner.test.js submission-recovery.test.js entry-model.test.js sync-queue.test.js local-entry-store.test.js auth.test.js inspection-api.test.js inspection-sharing.test.js swipe-actions.test.js`: 324 passed, 0 failed.
- `node --test --test-reporter=tap`: 452 total, 395 passed, 57 failed. Same recorded baseline failure count; failing-name equivalence not claimed. Unrelated baseline failures left unchanged.
- `node --check` on all 21 top-level application JavaScript files and guest-claim.test.js, preapproval-review.test.js, sync-runner.test.js passed. VM syntax parsing of both nonempty inline scripts passed. `git diff --check` passed.
- Tests exercise sign-in/wake exclusion; explicit durable new UUID/current owner/team; Guest preservation; independent stamped/raw photos; single-copy repeat/reload/restart/synced recovery; interruption at held creation and released UI confirmation; ledger/copy/release/readback failures; account/sign-out/team/workspace/session/verification/cancel/source changes; source edits/deletion; destination edits; missing/deleted copies; local_only/import/reconciliation exclusions; malformed history; photo corruption/missing evidence; UUID collision; first empty account workspace; real runner/API snapshots/acknowledgement with a mocked backend; actual extracted UI handlers with a local DOM double for surfacing, review/claim and late cancellation.

Cache v230 caches guest-claim.js. Ignored logs/syntax helper are under output/playwright/phase124*. No live browser session opened or modified. No Supabase/backend contact or live inspection/auth/profile/Storage requests. Only read-only GitHub commit verification contacted a remote service. No schema/RLS/profile/Storage/Realtime changes, photo upload, automatic PATCH or Phase 13 work.

## Exact combined live validation recommended — not performed here

Use a new isolated browser profile/workspace, preserving all prior Phase 12.3B fixtures/session and the published 153-record workspace. First confirm active cache v230 and Web Locks availability. Arrange a dedicated pending-account fixture plus separately authorized approval transition; profile changes are outside this implementation's scope. Authorize only the labeled disposable inserts below before removing any write guards.

1. Create two labeled pending-account records with local photos. Approve via the separately arranged transition and verify online. Approval/reload/reconnect must leave both preapproval flags intact and send zero INSERTs. Review record A -> Submit: exactly one normal runner POST/201, matching original UUID/time/content and verified owner/current team, durable snapshot and synced acknowledgement, null cloud photo columns. Review record B -> Keep local: durable local_only; reload/reconnect gives zero INSERTs. Both local photos and Log/Map/export records remain.
2. Create two labeled Guest records with photos before sign-in. Save original UUIDs, source record bytes and stamped/raw blob sizes/hashes. Sign in to the bound approved test account and verify: originals stay Guest, account has no copies, zero Guest INSERTs. Review Guest C -> Cancel: no ledger/copy change. Review Guest D -> Claim: exactly one new account UUID, matching inspection content and current owner/team, complete durable origin link, independent matching photo blobs. The existing runner sends one POST/201 for the new UUID, durably acknowledges it and sends null cloud photo fields. Original Guest UUID/content/photos/flags remain unchanged; zero Storage requests.
3. Reload/reopen/repeat the Guest D claim through the workflow or guarded recovery seam: one local account copy and one cloud row, no additional INSERT. Delay cloud dispatch while a separately labeled Guest E is claimed, then reload after durable claim/release before UI confirmation; recover the existing copy, allow normal submission and confirm one local/cloud copy. Preserve all fixtures.
4. Use separately labeled held fixtures to delay online verification/photo copying and sign out/cancel/switch scope before destination creation: no account copy or submission, no Guest mutation, late results ignored. Inject local destination persistence failure: source intact, no eligible copy/POST; explicit recovery reuses reserved UUID. Inject interruption after held-copy creation: zero submission until explicit same-account recovery completes the origin link and releases that same copy. Inject release failure: copy remains held and recovers without duplicate.
5. Edit a previously claimed Guest original through normal Guest editing: returning to the account reports changed-source hold, preserving prior copy and cloud row without another claim/PATCH. Verify removing/replacing a photo on a disposable claimed copy leaves its Guest photo intact and vice versa. Confirm unresolved Guest sources, reviewed local_only records and preapproval-held records remain excluded; account versus Guest Log/Map/export separation remains intact.

Inspect requests using sanitized method/status/UUID evidence only. Confirm correct current owner/team, one backend row per submitted new UUID, zero inspection PATCH/DELETE and zero Storage requests. No schema/RLS/profile/Realtime operations as part of validation. Preserve all labeled records/photos; no cleanup or old TEST 7 recovery is implicit.

## Phase 12 closure

No implementation blocker found within the approved copy model. Combined real preapproval/Guest live validation is still required before declaring Phase 12 complete. Real browser layout/IndexedDB/Web Locks/mobile/PWA behavior is not established by Node/DOM-double tests. All previously documented Phase 12.3B role, device and live backend-denial limitations remain; this increment does not convert them to passes. Stop after Phase 12.4B.
