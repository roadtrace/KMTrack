# Phase 12.4A — explicit preapproval inspection review

Implemented 2026-10-02. Phase 12.3B accepted by user. Independently read applicable instructions, handoff, planning documents and live-validation report. Read-only GitHub `ls-remote` confirmed pushed main at d9d1906b9859a2d32b75c827ae32b3479a44ee36, containing Phase 12.3B and cache v228. Existing unrelated AGENTS.md change, handoff/skill and reference workbook preserved. No staging, commit or push.

## Behavior

Log cards identify preapproval inspections. An approved, online-verified Inspector/Supervisor in the bound account workspace can open a single-record review containing saved inspection details, current submission team, Submit and Keep local. Existing photo viewing remains available on the Log card. The review does not read, delete or upload photo blobs.

Opening captures the exact record and account/workspace/team/role/session/scope identity. Either decision verifies online again and rechecks identity, durable record and unchanged content. Closing or authorization/scope changes cancel the review. Guest, imported, cloud, already-submitted, reconciliation/snapshot-held and previously local-only records are excluded; other holds cannot be cleared by this workflow.

Submit durably clears only the preapproval hold, sets pending and binds the local owner/team to the currently verified identity/team. Keep local durably clears the hold and sets local_only, retaining the record. Synchronous whole-workspace comparison, storage write and readback occur before publication to the live record. Failed readback restores the original held workspace; persistence failure leaves the live hold unchanged and blocks further storage-dependent review/sync for the session. A changed disk workspace is not overwritten. No await occurs between final scope validation and local commit.

Submit wakes the existing Phase 12.3 runner. The review controller contains no inspection transport; original runner/API authorization, durability, snapshots, reconciliation, retry, locking and acknowledgement remain in place. Approval, restart or wake alone never releases the hold. Cache v229 includes preapproval-review.js.

## Local validation

- `node --test --test-reporter=tap preapproval-review.test.js`: 34 passed, 0 failed.
- `node --test --test-reporter=tap preapproval-review.test.js sync-runner.test.js submission-recovery.test.js entry-model.test.js sync-queue.test.js local-entry-store.test.js auth.test.js inspection-api.test.js inspection-sharing.test.js swipe-actions.test.js`: 273 passed, 0 failed.
- `node --test --test-reporter=tap`: 401 total, 344 passed, 57 failed. Same recorded baseline failure count; failing-name equivalence is not claimed. No unrelated failures fixed.
- `node --check` for all 20 top-level application JavaScript files and both changed/new test files; VM parsing of both nonempty inline scripts; `git diff --check` passed.
- Focused tests cover unresolved approval exclusion, surfacing, both durable decisions, unchanged photo references, current team, runner eligibility, actual runner/API snapshot/acknowledgement with mocked backend, duplicate wake exclusion, failed save/readback/quota, changed disk workspace, account/workspace/team/session/sign-out/verification changes, cancellation, restart and Guest/other hold exclusions.

Logs and syntax helper are ignored under output/playwright/phase124a-*. No browser session opened or modified. No Supabase/backend contact, inspection requests, schema/RLS/profile/Storage operations, Guest claim, Realtime, automatic PATCH or later phase work occurred. GitHub received only the read-only remote commit query.

## Controlled live validation recommended — not performed or authorized here

1. Preserve the prior Phase 12.3B browser/session, fixtures and published 153-record workspace. Use a separate isolated profile/workspace. Arrange a dedicated pending-account fixture and separately authorized approval transition; do not change profiles as part of the current implementation scope.
2. Capture two uniquely labeled pending-account inspections, each with a local photo. Confirm durable review flags and zero inspection INSERTs. After approval and fresh online verification, reopen/reload/reconnect and confirm both remain held and expose Review inspection.
3. Review the first record, inspect details/photo, choose Submit. Confirm exactly one normal runner INSERT/201, original UUID/time/content, verified owner/current team, original snapshot, matching durable synced acknowledgement and null photo columns. Reopen/wake again: no second INSERT; local photo still present, zero Storage requests.
4. Review the second record and choose Keep local. Confirm durable local_only with cleared preapproval flag; reload/reconnect: no INSERT. Verify record/photo remain in Log/Map/export. Preserve both fixtures.
5. With another separately approved disposable held fixture, delay online verification and sign out/cancel before it returns. Confirm dialog closes, held account record remains unchanged and Guest workspace is untouched. Inject only local persistence failure for a review and confirm the hold survives reload with no INSERT. Do not consume or recover the preserved Phase 12.3B fixtures.

Live UI layout, physical mobile/PWA behavior and real pending-to-approved review are not verified by local tests. The prior Phase 12.3B limitations remain. Stop after this increment; live writes/approval setup require separate explicit scope.
