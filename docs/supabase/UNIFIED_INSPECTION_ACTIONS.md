# Unified inspection actions

Own inspections use one detail sheet, whether captured here or opened from My Records on another signed-in device. View: Edit and Delete. Edit: Cancel and Save. Photo actions stay in Photo evidence. Team records remain read only.

## Install before publishing the app

1. Apply `migrations/20261031_unified_inspection_actions.sql` once, after the existing R2 operations migration. Installation creates empty queues and guarded RPCs; it does not edit or delete inspections.
2. Run `migrations/20261031_unified_inspection_actions_verify.sql`. Authenticated callers should have EXECUTE on the two own-record RPCs, not the cleanup RPC. Anonymous EXECUTE and authenticated direct queue-table access should all be false.
3. Deploy the rebuilt production Worker (`output/photo-api/production.mjs`). Keep its current private bucket, secrets, production environment, transport flag and scheduled trigger. Its production-only scheduled cleanup now also erases detached legacy Supabase images through the Storage API. The test Worker never claims these jobs.
4. Publish the application build with cache v275 after the migration and Worker are installed. This task does not automatically commit, push, run live SQL, or deploy.

## Behavior and recovery

- Edits, photo removal and permanent deletion persist stable action UUIDs in the current account workspace before network work begins. Retrying an acknowledged action is idempotent, including after a lost response.
- Edits compare the prior editable fields under the inspection row lock. A conflicting remote edit stops the queue and shows Changes need review. Reload saved inspection explicitly discards the local pending changes after an authorized fresh snapshot succeeds.
- Save also schedules attached photos through the existing immutable R2 upload controller. New single-shot and continuous photo captures do the same after their inspection is acknowledged. Existing untouched device photos are not bulk uploaded.
- Cancel restores the original record and photo reference. Draft photo bytes are not allowed to replace the persisted record before Save.
- Removal checks both the production R2 pointer and legacy association. It detaches both atomically, cancels pre-removal reservations, and queues physical image cleanup. Existing R2 retention/retry rules still apply. Legacy cleanup uses a fixed bucket and validated exact object paths.
- A queued deletion is hidden from normal My Records, maps and inspection counts. Its pending work remains in sync status. After server acknowledgement a small local tombstone prevents a stale downloaded page from resurrecting it. Conflicted pending deletions reappear for review. Inspection insertion is still blocked by the existing server deletion receipt.
- Guest/import/preapproval review gates remain in force. The presentation build still disables remote transports. No service credential enters browser assets.
- A record with an uncertain original insertion must be reconciled before local deletion; removing it locally cannot prove the server has no copy.

Verification uses synthetic local browser state and an isolated PostgreSQL runtime, never real inspection deletions. Live/device confirmation remains a release check after installation.

Storage deletion uses the supported [Supabase Storage API](https://supabase.com/docs/guides/storage/management/delete-objects), rather than removing storage metadata directly.

Prepared commit title: `Unify inspection editing, photo actions and permanent deletion`

Prepared description: `Use one own-inspection sheet across devices, with durable offline actions, conflict-aware updates, consistent photo controls, guarded deletion and private legacy/R2 cleanup. Preserve Team read-only permissions and existing capture/authentication gates; refresh the offline shell to v275.`
