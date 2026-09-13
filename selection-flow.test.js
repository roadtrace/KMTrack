const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(require.resolve('./index.html'),'utf8');
const controls = fs.readFileSync(require.resolve('./log-controls.js'),'utf8');
const css = fs.readFileSync(require.resolve('./sharing.css'),'utf8');

test('first Select press enters mode without selecting entries',()=>{
  const handler = html.match(/document\.getElementById\('select-toggle-btn'\)\.addEventListener\('click',[\s\S]*?\n\}\);/)[0];
  assert.match(handler,/if\(!selectMode\)\{[\s\S]*?selectedEntryIds\.clear\(\);[\s\S]*?selectMode = true;[\s\S]*?return;/);
  assert.doesNotMatch(handler,/visible\.forEach/);
});

test('Select stays text-based beside Export and becomes Cancel in selection mode',()=>{
  assert.match(controls,/footer\.append\(count,toggle,exportMenu,selectAll,deleteSelected\)/);
  assert.match(controls,/toggle\.textContent = selectMode \? 'Cancel' : 'Select'/);
  assert.match(controls,/toggle\.removeAttribute\('aria-checked'\)/);
  assert.match(css,/#select-toggle-btn\{[^}]*width:auto[^}]*font-size:12px/);
});

test('selection mode reveals the shared bulk actions without preselecting rows',()=>{
  assert.match(controls,/footer\.classList\.toggle\('selection-mode',selectMode\)/);
  assert.match(controls,/selectAll\.hidden=!selectMode/);
  assert.match(controls,/deleteSelected\.hidden=!selectMode/);
  assert.match(html,/bar\.style\.display = 'none'/);
});

test('selection actions move above the persistent Cancel and Export row',()=>{
  assert.match(css,/\.log-action-footer\.selection-mode #bulk-select-all-btn,\.log-action-footer\.selection-mode #bulk-delete-btn\{grid-row:2;/);
  assert.match(css,/\.log-action-footer\.selection-mode #select-toggle-btn,\.log-action-footer\.selection-mode #export-menu-btn\{grid-row:3;/);
  assert.match(css,/#select-toggle-btn\.active\{background:var\(--line-yellow\);color:#191c1f;border-color:transparent;/);
});

test('footer actions keep equal geometry and date filters have no obsolete checkbox column',()=>{
  assert.match(css,/\.log-action-footer\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)[^}]*padding:8px[^}]*border-radius:var\(--radius-lg\)/);
  assert.match(css,/\.log-action-footer button\{[^}]*width:100%[^}]*height:44px/);
  assert.match(css,/html:root \.log-action-footer :is\([^}]+\)\{\s*appearance:none;box-sizing:border-box;border:1px solid transparent;border-radius:var\(--radius-sm\);box-shadow:none;/);
  assert.match(css,/@media\(max-width:430px\)\{\s*html:root \.log-date-filters\{grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\) 44px;/);
  assert.doesNotMatch(css,/log-date-filters[^}]*44px 44px/);
});

test('inspection heading uses a filtered-count badge and hides the legacy count row',()=>{
  assert.match(controls,/badge\.id='log-count-badge'/);
  assert.match(controls,/badge\.textContent=visible\.length\.toLocaleString\('en-US'\)/);
  assert.match(controls,/legacyCount\.hidden=true/);
  assert.match(css,/\.log-count-badge\{[^}]*min-width:24px;height:24px[^}]*border-radius:var\(--radius-full\)[^}]*box-shadow:[^}]*transform:translate\(-1px,-9px\)/);
  assert.match(css,/\.count-bar\[hidden\]\{display:none!important;/);
});

test('inspection and map filters share the filled funnel and active effect',()=>{
  assert.match(controls,/M4 5h16l-6 7v6l-4 2v-8z/);
  assert.match(html,/id="map-filter-menu"[\s\S]*?M4 5h16l-6 7v6l-4 2v-8z/);
  assert.match(css,/:is\(\.log-filter-menu,\.map-filter-menu\)\.filtered > summary\{\s*color:var\(--line-yellow\);border-color:var\(--line-yellow\);box-shadow:/);
  assert.match(html,/map-filter-menu'\)\?\.classList\?\.toggle\('filtered',mapFilterActive\)/);
});

test('deselecting the last row keeps selection mode open',()=>{
  assert.doesNotMatch(html,/selectMode = selectedEntryIds\.size > 0/);
});
