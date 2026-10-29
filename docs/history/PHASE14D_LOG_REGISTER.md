# Phase 14D — Log register UI redesign

October 6, 2026 (Asia/Manila). The approved implementation and local deterministic/synthetic validation are complete. Changes remain local and uncommitted. User acceptance, publication and physical-device checks remain pending. Stop after Phase 14D.

## 1. SUMMARY

Redesigned the Log register around the supplied mobile reference, retaining the existing editable local bottom sheet and submitted read-only details. Added compact scope controls, search, staged filters, removable chips, a Data Actions sheet and compact record cards. Cache v240 → v241; production photo transport remains disabled.

Before editing, read the applicable parent/repository AGENTS, handoff, project context, Supabase architecture, implementation plan and Phase 14A reports; inspected the current implementation and independently verified Git. The handoff's repository state had advanced: local main and its tracking ref were at `44335c9a1f977b704b37bf52096ab562ec84e6ec`, Add scoped Team Map with clustering and incremental canvas rendering. No fresh remote lookup was performed. Initial unrelated AGENTS.md, .codex/ and references/ changes were preserved. The user explicitly approved the bounded Phase 14D plan.

No new record store, query system, framework, dependency, theme system, cloud persistence, Realtime, cloud export, backend change or production fixture. No staging, commit or push.

## 2. LOG VISUAL REDESIGN

Log now uses the fixed Inspection Log heading and subtitle, amber active scope, one search field, nearby result/coverage count, Filter and Data Actions controls, a compact Refresh/Load more/Select row, and elevated rounded cards. Existing supported device actions remain available under each applicable card's Device actions disclosure.

The shared Capture/Log register still has one list and one renderer. Capture keeps its existing capped recent-record presentation and ignores Log filters. Global header, navigation, Capture, Settings and Map styling were not redesigned; Settings retains its name.

## 3. DARK / LIGHT THEME RESULT

Both themes use the existing palette and switching mechanism. Dark retains navy surfaces, subtle borders and readable chips; Light uses the existing warm light surfaces, borders and contrast tokens. Amber marks the active scope and primary actions. Log and its two new sheets use locally vendored Inter, Space Grotesk and DM Mono; no font download or new font asset was introduced.

New CSS is restricted to #log-view and .register-sheet. Dark/Light Log, filter and Data Actions screenshots were captured after theme styles settled and visually inspected. Shared theme styles and popup-specific CSS were not edited.

## 4. SCOPE / SEARCH / FILTER RESULT

My Records remains the signed-in default. Team uses the existing verified current-team controller. Imported selects the existing device archive source; individual batch filtering and provenance remain available. Guest keeps device records, with Team and Imported scope buttons hidden according to existing permissions. Map and Log scope remain independent.

Search matches available human fields: station text/numeric KM, defect, corridor, bound/lane, reliable local/import inspector, interchange/segment and notes. It excludes UUIDs, owner IDs, emails and private paths. It filters the current presentation only and is debounced by 120 ms; no remote search or directory query.

The filter sheet supports existing dates/type/source/inspector plus corridor, bound, lane, device-photo availability and separate inspection state. Names remain unavailable for My/Team cloud history; Team hides unsupported inspector/device-photo filters. Device-photo filtering explicitly selects device records only and makes no claim about cloud bytes. Options come from accessible device/loaded records, with no All Teams category.

Draft controls do not change the live list until Apply. Cancel/Escape restores applied values. Reset, Apply Filters (count), removable chips and Clear all work; Clear all retains the active archive scope. Filters survive detail open/close. A change of draft source updates the applicable options. The only temporary filter snapshot is the sheet's cancel/apply draft, not a second record store.

## 5. RECORD CARD RESULT

Cards show defect · KM · bound, then lane, available inspector and compact Manila date/time, followed by useful source and separate inspection/photo status. No technical IDs or Storage paths are exposed. Whole cards are tappable and keyboard accessible. Existing local action nodes and their guards/listeners are retained when decorating a card; local selection checkboxes appear only in selection mode.

Neutral evidence tiles indicate records/local photo references. The prior register had no reusable thumbnail asset, so this phase does not read IDB images or download cloud photos to manufacture scrolling thumbnails. Existing photo viewing remains explicit. No durable thumbnail cache or eager photo transport was added.

## 6. CURRENT LOCAL POPUP PRESERVATION RESULT

Popup markup, editable field population, Save/Delete/Add Photo handlers, camera/photo association path, bottom-sheet behavior and shared theme CSS remain unchanged. New local cards continue to open the same openEditModal path. No compatibility edit to the popup was necessary.

Synthetic full-app checks exercised local tap and Enter, Save of a lane change, Delete and existing Undo, and Add Photo through the real camera capture/storage handlers using a generated canvas stream. Saved/raw photo bytes were found in the isolated photo store; coordinates and KM were retained. This is synthetic camera validation, not physical camera certification.

Compared the same 390×520 popup fixture against the independently extracted committed application in a separate browser context. The opaque popup interior had **zero differing pixels in both themes**. Dark/Light differences of 399/555 pixels were confined to the rounded top edge/backdrop, where the redesigned page behind the popup differs. Source preservation checks normalize checkout line endings.

## 7. CLOUD / TEAM READ-ONLY DETAIL RESULT

Cloud-only My and all Team cards reuse the unchanged openSubmittedDetail and existing private viewers. They have no local array index, checkbox, swipe mutation, Save/Delete, retry, review or upload controls. Enter/Space are handled by the read-only card path; the local keyboard handler now explicitly rejects cards without a device index. Team own-row local context remains informational and directs device actions to My Records.

Synthetic Team history included own and teammate-owned rows. No mutation controls were present. Existing submitted detail opened for My and Team. An explicit synthetic private Team-photo view passed hash/association checks and revoked its temporary URL on close; scrolling performed zero photo downloads. That photo example was an own Team row; deterministic viewer tests separately cover teammate authorization. Live private Storage policy/success was not revalidated.

## 8. DATA ACTIONS RESULT

One sheet now houses the original Import button/file input, imported-file management, and the original Excel/Excel-with-photos buttons. Import accepts the existing Excel or Photos ZIP formats. Export scope is explicitly selected and counted before generation: selected device records, filtered device records, or all eligible accessible device records.

Filtered/selected exports use local references from the current register projection. All uses the existing accessible device set. Export intent is consumed synchronously before the existing asynchronous name/workbook pipeline freezes its snapshot. Empty selected exports cannot fall back to exporting other visible records. Team export is disabled in the sheet and rejected at the export handler boundary.

The currently supported photo export is Excel with native embedded photos. No new Photos ZIP export option was invented; Photos ZIP import remains supported.

## 9. SELECTION MODE RESULT

Default cards have no permanent checkboxes. Select/Cancel, selected count, Select all, supported device export and separately styled batch Delete retain existing handlers. Switching scope clears incompatible selection. Team cards cannot acquire device selection or deletion capabilities.

Browser checks selected one of ten projected local records while excluding cloud rows and imported archive rows from My selection, then generated a one-record selected workbook. A deterministic test runs the actual existing batch-delete handler with a selected device record and an absent cloud-only UUID: only the device record and its two local photo keys are removed. Local Delete/Undo was separately exercised in the browser. No production record was deleted.

## 10. STATUS WORDING RESULT

Inspection chips distinguish Saved on device, Waiting to submit, Submitting inspection, Inspection submitted, Needs review and Imported. Photo state remains separate, using existing acknowledgement/normalization rules. A submitted inspection is not labelled pending because photo transport is disabled. Interrupted photo-upload state remains waiting to reconcile, consistent with the existing normalizer.

Guest/preapproval holds, divergence, not-saved warnings, reserved/unavailable photos and disabled pilot upload notices remain visible where applicable. Existing review/retry/preparation controls retain their eligibility conditions. No generic Synced assertion was introduced.

## 11. IMPORT / EXPORT PRESERVATION

Excel schema/builders, native-cell photo writer, ZIP parser, duplicate/conflict planner, import normalization/provenance, inspector attribution, photo association and Undo handlers remain unchanged. Synthetic checks passed:

- Excel import added one device archive record with the original KM.
- Identical reimport reported one duplicate and disabled confirmation.
- Supported Photos ZIP imported one record and a valid local JPEG.
- Invalid synthetic workbook was rejected without committing it.
- Import Undo removed only the newest synthetic batch and retained the earlier batch.
- Actual selected Excel download re-parsed as one device record, zero photos, zero issues and zero cloud rows.
- Actual Excel-with-photos download re-parsed as two archive records, one embedded photo, zero issues and zero cloud rows.
- All scope correctly counted 102 device records before Undo; no cloud photo download occurred during sharing checks.

Conflict/compatibility regressions also passed in the focused suite. Workbook and ZIP format code was not modified.

## 12. OFFLINE / AUTH / ERROR STATES

Operational messaging distinguishes offline, Guest, sign-in, approval, missing team, online verification and unavailable permission. Empty states distinguish no records, no filtered results, no archive records, unavailable/loading Team history and empty loaded Team history. Loading/error-only updates can change an existing empty message without rebuilding the list.

Synthetic failed Team refresh retained 250 authorized cards and 100 local records, with refresh failure text. A failed first Team read stopped showing Loading; a successful empty read showed No Team inspections in the loaded history. Offline cleared both cloud collections, disabled Team and preserved 100 device records. Reconnect loaded 50 fresh My rows. Sign-out cleared cloud/detail state and preserved 100 saved device records. New filter/Data Actions sheets close on existing authorization invalidation.

Guest displayed local-mode guidance, empty local state and hidden unauthorized scopes. Final isolated synthetic account was signed out before the browser closed. No live auth/team/account revocation or production RLS assertion is inferred from these checks.

## 13. PERFORMANCE RESULT

The existing 100 ms cloud-notification coalescer and stable scope/revision/filter signature remain in use. A 100-notification burst retained the existing Team card node after the latest page revision had rendered. Loading/error-only notifications update controls instead of rebuilding unchanged cards. No eager thumbnails, cloud-photo download, new persistence or unbounded cloud read.

Final synthetic desktop Edge measurements, five synchronous complete Log renders per size:

| Scope | Loaded cloud rows | Device local rows | Rendered cards | Median | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Team | 50 | 100 | 50 | 4.9 ms | 5.5 ms |
| Team | 100 | 100 | 100 | 8.5 ms | 9.5 ms |
| Team | 250 | 100 | 250 | 17.0 ms | 18.0 ms |
| My | 50 | 100 | 150 | 27.8 ms | 36.7 ms |
| My | 100 | 100 | 200 | 28.9 ms | 30.5 ms |
| My | 250 | 100 | 350 | 37.4 ms | 40.5 ms |

The existing 50+1 requests, independent My/Team cursors and five-page/250-row cap were exercised. A sixth Team page retained 250 rows, marked eviction and preserved My's separate 250-row window. Counts describe loaded/retained history, never a complete team total.

Measurements include synchronous filtering/projection/durability and DOM work, not end-to-end paint, network, physical mobile or a large-workspace guarantee. Earlier samples varied. No leak audit or virtualization claim.

## 14. MOBILE VALIDATION

Fresh isolated Edge session at 390×844. Both themes, filter and Data Actions sheets visually inspected. Page and sheets had no horizontal overflow; sheets measured 390 px wide. Scope/toolbar controls measured 44 px minimum, search 46 px and Apply 44 px. Wider 414 px and 768 px checks also had no horizontal overflow. The existing popup remained 390 px wide in both themes.

Keyboard checks passed for cloud and local Enter and filter Escape/cancel. Desktop browser emulation is not a physical iPhone/PWA/camera/GPS certification.

## 15. TEST / REGRESSION RESULTS

- **23-file focused regression: 713/713 passed**, zero failures/skips/cancellations. Includes 34 new Log tests plus all prior 679 Phase 12/13/14A/14B checks.
- **Legacy surface set: 60 tests; 32 pass / 28 fail.** Independently extracted committed `44335c9` baseline has the same 28 failing titles. No new failing title. Three obsolete passing assertions were adjusted/restored for the approved UI placement/text; legacy debt was not repaired outside scope. No full-suite-pass claim.
- Syntax: 34 application JS files and two inline scripts passed. New/changed tests were executed and parsed. Whitespace checks passed.
- Source preservation checks cover popup markup/handlers/shared styles, submitted details/private guards, My/Team stores, filters, Map modules and the import/export format modules.
- Full-app synthetic checks described above completed with zero page errors. The deliberately blocked worker registration produced expected console messages; installed worker behavior was not tested.

Playwright skill was used. External backend traffic was blocked before navigation; the SDK was replaced with a synthetic adapter. Baseline comparison used a separate isolated context. No real account credentials, preserved user profiles, production fixtures or live backend writes. No live backend run was necessary for this presentation-only scope; company-Wi-Fi connectivity was not tested or diagnosed.

Ignored output/playwright/phase14d-* contains sanitized results, synthetic files/downloads, screenshots, the extracted baseline and harnesses. Harness corrections included waits for the existing coalescer, separate baseline storage context, async Guest/ZIP handling and CLI file-picker/dialog behavior. A shell-quoting artifact created during an early diagnostic was removed after confirming it was this task's new output; unrelated files were preserved. The fresh browser was signed out/closed and the localhost server was stopped through its own execution session. Do not rerun phase14d-edit.cjs.

## 16. REMAINING MANUAL CHECKS

User review/acceptance, GitHub Desktop commit/push and publication remain pending. Check installed/published v241, a physical iPhone/Android device, real camera/GPS, real-world keyboard/screen-reader behavior, field paint/scroll performance and very large device workspaces. Live teammate/private-photo and actual role/team/account revocation were not repeated; the existing deterministic/synthetic proof is not live proof. No production record mutation should be used merely to validate this UI.

Neutral evidence tiles are intentional; this phase creates no scrolling thumbnail cache. Inspector filtering remains constrained to reliable device/archive fields. Photo filters describe device references, not a fresh IDB byte inventory. Legacy suite failures remain. No Phase 14C, Realtime, cloud export, backend optimization or further phase is authorized by this report.

## 17. GITHUB DESKTOP HANDOFF

**COMMIT MESSAGE:** Redesign Log register with scoped filters and device data actions

**DESCRIPTION:** Redesign the mobile Log register with My/Team/Imported scope controls, human-field search, staged filter sheet and removable chips, compact status-aware cards, and consolidated Data Actions. Preserve the existing local edit bottom sheet, submitted read-only details, private-photo guards, bounded memory-only history, Capture/Map behavior and device-only import/export formats. Support existing Dark/Light themes, cache v241, retain disabled production photo transport, and add deterministic/synthetic preservation, export-scope, state and mobile checks. Focused tests 713/713; legacy surface failures match the committed baseline.

**FILE CHECKBOXES — select only these 19 Phase 14D files:**

- [ ] index.html
- [ ] log-controls.js
- [ ] log-register.js
- [ ] log-register.css
- [ ] log-register.test.js
- [ ] sw.js
- [ ] my-records.test.js
- [ ] log-list-view.test.js
- [ ] selection-flow.test.js
- [ ] cloud-records.test.js
- [ ] foreground-sync.test.js
- [ ] guest-claim.test.js
- [ ] map-records.test.js
- [ ] photo-pilot.test.js
- [ ] photo-sync.test.js
- [ ] preapproval-review.test.js
- [ ] sync-runner.test.js
- [ ] team-records.test.js
- [ ] PHASE14D_LOG_REGISTER.md

Leave unrelated AGENTS.md, .codex/ and references/ unchecked. Do not include ignored evidence, browser artifacts, downloads or the baseline. The existing .codex/HANDOFF.md was preserved as requested; this report records the current Phase 14D result. HEAD remains `44335c9`; staging is empty. Nothing was committed or pushed. Stop after Phase 14D.
