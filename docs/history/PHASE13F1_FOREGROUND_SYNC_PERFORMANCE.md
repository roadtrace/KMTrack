# Phase 13F-1 foreground sync performance

October 3, 2026 (Asia/Manila). Foreground-only performance changes; no Background Sync, Phase 14, Realtime, backend/schema/RLS/Storage change, production photo activation or live cloud write. Production photo transport remains false. Cache v235.

## Baseline and scope

Read parent/repository AGENTS.md, .codex/HANDOFF.md and context/architecture/implementation plan. Handoff phase statements were historical; current user scope supersedes them. Independently verified main a0328b40e511b6ad201c65783dc21ef63439fd64 (authenticated Phase 13E closeout), and read-only GitHub ls-remote returned the exact same pushed SHA. Baseline source cache v234. Preserve pre-existing AGENTS.md, .codex/ and references/ work. No staging/commit/push. No preserved browser profile, local workspace or cloud fixture was reopened.

## 1. Performance root cause

Dominant measured CPU cost: repeated parsing of the entire local workspace for every record durability check. Queue enumeration used contains once per eligible record; each call read/parsed the complete saved array. Status summary and Log action/unsaved checks repeated the same pattern, some multiple times per card. This makes those passes approximately quadratic as the workspace grows.

Runner notifications synchronously rebuilt the Log, filters and Map layers. Launch/process-start/process-finish/run-finish emit notifications, and a full Log render also updates sync status. Internal API/runner saves requested additional saved wakeups. Save's post-persistence Log/Map rebuild was synchronous, and the saved wake used a microtask, allowing sync work before the next input/paint task.

Save did NOT await Supabase INSERT/reconciliation/upload/preparation before this change. The problem was expensive synchronous bookkeeping and rendering surrounding asynchronous transport, not an awaited network promise. Camera Save waits for two local IndexedDB photo transaction completions and confirmed local metadata persistence. Shutter capture/stamping happens before Save; cloud derivative preparation is a separate explicit action.

## 2. Changes made

- local-entry-store.js snapshotContains reads/parses once and indexes exact serialized row versions by UUID for a synchronous enumeration. It fails closed on malformed/unavailable storage and retains duplicate-row equality semantics. Snapshots are freshly constructed per queue/summary/Log pass and never reused across an await or mutation.
- sync-runner.js uses an optional fresh snapshot for candidate enumeration. Per-operation API guards and current/durable checks still read fresh storage. Foreground batches optionally yield between inspections; the next iteration rechecks scope, eligibility and fresh persisted state.
- New foreground-sync.js coalesces local-save wakeups into one next-task wake and sync-driven renders into one 100 ms refresh. Pending work is not awaited by Save. No service worker job, background queue, new cloud operation or scheduler for photo transport.
- index.html separates internal sync persistence from user-save wakeups. Internal API/runner saves use saveEntries(false), preventing recursive saved wake requests. Runner and photo-cloud state changes request coalesced UI refresh; explicit local photo preparation remains unchanged. Camera and non-camera Save defer their full Log/Map refresh until after persistence/UI completion.
- Status summary and Log eligibility/unsaved labels use their own fresh short-lived exact-match snapshots. All action handlers retain independent fresh guards; eventual UI output is unchanged, with a bounded status-refresh delay. Full Log/Map rendering is retained for functional output, not replaced with partial markup.
- Cache v235 loads/caches foreground-sync.js. Updated exact cache expectations and extracted-handler test contexts. Added seven performance/durability/scheduling tests and a runner yield/scope test.

## 3. Before / after measurements

Single-run synthetic measurements on this desktop, not field-device guarantees. Ignored reproducible harness/evidence: output/playwright/phase13f1-benchmark.cjs, phase13f1-browser.js/.txt, phase13f1-regression.tap. Browser: Windows Edge154, new isolated context, synthetic-only page/modules; Supabase requests blocked. No authenticated live request. Initial harness 404 page navigation failed before measurement and was corrected with a local-only fulfilled fixture page.

### Actual Edge queue enumeration and local metadata persistence

Both old contains and new snapshot implementations ran on identical synthetic records in the same browser, using real localStorage and actual queue modules.

| Records | Queue before | Queue after | Full storage reads before/after | Local metadata save/readback |
| --- | --- | --- | --- | --- |
| 153 | 27.6 ms | 0.9 ms | 153 / 1 | 2.3 ms |
| 1,000 | 968 ms | 4.5 ms | 1,000 / 1 | 5.3 ms |

Local metadata persistence implementation is unchanged; these are save/stringify/readback timings, not end-to-end camera Save timings. No invented before/after acceleration claim for IndexedDB or network. The 968 ms synchronous queue pass was directly reduced to 4.5 ms in this sample.

Node synthetic independent run: queue153 records 66.74 -> 4.12 ms; queue1000 records 2397.68 -> 14.33 ms. Node memory-storage metadata persistence before 0.48/2.73 ms, after 0.70/3.05 ms respectively. These noisy single runs are not storage-device benchmarks; the improvement is queue bookkeeping, not changing durability writes.

100 status notifications in one burst previously invoke the synchronous render callback100 times; the browser scheduler harness observed one deferred render and one deferred wake for100 calls. This is notification-coalescing evidence, not a measured full application Map/Log frame rate or a count across a real cloud batch. Actual full-render extraction still verifies functional photo status/local preview output.

### Photo CPU and IndexedDB sample (unchanged implementation)

Synthetic4000x3000 JPEG, raw142451 bytes; production encoder yielded1600x1200 JPEG26447 bytes, quality.80. Encoding110.6 ms wall time; raw+payload SHA-2561.6 ms; real IndexedDB transaction writing raw+payload1.1 ms. PerformanceObserver observed a93 ms long task during the monitored photo interval.18 animation frames occurred over the encoding/hash/IDB interval plus a100 ms observation tail; this is not a responsiveness FPS guarantee. The canvas image is synthetic and does not represent high-detail camera photos. Complete guarded preparation, including repeated source checks and envelope readback, was not timed end-to-end. Cloud submission duration was not measured; tests use unresolved controlled network promises, not live latency.

## 4. Save behavior result

Extracted production saveEntries and saveCapturedPhoto tests establish:

- Local metadata save returns after exact persistence/readback, before a cloud wake task runs.
- First and second local Saves finish while an existing cloud promise and separately started photo-preparation promise remain unresolved. Neither Save starts or awaits preparation.
- Camera Save waits for local stamped/raw photo storage, then metadata durability; it closes capture and re-enables Save without waiting for cloud/preparation or the scheduled full refresh.
- Failed local persistence never schedules cloud work; existing failure/rollback/export behavior remains covered.
- Pending asynchronous work permits navigation tasks. Batches yield between operations and reject stale scope before a subsequent inspection.

This does not mean synchronous image encoding can never delay input; the93 ms sample is a remaining CPU limitation. Native async IndexedDB/network/hash waits do not monopolize the event loop, but localStorage/stringify and canvas work remain synchronous.

## 5. Remaining bottlenecks and worker decision

Large-photo decode/draw/JPEG encoding remains noticeable during explicit preparation. No Web Worker migration was forced here: the current encoder's Image/HTMLCanvas path applies browser EXIF orientation and creates the byte-identifying JPEG. Moving to worker createImageBitmap/OffscreenCanvas requires an alternate encoder plus cross-browser orientation and exact-JPEG/hash/path equivalence validation, worker lifecycle/failure/fallback tests and cached worker assets. An unverified encoder change would jeopardize immutable-byte compatibility. That is a separate scoped design/validation task; existing payloads would still have to be reused without regeneration. Raw/stamped blobs, encoder, compression, hashes, immutable paths, envelope/add-only durability and failure preservation are unchanged in this phase.

Full Log/Map DOM/layer reconstruction is still expensive on very large logs, but is now coalesced during sync. Save's snapshot/stringify/localStorage cost still grows linearly, and camera Save must wait for real local photo persistence. No migration to a new record store, virtualized Log, targeted Map layer architecture or photo worker. High-detail mobile/PWA/device CPU, quota, long offline queues and end-to-end field timings remain unverified. Production photo transport is disabled, so the measured photo bottleneck is explicit preparation, not an automatically activated upload path. No normal navigation awaits photo preparation; a synchronous encoding task can still briefly delay it.

## 6. Tests / checks

Final15-file focused regression:487 tests,487 passed,0 failed/skipped/cancelled. Covers Guest/preapproval/local_only/review holds, source immutability, owner/team/scope guards, reconciliation/retry/locks, single-flight inspection/photo operations and the new foreground scheduling paths. Runner safeguards suite now exercises the snapshot integration; added yield/scope invalidation case. Intermediate failures were extracted-handler test contexts missing the new scheduler dependency/async prefix and stale source-pattern expectations; updated without relaxing behavior safeguards.

Syntax:26 application JS files and2 inline scripts passed; changed/new test files node --check passed. git diff --check passed. No full-suite rerun; historical legacy surface failures remain outside scope. Browser module performance checks passed with backend blocked; no live-cloud/new fixture/device validation claimed.

## 7. GitHub Desktop handoff

Commit title: Improve foreground sync responsiveness

Description: Remove repeated workspace parsing from queue/status/Log enumeration, coalesce foreground wakeups and status renders, yield between inspection operations and defer post-save Log/Map refresh. Preserve fresh cloud mutation guards and local durability, keep production photos disabled, add scheduling regressions and cachev235. Document actual desktop measurements and remaining photo-encoding/field-device limitations.

Select only:

- index.html
- foreground-sync.js
- foreground-sync.test.js
- local-entry-store.js
- local-entry-store.test.js
- sync-runner.js
- sync-runner.test.js
- sw.js
- guest-claim.test.js
- preapproval-review.test.js
- photo-sync.test.js
- photo-pilot.test.js
- PHASE13F1_FOREGROUND_SYNC_PERFORMANCE.md

Leave unrelated AGENTS.md, .codex/ and references/ unselected; exclude ignored browser/profile/log/performance evidence. No staging/commit/push. Stop after Phase13F-1; no Background Sync, Phase14, Realtime, backend or production gate changes.
