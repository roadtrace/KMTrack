# Spot It implementation plan — phases 10–20

**Current status:** Phases 1–9 complete. Phase 10 Supabase Authentication Integration **COMPLETE** in commit `2571c4f2618d6ca5a0430f6930a08b2620eaa51b`. Phase 11 Connect inspections is **NEXT**. The existing inspection/photo sync queue has no transport.

## Working agreement with Codex CLI

1. Read `AGENTS.md`, `PROJECT_CONTEXT.md`, `SUPABASE_ARCHITECTURE.md`, this plan, and relevant source. Existing repo instructions remain authoritative; this handover adds project-specific constraints.
2. Inspect first; present proposed files, behavior, migration/testing risks; **wait for approval before editing**. Work in small reviewable increments. No automatic commit/push.
3. Use current repo and current Supabase schema/policies as truth for implementation; handover is a requirements record, not a guarantee the code already implements it.
4. Report tests run, failures, untested paths, PWA cache changes, and a proposed commit message. Avoid exposing secrets in output.

## Roadmap

- Phases 1–9 — backend foundation and security tests ✓ COMPLETE
- Phase 10 — Supabase authentication ✓ COMPLETE
- Phase 11 — Connect inspections ← NEXT
- Phase 12 — Offline-first sync engine
- Phase 13 — Photo sync/replacement/compression
- Phase 14 — Multi-user sync/Realtime
- Phase 15 — Admin user-management UI
- Phase 16 — Sync UI/UX
- Phase 17 — Conflict/reliability testing
- Phase 18 — Security audit
- Phase 19 — Production cleanup
- Phase 20 — Pilot deployment

## Phase 10 — Supabase authentication ✓ COMPLETE

- Email/password authentication, persistent sessions, and online `public.profiles` verification supply approved role/team state. Public Create account asks only for full name, email, password, and confirmation; email confirmation is required. The inspected `handle_new_user()` trigger copies the name from signup metadata and inserts `role='inspector'`, `approved=false`, `team=null`. Users cannot choose role, team, or approval.
- The seven-day verification window governs cloud/team eligibility. After it expires, the bound account still records inspections/photos locally until successful online verification. Pending users also record locally without cloud/team access.
- One local workspace binds to one account; existing inspections require explicit confirmation before first binding. Sign-out preserves records/photos. Mismatched accounts cannot view, modify, transfer, or rebind that workspace and can sign out to the normal auth screen.
- Guest / Local Mode has isolated records and local GPS/KM, map, capture, photos, and Excel export, without cloud/team access. Guest records are not assigned to the next account that signs in.
- Pending-created inspections retain `preapproval_review_required=true` after approval/re-verification. Guest records retain `guest_claim_required=true`. Neither is eligible for automatic sync; explicit review/claim belongs to Phase 12.
- Inspection and photo sync remain disabled: `SPOTITSync.createQueue({})` has no transport. Supabase JS browser SDK v2.117.1 is pinned locally, service-worker cache is v217, and browser assets contain only the public project URL and publishable key.
- Live-tested: approved Inspector and Supervisor authentication/local capture, persistent session, sign-out preservation, Guest isolation/export, public signup/email confirmation, pending local capture, and pending-to-approved verification. Final focused tests passed 47/47. Full suite: 123 passed / 59 known legacy failures, with no demonstrated Phase 10 regression.

## Phase 11 — Connect inspections ← NEXT

Map local model to actual `inspections` columns; preserve local UUID, original timestamp, owner and verified team. Authorized reads by RLS. No service-role client. Avoid broad rewrites.

## Phase 12 — Offline-first sync engine (major)

Save locally before network; queue/retry on reconnect/open; deduplicate by UUID; no sync for unapproved or unverified accounts. The future transport must check `preapproval_review_required` and require explicit review before pending-created records become eligible. Guest records require explicit review/claim before account sync eligibility; never assign or sync them automatically when someone signs in. Preapproval drafts: pending approval → review required → explicitly confirmed pending sync, or locally retained Not submitted. No guessed team; verified team assigned when eligible. Protect against account switching, duplicate taps, partial failures, and browser shutdown. Define conflict policy before implementing remote updates. The Phase 10 single-account local workspace is a limitation; consider multi-account local workspaces only as a separate later decision.

## Phase 13 — Photo sync/replacement (major)

Use local IndexedDB; optimize unwatermarked photo with configurable quality; dynamic watermark for display/export. Enforce MIME/5 MB. Upload with immutable unique object path and safe retry. The desired replacement order is upload the new optimized file successfully **before** switching the current photo reference. Existing `photo_path`-before-upload Storage policy conflicts with that order; design a secure staging/commit protocol and retest photo RLS and access to replaced/old versions. Do not weaken database or Storage RLS. Decide version retention with free-tier budget; do not silently overwrite originals or promise indefinite history.

## Phase 14 — Multi-user sync

Team-scoped records; authorized Realtime when useful; refresh on reopen; no assumption iOS background sync runs reliably. Avoid leaks across teams and stale accounts.

## Phase 15 — Admin user-management UI

Approve users, assign team/role with server-enforced administrator permissions. Administrator does not automatically edit engineering records.

## Phase 16 — Sync UI/UX

Clear locally saved, pending approval, review required, not submitted, pending sync, syncing, synced, failed/retrying statuses. Keep interface usable during field work.

## Phase 17 — Reliability/conflict tests

Offline/reconnect, iPhone Safari/PWA reopen, upload interruption, duplicate retries, concurrent edits, account switching, approval revocation, GPS loss, photo replacement and storage limits.

## Phase 18 — Final security audit

Live policy inventory and end-to-end role/team/photo tests from actual Spot It, not only a test HTML page. Verify no secrets in deployed assets.

## Phase 19 — Production cleanup

Remove test code/data and stale configs; verify cache/versioning, deployment settings, migrations, and backup/rollback plan. Do not delete real inspection records.

## Phase 20 — Small Roadway pilot

Deploy with approved users; observe actual field reliability, sync, storage usage and defect/photo clarity; iterate based on evidence.

## Next planning gate

Before Phase 11 work, inspect the committed Phase 10 implementation and the live inspection schema/policies, then propose the smallest inspection connection plan for approval. Do not infer active inspection/photo transport from the existing queue or start Phase 12–13 work early.
