# Phase 13F-2 inspection wakeup fallback

October 3, 2026 (Asia/Manila). Completed within the approved notification-only fallback scope. **This is not authenticated closed-page cloud submission.** Production photo transport remains disabled. No queue/session/workspace migration, credential duplication, backend/schema/RLS/Storage change, Realtime or Phase 14.

## 1. Background Sync support result

Isolated Windows Edge 154, localhost secure context: native service worker and one-off Background Sync APIs available. The stable tag is `kmtrack-inspection-wakeup-v1`. Registration is coalesced into a next-task check, checks existing tags, rechecks durable eligibility after the asynchronous tag lookup, and bounds attempts to once per minute per controller even when a tag is immediately consumed. Separate tabs use the same browser registration/tag. Failed/unsupported registration never blocks foreground recovery.

Actual production Save/readback in the live isolated app with the runner deliberately stopped: 100 saved wake requests produced one native registration call. Independent synthetic browser test likewise produced one call for 100 notifications; natural delivery notified its client. Unit tests cover consumed tags, existing tags, exclusions, asynchronous eligibility changes and registration failure.

## 2. Auth/session result

Current pinned SDK persists session at `kmtrack_supabase_session_v1` in localStorage. Workspace binding and inspection array also use localStorage. Native worker inspection confirmed `typeof localStorage === 'undefined'`. Worker cannot prove the authenticated durable workspace after its clients close. No tokens/passwords were copied, no custom auth storage was introduced, and no worker auth/refresh workaround was added.

`inspection-wakeup.js` supplies a credential-free worker notifier. `sw.js` imports only that notifier for sync events. It does not import the SDK, inspection API, queue or photo modules for execution. Its sync handler enumerates controlled same-origin windows at the exact app root/index.html and posts a type-only message. No network/record/credential work is performed by this handler.

## 3. Closed-page result

Controlled DevTools-dispatched browser sync events were used to make delivery reproducible. With the only KMTrack tab closed and an unrelated about:blank tab keeping the browser process available, worker enumeration reported **zero app clients**. The live event made **zero cloud requests**. The saved inspection array was byte-identical when read at the next document start, before auth/startup sync. Synthetic no-client testing independently confirmed unchanged pending storage and zero cloud requests.

Reopening the live KMTrack page automatically submitted the pending fixture through the existing foreground runner: one INSERT HTTP201, exactly one authorized cloud row, matching saved snapshot, local synced state and original UUID as remote_id. No Retry action.

This establishes tab/page closure preservation and next-launch recovery. It does not establish cloud submission while no page is open. Browser minimization, complete browser termination, installed PWA closure and browser-chosen event timing across those states were not tested. Consuming the one-off notification tag does not consume the inspection queue; durable records remain authoritative.

## 4. Fallback result

Launch/auth verification, online, visibility and existing saved/manual/retry wakeups continue using Phase 12's runner. An additional worker notification verifies online before waking it and does nothing for hidden clients. Unsupported Background Sync simply has no registration; the foreground paths remain independent.

Live browser offline-to-online recovery submitted a second ordinary pending test fixture without Retry. The fixture was constructed explicitly as ordinary eligible pending work; the test did not alter production offline/preapproval capture rules. Existing launch/online/visibility/verification regressions pass. Unsupported registration is deterministic-test coverage, not a second native unsupported-browser run.

## 5. Account safety result

The live disposable identity was freshly verified Inspector/ams, UUID `8f590a6a-db13-4c75-8fb8-df9c1786d47c`. User was told to retain its current team; no profile/team/approval mutation occurred. Only new ams fixtures were accessed. Preserved roadway fixtures and legitimate user workspaces were not opened.

Live sign-out invalidated a new pending fixture before submission. A subsequent browser sync notification made zero cloud requests; the account array remained byte-identical. Notification coalescing and scope comparisons reject sign-out/account/team/workspace changes during verification. Existing runner/API revalidate auth/profile/workspace and exact saved content before cloud operations. Unavailable/expired auth cannot be bypassed by this notifier.

Actual different-account login/team switching was not performed live. Deterministic notification and existing Phase 12/13 tests cover those boundaries; these are not claimed as live account-switch evidence.

## 6. Foreground/service-worker coordination result

There is no service-worker submitter, so no page/worker mutation race, worker lease or second submission system was introduced. All actual transport continues through the unchanged runner/API, including serial per-page execution, durable original submission snapshots, uncertain-outcome reconciliation, retry limits and exact UUID/content/owner/team checks. No upsert.

Open-client live notification: two delivered messages, one INSERT HTTP201, one cloud row with matching snapshot. Two actual tabs, repeated worker notification, 100 saved wakes and reload after successful reconnect added no duplicate POST; cloud count remained one for each fixture. This is bounded repeat/two-tab evidence, not an exhaustive adversarial simultaneous multi-process storage race guarantee. The existing inspection API uses per-instance single flight and fresh durability guards; this phase did not add a cross-tab inspection Web Lock or durable lease. Photo/claim locks are separate and unchanged.

## 7. User-facing status result

Pending summary now says **Waiting to sync / Saved on device**; local summary says **Saved on device**. Existing Waiting for connection, Submitted and review status remain. No “Syncing in background” claim appears. Registration alone never changes inspection status or marks it submitted. Existing submitting presentation still follows the verified foreground runner.

**SUPPORTED NOW:** Save is durable locally and KMTrack automatically resumes cloud sync whenever a safe verified app context becomes available.

**NOT YET SUPPORTED:** Guaranteed authenticated cloud submission while KMTrack has no open client/page. True closed-app submission requires a separately approved shared durable storage/auth architecture.

## 8. Preserved fixtures and limitations

Dedicated persistent profile: ignored `output/playwright/phase13f2-profile`. All fixture labels end `- DO NOT DELETE`. No cleanup/reuse is authorized.

| Fixture | UUID | Outcome |
| --- | --- | --- |
| REOPEN | 7d7fcf40-b837-4df0-ac7d-cc40ba81bdc7 | One POST201, one matching cloud row, local synced |
| OPEN NOTIFICATION | a216ec29-f6be-4fed-a9da-5f24beb05190 | One POST201, one matching cloud row, local synced |
| RECONNECT | 8669b362-8a63-4ae6-a533-1e930bdfc86c | One POST201, one matching cloud row, local synced |
| SIGNOUT HELD | 6047fe1f-fc45-4fc2-ae5b-d162eb18ca03 | Local pending preserved, no POST issued |

Total authorized live INSERTs: three, all HTTP201. Photo fields null. Zero inspection PATCH/DELETE, Storage requests or backend settings changes. Signout fixture's cloud absence was not independently queried after signout; absence of POST is the observed evidence. Test-only transport holds and exact-UUID/owner/team guards bounded writes. Fixtures were constructed through the existing entry model and actual Save; physical GPS/camera capture was not exercised.

Both isolated browsers were closed after validation, without clearing their data. The persistent live profile is signed out and retains three synced account fixtures plus the pending signout fixture. Local test server stopped. Do not reopen/reconcile that pending fixture automatically in future work; live guards are ephemeral and must be recreated before separately authorized validation.

Registration is advisory; browser permission/policy/support/lifecycle can prevent delivery. Minimum attempt spacing can skip a notification registration until a later save/verification/launch, with no effect on existing foreground transport. No worker accesses or schedules photo data. Mobile/PWA/published v236, device/network extremes and exhaustive concurrency remain unverified.

## 9. Tests/checks

Final focused 16-file regression: **507 passed, zero failed/skipped/cancelled**. Includes 20 new notifier tests plus the Phase 13F-1 487-test regression. Existing persisted snapshot/reconciliation/retry/account/Guest/preapproval/local_only/review/photo safeguards pass. Worker snapshot submission tests are inapplicable because worker submission is intentionally absent; unchanged foreground tests cover snapshot use and uncertain reconciliation.

Syntax: 27 application JavaScript files and two inline scripts passed; new test syntax passed. Final diff whitespace check passed. Full suite not rerun; historical legacy surface failures remain outside scope. Browser results distinguish synthetic notifier tests, actual app Save/recovery, natural notification and forced browser events. Harness corrections: initial server command unavailable; native DevTools dispatch needed origin; worker-target CDP attach replaced with an off-origin page session. None caused cloud writes or data loss.

Ignored scripts: `output/playwright/phase13f2-{setup,native,live-reopen,live-events}.js`; focused TAP: `phase13f2-regression.tap`. Browser profiles/CLI logs may contain session material: never stage/share them.

## 10. GitHub Desktop handoff

Independently verified main HEAD `a5aa7f2262ebe0e92bf8a4a4f6ee4b7571f9387e`; read-only GitHub ls-remote confirmed the same pushed SHA. Phase 13F-1 accepted by user. Phase 13F-2 changes remain unstaged/uncommitted. Cache bumped to v236 and new notifier asset loaded/cached. No agent staging/commit/push.

Prepared commit title: **Add safe inspection wakeup fallback**

Description: Register coalesced inspection wake notifications where supported, reverify open clients through the existing foreground runner, preserve closed-page pending records and automatic recovery, clarify local status, cache v236 and document isolated live/notification safety validation. Keep worker cloud mutations and production photo transport disabled.

Select only these 11 files:

- inspection-wakeup.js
- inspection-wakeup.test.js
- index.html
- sw.js
- foreground-sync.test.js
- guest-claim.test.js
- photo-pilot.test.js
- photo-sync.test.js
- preapproval-review.test.js
- sync-runner.test.js
- PHASE13F2_INSPECTION_WAKEUP_FALLBACK.md

Leave unrelated AGENTS.md, .codex/ and references/ unselected. Ignore test profiles/logs/scripts. Stop after Phase 13F-2; no true closed-app migration, photo activation or Phase 14.
