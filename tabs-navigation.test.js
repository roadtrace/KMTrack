// Guards the five-tab shell and where the data controls live.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(require.resolve('./index.html'),'utf8');
const controls = fs.readFileSync(require.resolve('./log-controls.js'),'utf8');
const design = fs.readFileSync(require.resolve('./design-system.css'),'utf8');

test('network disclosure reports loading, available, cached and failed sources honestly',()=>{
  const elements = Object.fromEntries(['dataset-drawer','dataset-state-label','calib-status','ramp-status','calib-badge','ramp-badge'].map(id=>[id,{dataset:{},textContent:''}]));
  const source = html.match(/function updateDatasetDrawerState\(\)\{[\s\S]*?\n\}/)[0];
  const context = vm.createContext({document:{getElementById:id=>elements[id]}});
  vm.runInContext(source,context);
  for(const [calib,ramp,expected] of [
    ['loading','loading','Checking datasets…'],
    ['ready','loading','Checking datasets…'],
    ['ready','ready','Both sources ready'],
    ['cached','ready','Available on this device'],
    ['cached','cached','Available on this device'],
    ['error','ready','1 of 2 sources available'],
    ['cached','error','1 of 2 sources available'],
    ['error','error','Network data unavailable']
  ]){
    elements['calib-status'].dataset.state = calib;
    elements['ramp-status'].dataset.state = ramp;
    context.updateDatasetDrawerState();
    assert.equal(elements['dataset-state-label'].textContent,expected);
    assert.equal(elements['calib-badge'].dataset.state,calib);
    assert.equal(elements['ramp-badge'].dataset.state,ramp);
  }
  assert.equal(elements['calib-badge'].textContent,'Unavailable');
});

test('the tab bar exposes inspection, log, map, tools and settings',()=>{
  for(const view of ['inspection','log','map','tools','settings']){
    assert.match(html,new RegExp(`data-app-view="${view}"`));
    assert.match(html,new RegExp(`id="${view}-view"`));
  }
  // Five columns now that Log exists.
  assert.match(design,/\.app-tab-bar\{[^}]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});

test('bottom navigation uses each theme’s surface and teal accent',()=>{
  assert.match(design,/\.app-tab-bar\{[^}]*background:#1b2737/);
  assert.match(design,/html\[data-theme="light"\] \.app-tab-bar\{[^}]*background:var\(--ds-card\)/);
  assert.match(design,/html\[data-theme="light"\] \.app-tab-btn\{color:var\(--ds-fg-muted\)/);
  assert.match(design,/\.app-tab-btn\.active,\s*html\[data-theme="light"\] \.app-tab-btn\.active\{[^}]*background:transparent;[^}]*color:var\(--ds-secondary\)/);
  assert.match(design,/\.app-tab-btn:focus-visible\{[^}]*outline:2px solid var\(--ds-secondary\)/);
  assert.match(design,/\.app-tab-btn\.active::after\{[^}]*background:currentColor/);
  assert.doesNotMatch(design,/:is\(\.lane-btn,\.app-tab-btn,\.switch,\[role="button"\]\):focus-within/);
  assert.match(design,/--app-nav-h:calc\(64px \+ env\(safe-area-inset-bottom\)\)/);
});

test('capture keeps bound correction inside collapsed location details',()=>{
  const capture = html.slice(html.indexOf('id="inspection-view"'),html.indexOf('id="log-view"'));
  assert.match(capture,/id="instrument-details"[\s\S]*id="bound-toggle"/);
  assert.match(capture,/id="segment-tag"/);
});

test('showAppView drives every view from one map of ids',()=>{
  assert.match(html,/const APP_VIEW_IDS = \{/);
  for(const id of ['inspection-view','log-view','map-view','tools-view','settings-view']){
    assert.match(html,new RegExp(`${id.replace('-','\\-')}`));
  }
  assert.match(html,/Object\.keys\(APP_VIEW_IDS\)\.forEach/);
  assert.match(html,/if\(viewName === 'map'\)\{/);
  assert.doesNotMatch(html,/const showMap = viewName === 'map'/);
});

test('one register node is re-parented, never duplicated',()=>{
  // The user needs the log in BOTH tabs for immediate delete access, but the
  // rows, selection and swipe handlers must not fork. Exactly one node.
  assert.equal((html.match(/id="log-register"/g)||[]).length,1,'exactly one register block');
  assert.equal((html.match(/id="log-list"/g)||[]).length,1,'exactly one list');
  assert.match(html,/id="log-host-inspection"/);
  assert.match(html,/id="log-host-log"/);
  assert.match(html,/function mountLogRegister/);
  assert.match(html,/host\.appendChild\(block\)/);
  // The shell must not hand-roll a second list renderer.
  assert.equal((html.match(/function renderLog\(/g)||[]).length,1);
});

test('import/export live in Log; alignment lives in Tools',()=>{
  const log = html.slice(html.indexOf('id="log-view"'),html.indexOf('id="tools-view"'));
  const tools = html.slice(html.indexOf('id="tools-view"'),html.indexOf('id="settings-view"'));
  const settings = html.slice(html.indexOf('id="settings-view"'),html.indexOf('<nav class="app-tab-bar"'));
  for(const id of ['log-export-actions','log-import-actions','import-btn','import-history-btn','import-file','import-status']){
    assert.ok(log.includes(id),`Log should contain ${id}`);
  }
  for(const id of ['dataset-drawer','calib-reload','ramp-reload','calib-status','ramp-status']){
    assert.ok(tools.includes(id),`Tools should contain ${id}`);
  }
  assert.ok(!tools.includes('import-btn'),'Tools should no longer hold import/export');
  for(const id of ['theme-toggle','storage-status']){
    assert.ok(settings.includes(id),`Settings should contain ${id}`);
  }
  assert.ok(!settings.includes('dataset-drawer'),'alignment moved out of Settings');
  // The masthead keeps only the brand and the clock.
  const header = html.slice(html.indexOf('<header>'),html.indexOf('</header>'));
  assert.doesNotMatch(header,/theme-toggle|storage-status|dataset-drawer/);
});

test('log-controls mounts into the Log tab, not Tools',()=>{  assert.match(controls,/getElementById\('log-export-actions'\)/);
  assert.match(controls,/getElementById\('log-import-actions'\)/);
  assert.doesNotMatch(controls,/tools-export-actions|tools-import-actions/);
  assert.doesNotMatch(html,/tools-export-actions|tools-import-actions/);
});

test('the Select panel is gone and Select pairs with the records chip',()=>{
  // The old full-width `.log-action-footer` card under the list is removed.
  assert.doesNotMatch(controls,/className='log-action-footer'/);
  assert.doesNotMatch(controls,/list\.after\(footer\)/);
  // Mounted into the Log tab's head, in the same row as the records chip, so it
  // no longer floats alone on its own row.
  assert.match(controls,/getElementById\('log-select-actions'\)/);
  assert.match(html,/id="log-select-actions"/);
  // Mounted into the Export/Import data row and pushed to its right edge. The
  // bulk actions mount separately, on their own row above. `actions` must stay
  // in scope because sync() toggles `selection-mode` on it.
  assert.match(controls,/let actions=selectMount;/);
  assert.match(controls,/actions\.append\(toggle\)/);
  assert.match(html,/class="ds-row log-select-actions" id="log-select-actions"/);
  assert.match(design,/\.log-head-row\{/);
  assert.match(design,/\.log-head-row \.ds-chip\{margin-top:0;\}/);
  // The chip itself reports the selection, so there is no separate count span.
  assert.doesNotMatch(controls,/selection-count/);
});

test('the Log head carries only the title, chip and Select',()=>{
  const head = html.slice(html.indexOf('id="log-view"'), html.indexOf('log-data-row'));
  assert.match(head,/<h2>Inspection log<\/h2>/);
  assert.match(head,/class="ds-chip"/);
  // The eyebrow and the description were removed as visual noise.
  assert.doesNotMatch(head,/eyebrow/);
  assert.doesNotMatch(head,/Every record keeps the fix/);
});

test('the Log tab uses a Base44 records chip instead of the red badge',()=>{
  assert.match(html,/class="ds-chip"/);
  assert.match(html,/id="log-records-chip"/);
  assert.match(html,/<h2>Inspection log<\/h2>/);
  assert.match(controls,/getElementById\('log-records-chip'\)/);
  assert.match(design,/\.ds-chip\{/);
  // Only the duplicate heading is hidden in the Log tab; the toolbar — and so
  // Select — stays.
  assert.match(design,/\.log-view \.log-header h2\{display:none;\}/);
});

test('the Log tab leads with a bare action row, then the register',()=>{
  const log = html.slice(html.indexOf('id="log-view"'),html.indexOf('id="tools-view"'));
  const row = log.indexOf('log-data-row');
  const reg = log.indexOf('id="log-host-log"');
  assert.ok(row !== -1, 'the action row must exist');
  assert.ok(reg !== -1, 'the register mount must exist');
  // Actions first: a register of hundreds of rows must not push them off-screen.
  assert.ok(row < reg, 'the action row must come before the register');
  // No card chrome around the actions any more.
  assert.doesNotMatch(log.slice(row, reg), /ds-card/);
  assert.doesNotMatch(html, /id="log-export-hint"/);
  assert.match(design, /\.log-data-row\{/);
  assert.match(design, /\.log-data-hint\{/);
  // Export's explanatory line relocated into its dialog.
  assert.match(controls, /export-hint/);
  assert.match(design, /\.export-hint\{/);
});

test('view titles use the reference sentence case, not uppercase',()=>{
  assert.match(design,/h2,\.section-title\{[^}]*text-transform:none/);
  assert.match(design,/\.ds-view-head h2\{[^}]*text-transform:none/);
  assert.match(design,/\.ds-view-head h2\{[^}]*font-size:30px/);
});

test('tab labels are copied from the reference verbatim',()=>{
  const nav = html.slice(html.indexOf('class="app-tab-bar"'), html.indexOf('</nav>'));
  const labels = [...nav.matchAll(/<span>([^<]+)<\/span>/g)].map((m)=>m[1]);
  assert.deepEqual(labels,['Capture','Log','Map','Tools','Settings']);
});

test('buttons follow the shared touch-target and control shape',()=>{
  assert.match(design,/--ds-control-min:44px/);
  assert.match(design,/\.ds-btn\{[^}]*min-height:var\(--ds-control-min\)[^}]*padding:0 14px/);
  assert.match(design,/\.ds-btn\{[^}]*border-radius:var\(--radius-control\)/);
  assert.match(design,/--radius-control:10px/);
  assert.match(design,/\.ds-btn-primary\{[^}]*background:var\(--ds-primary\)/);
  assert.match(design,/\.ds-btn-quiet\{[^}]*background:var\(--ds-muted\)/);
  // The new buttons use them.
  assert.match(html,/class="ds-btn ds-btn-primary" id="import-btn"/);
  assert.match(controls,/exportMenu\.className = 'ds-btn ds-btn-primary'/);
});

test('the visual system adapts the reference typography and semantic status tones',()=>{
  assert.match(design,/--font-ui:'Space Grotesk'/);
  assert.match(design,/--font-heading:var\(--font-ui\)/);
  assert.match(design,/--font-readout:'DM Mono'/);
  assert.match(design,/h1,h2,h3,h4[^}]*font-family:var\(--font-heading\)/);
  assert.match(design,/\.status\.ok,\.status-fresh\{[^}]*color:var\(--ds-accent-fg\)/);
  assert.match(design,/\.status\.err,\.status-bad\{[^}]*color:var\(--ds-error\)/);
  assert.match(design,/\.setting-pills \.status-fresh\{color:var\(--ds-accent-fg\)/);
  assert.match(design,/:focus-visible[^}]*outline:2px solid var\(--ds-ring\)/);
});

test('the local foundation uses the reference light and dark palette without adding a runtime dependency',()=>{
  for(const value of ['#121b26','#1b2532','#0c121a','#efece6','#fab80f','#48aeb1','#2b474a','#dd413c',
                      '#f2efe9','#f9f8f5','#1b2737','#33646c','#ceecee','#c72e29']){
    assert.ok(design.includes(value),`missing reference token ${value}`);
  }
  assert.match(design,/--radius-card:14px/);
  assert.match(design,/--radius-control:10px/);
  assert.match(design,/--ds-space-1:4px/);
  assert.doesNotMatch(html,/@workspace\/spotit-design-system|tailwindcss/);
});

test('export buttons stay in the DOM so the export dialog can adopt them',()=>{
  // log-controls.js moves #export-btn / #backup-btn into the format dialog,
  // so they must still exist in the shell.
  assert.match(html,/id="export-btn"/);
  assert.match(html,/id="backup-btn"/);
  assert.match(controls,/options\.append\(button\)/);
});

test('the design-system layer loads last so it wins the cascade',()=>{
  const designIndex = html.indexOf('design-system.css');
  for(const sheet of ['leaflet.css','radius-system.css','sharing.css','photo-viewer.css','map-overlays.css']){
    const i = html.indexOf(sheet);
    assert.ok(i !== -1,`${sheet} should still be linked`);
    assert.ok(i < designIndex,`design-system.css must load after ${sheet}`);
  }
});

test('radii are preserved rather than re-tuned by the design layer',()=>{
  // AGENTS.md protects the restored corner values; the new layer must not
  // redefine the radius scale. It adds two named tokens only.
  assert.doesNotMatch(design,/--radius-(xs|sm|md|lg|xl|full)\s*:/);
  assert.match(design,/--radius-card:14px/);
  assert.match(design,/--radius-control:10px/);
});
