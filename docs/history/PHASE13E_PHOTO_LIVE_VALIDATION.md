# Phase 13E controlled live pilot photo validation

October 3, 2026 (Asia/Manila). Core desktop photo protocol passes with the authenticated denial matrix still NOT VERIFIED. Do not interpret this as unrestricted pilot readiness or production activation approval. Phase 13E stops here; Phase 14 was not started.

## Authorization, baseline and environment

The user accepted/committed/pushed Phase 13D and explicitly authorized the Phase 13E scenarios, new labeled fixtures, conditional reservation, immutable upload, private reads and contained fixes. Read parent/repository AGENTS.md, .codex/HANDOFF.md, PROJECT_CONTEXT.md, SUPABASE_ARCHITECTURE.md, IMPLEMENTATION_PLAN.md, Phase 13B/13C/13D reports and PHASE12_FINAL_VALIDATION.md. Independently verified main HEAD 0cbb4e3738af1a72d84b4bf67f53531d28224b10 and read-only GitHub ls-remote returned that exact pushed main. Local HEAD...origin/main was 0/0. Pre-existing AGENTS.md change, .codex files and reference workbook remain preserved. No staging, commit or push.

New persistent isolated Edge profile: ignored output/playwright/phase13e-profile; origin http://127.0.0.1:8785/. Account and Guest workspaces started empty. The user signed in manually as the approved dedicated Disposable Account, user 8f590a6a-db13-4c75-8fb8-df9c1786d47c, Inspector / roadway. Only NEW Phase 13E records used this identity. No preserved Phase 12 fixture was reused/recovered/deleted; no legitimate production session was navigated. Synthetic 640x480 canvas video and synthetic NLEX GPS readings exercised normal capture/save UI; no physical-camera/GPS claim. Initial actual cache was spotit-shell-v233. After the contained fix, actual cache and tested code became v234.

Context-wide request guards allowed labeled new UUID INSERTs only, exact two-field reservation PATCH with UUID/owner/team and BOTH is.null predicates, registered immutable object paths, x-upsert:false and SHA-256 checked multipart IMAGE bytes, and registered private GETs. All UPDATE/DELETE/other paths blocked. Explicit test-only enabled controllers used production modules, adapters, durable compare/save/readback and native locks. Production PHOTO_CLOUD_TRANSPORT_ENABLED stayed false throughout; no deployed gate/toggle/scheduler change.

## Pre-live effective backend verification — PASS

Before writes, current dashboard settings and SELECT-only catalog inventory reconfirmed private inspection-photos, 5 MB, image/jpeg and image/png; authenticated photo_filename/photo_path UPDATE column privileges both true; inspection RLS enabled; owner/current-team Inspector UPDATE and current-team Supervisor UPDATE; protected id/user_id/team/created_at trigger permits photo fields; approval/role/team helpers unchanged. Storage INSERT still requires the matching owned inspection UUID/team/current verified team and row.photo_path equal to object name. SELECT requires matching visible inspection/path. Only INSERT and SELECT Storage object policies were present, with no other objects/buckets policy, UPDATE or DELETE policy. No material difference from Phase 13A; no schema/RLS/Storage/function/settings changes were made. Dashboard Run may retain a query snippet/history; all executed SQL was SELECT-only.

## 1. Primary success result — PASS after contained fix and harness interruptions

Primary fixture label: PHASE 13E PHOTO SUCCESS - DO NOT DELETE. Normal Phase 12 submission made one POST/201 with its permanent UUID and null cloud photo fields. Durable local raw/stamped photos existed. A contained ownership acknowledgement defect blocked preparation before any photo PATCH: normal capture left local user_id/team blank after successful submission. The photo guard correctly returned wrong-owner.

Fix: both successful INSERT acknowledgement and matching SELECT reconciliation persist user_id/team from the already fully validated immutable submission row, together with synced/remote_id. No mapping/snapshot/server write contract, Guest rule or photo guard was relaxed. Tests cover blank-owner capture becoming photo eligible only after durable matching acknowledgement, mismatching acknowledgement leaving ownership blank, failed submission retaining identity, and matching SELECT reconciliation. Existing records are not bulk migrated or automatically recovered. Source/test cache bumped to v234. The same primary UUID was rechecked SELECT-only; no second inspection INSERT occurred.

The only owner reservation PATCH set photo_filename/photo_path with id/owner/team AND both prior fields is.null; HTTP200 and exact reread. The live missing-object response was HTTP400 with body code NoSuchKey and statusCode404. This explicit code, in verified owner/reserved-row context, permitted upload; status alone did not.

Harness-only issues interrupted before Storage creation: require was unavailable in CLI run-code; a subsequent guard incorrectly hashed the whole SDK multipart envelope rather than its image part; a diagnostic upload was blocked. Corrected interceptor parsed the JPEG part and checked its exact persisted SHA-256, size and x-upsert:false before allowing transport. These were harness failures, not backend or photo protocol defects. Four photo attempts persisted on the primary; only ONE owner upload reached live Storage and returned200. The exact same manifest, payload and path survived all attempts. Authorized private download/hash plus final exact row and durable readback established photo_synced. Thus the primary was not an uninterrupted one-attempt demonstration; the claimed-copy fixture later passed a clean first-photo path.

## 2. Reserved-path recovery — PASS

PHASE 13E PHOTO RESERVED RECOVERY - DO NOT DELETE used a new owned synced row and independent manifest. One conditional PATCH200 reserved the path. A test hook aborted the upload BEFORE network transmission. Authorized missing GETs returned NoSuchKey; local state was photo_failed with persisted attempt1/retry time/reservation hint. Log visibly showed Photo retry scheduled and Photo unavailable / reserved but not yet uploaded, with production Retry disabled. Local stamped blob remained readable (36264 bytes); payload hash matched. Reload preserved JSON-identical manifest, payload identity, retry time and attempts. Explicit recovery uploaded the same path/bytes once and reached durable photo_synced. No clearing/repointing, second PATCH or replacement path.

## 3. Lost acknowledgement / reconciliation — PASS

PHASE 13E PHOTO LOST ACK - DO NOT DELETE: conditional PATCH200, missing-object proof, exact immutable upload delivered via controlled route.fetch and returned200. The hook deliberately withheld that response from the SDK and blocked the immediate subsequent proof GET, so the client could not accept success. Local photo_failed/attempt1/retry time persisted with manifest/payload retained. After reload and removing the read hook, explicit retry read the existing exact path FIRST, matched full hash, reread final row and durably acknowledged. No second upload, overwrite or second path occurred. Repeated completed dispatch returned photo_synced without network. Final reload retained acknowledgements for all four fixtures.

## 4. Denial / isolation — PARTIAL, authenticated matrix NOT VERIFIED

A separate unauthenticated publishable-key SDK client with no session made fixture-only requests: conditional primary PATCH200 returned zero rows; upload failed with AccessDenied / RLS (HTTP400, body statusCode403); private download failed HTTP400/NoSuchKey even though the owner had already proven the object exists. No object or metadata changed. This confirms anonymous exclusion but DOES NOT establish a distinct authenticated wrong-team/pending-account matrix. The zero-row PATCH also had null predicates against an already reserved row, so it is not independently a decisive owner-denial proof. No separate denied authenticated account/session was available or created; no policies/profile/account permissions were changed. A denied NoSuchKey must not be interpreted as general absence: production controller still requires fresh verified owner/team/profile and exact visible row; denied viewer never displays it. Mocked wrong-owner/team/role tests remain separate evidence.

Actual isolated Guest/account workspaces and explicit claim are verified below. Broader account/team switching and direct authenticated ownership denials remain NOT VERIFIED. Therefore full workspace/ownership isolation certification and unconditional Phase 13 pilot-ready status are withheld.

## 5. Guest / claim — PASS

Guest source UUID 24efb682-fcf4-4aa7-83b5-9bf1b018db5a, label PHASE 13E PHOTO GUEST CLAIM - DO NOT DELETE, was captured normally in Guest mode with both holds, pending/photo_local and original raw/stamped blobs. Guest recording made no row/reservation/upload. The user signed back in; account count remained3, zero claimed copies, Guest JSON byte-for-byte unchanged, no manifest/upload. Explicit Claim to my workspace created NEW UUID 3ecd7825-ab2c-40ba-950e-b7dd9ca214bc and independent photoId 3ecd7825-ab2c-40ba-950e-b7dd9ca214bc:claim-photo. It completed ordinary Phase12 POST201 and durable inspection sync before explicit local preparation/dispatch. One conditional PATCH200, one Storage POST200, private exact hash proof/final row/readback produced durable photo_synced on attempt1. Guest original JSON and raw/stamped hashes remain exact; copy hashes match originals under separate keys. Only the account copy has cloud metadata/object. Guest cloud row/object counts are0/0.

## 6. Cross-tab / locking — PASS within tested path

Two actual same-origin Edge tabs constructed enabled test controllers for the reserved recovery intent. Holding the production kmtrack-photo-cloud-v1 Web Lock yielded one held lock and TWO pending photo operations with different browser client IDs. Release allowed the first tab to reconcile/upload/acknowledge. The stale second tab returned storage-error at durable workspace comparison and performed no duplicate upload. Reload of that tab showed durable photo_synced. Temporary tab closed, lock released. This proves native serialization and stale-tab protection for this scenario, not exhaustive concurrent mobile/background behavior.

## 7. Photo viewing — PASS with stated scope

Production viewer load preferred the stamped local blob before and after acknowledgement. The actual local photo modal was screenshot-inspected after sync. Initial harness called its index-based UI handler with a UUID and did not open the modal; corrected invocation opened the real stamped preview. For temporary local unavailability, a test-only read adapter returned null without deleting any blob; the production guarded viewer freshly authorized the owner, checked row, privately downloaded exact bytes, matched full hash and checked final row. It returned private-cloud for the primary and all four final verification reads. Unacknowledged lost-ack intent with missing local-preview adapter was refused before success; reserved/missing state displayed unavailable UI and retained local blobs. No public/signed URL or local deletion. A reserved-state local blob was read successfully; a separate screenshot of its modal while pending was not captured.

## 8. Preserved cloud fixtures / objects

| Fixture | Local and cloud UUID | remote_id | Final inspection / photo | Cloud rows / objects |
| --- | --- | --- | --- | --- |
| Primary success | 07034a34-1832-4cc2-8514-c6cce644244b | 07034a34-1832-4cc2-8514-c6cce644244b | synced / photo_synced | 1 / 1 |
| Reserved recovery | 201b2a4d-2d72-488c-8982-5bee2d12034c | 201b2a4d-2d72-488c-8982-5bee2d12034c | synced / photo_synced | 1 / 1 |
| Lost acknowledgement | 8a75a385-d5d2-4cad-bffc-d414a832bf3b | 8a75a385-d5d2-4cad-bffc-d414a832bf3b | synced / photo_synced | 1 / 1 |
| Claimed account copy | 3ecd7825-ab2c-40ba-950e-b7dd9ca214bc | 3ecd7825-ab2c-40ba-950e-b7dd9ca214bc | synced / photo_synced | 1 / 1 |
| Guest original | 24efb682-fcf4-4aa7-83b5-9bf1b018db5a (local only) | blank | pending / photo_local, holds retained | 0 / 0 |

Dashboard SELECT-only final counts independently found exactly one object under EACH account inspection UUID, not only one matching filename, and zero Guest objects. All five labeled local fixtures and four cloud rows/objects are preserved. No cleanup/deletion authorized or performed.

### Primary success

- Inspection/cloud UUID: 07034a34-1832-4cc2-8514-c6cce644244b; remote_id: 07034a34-1832-4cc2-8514-c6cce644244b.
- Object path: `roadway/07034a34-1832-4cc2-8514-c6cce644244b/photo-v1-3e790b2e91e748590afc18c1c1b730bcd0b17f7ff6b27b8fca11d3eb36fd3415.jpg`.
- Cloud photo_filename: `photo-v1-3e790b2e91e748590afc18c1c1b730bcd0b17f7ff6b27b8fca11d3eb36fd3415.jpg`; cloud photo_path exactly equals the path above.
- Persisted upload SHA-256 and independently downloaded SHA-256: `3e790b2e91e748590afc18c1c1b730bcd0b17f7ff6b27b8fca11d3eb36fd3415` (equal).
- Durable inspection/photo state: synced / photo_synced; attempt count 4.
- One matching cloud row; one object under this inspection UUID (separate dashboard SELECT-only count). Original raw/stamped hashes still match manifest.

### Reserved recovery

- Inspection/cloud UUID: 201b2a4d-2d72-488c-8982-5bee2d12034c; remote_id: 201b2a4d-2d72-488c-8982-5bee2d12034c.
- Object path: `roadway/201b2a4d-2d72-488c-8982-5bee2d12034c/photo-v1-0427b1478455812ce1d414be46f98ec53ba303ef095e4d56f58d830f1dab398f.jpg`.
- Cloud photo_filename: `photo-v1-0427b1478455812ce1d414be46f98ec53ba303ef095e4d56f58d830f1dab398f.jpg`; cloud photo_path exactly equals the path above.
- Persisted upload SHA-256 and independently downloaded SHA-256: `0427b1478455812ce1d414be46f98ec53ba303ef095e4d56f58d830f1dab398f` (equal).
- Durable inspection/photo state: synced / photo_synced; attempt count 2.
- One matching cloud row; one object under this inspection UUID (separate dashboard SELECT-only count). Original raw/stamped hashes still match manifest.

### Lost acknowledgement

- Inspection/cloud UUID: 8a75a385-d5d2-4cad-bffc-d414a832bf3b; remote_id: 8a75a385-d5d2-4cad-bffc-d414a832bf3b.
- Object path: `roadway/8a75a385-d5d2-4cad-bffc-d414a832bf3b/photo-v1-0427b1478455812ce1d414be46f98ec53ba303ef095e4d56f58d830f1dab398f.jpg`.
- Cloud photo_filename: `photo-v1-0427b1478455812ce1d414be46f98ec53ba303ef095e4d56f58d830f1dab398f.jpg`; cloud photo_path exactly equals the path above.
- Persisted upload SHA-256 and independently downloaded SHA-256: `0427b1478455812ce1d414be46f98ec53ba303ef095e4d56f58d830f1dab398f` (equal).
- Durable inspection/photo state: synced / photo_synced; attempt count 2.
- One matching cloud row; one object under this inspection UUID (separate dashboard SELECT-only count). Original raw/stamped hashes still match manifest.

### Claimed account copy

- Inspection/cloud UUID: 3ecd7825-ab2c-40ba-950e-b7dd9ca214bc; remote_id: 3ecd7825-ab2c-40ba-950e-b7dd9ca214bc.
- Object path: `roadway/3ecd7825-ab2c-40ba-950e-b7dd9ca214bc/photo-v1-0427b1478455812ce1d414be46f98ec53ba303ef095e4d56f58d830f1dab398f.jpg`.
- Cloud photo_filename: `photo-v1-0427b1478455812ce1d414be46f98ec53ba303ef095e4d56f58d830f1dab398f.jpg`; cloud photo_path exactly equals the path above.
- Persisted upload SHA-256 and independently downloaded SHA-256: `0427b1478455812ce1d414be46f98ec53ba303ef095e4d56f58d830f1dab398f` (equal).
- Durable inspection/photo state: synced / photo_synced; attempt count 1.
- One matching cloud row; one object under this inspection UUID (separate dashboard SELECT-only count). Original raw/stamped hashes still match manifest.


## 9. Network evidence

Counts below are LIVE requests observed through the guarded harness, including final verification reads. Aborted client-side hooks are recorded separately and are not successful live writes. Every owner reservation PATCH carried only the two photo fields with exact UUID/owner/team and both is.null filters. Every live owner upload used the exact saved JPEG part with x-upsert:false. Lost-ack POST200 was observed by route.fetch rather than page response listener.

| Fixture | Owner PATCH | Additional denied PATCH | Live Storage POST | Live private GET statuses | Final rows / objects |
| --- | --- | --- | --- | --- | --- |
| Primary | 1 × 200 | 1 × 200, zero rows (anonymous) | 1 × 200 owner + 1 × 400 AccessDenied anonymous | 3 × 200; 6 × 400 explicit missing; 1 × 400 denied/masked | 1 / 1 |
| Reserved recovery | 1 × 200 | 0 | 1 × 200 owner | 2 × 200; 3 × 400 explicit missing | 1 / 1 |
| Lost acknowledgement | 1 × 200 | 0 | 1 × 200 owner (hook captured) | 2 × 200; 1 × 400 explicit missing | 1 / 1 |
| Claimed copy | 1 × 200 | 0 | 1 × 200 owner | 2 × 200; 1 × 400 explicit missing | 1 / 1 |
| Guest original | 0 | 0 | 0 | 0 | 0 / 0 |

Totals: four inspection INSERT201; four successful owner reservation PATCH200 plus one anonymous zero-row PATCH200; four successful immutable Storage creations plus one denied anonymous POST400; 21 live Storage GET responses (9 success200, 11 explicit missing400 in owner context, 1 denied/masked400). ZERO Storage PUT/PATCH/UPDATE and ZERO DELETE. Primary had three harness-stopped upload attempts before its successful owner creation; reserved fixture had one deliberately aborted pre-upload request; lost-ack had one proof GET aborted after creation. These client interruptions have no live write status and are not counted as extra objects. Account copy's new normal inspection sync succeeded while original photo transport remained independently failed/retryable in the preceding scenarios. No Phase12 INSERT used non-null cloud photo fields.

## 10. Remaining unverified items

Distinct authenticated wrong-team/pending/other-owner denial matrix; physical mobile/camera/GPS; installed PWA and published v234 deployment; actual device/network outages (hooks simulate interruption); exhaustive cross-tab/tab-background behavior; real quota/readback failure; live source divergence and eight failed attempts/permanent holds (focused mocks cover those paths; excessive live failed writes were not performed); fresh Map/export/offline full flows in this phase; complete fixture-cloud content equality beyond protocol identity/timestamps. No full-suite rerun: known legacy surface failures remain documented in13D. Anonymous denial, mocked guards and dashboard policy definitions are not substituted for authenticated live denial evidence.

Intended-path absence was verified by the first authorized live NoSuchKey read after reservation. A separate pre-dispatch/pre-reservation Storage catalog count was not taken; unreserved-path private reads would not independently establish absence under the current policy.

## 11. Phase 13 overall status

Core desktop first-photo protocol, conditional reservation, immutable-byte upload/private hash proof, reserved-path restart, lost-ack/existing-object reconciliation, actual locking, local preservation and Guest/claimed-copy paths PASS. Phase13E validation completed with documented limitations. Full pilot-ready signoff is NOT declared because distinct authenticated ownership/team isolation is still unverified. Production activation remains false, no automatic/manual ordinary-user transport enabled; no Phase14, replacement, deletion or backend changes. Any additional validation/activation requires new explicit scope after this stop.

## 12. Test / check results

- Pre-live combined regression:477 pass/0fail.
- Final14-file combined regression:479 pass/0fail, none skipped/cancelled. Two added focused ownership tests; existing insert/reconcile assertions extended. Command: node --test --test-reporter=tap photo-pilot.test.js photo-sync.test.js photo-upload-state.test.js guest-claim.test.js preapproval-review.test.js sync-runner.test.js submission-recovery.test.js entry-model.test.js sync-queue.test.js local-entry-store.test.js auth.test.js inspection-api.test.js inspection-sharing.test.js swipe-actions.test.js
- Syntax helper:25 application JS and2 inline scripts pass. Updated test files individually checked with node --check. git diff --check passes. One intermediate regression failed only because photo-pilot cache assertion still expectedv233; corrected tov234 and final479 pass.
- Screenshots inspected: reserved/retry Log and actual stamped local preview. Actual cache v234 after reload; production controller enabled=false. Published/device runtime not claimed.

Ignored sanitized evidence/scripts: output/playwright/phase13e-*. Persistent profile is private/ignored and must never be staged/shared. CLI and browser snapshot/log files may contain private app/auth state; do not upload them or include them in commits. No secrets/tokens/headers/passwords are included in this report. Request counts/UUIDs/hashes and safe field values only.

## 13. GitHub Desktop handoff

SUMMARY: Fix acknowledged local inspection ownership and document controlled live photo validation.

COMMIT MESSAGE: Fix synced inspection ownership and validate pilot photo protocol

DESCRIPTION: Persist verified owner/team with matching inspection acknowledgements so normal captures can prepare photos without relaxing guards. Add ownership regression coverage and cachev234; document conditional reservation, immutable private upload/hash proof, restart/lost-ack recovery, native tab locking, Guest claim, preserved fixtures and remaining authenticated-isolation/device limits. Production photo dispatch stays disabled.

FILE CHECKBOXES (select only these10 Phase13E files):

- [ ] inspection-api.js
- [ ] inspection-api.test.js
- [ ] submission-recovery.test.js
- [ ] sw.js
- [ ] guest-claim.test.js
- [ ] preapproval-review.test.js
- [ ] sync-runner.test.js
- [ ] photo-sync.test.js
- [ ] photo-pilot.test.js
- [ ] PHASE13E_PHOTO_LIVE_VALIDATION.md

The five pilot/Phase12 test changes outside ownership coverage update only exact cache-version assertions. Leave unrelated AGENTS.md, .codex/ and references/ unselected. Do not include ignored profiles, CLI logs, screenshots or scripts. Main HEAD remains0cbb4e3; all Phase13E files unstaged/untracked. Nothing staged/committed/pushed. .codex/HANDOFF.md retains historical13D-only scope and was deliberately preserved; this report and the latest explicit user request supersede its phase status.

Final environment: request allowlists cleared, database writes and all Storage requests blocked; production and temporary controller check returned false/absent. Only the phase13e browser was closed, retaining its persistent profile with four account records and one Guest original. No localhost8785 listener remained at final check. Existing user browser/backend sessions remain open. Harness guards are ephemeral and must be re-established before any future pilot restart; do not reuse old fixtures or clear the profile without explicit scope.
