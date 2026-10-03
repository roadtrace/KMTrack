# Phase 13B — immutable local photo preparation

October 3, 2026. Phase 13A accepted; Phase 13B implementation only. No Supabase contact, Storage requests, inspection PATCH, cloud reservation, upload, schema/RLS/policy/function changes, staging, commit or push occurred. Phase 13C is not implemented or authorized by this work.

## Behavior

Inspection state remains independent of `photo_sync_status` and `photo_sync_error`. Photo states are `photo_local`, `photo_pending`, `photo_uploading`, `photo_synced`, `photo_failed`, `photo_needs_review`. Missing legacy state becomes local; unknown state, unproven nonempty cloud path or invalid/conflicting manifest becomes review. Phase 13B cannot establish cloud acknowledgement: supplied synced/uploading photo states conservatively become review. Pending requires a valid manifest. No non-null path proves successful upload.

Eligible account Log cards offer **Prepare photo locally**, or **Check prepared photo locally** for an established intent. Status distinguishes inspection submitted/photo local, inspection submitted/photo pending, and photo needs review; held reasons are available on the status label. No automatic preparation/restart upload, profile verification call, cloud runner wake, photo association write or broader sync UI redesign was added by this action.

Preparation requires a durably saved synced inspection with remote_id equal to its UUID; current owner equal to authenticated user; approved Inspector/Supervisor; matching bound account/profile identity/team; a current online-verified account state with verifiedAt within five minutes. The five-minute local freshness limit is intentionally tighter than the existing offline capture window. The existing Verify online action may refresh verification, but preparation never calls it. Supervisor preparation is owner-only. Guest originals/held claims, imports/cloud-only rows, preapproval/submission review, unknown inspection outcomes, local_only, unsynced/mismatched remote UUID, wrong owner/team/workspace, unresolved photo review and missing photo IDs are excluded. Released explicitly claimed Guest account copies qualify only after durable inspection sync, using their new account UUID. Actual stamped and raw blobs are then required.

## Persistence and manifest

No migration or new database version. Existing `kmtrack_photos_v1`, version 1, `photos` store holds a separate add-only envelope `{manifest, payload}`. Namespace key is `photo-upload-v1:{user_uuid}:{team}:{inspection_uuid}`. IndexedDB `add`, transaction completion and byte/hash readback establish the immutable envelope before guarded local inspection metadata linkage. Web Locks serialize preparation of that intent. Whole-workspace compare/save/readback prevents stale-tab metadata overwrite; session/scope/workspace/durability guards run after asynchronous boundaries.

The inspection stores `photo_upload_manifest`, `photo_sync_status`, `photo_sync_error`. Immutable manifest fields:

- `version` (1), `inspection_id`, `user_id`, `workspace_user_id`, `team`.
- `source_photo_id`, `source_key` (`photoId:raw`), `source_sha256`, `stamped_sha256`.
- `payload_key`, `upload_sha256`, `object_path`, `intent_id` (object path).
- `photo_filename_intent`, `photo_path_intent` (local intent only; does not set inspection photo_path).
- `mime`, `size`, `width`, `height`, `quality`.
- `stage` (`prepared`), `status` (`photo_pending`), `attempt_count` (0), `next_retry_at` (null).
- `created_at`, `updated_at` (ISO local preparation timestamps).

Path is exactly `{verified-team}/{inspection-uuid}/photo-v1-{full-lowercase-sha256-of-upload-bytes}.jpg`. Filename is the final path segment. Team/UUID/hash are validated; no local photoId, email or secret enters the object path. All 64 hash digits are retained.

An interrupted inspection-link save can recover the existing envelope by its stable owner/team/UUID key. Retries/reload/sign-out/sign-in/workspace restoration read and validate those bytes and the same manifest; they never re-encode an established intent. Missing or corrupt persisted payload, contradictory manifest, or a conflicting cloud association is held, not regenerated/repointed. Failed/aborted preparation may retain an unattached envelope; no cleanup implemented.

Source identity includes raw and stamped byte hashes plus original photoId. Both are reread before linkage and on explicit subsequent preparation checks. Replacement/removal flags existing manifests for review during the normal local save; stamp regeneration conservatively flags review. Established envelope bytes and manifest are retained. No reset/replacement intent UI is implemented. Future upload must also perform fresh identity validation immediately before dispatch; current pending status is not authority to upload.

## Compression

Only the unwatermarked `photoId:raw` blob is encoded. Missing raw holds review with an explicit stamped-fallback-disabled reason. The browser decodes display orientation, draws into a fresh canvas at maximum long edge 1600 px with proportional rounded dimensions and no upscaling, and calls toBlob with image/jpeg, quality 0.80. Fresh canvas encoding removes source EXIF. Result must be nonempty JPEG, within the existing 5 MiB ceiling. It is encoded once, atomically persisted, and exact persisted bytes are SHA-256 checked. Existing raw/stamped blobs remain unchanged by preparation.

## Verification

- New focused tests: 42 passed, 0 failed.
- Combined Phase 13B plus existing Phase 12 regression: 366 passed, 0 failed, none skipped/cancelled. Command:

  `node --test --test-reporter=tap photo-upload-state.test.js guest-claim.test.js preapproval-review.test.js sync-runner.test.js submission-recovery.test.js entry-model.test.js sync-queue.test.js local-entry-store.test.js auth.test.js inspection-api.test.js inspection-sharing.test.js swipe-actions.test.js`

- Syntax: 22 application JavaScript files and both inline scripts; all four changed/new test files checked with node --check. `git diff --check` passed.
- Real isolated Edge browser: 14 checks passed. Actual canvas 1600 cap, no upscale, .80 encoder parameter; synthetic JPEG with EXIF orientation 6 retained oriented pixel placement and removed EXIF; actual production IndexedDB helper saved/read back exact bytes/hash; reload restored same manifest/path without encoder invocation; duplicate add rejected without overwrite; same-key raw change held review and retained manifest. Isolated fixture database/localStorage on localhost:8766; no application/Auth SDK initialization, remote requests or real workspace used. CSP connect-src none. Harness under ignored output/playwright/phase13b-browser.js and generated HTML; browser result captured in this report.
- Extracted production preparation handler tested with local storage/adapter doubles; durable linkage, button restoration/render and no verification/runner wake asserted.
- sw.js is v231 and caches photo-upload-state.js. Three existing tests updated solely for their exact cache-version assertion.
- No full-suite rerun: the agreed focused/regression scope passed; historical unrelated full-suite debt remains as recorded in Phase 12. No physical mobile/camera/GPS/installed PWA or deployed v231 runtime check. EXIF browser check covers orientation 6 in a synthetic JPEG, not every orientation/device/format or actual field-image quality.

## Phase 13C prerequisites

Explicit Phase 13C authorization is required. Implement guarded compare-and-set cloud reservation, immutable Storage upload without upsert, unknown-outcome reconciliation/download hash proof, durable cloud acknowledgement and appropriate recovery/availability UI within agreed scope. Do not treat this manifest/status as upload permission. Recheck current verified owner/team/binding/source and existing cloud row, effective metadata PATCH/Storage permissions, and temporary missing-object reservation behavior in separately authorized controlled validation. Backend remains unchanged; no backend compatibility claim was proven by a live write in Phase 13B.

Review recovery/reset and source divergence must preserve retained immutable evidence. Replacement/multiple photos/cloud deletion/Realtime remain deferred. No technical stop condition encountered for this local foundation; physical-browser coverage and later effective cloud permissions remain validation limits.

## Reviewable files and Git

Prepared message: `Add immutable local photo upload preparation and review state`

Implementation: photo-upload-state.js, photo-upload-state.test.js, entry-model.js, index.html, sw.js. Exact-cache assertions: guest-claim.test.js, preapproval-review.test.js, sync-runner.test.js. Report: this file. All unstaged/untracked, with main HEAD b6abbe924a9df809e662c40f4001a86c5f4ec372 unchanged. Pre-existing AGENTS.md, .codex handoff/skill and references workbook preserved; none belongs to this implementation's staging selection.
