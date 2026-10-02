# Phase 12.2 submission recovery contract

Automatic queue transport remains disconnected. This increment does not call
reconciliation from app events, add a retry runner, or change schema/RLS. The
existing explicit single-inspection submission now uses the recovery foundation.

## Persisted intent and lifecycle

`submission_snapshot` is `{version: 1, row: ...}` on the permanent local UUID.
Its row uses the shared Phase 11 mapping, with a deterministic field order:
identity (including `created_at`), inspection time/content, location/DMM, road,
direction, lane, integer-metre KM, interchange fields, and null cloud photo
columns. No `updated_at`, local photo/blob, password or session token is included.
UUID case and timestamp offset representations are canonicalized. Numbers and
text are compared exactly; missing fields differ from explicit null. Meaningful
sub-millisecond timestamp differences are rejected rather than rounded away.

Before INSERT, `insertOne` saves the snapshot together with `syncing`,
`sync_outcome_unknown=true`, and `submission_retry_allowed=false`. The existing
local store must confirm exact readback before any INSERT starts. No snapshot is
silently regenerated on retry. Normalization preserves the snapshot and its
metadata through the entry model's existing unknown-field preservation. Restart
converts interrupted `syncing` to blocked `needs_review`, retaining intent.

Snapshots are retained after acknowledgement. A successful server response must
match every snapshot field before `remote_id`/`synced` are saved and confirmed.
Failed acknowledgement persistence rolls back the success fields, leaving the
pre-request uncertainty durable. A lost/error response remains blocked until
reconciliation. No later local edit changes the original snapshot.

## Explicit one-record reconciliation

`inspectionApi.reconcileOne(entry)` is an integration seam for a later approved
runner. It performs fresh profile/account verification and one authorized UUID
SELECT, then persists the local classification. It never inserts, patches,
uploads a photo, or copies cloud rows into Entries. There is no app/event/UI
invocation of this method in Phase 12.2.

| Status | Durable local result | Later INSERT |
| --- | --- | --- |
| `no-row` | `failed`, uncertainty cleared, retry permission recorded | May be considered under fresh authorization |
| `matching` | `synced`, original UUID restored as `remote_id` | Blocked |
| `mismatch` / `local-changed` | Sticky `submission_review_required`, `needs_review`, uncertainty retained | Blocked pending explicit review |
| `inaccessible` | Uncertainty retained; no absence permission | Blocked |
| `transient-failure` | Uncertainty retained; no absence permission | Blocked; retry reconciliation only |
| `not-durable` | No acknowledgement or permission granted | Blocked |

Local persistence errors reject the operation; they are never absence/success.
A fresh reconciliation revokes old absence permission before verification/read.
Only an explicit successful `data: null` response can count as no authorized row.
A SELECT under RLS proves absence only within authorized visibility. A known
UUID uniqueness conflict or previous acknowledgement proves a row existed: an
empty SELECT in that case is classified inaccessible, not retryable. No conflict
is overwritten, and a UUID alone never proves success.

Server-content edits before/during reconciliation, or during INSERT, hold the
record for review. Retry also compares current mapped content with the original
snapshot before sending. Sticky review is not released by another empty read or
requeue. Post-submission automatic editing and review-resolution UI are outside
this increment. Guest/preapproval flags are never cleared by recovery.

## Caller requirements and Phase 12.3 prerequisites

`createApi` now requires synchronous `persist(entry)` returning true only after
confirmed storage, `durable(entry)`, and `isCurrent(entry)` checking membership in
the active workspace. App persistence uses `saveEntries`/readback. The caller's
context supplies `scopeGeneration`, which changes across account/access/workspace
transitions (including leaving and returning to the same account). Profile/team,
owner, workspace binding, record membership, snapshot, and local record are
checked before applying results. Late results from another scope are discarded.

A future runner must consume these guarded methods, reconcile uncertain attempts
first, and send only new eligible records using the retained snapshot. It must
serialize per-record operations, recheck scope at each request, and keep storage
failures/mismatches held. Scheduling/backoff is not implemented. Fresh live schema,
RLS/account verification and device/PWA recovery tests need separate authorization
before integration or live tests. No storage redesign or schema/RLS blocker was
found in this local increment.
