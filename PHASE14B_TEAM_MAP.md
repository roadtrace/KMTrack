# Phase 14B — scoped Map records, clustering and rendering

October 5, 2026 (Asia/Manila). Phase 14B implementation and bounded deterministic, synthetic and Inspector/Guest read-only validation complete. Acceptance remains with the user. Stop after Phase 14B.

## 1. Summary

Added explicit My/Team Map scope through the Phase 14A presentation controllers, bounded loaded-history controls, UUID marker updates, stable overview clusters, canvas inspection dots and collision-limited KM labels. Cache v239 → v240 includes map-records.js. No new dependency, Realtime, cloud export, durable cloud cache, backend change or production fixture.

Read parent/repository AGENTS.md, handoff, Phase 14A.1/14A.2/14A.3 reports, context/architecture/implementation plan, MAP_LANDMARKS.md, relevant DESIGN.md basemap/GPS notes and Phase 13F responsiveness report. User explicitly accepted and committed/pushed Phase 14A.3. Independently verified local main at 0c2a3786fd9c41ab0f72152c784c8f78c7d69e68, clean staging, matching tracking ref and initial unrelated AGENTS.md/.codex/references work. GitHub connector GET refs/heads/main independently returned that same commit. Direct git network/Schannel failed; it was not treated as proof of an app failure. Public Supabase auth endpoint and guarded live-browser connectivity returned HTTP 200.

## 2. Map data architecture

map-records.js is a pure memory-only projection of normalized presentation items. Signed-in My consumes myRecords.records(), retaining the existing UUID merge, local-primary holds and owned current-team cloud history. Team consumes teamRecords.records(), which checks fresh verified scope against the shared Team read-store snapshot. Guest consumes normalized accessible device items. Imported archives stay separate within My/device source filtering; their keys namespace the original UUID with import batch provenance so an archive cannot replace an engineering UUID.

Projection carries UUID, stable render key, scope, display source, numeric coordinates, Manila inspection time, defect, expressway, bound, lane, KM, inspection/photo status, local-action/read-only capability and detail identity. It skips missing/non-numeric/out-of-range coordinates; it never parses coordinate/KM display text or relocates invalid data. Submitted metres convert to kilometres through existing cloudDisplay. Engineering records deduplicate by UUID; imported copies remain distinct. No Map query implementation, localStorage parsing, persistence or sync acknowledgement is introduced. The existing Manila formatter is reused rather than constructed per cloud row.

## 3. My / Team Map scope

My is default. Map and Log retain independent last-selected scopes for the current page lifetime; navigating one view does not silently switch the other. Auth invalidation resets Map to My. Switching Map scope closes detail/previews, clears marker selection and incompatible source/inspector filters. Team is disabled without current verified assigned-team authorization and hidden for Guest.

Refresh/Load more reuse each existing store collection and cursor: 50+1 rows per read, five retained pages/250 rows, further paging retaining a bounded window. Log and Map share those loaded collections; they do not create independent unbounded histories. Coverage text distinguishes loaded history, more available, retained-window eviction, loading/error and connection requirements. The Map count describes filtered valid projected records, not complete team history or exact records inside the viewport. Imported archives are not relabeled as current cloud Team history.

## 4. Clustering

Retained the actual Leaflet inspection-layer architecture; MapLibre is only the optional dark basemap. Using MapLibre-only source clustering would omit the light raster path or require a basemap rewrite. No external library was needed: vendored Leaflet 1.9.4 provides canvas dots and normal fitBounds/setView expansion.

Inspection-only 64 world-pixel cells cluster through zoom 14, remain stable during pans and expose individuals at zoom 15+. Cluster anchors average member coordinates solely for overview placement; member coordinates/UUIDs remain exact. Neutral count controls scale their visible circle and retain a 56px target. Mixed groups carry no bound/defect-color claim. Exact co-location opens a UUID-based chooser in pages of 50 so overlapping records remain individually selectable without moving their coordinates.

## 5. KM label density

Broad zoom has no permanent KM label per inspection. Close zoom shows labels only when collision checks find room, avoiding Map controls and previously placed labels. Selected detail always includes KM. A synthetic 50-row coincident set rendered 50 exact canvas dots with only two readable labels at high zoom. Existing landmark/interchange labels remain separate and unchanged.

## 6. Individual selection and photos

Canvas/label taps resolve the nearest exact geographic record and pass UUID identity. My local/device archive resolves its current local reference to the existing editor; My cloud-only and all Team rows open submitted read-only detail. No teammate/local ownership is inferred from visibility. Reorder tests and actual Guest local-detail checks cover device selection.

My/Team Map detail reuses the existing explicit private viewer factories with a fresh current-item callback keyed to Map detail scope, independent of Log. No marker photo download. Generated-JPEG synthetic tests opened each viewer only via View photo and proved temporary URL revocation. Existing association/hash/scope/private-bucket contracts, upload behavior and disabled production photo transport remain unchanged. Live photo success was not claimed; live validation made zero Storage requests.

## 7. Landmarks / interchanges

renderLandmarks, landmark datasets, surveyed/calibrated positions, interchange matching, GPS/stationing and basemap camera synchronization are unchanged. Inspection clusters/canvas use osmEntryLayer; landmarks use osmLandmarkLayer. Prior light/dark basemap synchronization behavior is preserved in source. Synthetic external tile traffic was blocked, so this phase does not claim a fresh production-tile or physical GPS/camera validation.

## 8. Incremental render / redraw

Projection diff tracks added/removed/changed/unchanged identities. Inspection-layer descriptors retain unchanged Leaflet objects; only affected dots/cluster membership/labels are changed. Stable row-array plus viewport/zoom/selection identity skips an unchanged layer pass. Pans/zoom or collisions can legitimately change visibility, clusters and label placement.

Cloud loading/error/count-only notifications do not dirty local data or reconstruct unchanged markers. Rapid notifications coalesce at 100ms. Actual full-app 100-notification burst invoked Map rendering once and retained the same marker object. No repeated Map localStorage reads and no authorization snapshot reused across an async boundary. A 5,000-row incremental append/remove touched exactly one added/removed marker and retained the other 5,000.

## 9. Performance results

Isolated desktop Edge, 390×844 viewport, synthetic normalized cloud identities, three samples per size. Final run medians in milliseconds:

| Identities | Projection | Cluster layer update | Individual canvas update | Scope projection/update | Pan/update | One add | One remove |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 100 | 0.5 | 0.4 | 3.2 | 1.2 | 2.8 | 1.4 | 0.9 |
| 500 | 2.1 | 0.6 | 6.0 | 3.5 | 4.0 | 2.4 | 1.7 |
| 1,000 | 6.6 | 1.2 | 10.2 | 6.0 | 5.0 | 5.3 | 2.9 |
| 5,000 | 16.4 | 2.9 | 74.7 | 33.3 | 16.8 | 10.3 | 10.1 |

At 5,000, maxima respectively: 18.7/3.9/82.5/35.5/27.5/10.7/12.5ms. Unchanged layer update rounded to 0.0ms at the browser clock precision. These are synchronous projection/Leaflet/DOM source-update timings; canvas painting, tiles/network, end-to-end frame latency and physical mobile are not included. The scope benchmark projects the same synthetic read-only identities into each scope; live/full-app switching separately validates authorization/collection behavior.

PerformanceObserver reported nine compound benchmark/paint long tasks, maximum 245ms. No zero-jank claim. One non-forced-GC aggregate heap sample was 18,558,295 bytes; it is not per-record memory or a leak audit. Earlier DOM-marker implementation was rejected after >1s high-zoom updates at 5,000. Canvas results varied across runs; report this final run rather than treating one timing as a device guarantee. No production fetch of 5,000 records, fixture or viewport-query optimization.

## 10. Auth / invalidation

Existing full scope tuple, fresh verification, session generations, store epoch guards and stale-response rejection remain authoritative. Sign-out/account/session/team/role/verification/workspace/offline invalidation clears cloud pages, immediately clears inspection layers/selection/count presentation, closes Map detail/photo previews and schedules fresh local presentation. Local storage is untouched. Deterministic tests cover stale Team projection on all these boundaries. Live sign-out cleared both collections, Map projection/layer and detail; actual live team/role/account revocation remains unverified.

## 11. Offline

Team history is removed as current and cannot refresh/load more offline. My local remains usable; synthetic full-app offline preserved and mapped 100 saved local records. Reconnect uses existing verified bounded read-store reload behavior. No durable Team/Map history or photo cache was added.

## 12. Live read-only validation

Fresh isolated Edge; guards installed BEFORE navigation denied all non-GET/HEAD/OPTIONS inspection/profile/Storage operations and blocked unrelated external traffic. User manually signed into approved Inspector. No credentials, raw inspection contents or session/header storage were logged. Worker registration was blocked in this live harness; installed-PWA behavior is not claimed.

My: 50 loaded/projected owned/current-team rows, exact numeric coordinates, zero duplicate UUIDs. Team: 50 loaded/projected current-team rows, all read-only/local:null, independent Log My scope. Read-only Team detail had no mutation controls. Switching My→Team caused zero extra inspection reads. Device entry storage was unchanged and no cloud row became a local entry. Sign-out cleared pages, projected markers, Leaflet layers and detail; Guest scope hidden/Team disabled with zero cloud markers.

All sampled Team rows belonged to current Inspector; teammate-owned live rows remain unverified. Live workspace was empty, so nonempty-local preservation is synthetic, not live evidence. No live private photo success, different-account/team/role revocation, physical mobile/camera/GPS or published PWA check.

Final instrumented invocation: one inspection GET/HTTP200, zero Storage reads, zero blocked write attempts, zero page errors. Earlier startup and the first interrupted harness's My/Team reads are excluded from that counter; one is NOT total session traffic. The first harness checked Team while it was still loading at a fixed 350ms delay; final harness waits for read completion. Original write guards remained active throughout, with no app failure or mutation inferred from that harness error. User signed out before Guest. New test browsers closed and localhost server stopped; old fixture profiles untouched.

## 13. Tests / checks

- Final focused 22-file regression: 679 passed, zero failed/skipped/cancelled; includes 33 new Map checks plus all prior 646 Phase 12/13/14A regressions.
- Surface preservation set: 60 tests, 32 passed/28 failed; independently extracted committed 0c2a378 baseline has the identical 28 failing titles. No full-suite-passing claim; legacy UI/export/map/GPS test debt remains.
- Syntax: 33 application JS files plus two inline scripts; new/changed tests checked. git diff --check passed.
- Actual synthetic full app: My default/lazy Team, bounded paging, scope independence, read-only selection/co-location chooser, exact coordinates, clusters/declustering/label density, 100-notification burst, My/Team explicit generated-photo/revocation, 100-local offline/sign-out preservation, Guest local detail, mobile controls/cluster sizing and no page errors. All live backend traffic blocked.
- Source cache v240/new asset, unchanged local export pipelines and PHOTO_CLOUD_TRANSPORT_ENABLED=false confirmed.

Ignored evidence/harnesses under output/playwright/phase14b-* include synthetic/live results, TAP, mobile PNGs, baseline archive/directory and timing summaries. Never stage/share raw CLI/auth/session logs, profiles or ignored evidence. One-time edit/adaptation scripts must not be rerun.

## 14. Remaining Phase 14C / pilot limits

Phase 14C Realtime remains unstarted. Backend indexes/schema/RLS, cloud exports, durable caches, teammate directories, viewport fetch and write features remain outside scope. Loaded history is bounded/changing, not a transactional snapshot or full-team total. Dense 5,000-individual views still produce long tasks; further optimization needs measured pilot demand. Keyboard record discovery remains available in Log and co-location/label controls; canvas-only dots do not each create a focusable DOM button. Physical/published/live teammate/photo/revocation limits above remain. No blocker required policy weakening, persisted cloud entries, broken landmarks, a large dependency or backend semantics change.

## 15. GitHub Desktop handoff

COMMIT MESSAGE: **Add scoped Team Map with clustering and incremental canvas rendering**

DESCRIPTION: Use existing My/Team presentation controllers for a numeric UUID-based Map projection with independent view scope and bounded loaded-history refresh/paging. Preserve device actions, Guest/import behavior, bound colors, GPS/landmarks and device-only exports. Add stable inspection clusters, canvas dots, readable KM labels, co-location selection and explicit private-photo detail; coalesce notifications and retain unchanged marker objects. Cache v240 and document deterministic, synthetic performance and guarded Inspector/Guest read-only validation with pilot limits. Keep photo transport disabled; no Realtime, backend changes or cloud persistence.

FILE CHECKBOXES — select only these 16 files:

- [ ] map-records.js
- [ ] map-records.test.js
- [ ] map-overlays.js
- [ ] map-overlays.css
- [ ] my-records.js
- [ ] index.html
- [ ] sw.js
- [ ] cloud-records.test.js
- [ ] foreground-sync.test.js
- [ ] guest-claim.test.js
- [ ] photo-pilot.test.js
- [ ] photo-sync.test.js
- [ ] preapproval-review.test.js
- [ ] sync-runner.test.js
- [ ] team-records.test.js
- [ ] PHASE14B_TEAM_MAP.md

Leave unrelated AGENTS.md, .codex/ and references/ unchecked. No staging, commit or push performed; main remains 0c2a378. User handles review/acceptance and GitHub Desktop. Stop after Phase 14B.
