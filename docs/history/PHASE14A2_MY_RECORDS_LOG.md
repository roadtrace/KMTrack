# Phase 14A.2 — cross-device My records Log and read-only submitted detail

October 5, 2026 (Asia/Manila). Implemented only the explicitly approved Phase 14A.2 scope. Phase 14A.1 was accepted by the user; GitHub connector independently confirmed remote main at `7784786717d0e389e34ba4a0df26b87f82d8c2ca`, matching local HEAD. Git CLI remote lookup failed with connectivity/TLS errors; connector verification succeeded. Applicable AGENTS, HANDOFF, context/architecture/implementation plan and relevant Phase 12/13/14A.1 reports were read. The user confirmed HANDOFF is the authoritative in-repository accepted Phase 14A architecture reference; no separate architecture-review file exists.

## 1. Summary

Normal account Log now presents My records using the existing Phase 14A.1 projection and memory-only read store. Added automatic first-page loading, Refresh/Load more, local/cloud UUID deduplication, operational status, submitted detail and a separate private-photo viewer. Retired the Phase 11 technical cloud panel and its cloud-edit UI; reusable inspection API functions remain. Cache v238 includes both new application modules. Production photo transport remains disabled.

No Team UI/tab, Tools migration, Map scope, clustering, Realtime, cloud export, persistent cloud-page cache, schema/RLS/index change or live write fixture. No staging, commit or push.

## 2. Cross-device My records result

An approved Inspector signed in through normal application UI in a newly isolated Edge workspace. Before sign-in, local memory and device entries storage were empty. Successful verification automatically loaded 50 owned/current-team cloud inspections. Log displayed 50 cards and a 50-record chip; local entries and device storage remained empty. Further authorized pages reached all 219 records available to that account/current team in this bounded run. These counts are loaded history, not global totals.

Cloud rows remain exclusively in the read store/presentation. They are never appended to entries, normalized as local sync candidates, assigned photo manifests or stored in IndexedDB/localStorage.

## 3. Log integration

My records is the normal unlocked signed-in account Log. Capture retains its local recent-record behavior. Guest retains its local Log/Map/export behavior and cannot include account cloud history. The Imported source and individual imported batches remain separate device-local archive views. No imported record appears as submitted My history.

Date/type filters apply to loaded cloud rows and current device records. Cloud inspection dates are presented/filtered in Asia/Manila; nullable times display as unavailable and cannot satisfy a date range. Cloud-only metadata uses server fields and KM metres-to-kilometres conversion. Combined records show/filter their device representation, with submitted data separately available. Inspector-name filtering is disabled in My records because cloud rows have no equivalent name field; it remains available for Imported records. Controls explicitly explain loaded-history filtering, device-only exports/selection and the inspector-name limitation. No author filter is represented as a server query.

The existing local card/actions remain for each projected local reference. New cloud-only cards use a separate renderer with no local array index. The actual Log toolbar now counts rendered loaded cards; selection still counts device records.

## 4. Deduplication result

Phase 14A.1 projectMy performs the UUID merge once per Log presentation pass. UI preserves local references, local photos, durable status and guarded actions. One card is rendered for a combined UUID. A compact “Device and submitted details differ” indicator appears for proven current field differences; submitted comparison remains read-only. Unknown baseline comparison does not assert equality or automatically release a hold. No reconciliation, snapshot rewriting or automatic conflict resolution was added.

Deterministic renderer tests and Edge synthetic data verified deduplication, local-only/pending/review-primary behavior and divergence. Live validation temporarily constructed one **memory-only**, local_only device representation of an already authorized cloud UUID: 219 projected cards remained 219, device storage remained empty. It was then removed from memory. No local capture, saved fixture or cloud mutation was used.

## 5. Cloud-only read-only rules

Cloud-only cards provide submitted detail and, when appropriate, View photo. They have no Save/Edit/Delete, selection checkbox, inspection retry/submit, review, claim, photo retry/preparation/replacement or map action. They carry no local index and do not enter swipe rows. Existing local edit/delete/review/claim/submit guards remain separate. Combined records retain their device detail/actions with an optional submitted-detail button.

Submitted detail shows date/time, defect, expressway, bound, lane, KM, coordinates and photo availability. It shows no raw UUID, backend terminology, path or raw API error. Error/loading text is operational and generic.

## 6. Cloud photo viewing result

New cloud-photo-viewer.js is independent of upload/recovery/acknowledgement code. It prefers a valid current local image blob. Otherwise it requires fresh verified account/current-team scope, matching getUser identity and an owned/current-team inspection association read. Only exact Phase 13 v1 paths of the form team/UUID/photo-v1-SHA256.jpg are accepted, with matching photo_filename. Legacy/unverifiable paths, null association, denied/missing object or mismatched bytes fail safely as unavailable.

The viewer uses authenticated private bucket download with `cache: 'no-store'`, checks JPEG MIME/positive size/5 MB bound and full SHA-256 identity, then rereads the exact row association and rechecks scope/current record before creating a temporary object URL. URLs are revoked on close/replacement/scope invalidation. No public/signed URL, manifest/acknowledgement creation, local photo status mutation, upload, reservation, replacement or durable cloud-image storage.

Pinned SDK 2.117.1 with intercepted fetch proves the no-store request reaches Storage GET. This matches the official [private-download fetch-parameters contract](https://supabase.com/docs/reference/javascript/file-buckets-download). Existing service worker ignores cross-origin requests, including private Storage.

Synthetic Edge exercised the actual detail/View photo control with a generated JPEG and private-download adapter, verified rendered image, and confirmed object URL fetch fails after close. Unit tests cover fresh owner/team authorization, changed final association, denied/missing/hash/MIME failures, local preference/nonmutation and late session/account/team/offline/close results.

**Live private photo read not verified:** none of the 219 loaded rows for the signed-in Inspector had a verifiable v1 filename. No other account/profile was accessed, no new photo was uploaded and legacy paths were not accepted to manufacture a successful result.

## 7. Refresh / pagination result

Automatic first page runs once per verified scope; recording the attempted scope before verification notifications prevents recursive reloads. Refresh and Load more use the existing store's atomic replacement, keyset cursor, 50+1 lookahead and five-page cap. Generic refresh failure preserves still-authorized cloud pages and all local records. Auth failures clear presentation. Loading/error/hasMore/last refreshed and retained-window text are visible; controls are disabled without verified online scope.

Live Refresh and pagination passed. Synthetic browser tested 50/100/250 loaded rows, failed refresh retention and local storage preservation. Deterministic tests exercise five-page eviction. Counts do not imply complete backend totals, and pagination remains a changing dataset rather than a transaction snapshot.

## 8. Auth / invalidation result

Sign-out/auth-session invalidation, account/team/role/verification changes, relevant cross-tab auth/binding events, offline and reload invalidate the store. UI immediately removes cloud-only cards/submitted comparison controls, closes submitted detail and revokes previews, then coalesces the remaining render. Projection always uses current context; late old requests cannot revive previous rows. Same-user new-session and account/team/scope guards remain covered by the Phase 14A.1 tests and viewer tests.

Live sign-out cleared cloud cards/store and left the empty device workspace empty. Synthetic offline/reconnect/sign-out and deterministic account/team/session transitions passed. Actual live different-account/team switching and continuous backend profile revocation monitoring were not performed; backend changes are discovered on subsequent verification, as in the accepted architecture.

## 9. Offline result

Memory cloud rows are cleared when verified online access is unavailable. Local account records remain usable with their existing guards. Refresh/Load more do not run offline. Reconnect re-verifies and safely reloads the first My page. Synthetic browser retained a device-only record offline; live empty-workspace reconnect restored 50 cloud cards. No persistent offline cloud history was introduced.

## 10. Export result

Workbook/backup code and entriesForExport continue to use accessible local/device entries and existing filters/selected IDs. Cloud-only cards never supply export records or photos. Export dialog now explicitly says “Export records on this device” and excludes submitted records from other devices. Empty-device cloud history leaves export disabled. Existing workbook schema/local-photo embedding is exercised by focused regressions. No cloud/team export was added.

## 11. Performance results

Cloud changes coalesce into one 100 ms render task. Loading/error-only state notifications update controls without rebuilding cards when scope/revision/view/filter signature is unchanged. Cloud-driven card rebuilds skip Map layer work. Local-save/runner rendering retains the Phase 13F scheduler. One merge per presentation pass; one local durability snapshot per renderer pass; no eager photo fetch. Cloud cards never exceed retained pages.

Final isolated Edge synthetic run, 100 local local_only records plus loaded cloud rows, seven complete Log renders per size:

| Loaded cloud | Device local | Median full Log render | Maximum sample |
| --- | --- | --- | --- |
| 50 | 100 | 46.0 ms | 53.9 ms |
| 100 | 100 | 50.9 ms | 76.2 ms |
| 250 | 100 | 80.3 ms | 84.8 ms |

Includes full synchronous renderer/filter/durability/DOM work; excludes network, physical mobile and end-to-end paint guarantees. Timing noise was observed in earlier iterations, including larger maximum samples. This is not a promise of mobile frame rate or bounded cost for arbitrarily large device workspaces. No virtualization, worker or backend index change.

## 12. Live read-only validation

New nonpersistent Edge session at localhost8786. User entered credentials only through normal UI. Existing Phase 12/13 profiles, sessions and fixtures were not reopened. Before navigation, route guards denied non-GET/HEAD/OPTIONS inspection/profile/Storage requests, allowing authentication and authorized reads. No credentials or raw session/header/storage state were logged.

Final controlled run observed eight inspection GET responses, all HTTP200, zero private Storage reads, zero blocked write attempts and zero page errors. Initial startup/early inspection reads before the final counter installation were also read-only but are not included in that eight-request count; do not treat it as total session traffic. No inspection INSERT/PATCH/DELETE, Storage upload/update/delete, profile/schema/RLS/index change or new production fixture. Sign-in/refresh/logout authentication requests are separate from inspection writes.

PASS: empty device/owned history, automatic page, 50-card loaded count, Refresh, bounded pages to219, memory-only same-UUID dedup, zero cloud-to-device persistence, offline clear/disabled controls, reconnect/refetch and sign-out clear. No verifiable v1 photo for this account; live viewer success remains unverified. Browser signed out and closed afterward.

## 13. Test / check results

- Focused 20-file regression: **606/606 passed**, zero failures/skips/cancellations. Includes37 new tests plus Phase12 sync/review/claim, Phase13 photo/wakeup/foreground safeguards and all Phase14A.1 tests.
- New tests exercise actual extracted Log renderer as well as modules and actual pinned Storage SDK with intercepted fetch.
- Isolated full-app Edge synthetic checks: empty-device cloud history, detail/private synthetic JPEG/revocation, loaded counts, 50/100/250 rendering, dedup/divergence, failed-refresh retention, local-only storage, offline/reconnect/sign-out. Zero page errors; external backend requests blocked.
- Mobile390x844 My-records card and submitted-detail screenshots inspected. Live Inspector mobile-width screenshot inspected. Desktop Edge emulation is not physical mobile/PWA certification.
- Additional8-file legacy surface set:32 passed/28 failed of60. Extracted **current committed7784786** baseline ran the identical set:32 passed/28 failed, identical28 failure titles. A loaded-count source assertion was updated to the approved new behavior. No new failing title; historical UI/export/map/GPS test debt remains. Full suite not declared passing.
- Syntax31 application JS +2 inline scripts and changed/new test syntax passed. Git whitespace check passed. Cachev238 and disabled production photo transport checked.

Reproducible ignored evidence/harnesses reside in output/playwright/phase14a2-*. No profiles/logs/screenshots/scripts or baseline archive are commit artifacts. Browser harness setup/timing/module-load-order/CSS issues were corrected before final checks; initial errors are not presented as passes.

## 14. Remaining 14A.3 prerequisites

Separate approval for Team records/tab, Tools migration or other subsequent phases. Current My projection/private viewer does not authorize team-row actions or engineer/admin writes. Team viewer would need its own scoped authorization/association contract and role/team validation. Legacy no-hash photos remain unavailable pending an explicit design decision. Physical mobile/PWA/published build checks, live cross-account/team revocation and live verified-v1 photo success remain follow-up validation. Backend indexes, durable cloud caching, Realtime, Map projection/clustering and cloud exports remain separately scoped.

## 15. GitHub Desktop handoff

**COMMIT MESSAGE:** Add cross-device My records Log and private read-only detail

**DESCRIPTION:** Integrate the scoped memory-only My read store and UUID projection into normal account Log, preserving device actions, Guest/import separation and device-only exports. Add bounded refresh/pagination, operational submitted status/detail and a fresh-authorized hash-verified private-photo viewer with no-store downloads and revocable URLs. Retire technical cloud edit UI, cachev238, add focused tests and document synthetic/live read-only validation plus remaining photo/mobile/legacy-test limits. Keep production photo transport disabled.

**FILE CHECKBOXES — select only these17 Phase14A.2 files:**

- [ ] my-records.js
- [ ] my-records.test.js
- [ ] cloud-photo-viewer.js
- [ ] cloud-photo-viewer.test.js
- [ ] index.html
- [ ] log-controls.js
- [ ] sw.js
- [ ] cloud-records.test.js
- [ ] inspection-api.test.js
- [ ] photo-pilot.test.js
- [ ] foreground-sync.test.js
- [ ] guest-claim.test.js
- [ ] photo-sync.test.js
- [ ] preapproval-review.test.js
- [ ] sync-runner.test.js
- [ ] selection-flow.test.js
- [ ] PHASE14A2_MY_RECORDS_LOG.md

Leave unrelated AGENTS.md, .codex/, references/ and ignored browser profiles/evidence/baseline artifacts unchecked. Existing unrelated work preserved. Nothing staged, committed or pushed. Stop after14A.2; no14A.3/14B/14C started.
