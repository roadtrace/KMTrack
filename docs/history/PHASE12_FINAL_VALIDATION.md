# Phase 12 final combined live validation

Validated 2026-10-02 (Asia/Manila) against committed main `7f4b4da17b9bbfac04ad58b727172aae13390141`. Read applicable AGENTS, handoff, architecture/planning documents and the three earlier validation reports. Read-only GitHub `ls-remote` confirmed that exact pushed main. Source and actual browser cache were v230 (`spotit-shell-v230`), with an active localhost service worker. No application source change or cache bump was needed.

The user accepted Phase 12.4B and explicitly authorized this final validation, including the labeled disposable inspection INSERTs and controlled local fault injection. The user created/signed in to the dedicated pending account through normal application UI, then separately approved it and assigned Inspector / `roadway` in the dashboard after the two pending fixtures were ready. The agent made no approval, role, team, schema or RLS changes. Latest user authorization supersedes the old handoff's awaiting-live-approval status.

## 1. Preapproval result — PASS

Both required labeled fixtures were captured through normal camera/save UI while the dedicated account was genuinely pending (`approved=false`, team null). Synthetic desktop video supplied test images; no physical-camera claim is made. Both records were durable with `preapproval_review_required=true`, blank remote IDs, and local stamped/raw IndexedDB blobs. Reload preserved them and made zero inspection requests.

Fresh online verification after the user's approval returned approved Inspector / roadway. Verification and reload alone left both records held; zero inspection requests or automatic releases occurred.

- **PHASE 12 FINAL PREAPPROVAL SUBMIT - DO NOT DELETE**: explicit review -> Submit made fresh profile GET/200 requests and released the durable decision. The existing runner/API created its immutable submission snapshot, sent exactly one POST/201 with the original local UUID, original content/time, current user/team and both photo columns null. Matching acknowledgement was saved durably: synced, remote_id equal to UUID, attempts zero, unknown outcome false. Authorized GET/200 confirmed exactly one row matching the snapshot. Reload did not submit it again. Its stamped/raw photo hashes stayed unchanged.
- **PHASE 12 FINAL PREAPPROVAL KEEP LOCAL - DO NOT DELETE**: explicit review -> Keep local durably cleared the review flag and saved local_only. It survived reload without an INSERT; authorized reads found zero rows for its UUID. It remained in account Log, accessible local map data and normal Excel export. Its stamped/raw blobs remained unchanged. The synthetic fixture image is small (759 bytes each); this establishes persistence, not photographic detail quality.

## 2. Guest claim result — PASS

**PHASE 12 FINAL GUEST CLAIM - DO NOT DELETE** was saved normally in the new isolated Guest workspace before account sign-in. It survived reload with both blocking flags and local photos intact. Account sign-in/approval/reload alone created no copy or claim ledger and made no Guest INSERT. The separate Guest-review panel displayed the source without adding it to normal account Entries/export.

After controlled failure testing, explicit UI Claim recovered the reserved new UUID and used the existing runner/API for exactly one POST/201. The durable account copy preserves original inspection content/time/created_at and records current verified owner/team, dedicated source UUID/full source origin link and complete ledger. The local copy is synced with remote_id equal to its new UUID; authorized GET/200 found one matching snapshot row. Cloud photo_filename and photo_path are null.

The Guest original remains byte-for-byte unchanged, including UUID, photo ID and blocking flags. Its authorized cloud row count is zero. Independent account-copy stamped/raw photo IDs contain matching SHA-256 hashes. Final checks confirmed all source/copy photo bytes unchanged; no Storage request occurred.

## 3. Duplicate / interruption result

- **PASS:** two repeated already-synced claim calls through the guarded production controller seam, followed by another after reload, each returned already-claimed with the same copy UUID and exactly one local copy. Complete origin link survived reload. No additional POST occurred; cloud count remained one.
- **PASS:** controlled copy-persistence failure left only a durable reservation, with no account copy or INSERT. Reload plus explicit UI recovery reused that UUID and completed one copy/one cloud row.
- **PASS, bounded scenario:** delayed an actual profile response during a repeat-claim operation, then used normal Settings Sign out and Continue without signing in. Releasing the response rejected the stale result with the account/workspace-change error. Account storage, Guest storage and ledger remained exactly unchanged, with no new POST. This tests sign-out during verification of an already-claimed source, not first-claim sign-out after held-copy creation.
- **NOT VERIFIED live:** first-claim shutdown after held-copy creation or durable release before UI confirmation, real different-account/team switch, and first-claim sign-out during photo copying. Existing deterministic tests cover these guards, but are not substituted for live evidence.

## 4. Storage / locking result — PASS within tested paths

Actual Edge IndexedDB stored and retrieved stamped/raw blobs across reload. The Guest source and account copy use distinct IDs and matching bytes. Preapproval decision and claim origin ledger survived reload.

Actual same-origin Web Locks serialized two tabs using the production claim lock name: the second acquisition waited while the first was held, then acquired after release. The temporary second test tab was closed after releasing the lock.

Unsupported locking was simulated by temporarily hiding navigator.locks and recreating the production controller. Explicit UI Claim reported safe locking unavailable, created no copy/ledger and made no INSERT. Native locks were restored and the page reloaded.

Controlled failure injections temporarily made production saveReview/saveClaim throw before persistence, without corrupting browser storage. Review failure retained both durable review flags and sent no INSERT. Guest-copy failure left the original untouched, created no account copy and sent no INSERT. The reservation/copy-photo evidence was preserved and reused by recovery. Functions were restored and pages reloaded. Actual quota exhaustion/readback corruption was not injected live; deterministic coverage remains separate.

## 5. Workspace isolation result — PASS for Guest / dedicated account

The isolated persistent Edge profile (`phase12-final`) started with empty account/Guest workspaces. Account sign-in showed zero account records until its two normal pending captures. The Guest original remained separate until explicit creation of a new account copy. Account accessible Entries/export contained exactly the two preapproval UUIDs plus claimed-copy UUID, never the Guest source UUID or cloud-fetched team records. Normal account Excel download succeeded with three local data rows; Keep local remained included.

After sign-out, Guest Log/export/map contained only the original Guest record. Actual Guest map showed `1 visible`; Guest Excel download succeeded with one local data row. Three account records remained durably stored separately. The late verification result could not mutate either workspace.

Account map was opened with local entries enabled and its production local data scope was inspected. Its coincident test points produced a grouped map layer; individual account marker/popup membership was not exhaustively inspected. MapTiler styles returned 403 and the app attempted its raster fallback; no map-style fix was in scope. Account and Guest export scope and Guest visible map count were verified independently of that basemap limitation.

Different-account live coverage is NOT VERIFIED. No existing approved Inspector/Supervisor/Admin account was used or modified. The original phase12-live session and published 153-record workspace were not navigated, rebound or changed. The original session was inspected read-only before creating the new profile.

## 6. Cloud test records

Both submitted rows use dedicated test user `8f590a6a-db13-4c75-8fb8-df9c1786d47c`, role Inspector, team `roadway`. Cloud counts came from complete paginated authorized reads through the existing API; snapshot matches include all mapped content fields under the existing float8 acknowledgement contract.

| Fixture | Local UUID | Cloud UUID / row count | POSTs | HTTP evidence | Final local state / remote_id |
| --- | --- | --- | --- | --- | --- |
| Preapproval Submit | c3b8d6ae-83be-4a1e-b627-6c8021c60a4d | Same UUID / 1 | 1 | POST 201; GET 200, snapshot match | synced / same UUID |
| Preapproval Keep local | a260ec10-e9ca-4160-b3c3-fcc22e2c5fe9 | None / 0 | 0 | Authorized GET 200, absent | local_only / blank |
| Guest claimed account copy | 5386c5ea-9688-4457-ad56-40d2569e944b | Same UUID / 1 | 1 | POST 201; GET 200, snapshot match | synced / same UUID |
| Guest original | bf4573d8-02f9-4884-b8c8-d8f06d5e8a52 | None / 0 | 0 | Authorized GET 200, absent | Guest pending, claim/review held / blank |

Totals: **two POSTs, both 201; zero inspection PATCH, DELETE or Storage requests, including blocked attempts**. No duplicate row or new copy in tested repeat/reload/recovery paths. Both cloud photo columns remain null. All labeled local/cloud fixtures and photos are preserved; no cleanup performed.

## 7. Remaining unverified items

Physical mobile/GPS/camera, installed PWA, fresh published GitHub Pages runtime/cache, first-claim interruption points listed above, different-account/team switching, actual browser quota/readback failures, complete account map marker membership, role matrix and live direct RLS/conflict-denial scenarios remain unverified. Earlier Phase 12.3B limitations are not converted into passes. Synthetic images/emulated GPS and desktop Edge results do not establish physical-device behavior. Real tab lock contention is verified; concurrent claim/cross-tab storage-event recovery is not exhaustively verified.

## 8. Phase 12 overall status — COMPLETE WITH DOCUMENTED LIMITATIONS

The user's completion criteria pass for desktop: real pending-to-approved Submit and Keep local, sign-in-alone Guest exclusion, explicit claim, no duplicate in tested paths, local photos, Guest/account isolation, existing runner reuse and no schema/RLS/Storage change. Device/PWA gaps are documented rather than used as a closure blocker. No implementation blocker or application defect was found requiring a fix. Stop at Phase 12; Phase 13 was not started.

## 9. Tests / checks

- Eleven-file regression: **324 passed, 0 failed**, none skipped/cancelled.
- Full Node suite: **452 total, 395 passed, 57 failed**, none skipped/cancelled. Same recorded baseline failure count; failing-name equivalence is not claimed and unrelated test debt was not fixed.
- Syntax helper: **21 application JavaScript files and 2 inline scripts passed**.
- `git diff --check` passed before report creation; final report check recorded in final response.
- Live harness had two corrected sequencing issues: post-reload auth state is briefly null, requiring optional chaining; Excel selection opens a separate confirmation dialog before download. These were harness issues, not app fixes, and did not recreate fixtures or change records.

Sanitized ignored evidence/scripts, TAP logs and account/Guest exports: `output/playwright/phase12-final-*`. Browser profile/session storage is private and ignored; do not stage/upload it. No credentials, tokens, cookies or auth headers are included in this report. Network evidence uses methods/statuses/UUIDs and public inspection fields.

## 10. GitHub Desktop handoff

**Summary:** documentation-only final Phase 12 live validation report. No application source or tests changed. Existing AGENTS.md, .codex handoff/skill and reference workbook remain untouched. No staging, commit or push.

**Commit message:** `Document final Phase 12 combined live validation`

**Description:** Record controlled real pending-account review and Guest claim validation, two unique runner INSERTs, durable local photos/origin recovery, repeat/reload safety, cross-tab locks, persistence failures and sign-out isolation. Close Phase 12 under the approved desktop completion rule while documenting remaining live/device limitations.

**File checkboxes:**

- [ ] Select only `PHASE12_FINAL_VALIDATION.md` for this report commit.
- [ ] Leave unrelated `AGENTS.md`, `.codex/` and `references/` changes unselected.
- [ ] Do not include ignored browser profiles, evidence logs or test exports.

Final test browser remains open in Guest mode with one Guest original and three preserved account records. POST allowlist is empty; current test guards permit inspection GET only and block Storage. Guards are ephemeral harness state and must not be assumed to survive browser/CLI restart. Original phase12-live session remains preserved. The new profile is persistent; never clear it or delete fixtures without fresh instruction.
