# Phase 12.3A automatic inspection runner

The app now connects `sync-runner.js` to `inspectionApi.insertOne/reconcileOne`.
Local capture saves synchronously with confirmed storage readback; a microtask
wakes the runner after Save returns. Only new eligible durable inspections can
submit. Photos remain local and both cloud photo columns remain null.

## Operations and wakeups

One operation runs at a time. Runner and API locks cover manual INSERT and
automatic INSERT/reconciliation together. Busy manual actions start no duplicate
operation. Ordering uses oldest `created_at`, with original array order for ties.
Unrelated safe records continue after an individual permanent review hold.

Wakeups occur after startup/local load, successful Auth/profile verification,
online events, foreground visibility, confirmed local saves, and Retry now.
Online/foreground wakeups verify the account first. `navigator.onLine` is only a
scheduling hint; fresh account/profile and API results determine authorization
and failures. Hidden/offline pages stop scheduling. There is no closed-page or
background execution requirement.

Unknown outcomes and snapshots without durable absence proof reconcile first.
Matching rows are acknowledged without INSERT. Only authorized NO ROW may
release the original unchanged snapshot for a controlled INSERT. A hidden known
UUID conflict, mismatching content/identity, or permanent rejection never permits
automatic overwrite/retry. In-memory `syncing` from an invalidated old session is
also recoverable after the shared API lock is released.

Each request uses the Phase 12.2 mapping/persistence/acknowledgement checks.
Account, team, workspace, session generation, record membership/state/content,
and durability are rechecked before applying results. Auth lifecycle invalidates
session generation immediately when sign-out/account/Guest/binding transitions
begin. Concurrent verification wakeups share one fresh profile check.
Profile/access changes invalidate runner work. Reload invalidates work
instead of starting another drain; interrupted attempts recover on reopen.

## Retry and failure policy

Central constants in `sync-runner.js`: 30-second initial delay, exponential
doubling, +/-20% jitter, 30-minute maximum delay, and eight transient failures
maximum. `sync_attempts` and ISO `sync_next_retry_at` are saved with readback.
Restart honors that timestamp. Success clears both in the same durable
acknowledgement write. Retry now can explicitly bring a scheduled transient retry
forward, retaining its count/snapshot and reconciliation requirement.

Transient network, server, timeout, or rate-limit failures schedule retry.
Uncertain INSERTs retain their snapshot/unknown marker; the next operation is a
read, not another INSERT. Authorization/profile failure pauses the whole runner
until verification or explicit retry. Storage failure pauses without claiming
acknowledgement or allowing unconfirmed retry state. RLS, validation, conflicts,
invalid retry schedules, and exhausted retry budgets receive sticky review holds.
Guest/preapproval review flags, imports/cloud rows, local-only, submitted records,
invalid UUIDs, and existing permanent review holds remain excluded.

Minimal status text distinguishes saved/pending, waiting for connection,
retrying, submitted, and review. Submitted requires every relevant durable local
record to have an acknowledgement. There is no automatic PATCH, photo Storage,
Guest claiming, preapproval review UI, Realtime, or broader sync UI redesign.

## Phase 12.3B required live checks (not performed in 12.3A)

1. Obtain separate live-test authorization and privately sign in to approved
   Inspector/Supervisor accounts. Inventory current inspection schema, identity
   and updated_at triggers, all inspection/profile RLS policies, and live role,
   approval/team/workspace binding. Confirm the Phase 11 mapper is still valid
   and normal writes use only authenticated client credentials.
2. Create specifically approved disposable NEW records through the app. Verify
   automatic INSERT/acknowledgement, stable UUID, original created/inspection
   timestamps, owner/team, exact content, null cloud photo columns, preserved
   local photos, and no cloud-to-local import. Preserve existing records.
3. On desktop and target mobile/PWA devices, test offline capture, reconnect,
   foreground/reopen, storage errors, retry timing across restart, and manual/
   automatic overlap. The PWA must not rely on execution while closed.
4. With approved fault injection, lose the INSERT response/acknowledgement write:
   verify reconciliation reads first, matching rows recover without duplicate
   INSERT, NO ROW permits controlled retry, and inaccessible/transient reads
   never prove absence. Test UUID mismatch/conflict without overwriting any row.
5. Verify sign-out/account/team/workspace changes, pending/revoked approval,
   stale/unavailable verification, Admin/Guest/preapproval exclusions, and late
   results. Run authorized direct RLS-denial checks; UI restrictions alone do
   not establish backend enforcement.

No live backend contact is necessary for the local deterministic suites. No
schema/RLS or storage redesign blocker was found locally. Actual live policy,
mapping and device reliability remain unverified; report a discovered blocker
before changing schema/RLS or expanding scope. No live cleanup is authorized by
this phase.
