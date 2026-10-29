# Phase 14A.3 — Team records, Team tab and Tools → Settings

October 5, 2026 (Asia/Manila). **Local implementation, deterministic/synthetic validation and a bounded Inspector/Guest read-only live run are complete. User acceptance remains pending; live teammate/private-photo and Supervisor coverage remain unverified.** Stop after this phase; Phase 14B/14C remain outside scope.

## 1. Summary

Added a read-only Team Log scope using the existing Phase 14A.1 store, an explicit separate private Team-photo viewer factory, and an operational Team tab. Replaced Tools with Team and moved its existing utility controls into Settings. Settings retains its name. Cache v238 → v239 includes team-records.js; production photo transport remains disabled.

Phase 14A.2 acceptance was supplied by the user. Independently verified local main HEAD 788eeb8fdb656c442d874525cffc4da3b3efa224 and GitHub connector refs/heads/main at the same SHA after the user's push. Direct Git ls-remote could not connect. At start only unrelated AGENTS.md, .codex/ and references/ were uncommitted; all were preserved. No staging/commit/push, backend mutation, schema/policy/index changes, production fixtures or preserved browser-profile access.

## 2. Team records result

team-records.js wraps the existing memory-only store's Team collection. Initial reads are lazy on opening Team records; attempted-scope bookkeeping prevents recursive verification notifications from issuing duplicate initial reads. Activated Team history reloads on reconnect/reverification; switching between valid retained My/Team pages does not refetch them.

Team queries remain current-team equality only, with no owner filter. RLS remains authoritative. Approved verified Inspector/Supervisor/assigned-team Admin use the same bounded collection; Guest, pending/unverified/locked accounts and no-team Admin cannot load it. No second inspection-query implementation was added to the UI.

The projection checks fresh scope against the Team snapshot, filters submitted values and groups UUID only. Every Team item uses the cloud-only renderer, including the user's own submitted rows. Team items have no local array index, edit/delete, checkbox, swipe, submit/retry, review, claim or photo upload/preparation actions. Own rows may show an informational local-context note only when the local UUID, explicit owner/team and non-import/non-Guest provenance match; device actions remain in My records. Teammate visibility grants no local ownership. No cloud row is written to entries, localStorage or IndexedDB.

## 3. Log scope result

Added compact My records / Team records buttons with pressed state. My remains the signed-in default. Guest retains local Log with the scope controls hidden. Team scope is disabled without a current authorized team. My behavior and its pure merge module are unchanged; active-controller routing chooses the existing independent My/Team store collections.

Scope switch closes both viewers/detail, revokes previews, clears local selection/select mode, resets incompatible archive/inspector source filters, and mounts Log. Common date/type filters use submitted Team values and Manila dates. No teammate profile/name lookup, email or UUID display. Existing local-only inspector filtering stays unavailable for cloud scopes; Imported archive remains a separate My/device source. No new expressway/bound filter controls were introduced because this Log does not currently expose them.

Refresh/Load more use the active collection: 50+1 lookahead, keyset order and maximum five retained pages/250 rows. My and Team cursors/pages/revisions remain separate. Failed Team refresh retains earlier Team pages and leaves My/local data intact. Loaded counts describe retained loaded history, not complete team totals.

## 4. Team tab result

Primary navigation is Capture · Log · Map · Team · Settings, with five items. Team has matching route, panel ID, ARIA relationships, active state and a team icon. Existing tab keyboard navigation and saved-view behavior are preserved. No navigation CSS or safe-area sizing was changed; synthetic mobile measured the existing 58 px bar with no horizontal overflow. Home/End and wraparound arrow navigation passed in Edge.

Three operational cards show Account (display name or neutral fallback, role, team, approval/verification explanation), Work on this device (durable local inspection/review/photo counts plus connection state), and Records (separate loaded My/Team counts, last successful refresh times in Asia/Manila, Open My/Open Team actions).

Counts exclude imports, cloud-source entries and records that fail the fresh durability snapshot. Photo counts describe durable local record photo references/status; they are not a fresh enumeration or hash audit of IndexedDB bytes. Waiting photo counts do not activate transport. Loaded My count here means cloud My rows, not the merged local-plus-cloud Log-card count. The cards use operational wording without tokens/backend identifiers or teammate profile data. Text changes update existing nodes; they do not reconstruct the Team tab.

## 5. Tools → Settings migration result

Source inventory found the planned Alignment/calibration network drawer and Installability guidance; no additional Tools controls had been added. Moved both existing cards to Settings, renamed their section headings Network data and Installation & offline use, and retained all other Settings controls.

Preserved dataset-drawer, dataset-state-label, calib-badge/status/reload and ramp-badge/status/reload IDs exactly once. Reload listeners still call loadCalibrationDataset(true) / loadRampDataset(true). Drawer content/state, loaders, caching and status writers are unchanged. Installation/home-screen, location permission and local-storage/offline guidance remain. Guest browser checks opened Settings, opened the drawer, invoked both reload controls and observed ready datasets. No duplicate Tools view/tab remains.

Historical route values tools, tools-tab and tools-view resolve to Settings; sessionStorage saved tools state reloads into Settings. Internal historical utility class names are retained. Settings was not renamed More or broadly redesigned.

## 6. Team photo viewing result

createViewer remains fixed to the My owner contract. createTeamViewer is an explicit separate factory with independent URL/epoch state. Team never prefers an unrelated local blob; it requires current verified Team scope, fresh verification and matching getUser, rereads the specific inspection with UUID+team predicates, privately downloads the exact associated v1 path, checks JPEG MIME/positive size/5 MB bound/full SHA-256, rereads association and rechecks scope/current item before minting a temporary object URL. Both association reads include the current team; My continues to add the owner predicate.

The private SDK download keeps cache:no-store. No public/signed URL, manifest/ack mutation, photo status rewrite, reservation, replacement, upload or durable cloud-byte cache. Close/scope invalidation cancels late completion and revokes URLs. Invalid/legacy paths and denied/missing/hash/MIME/changed associations remain unavailable.

Deterministic tests prove authorized same-team teammate read with no owner filter, unchanged My teammate denial, unauthorized/cross-team denial, path/hash checks and URL lifetime. Synthetic full-app Team detail displayed a generated JPEG through the private adapter and proved URL revocation. That UI photo used a synthetic current-user Team row; the deterministic viewer test separately covers a teammate owner.

The prior Phase 13E policy closeout documents private SELECT following the exact referenced inspection visible under RLS, including teammate reads. **Current live Storage policy inventory and live Team/private-photo success were not reverified. Connectivity was restored for the Inspector/Guest record run, which made no Storage requests.** No policy weakening or public Storage was attempted. If existing policies deny the intended live read, report the denial and stop rather than altering them.

## 7. Auth / invalidation result

Reuse existing auth/store invalidation for sign-out/account/session/team/role/verification/workspace/offline changes. Clear memory cloud pages, close detail/both viewers, revoke previews, remove cloud controls/cards immediately, reset Team scope to My and clear incompatible selection before coalesced rendering. Local records remain untouched.

Focused tests cover these boundaries, pending reads and snapshot mismatch. Synthetic full-app offline/sign-out cleared cloud cards/pages and preserved 100 device records. Actual live different-account/team/role changes remain unverified. Backend profile changes are observed on existing verification, not continuously monitored.

## 8. Offline result

Team history is not retained as current offline. Team Refresh/Load more and Team-open controls are disabled; Team card explains connection/verification requirements. Local My/device entries remain usable. No persistent Team-page cache was added. Synthetic reconnect reverified and loaded fresh first pages for My and an already activated Team view.

## 9. Export result

No Team export. Team scope has an empty device selection projection; select/export/backup controls are disabled there. Existing My/device workbook and backup pipelines are unchanged and still consume only local entries and local photo storage. Cloud rows never enter export or Map marker arrays. No Team Map/toggle/clustering.

## 10. Performance results

Synthetic isolated Edge, actual full-app renderer, seven synchronous renders per size with 100 durable local records:

| Loaded Team rows | Median | Maximum |
| --- | --- | --- |
| 50 | 15.0 ms | 17.0 ms |
| 100 | 30.4 ms | 46.2 ms |
| 250 | 68.4 ms | 73.1 ms |

Includes filter/durability bookkeeping and DOM reconstruction, not network/paint/physical-mobile latency. Measurements preceded removal of one redundant Team-card update call; no additional acceleration claim is made. Synthetic local states included 40 submitted, 50 review-held and 10 kept-on-device inspections. Separate focused count tests include a waiting inspection/photo, imports/cloud exclusions and unsaved rows. No production records were created.

Existing 100 ms notification coalescing remains. Render signatures now include collection identity/revision, so loading-only/error-only notifications update controls and Team text without rebuilding unchanged Log cards or Map. Browser scope switching kept My 25 / Team 250 and issued no new read. No virtualization or unbounded-local-workspace performance guarantee.

## 11. Live read-only validation

**Bounded Inspector/Guest run passed after connectivity was restored.** A fresh nonpersistent headed Edge session had read-only guards installed before initial navigation: non-read inspection/profile/Storage requests aborted, unrelated external traffic blocked, workspace empty. Public auth/settings connectivity returned HTTP200. The user manually signed into an approved Inspector account; no password was requested or recorded by the agent.

Observed live results:

- My loaded 50 owned/current-team submitted rows with zero local entries.
- Team loaded 50 current-team rows through the existing Team store. All sampled rows belonged to the current user; no teammate-owned row occurred in this first page. Every Team card was read-only, had no local index/checkbox/swipe/mutation action, and submitted detail exposed read-only information.
- My → Team switching preserved each collection's 50 rows, produced the correct card counts and issued no additional inspection read. Team Refresh succeeded and preserved My's 50 rows.
- Before/after device entry storage was byte-identical and the local array remained empty. This proves fetched rows were not persisted; live nonempty-local-data preservation is not claimed. Synthetic validation separately preserved 100 saved device records.
- Sign-out cleared both page stores, cloud cards and submitted detail and preserved device storage. There was no live photo URL to revoke; synthetic/deterministic checks cover URL invalidation.
- Guest Team access was disabled and Log scope controls hidden. Guest Settings opened the migrated network drawer, invoked both reload controls and observed Stationing / Interchange badges Ready.
- Final instrumented invocation: two inspection GETs, both HTTP200; zero Storage reads, zero blocked write attempts, zero page errors. Earlier sign-in/startup and the preceding partially completed read-only harness invocation are not included in this two-read count. Do not call two the total session traffic. Auth sign-in/refresh/sign-out operations are separate from engineering writes.

A harness-only request-counter lifetime error interrupted the first run after Team/detail reads. The original write guards remained installed throughout; instrumentation was recreated inside the subsequent invocation, which completed all checks. No app change was needed.

Remaining live limitations: no teammate-owned row in the sampled first Team page, no private photo download/current Storage-policy audit, no approved Supervisor account made available, no live different-account/team/role revocation, no physical mobile/camera/GPS or installed/published PWA check. Deterministic tests, prior policy documentation and synthetic results are not substitutes for those live observations. No other account/profile or preserved fixture workspace was opened, no fixture was created and no upload/backend mutation occurred.

The user account was signed out before entering Guest. The isolated resume browser was closed and localhost8786 server stopped. Old route guards do not survive browser close. Any further coverage needs a fresh isolated guarded session and a safely available approved account/existing authorized photo; never weaken policies or create production fixtures to obtain a passing result.

## 12. Test / check results

- Final 21-file focused regression: **646/646 passed**, zero failures/skips/cancellations. Includes 40 new Team/viewer checks plus Phase 14A.1/14A.2 and Phase 12/13 regressions.
- Surface set: 60 tests, 32 passed / 28 failed. Independently extracted committed 788eeb8 baseline: same 32/28 with identical failing titles. No new failures demonstrated; no full-suite-passing claim. Legacy UI/export/map/GPS debt remains.
- Syntax: 32 application JS files and two inline scripts passed; new/changed test files checked; git diff --check passed.
- Synthetic full app: default My/lazy Team, read-only card/actions, generated private photo/revocation, 50/100/250 rows, separate pages/no refetch, failed refresh preservation, Team counts/actions, offline/reconnect/sign-out, Guest utility reloads, legacy saved route and keyboard navigation. Zero page errors; live backend blocked throughout. Mobile Team/Settings screenshots inspected.
- Cache v239 caches team-records.js; PHOTO_CLOUD_TRANSPORT_ENABLED=false confirmed. Installed PWA/published runtime, physical GPS/camera/mobile and live teammate/private-photo/Supervisor coverage remain unverified.

Ignored evidence: output/playwright/phase14a3-{regression,preservation,preservation-baseline}.tap; browser-result.txt; keyboard.txt; mobile PNGs; live-setup-result.txt; harnesses and isolated committed baseline archive/directory. Never stage/upload browser logs/profiles/session material. phase14a3-edit.cjs was a one-time transformation and must not be rerun.

## 13. Remaining Phase 14B prerequisites

Obtain user acceptance of this phase and its recorded live limitations first. Phase 14B still needs a separately approved bounded Map plan: readonly UUID projection, numeric-coordinate/KM/provenance checks, coverage and action contract, separation from imported Map history, scope invalidation and clustering/performance validation. Team photo reads confer no Map/edit/upload permissions. No Phase 14B/14C work was started; cloud exports, durable caching, Realtime and backend optimization remain separate scope.

## 14. GitHub Desktop handoff

Reviewable local work; bounded Inspector/Guest live check passed with the limitations above. No staging, commit or push performed. Prepared commit message:

**Add read-only Team workspace and move Tools into Settings**

Description:

Add current-team read-only Log history with separate bounded My/Team pagination and private Team-photo authorization. Replace Tools with an operational Team tab; preserve utility IDs/handlers and move network/install guidance into Settings with legacy-route fallback. Keep device data/export/Map and My behavior intact, production photo transport disabled, and cache v239. Add focused safety/navigation/count regressions and document synthetic results, unchanged baseline test debt and bounded Inspector/Guest live validation and remaining live coverage limits.

Select only these 16 intended files when the user chooses to commit:

- [ ] team-records.js
- [ ] team-records.test.js
- [ ] cloud-photo-viewer.js
- [ ] cloud-photo-viewer.test.js
- [ ] index.html
- [ ] sw.js
- [ ] my-records.test.js
- [ ] cloud-records.test.js
- [ ] inspection-api.test.js
- [ ] foreground-sync.test.js
- [ ] guest-claim.test.js
- [ ] photo-pilot.test.js
- [ ] photo-sync.test.js
- [ ] preapproval-review.test.js
- [ ] sync-runner.test.js
- [ ] PHASE14A3_TEAM_WORKSPACE.md

Leave unrelated AGENTS.md, .codex/ and references/ unchecked. Ignore output/playwright/ and .playwright-cli/ artifacts. The other regression test edits update exact cache expectations and extracted-renderer/controller harness dependencies; transport eligibility/assertions were not weakened. HEAD remains the accepted Phase 14A.2 commit 788eeb8.
