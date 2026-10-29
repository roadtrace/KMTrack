# Phase 14G — Log / Capture polish and mainline recovery

October 6, 2026 (Asia/Manila). Local implementation; not staged, committed, pushed, deployed, or field validated. Phase 14F remains deferred. Directed transition gates are stopped under the approved dataset stop condition; a conservative existing-resolver fallback is implemented separately.

## 1. Summary

Read parent/repository AGENTS.md, .codex/HANDOFF.md and the three project architecture/planning documents. Independently verified main at b94fcd4, the accepted Phase 14E commit, cache v242, and the unrelated initial working-tree files. HEAD and local origin/main matched; no remote fetch was performed. The user's acceptance/push confirmation supersedes the handoff's stale uncommitted description.

Polished the existing Log evidence presentation, date controls/chip, and shared Capture Today register. Removed redundant Capture interchange presentation. Added narrow NLEX mainline recovery inside the existing location resolver. No second resolver, record store, schema, backend access, or Phase 14F work. Team markup, controller, styles, and behavior remain at committed state; team-records.test.js changes only its service-worker version expectation.

## 2. Evidence placeholder result

Log cards use a clear outline image icon with text. Durable local records without a photo reference say “No photo”; local references say “Photo” without claiming verified bytes. Cloud-only, Team, and non-durable records say “Evidence”. No inference from missing blobs, private images not fetched, or absent thumbnails. No eager image request, thumbnail persistence, new photo state, or viewer/upload change. The prior Log register had no thumbnail loader to preserve; existing local photo controls and private viewer remain intact. Guarded synthetic My/Team history made zero photo downloads.

## 3. Date filter control result

The original date inputs are wrapped in separately labeled From / To cards. Controls remain at least 44px high. Existing input IDs, validity, min/max bounds, original calendar-day filtering, local/cloud filtering, and sheet draft/apply/cancel logic are retained. Actual browser checks confirmed Apply uses both bounds and Escape restores the previously applied bounds.

## 4. Date chip result

One calendar-icon chip covers both date bounds. Removing it clears both bounds and retains unrelated filters; Clear All clears both and other filters while retaining the existing source scope. Formats: Oct 6, 2026; Oct 4 – 6, 2026; Sep 28 – Oct 6, 2026; Dec 30, 2026 – Jan 2, 2027. Open bounds are “From …” / “Through …”. Calendar strings are formatted without changing filtering or converting the selected day to UTC. All other chips remain.

## 5. Today panel spacing result

Capture-scoped CSS removes the register padding and residual header margin, honors hidden regions, and hides the Log-only filter/account-control regions. The one shared register remains. Browser measurements in both themes at both widths: header-to-list gap 0px, first-row/accent offset 0px. No broad Capture redesign.

## 6. Today count result

The large number uses the complete eligible Today population, not rendered-row count. It uses the original fullTimestamp() local calendar day, the unlocked active device workspace, accessibleEntries(), and an owner guard. Imported archives, cloud projections, yesterday/tomorrow, and another owner's records are excluded. Separate Guest storage remains isolated. A 25-record Today population displays 25 while showing three rows. No inspection population is deleted or rewritten.

## 7. Today recent-list result

Maximum three Today rows, newest inspection timestamp first, stable ID tie-break for equal timestamps. The helper filters/sorts a copy and has no storage operations. Browser checks for 0, 1, 3, 10, 17, and 25 Today records passed; zero shows “No inspections recorded today”. The Log retained all 26 device fixture records (25 Today plus yesterday). No cap applied to Log, Map, storage, exports, or cloud paging.

## 8. Interchange UI simplification result

Removed the separate “Interchange identity” row and the Near interchange/exit branch beneath the station. Primary interchange-name-as-station behavior is retained. The nearby summary continues to present a valid bridge. Resolver, interchange dataset/loading, save snapshot semantics and camera behavior remain; only the fallback described below changes resolver behavior.

## 9. Existing interchange architecture finding

- interchanges.json contains dataset label “Final NLEX Mainline Interchange”, CRS, matchRadiusMeters, and 448 sampled polylines for 21 sites. There is no explicit geometry version or transition-gate collection; the on-device cache key is nlex_interchange_dataset_v2.
- Only two lines carry bound (both SCTEX Spur), one carries travel, one carries level, eleven carry ramp labels, and two carry segment type. No line has from_node or to_node. Tambubong's lines have none of bound/travel/level/connectivity metadata.
- The existing matcher indexes sampled points and returns a preferred-site/nearest-point match within the dataset radius. It does not resolve directed line crossing, ramp endpoints, topology, mainline joins, or grade-separated connectivity.
- calibration.json supplies corridor/bound/station samples. computeKmStation() interpolates within corridor/bound; computeCorridorCandidates() exposes one nearest candidate per corridor. Direction auto-detection is an existing KM-trend function.
- The resolver confirms road startup, latches interchange identity after repeated matches, locks on mainline departure, and uses movement/time/count hysteresis for outgoing roads. A same-site match resets exit evidence. Poor-accuracy and implausible steps block existing exit confirmation. This combination can retain an interchange during/near a mainline merge.

These inputs support conservative corridor-based fallback, but do not prove which sampled endpoint is a directed entry/re-entry or which carriageway/level it connects to. Deriving transverse gates or inferring direction from point-array order would invent unsupported semantics. No such approximation was implemented.

## 10. Interchange entry / mainline re-entry result

Directed crossing gates are stopped, including between-sample segment-crossing support. Entry still uses the committed repeated-match/departure logic; no claim of faster gate-driven entry. The existing mainline KM and interchange primary display remain. Re-entry can now clear a locked NLEX identity promptly when the conservative repeated mainline evidence below is present. This is a fallback improvement, not a complete directed-gate solution.

## 11. Missed-gate fallback result

Inside createResolver(), remember the bound of a previously confirmed, unambiguous, accurate NLEX mainline fix. A locked NLEX interchange can release after approximately two consecutive qualifying fixes, without waiting for the old elapsed hold:

- NLEX is the strongest candidate, same previously confirmed NB/SB bound, distance at most 15m to existing stationing samples;
- accuracy at most 20m, plausible motion, strictly increasing timestamps, interval at most the app's 12-second freshness window;
- other corridor candidates have at least 25m separation advantage;
- no current same-site ramp match, and at least the existing 150m departure distance from the last same-site ramp observation;
- between the qualifying fixes, at least 20m geographic movement and 10m of KM progress consistent with NLEX NB increasing / SB decreasing.

Invalid, stale, opposite-bound, ambiguous, stationary, wrong-way or same-site evidence breaks the pending confirmation. markStale() also clears it. The original exit rules remain for other corridors and weaker evidence. Unknown prior carriageway, U-turn/opposite-bound re-entry, overlapping/near ramp geometry, missing stationing samples, or poor accuracy intentionally retain the original conservative behavior. This fallback cannot guarantee every real merge clears in two samples, especially while a same-site match remains.

## 12. Bridge preservation result

Nearby bridge name/identity, station range, distance and bridge filter markup are retained. updateBridgeReadout() and the stationing/corridor candidate functions compare equal to HEAD. Map functions/controllers and bridge data are unchanged. Both theme screenshots show the retained bridge section/action. No physical GPS/bridge accuracy claim.

## 13. Light / Dark theme result

All new styling uses current --ds-* surface, border, foreground and primary tokens, or currentColor. Shared markup works in both existing themes. No new palette, fonts, theme engine, or changes to Team theme rules. More's BUILD label changes only from v242 to v243 to match the service worker.

## 14. Mobile result

Fresh isolated Edge session kmtrack14g, 390×844 and 414×844, Light and Dark. Synthetic SDK interception and external-request guards installed before localhost navigation; worker deliberately blocked; no production credentials/backend. All four matrices had document scrollWidth equal viewport width, dialog scrollWidth equal clientWidth, 44px date inputs, readable evidence and fitting date chip, zero Capture gap/accent offset, and visible bridge action. Screenshots visually inspected in both themes/widths. Native iPhone date-picker behavior remains manual.

## 15. Tests / regression results

- Focused 26-file Phase 12–14 / More / location-resolver / new Phase 14G regression: 772/772 passed, zero failures/skips/cancellations.
- New Phase 14G file: 43 deterministic checks, covering evidence privacy/read boundaries, calendar formats, date bounds, Today counts/order/isolation/nonmutation, NLEX NB/SB synthetic recovery, opposite bound, jitter/outliers, bad accuracy, stale/duplicate/sparse fixes, wrong-way progress and preserved features.
- Entire committed baseline: 846 tests, 785 passed / 61 failed. Entire final suite: 889 tests, 828 passed / 61 failed. Decoded PowerShell UTF-16 TAP output and compared failure-title lists: identical, no added/removed failures. Unrelated legacy failures not repaired; no whole-suite-pass claim.
- Syntax: 35 app JS files plus two inline scripts passed; new test separately passes node --check. git diff --check passes (Windows line-ending notices only).
- Completed browser run: no page errors; Apply/Cancel/remove/Clear All, counts/list order/storage retention, neutral My/Team evidence and zero downloads, Guest isolation and mobile matrix passed. Early harness mistakes (device-vs-loaded-history count, awaiting Team rendering, hidden account button, persisted mock state, CLI-global error collection) were corrected before the completed run.
- Protected popup, export handlers, My/Team/cloud/private photo/Map modules and shared theme remain unchanged; directed gate tests are not claimed because gate implementation is stopped. Existing resolver regressions pass; existing location-pipeline source extraction failures match baseline.

Evidence is ignored under output/playwright/phase14g-*: baseline/final/regression TAP, browser result, screenshots and disposable harnesses. The task's isolated browser ended signed out and closed; its localhost8787 server was stopped. No old profiles were reopened or cleaned. Worker/cache installation intentionally not tested in the guarded browser.

## 16. Stopped / deferred items

Phase 14F and Team redesign remain deferred. Directed gate entry/re-entry detection is stopped under the approved condition. Required future calibration, within the existing local interchange dataset: stable dataset/schema version; audited gate ID/site/segment association; short transverse segment endpoints; NLEX corridor/carriageway bound; allowed movement/crossing orientation; entry vs re-entry classification; explicit ramp/mainline connectivity; level where roads stack; source/review metadata. For example, a future optional transitions array can reference existing seg_id/site_id and store these fields, rather than embedding coordinates in UI conditionals. No coordinates are supplied here and no dataset extension is implemented.

All 21 sites need an audit of relevant entry/re-entry transitions for each real NB/SB connection: Angeles; Balagtas/Plaridel By-pass; Balintawak; Bocaue; Burol/Tabang Spur Overpass; Dau; Harbor Link/Smart Connect; Lawang Bato; Lingunan; Marilao; Meycauayan; Paso de Blas/Valenzuela; Philippine Arena; Pulilan; San Fernando; San Simon; Santa Rita; SCTEX Spur; Sindalan/Mexico; Sta. Ines; Tambubong. Begin with Tambubong NB/SB where connections actually exist; do not assume symmetric ramps. Smart Connect and other stacked crossings require level/connectivity calibration. SCTEX Spur's two bound labels alone do not constitute calibrated gates.

## 17. Remaining manual field checks

Physical-device/drive sequence: approach on NLEX Mainline; confirm normal KM; enter ramp; confirm correct interchange identity; travel through interchange; rejoin Mainline; confirm identity clears when trustworthy evidence is available; confirm normal KM resumes; repeat relevant opposite direction. Also check poor GPS, close parallel ramps, sparse browser samples and stacked roads against real data. Gate-specific expected crossings cannot be field validated until gates are calibrated/implemented. No drive performed.

Also verify installed/published v243 upgrade and offline app-shell launch, real iPhone touch/scroll/native date controls, and camera/GPS behavior. No production account/backend validation was performed.

## 18. GitHub Desktop handoff

COMMIT MESSAGE

Polish Log and Capture Today records; improve NLEX mainline recovery

DESCRIPTION

Clarify Log evidence states, label existing date controls, and combine the active date bounds into one removable chip. Make Capture count today's eligible local inspections and show the latest three with compact spacing. Remove redundant interchange presentation while retaining the primary station name and bridge controls.

Add conservative consecutive NLEX mainline recovery in the existing resolver. Directed transition gates remain deferred because the existing ramp dataset lacks calibrated direction/connectivity. Preserve Team, private photos, sync, exports, storage and backend architecture. Bump shell and build label v242 → v243.

Validation: 772 focused tests passed; full suite 828 passed / 61 failures matching the untouched committed baseline. Both mobile widths/themes and synthetic account/evidence/isolation states checked. Physical drive/iPhone and installed-PWA checks remain manual.

FILE CHECKBOXES

- ✅ CHECK — index.html
- ✅ CHECK — location-resolver.js
- ✅ CHECK — log-controls.js
- ✅ CHECK — log-register.js
- ✅ CHECK — log-register.css
- ✅ CHECK — more.js (build label only)
- ✅ CHECK — sw.js (v243; all changed app assets were already cached)
- ✅ CHECK — phase14g.test.js
- ✅ CHECK — PHASE14G_LOG_CAPTURE_POLISH.md
- ✅ CHECK — instrument-panel.test.js
- ✅ CHECK — log-list-view.test.js
- ✅ CHECK — selection-flow.test.js
- ✅ CHECK — log-register.test.js
- ✅ CHECK — cloud-records.test.js
- ✅ CHECK — foreground-sync.test.js
- ✅ CHECK — guest-claim.test.js
- ✅ CHECK — map-records.test.js
- ✅ CHECK — photo-pilot.test.js
- ✅ CHECK — photo-sync.test.js
- ✅ CHECK — preapproval-review.test.js
- ✅ CHECK — sync-runner.test.js
- ✅ CHECK — team-records.test.js
- ⬜ UNCHECK — AGENTS.md: pre-existing unrelated instruction addition, preserved.
- ⬜ UNCHECK — .codex/HANDOFF.md: pre-existing untracked historical handoff, untouched.
- ⬜ UNCHECK — .codex/skills/handoff/SKILL.md: pre-existing untracked local skill, untouched.
- ⬜ UNCHECK — references/kmtrack_new_table columns format.xlsx: pre-existing untracked reference, untouched.

Ignored output/playwright, .playwright-cli, browser/test evidence and older profiles are excluded. Leave them out; no cleanup or reuse. No stage/commit/push performed. Stop after Phase 14G.
