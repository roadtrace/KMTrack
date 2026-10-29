# Phase 14E — More tab redesign

October 6, 2026 (Asia/Manila). Approved scope: reorganize existing Settings utilities into More, using the attached layout references and existing theme tokens. Implementation is uncommitted. No staging, commit, push, live backend access, or backend writes performed.

## 1. Summary

Settings is now presented as More. One shared landing page opens six detail screens; all 26 existing Settings element IDs are retained. Existing controls and event handlers are reused. No second settings store, dataset loader, theme engine, auth controller, record store, or transport was introduced.

## 2. More visual result

Account contains Profile & team. Inspection contains Location & corridor and Calibration datasets. Application contains Appearance, Storage & offline data, and Diagnostics. The exact subtitle is “Settings, datasets, storage, and diagnostics”. Grouped rounded cards use icons, inset dividers, and chevrons. Each detail page has a More back button; Escape returns focus to its opening row. The bottom tab has the More visible and accessible label and existing amber accent.

## 3. Light / Dark theme result

One markup structure uses the existing `--ds-*` background, card, border, text, and primary tokens. No parallel palette or new font loading. Space Grotesk headings, Inter controls/body, and DM Mono diagnostic values reuse local fonts. Both themes were visually inspected in fresh synthetic Edge.

## 4. Profile & team result

The existing auth identity/state/actions and device inspector identity input are retained. Additional read-only supported fields come directly from `authDisplayState.profile` and auth state: full name, email, role, team, approval, mode, and cloud verification. No identity keys, tokens, directory, invented profile fields, or new account mutations. Synthetic approved Inspector, Guest, sign-out, and Guest sign-in navigation were exercised. Guest inspector preference persistence was verified.

## 5. Location & corridor result

Existing alignment count, accuracy, and last-fix readouts remain. Existing location-permission/corridor guidance is presented here. GPS, stationing, corridor resolver, interchange/bridge calculations, datasets, and permission logic are unchanged. Physical GPS is not proven by synthetic UI checks.

## 6. Calibration datasets result

The original network data drawer, alignment/ramp statuses and badges, and both Reload controls remain single instances. Entering the detail screen opens the existing drawer. Browser wrappers confirmed clicks called the real original `loadCalibrationDataset(true)` and `loadRampDataset(true)` functions and completed loading the local project datasets (20,478 alignment points; 448 lines for 21 sites). No loader/cache changes.

## 7. Appearance result

The original theme switch calls the original theme function and persists the original preference key. Dark uses the existing absent `data-theme` attribute convention. Switch target is now 44px high, verified in both themes. No other tab theme behavior was changed.

## 8. Storage & offline result

Original installation/offline instructions, storage/connection indicators, and storage error node are retained. Read-only information counts durable accessible device inspections and unique local photo references, and reports local storage writability. References are explicitly distinct from verified image bytes. No clearing actions, storage mutations, or sync changes were added. Guest/account isolation and sign-out preservation remain governed by the original implementation. Offline Diagnostics was exercised; installed-PWA offline launch remains a manual check.

## 9. Diagnostics result

`more.js` reads existing state through a presentation adapter. It reports app build v242, online/offline state, existing dataset status text, latest valid acknowledgement time among current durable device records, device inspection count, unique local photo references, and existing sync-summary pending/submitting/failed/review/unsaved counts. It separately reports actual worker registration/control state and existing shell cache names using read-only browser APIs.

Dataset versions are Not available because no authoritative version metadata is supplied. Photo bytes are Not checked. Missing acknowledgement timestamps are Not available; no acknowledgements among device records is Never synced. This is not global sync history. Pending review is separate from failed submission. Cloud projections are not added to device counts. Photo transport stays disabled. No private paths, secrets, or raw backend internals are displayed.

Synthetic pending/failed/review/synced/local/photo-reference states and reactive changes were verified, including failed count increasing from 1 to 2 while pending decreased from 1 to 0. Offline Connection updates correctly. Worker registration was deliberately blocked during guarded testing, yielding accurate Not registered / No shell cache found states. Actual installed worker upgrade is not verified.

## 10. Legacy Settings / Tools migration result

Internal settings IDs and saved destination remain. `settings`, `settings-tab`, `settings-view`, `tools`, `tools-tab`, `tools-view`, and `more` resolve to the existing settings view with the More landing page. Reload from a saved tools-view state was exercised. No normal Tools tab returned.

## 11. Mobile result

All six detail screens and the landing page were checked in Light and Dark at 390×844 and 414×844: no horizontal overflow. Landing rows measured 76px; icons are 44px; back/action buttons and the theme switch have at least 44px targets. The inspector field has a 44px minimum. Long profile/dataset/diagnostic values wrap. Long detail pages scroll normally above the existing bottom navigation. Visual screenshots are ignored under `output/playwright/phase14e-*`.

## 12. Test / regression results

- Focused Phase 12–14 regression plus 5 More checks: 718/718 passed, zero failures/skips/cancellations.
- Legacy eight-file surface suite: 60 total, 32 passed, 28 failed. Independently compared all failing titles against the stored Phase 14D baseline: identical. No whole-suite pass claim.
- Syntax: 35 application JS files plus 2 inline scripts passed; new helper/test separately passed `node --check`.
- `git diff --check` passed (existing Windows line-ending notices only).
- Source comparison: all 26 original Settings IDs retained; body markup preceding Settings (unrelated tabs) byte-identical to HEAD. Functional engines remain unchanged.
- Browser: fresh isolated Edge; synthetic SDK and external-request guards installed before localhost navigation; no credentials/live backend; no page errors in final completed runs. Both dataset reload functions, original theme persistence, screen navigation, legacy routes/reload, approved synthetic profile, sign-out gate, Guest utilities/identity/sign-in, Escape/focus restoration, diagnostics state changes and offline presentation passed.
- Cache v241 → v242, with `more.js` and `more.css` included. Existing version assertions updated; the obsolete test prohibition on a More navigation label removed while Team export/transport prohibitions remain.

Evidence: ignored `output/playwright/phase14e-regression.tap`, `phase14e-surface.tap`, `phase14e-browser-result.txt`, `phase14e-final-ui.txt`, `phase14e-extra-ui.txt`, screenshots and guarded harnesses. Harness selector/theme/fixture setup issues were corrected before completed runs. The isolated browser ended signed out and closed; the task's localhost server was stopped. Old profiles and prior evidence were not reused or cleaned.

## 13. Remaining manual checks

Published/installed v242 upgrade and offline app-shell launch; physical iPhone touch/scroll and camera/GPS; real approved authenticated account/profile verification and production offline/revocation behavior. Synthetic approved state does not prove live backend behavior. Existing 28 legacy surface failures remain debt. No additional phase is authorized by these limitations.

## 14. GitHub Desktop handoff

Commit message: `Redesign Settings as More with grouped utilities and device diagnostics`

Description:

Reorganize existing Settings utilities into the approved More landing page and six detail screens in both current themes. Retain existing controls, account state, dataset reloads, theme persistence and Settings/Tools navigation compatibility. Add read-only device diagnostics that distinguish submission failures, review holds, and photo references; bump and cache app assets at v242.

Validation: 718 focused tests passed; legacy surface results remain 32 passed / 28 baseline-matching failures. Both mobile widths/themes and synthetic account/offline states verified. Installed-PWA and physical/live-account checks remain manual.

File checkboxes (every modified or untracked file at completion):

- ✅ CHECK — `index.html`
- ✅ CHECK — `more.css`
- ✅ CHECK — `more.js`
- ✅ CHECK — `more.test.js`
- ✅ CHECK — `sw.js`
- ✅ CHECK — `PHASE14E_MORE_TAB.md`
- ✅ CHECK — `cloud-records.test.js`
- ✅ CHECK — `foreground-sync.test.js`
- ✅ CHECK — `guest-claim.test.js`
- ✅ CHECK — `log-register.test.js`
- ✅ CHECK — `map-records.test.js`
- ✅ CHECK — `photo-pilot.test.js`
- ✅ CHECK — `photo-sync.test.js`
- ✅ CHECK — `preapproval-review.test.js`
- ✅ CHECK — `sync-runner.test.js`
- ✅ CHECK — `team-records.test.js`
- ⬜ UNCHECK — `AGENTS.md` (pre-existing unrelated modification)
- ⬜ UNCHECK — `.codex/HANDOFF.md` (pre-existing untracked)
- ⬜ UNCHECK — `.codex/skills/handoff/SKILL.md` (pre-existing untracked)
- ⬜ UNCHECK — `references/kmtrack_new_table columns format.xlsx` (pre-existing untracked)

Ignored browser evidence, `.playwright-cli/`, output artifacts and prior profiles: leave out. No staging, commit or push performed. Stop after Phase 14E.
