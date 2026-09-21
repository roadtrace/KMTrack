// Guards the global header: shown on every tab, wordmark swapped for the map's
// live station/coords, and the clock moved into the instrument footer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(require.resolve('./index.html'), 'utf8');
const design = fs.readFileSync(require.resolve('./design-system.css'), 'utf8');

test('the header is global, not inside the Capture view', () => {
  const headerAt = html.indexOf('<div class="top-shell">');
  const viewAt = html.indexOf('id="inspection-view"');
  assert.ok(headerAt > -1 && viewAt > -1);
  assert.ok(headerAt < viewAt, 'the header must sit before the views so it shows on every tab');
  // Exactly one header.
  assert.equal((html.match(/<header>/g) || []).length, 1);
});

test('the header carries the mark, a two-tone wordmark, the sync control and reload', () => {
  assert.match(html, /class="header-logo" src="spotit-mark\.svg"/);
  // One artwork serves both themes: the mark's own amber tile keeps the navy
  // reticle legible on the dark bar and on the paper surface alike, so there is
  // no theme swap and no second asset to keep in sync.
  assert.doesNotMatch(html, /header-logo-light/);
  assert.doesNotMatch(design, /header-logo-light/);
  // Reference Brand: "SPOT" in the foreground, "IT" in the brand accent.
  assert.match(html, /id="header-wordmark"><span class="header-brand-name">SPOT<\/span> <span class="header-brand-accent">IT<\/span></);
  // The sync indicator is the header's state control and opens its own panel.
  assert.match(html, /class="sync-menu" id="sync-menu"/);
  assert.match(html, /id="sync-status-text" role="status"/);
  assert.match(html, /id="sync-panel-title"/);
  // Two separate actions: syncing must never navigate.
  assert.match(html, /id="sync-now-btn">Sync now</);
  assert.match(html, /id="reload-app-btn">Reload app</);
  assert.match(html, /class="header-refresh" id="net-refresh" aria-label="Reload app"/);
  assert.match(design, /\.header-wordmark\[hidden\]\{display:none;\}/);
});

test('the header uses the shared surface and control values', () => {
  // TRACE structure: a square, solid band closed by a saturated accent rule.
  // The app keeps its own dark surface rather than the dashboard's blue.
  const bar = design.slice(design.indexOf('html:root .top-shell header{'), design.indexOf('html:root .top-shell header{') + 800);
  assert.match(bar, /justify-content:space-between/);
  assert.match(bar, /background:var\(--ds-bg\)/);
  assert.match(bar, /border-bottom:2px solid var\(--brand-accent\)/);
  assert.match(bar, /padding:12px 16px/);
  assert.match(bar, /padding-top:max\(12px, env\(safe-area-inset-top\)\)/);
  // The inline navy gradient, rounded corners and shadow must all be reset.
  assert.match(bar, /border-radius:0/);
  assert.match(bar, /box-shadow:none/);
  // Brand: 40px square mark, 12px gap, 18px uppercase two-tone wordmark.
  assert.match(design, /\.header-logo\{[\s\S]{0,200}?width:40px/);
  assert.match(design, /\.header-brand\{[\s\S]{0,420}?gap:12px/);
  const word = design.slice(design.indexOf('.header-wordmark{'), design.indexOf('.header-wordmark{') + 340);
  assert.match(word, /font-size:18px/);
  assert.match(word, /font-weight:700/);
  assert.match(word, /letter-spacing:-\.01em/);
  assert.match(word, /color:var\(--ds-fg\)/);
  assert.match(design, /\.header-brand-accent\{color:var\(--brand-accent\);\}/);
  // The accent is a brand token taken from the mark's amber, not --primary.
  assert.match(design, /--brand-accent:\s*#FFBE00/);
  // StatusPill contract: fully rounded, 11px bold, holding the 44px control
  // height so the whole pill is a valid touch target.
  const pill = design.slice(design.indexOf('.sync-menu > summary{'), design.indexOf('.sync-menu > summary{') + 600);
  assert.match(pill, /min-height:var\(--ds-control-min\)/);
  assert.match(pill, /border-radius:var\(--radius-full\)/);
  assert.match(pill, /font-size:11px/);
  // One tone rule per state, from the system's StatusPill vocabulary.
  assert.match(design, /\.sync-menu\[data-sync-state="synced"\] > summary\{[^}]*color:var\(--ds-secondary\)/);
  assert.match(design, /\.sync-menu\[data-sync-state="pending"\] > summary,[\s\S]{0,80}?color:var\(--ds-warning\)/);
  assert.match(design, /\.sync-menu\[data-sync-state="failed"\] > summary,[\s\S]{0,80}?color:var\(--ds-error\)/);
  assert.match(design, /\.header-refresh\{[\s\S]{0,400}?min-height:var\(--ds-control-min\)/);
  assert.match(design, /\.header-actions\{[\s\S]{0,120}?gap:var\(--ds-space-2\)/);
});

test('the map swaps the wordmark for its station and status, in place', () => {
  // The elements never move, so their existing writers keep working.
  assert.match(html, /id="header-map-context"[\s\S]{0,220}?id="map-km-station"[\s\S]{0,220}?id="map-status"/);
  assert.match(html, /function syncHeaderContext\(viewName\)/);
  assert.match(html, /wordmark\.hidden = isMap;/);
  assert.match(html, /context\.hidden = !isMap;/);
  // The map's own topbar and theme control are gone.
  assert.doesNotMatch(html, /class="map-topbar"/);
  assert.doesNotMatch(html, /id="map-theme-toggle"/);
  assert.match(html, /const toggles = \[document\.getElementById\('theme-toggle'\)\];/);
});

test('the map fills the viewport minus the tab tray AND the global header', () => {
  assert.match(design, /\.map-view\{[^}]*height:calc\(100dvh - var\(--app-header-h,0px\) - var\(--app-nav-h\)\)/);
  assert.match(design, /\.map-view\{[^}]*min-height:0/);
  // The header height moves with the safe-area inset and the logo, so it is measured.
  assert.match(html, /function syncHeaderHeight\(\)/);
  assert.match(html, /setProperty\('--app-header-h'/);
  assert.match(html, /ResizeObserver\(syncHeaderHeight\)/);
});

test('the live inspection time sits below the header and outside location details', () => {
  const header = html.slice(html.indexOf('<div class="top-shell">'), html.indexOf('id="inspection-view"'));
  assert.doesNotMatch(header, /id="capture-session-time"/);
  const session = html.slice(html.indexOf('class="capture-session-bar"'),html.indexOf('<main>'));
  assert.match(session,/Live inspection/);
  assert.match(session,/id="capture-session-time"/);
  const foot = html.slice(html.indexOf('class="instrument-foot"'), html.indexOf('class="instrument-foot"') + 400);
  assert.match(foot, /id="lat"/);
  assert.doesNotMatch(foot, /capture-session-time/);
  assert.match(foot, /id="clock-saved"/);
});

test('the location footer contains coordinates and the saved count only', () => {
  const foot = html.slice(html.indexOf('class="instrument-foot"'), html.indexOf('class="instrument-foot"') + 400);
  assert.doesNotMatch(foot, /capture-session-time/);
  assert.match(foot,/id="clock-saved">0 saved/);
  assert.match(foot, /class="foot-separator"[^>]*>·</);
});

test('syncing and reloading are separate actions', () => {
  assert.match(html, /function updateNetStatus\(\)/);
  assert.match(html, /navigator\.onLine !== false/);
  assert.match(html, /window\.addEventListener\('online', updateNetStatus\)/);
  assert.match(html, /window\.addEventListener\('offline', updateNetStatus\)/);
  assert.match(html, /getElementById\('net-refresh'\)\.addEventListener\('click', reloadApp\)/);
  assert.match(html, /getElementById\('reload-app-btn'\)\.addEventListener\('click', reloadApp\)/);
  assert.match(html, /getElementById\('sync-now-btn'\)\.addEventListener\('click', syncNow\)/);
  // Syncing must NOT navigate — a page reload can never be its side effect.
  const start = html.indexOf('async function syncNow()');
  const end = html.indexOf('// ---------- Header: connection status + reload ----------');
  assert.ok(start > -1 && end > start, 'syncNow() must be found');
  const syncNow = html.slice(start, end);
  assert.doesNotMatch(syncNow, /location\.reload\(\)/);
  assert.match(syncNow, /await syncQueue\.drain\(entries\)/);
  // Reload flushes the queue first, so an in-flight upload is not cut off.
  const reloadApp = html.slice(html.indexOf('async function reloadApp()'), html.indexOf('async function reloadApp()') + 700);
  assert.match(reloadApp, /await syncQueue\.drain\(entries\)/);
  assert.match(reloadApp, /window\.location\.reload\(\)/);
});

test('the indicator distinguishes all six sync states from real data', () => {
  assert.match(html, /function syncState\(counts, online, ready, syncing\)/);
  // Priority, most actionable first: running sync, failures, waiting work, then
  // connectivity, then the quiet states.
  assert.match(html, /if\(syncing\) return 'syncing';/);
  assert.match(html, /if\(counts\.failed > 0\) return 'failed';/);
  assert.match(html, /if\(ready && counts\.pending > 0\) return 'pending';/);
  assert.match(html, /if\(!online\) return 'offline';/);
  assert.match(html, /if\(counts\.total > 0 && counts\.pending === 0 && counts\.failed === 0\) return 'synced';/);
  assert.match(html, /return 'local';/);
  // Each state carries copy and one of the system's four tones.
  assert.match(html, /syncing:\{tone:'warn',/);
  assert.match(html, /failed: \{tone:'bad',/);
  assert.match(html, /pending:\{tone:'warn',/);
  assert.match(html, /offline:\{tone:'bad',/);
  assert.match(html, /synced: \{tone:'fresh',/);
  assert.match(html, /local:  \{tone:'neutral',/);
  // Counts come from the queue's own summary, never a parallel counter.
  assert.match(html, /SPOTITSync\.summary\(entries\)/);
  for(const id of ['sync-total','sync-pending','sync-synced','sync-failed']){
    assert.match(html, new RegExp(`id="${id}"`));
  }
  // The panel is honest while there is no transport to sync with.
  assert.match(html, /Cloud sync is not configured yet/);
});

test('the sync indicator exists once, in the global header', () => {
  assert.equal((html.match(/id="sync-status-text"/g) || []).length, 1);
  assert.equal((html.match(/id="sync-menu"/g) || []).length, 1);
  // The old Log-tab chip and its dead CSS are gone with it.
  assert.doesNotMatch(html, /sync-status-chip/);
  assert.doesNotMatch(design, /\.ds-chip-sync/);
  // The map context swap is untouched.
  assert.match(html, /wordmark\.hidden = isMap;/);
});

test('a reload comes back to the same tab and map position', () => {
  // The reload is a recovery action, so it must not cost the inspector their
  // place. Both are remembered for the SESSION only, so a fresh launch is clean.
  assert.match(html, /function rememberActiveView\(viewName\)/);
  assert.match(html, /sessionStorage\.setItem\(STORAGE_KEY_ACTIVE_VIEW, viewName\)/);
  assert.match(html, /function restoreActiveView\(\)/);
  assert.match(html, /restoreActiveView\(\);/);
  assert.match(html, /function rememberMapView\(\)/);
  assert.match(html, /function loadMapView\(\)/);
  assert.match(html, /function applySavedMapView\(\)/);
  assert.match(html, /osmMap\.on\('moveend',rememberMapView\)/);
  assert.match(html, /osmMap\.on\('zoomend',rememberMapView\)/);
  // A restored view must not be yanked onto the current fix, which would discard
  // exactly the position the reload was meant to keep.
  assert.match(html, /if\(saved\) osmHasCenteredOnLocation = true;/);
  // The map has no size while its tab is hidden, so the view is re-asserted once
  // the pane has been measured.
  assert.match(html, /osmMap\?\.invalidateSize\(false\);[\s\S]{0,120}?applySavedMapView\(\)/);
  // sessionStorage, not localStorage: a reload keeps it, a fresh launch does not.
  assert.doesNotMatch(html, /localStorage\.setItem\(STORAGE_KEY_ACTIVE_VIEW/);
});
