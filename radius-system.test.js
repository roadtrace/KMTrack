const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync(require.resolve('./index.html'),'utf8');
const css = fs.readFileSync(require.resolve('./radius-system.css'),'utf8')+'\n'+fs.readFileSync(require.resolve('./sharing.css'),'utf8');
test('date inputs shrink inside both filter grids and inset tabs retain rounded highlights',()=>{
  const rule=css.match(/html:root :is\(\.entry-filters,\.map-entry-controls\) input\[type="date"\]\{([^}]+)\}/)[1];
  assert.match(rule,/min-inline-size:0/);
  assert.match(rule,/max-width:100%/);
  assert.match(rule,/-webkit-appearance:none/);
  assert.match(rule,/overflow:hidden/);
  assert.match(css,/html:root \.app-tab-btn\{[^}]*border-radius:12px/);
  assert.match(html,/\.app-tab-btn\.active\{background:/);
});
test('pre-system corner shapes are restored while bottom navigation stays rectangular',()=>{
  for(const expected of [
    /header\{border-radius:0 0 24px 24px/,
    /\.dataset-drawer\{border-radius:0 0 30px 30px/,
    /\.dataset-panel\{border-radius:14px/,
    /\.readout\{border-radius:18px/,
    /\.bound-panel\{border-radius:10px/,
    /\.kmpost\{border-radius:20px/,
    /\.select-toggle-btn,html:root \.export-btn\{border-radius:999px/,
    /\.app-tab-bar\{border-radius:0/,
    /\.app-tab-btn\{border-radius:12px/
  ]) assert.match(css,expected);
});
test('flush swipe cards share clipping radius and images delegate clipping to parents',()=>{
  assert.match(css,/\.swipe-row \.log-entry\{border-radius:8px;/);
  assert.match(css,/\.edit-photo-thumb-wrap img\{border-radius:0;display:block;/);
  assert.match(css,/\.photo-card\{border-radius:8px;overflow:hidden;/);
  assert.match(css,/#photo-preview\{border-radius:0;/);
});
test('geometry stylesheet loads after legacy CSS and is cached offline',()=>{
  assert.ok(html.indexOf('href="radius-system.css"') > html.lastIndexOf('</style>'));
  assert.match(fs.readFileSync(require.resolve('./sw.js'),'utf8'),/\.\/radius-system\.css/);
  assert.match(css,/html:root \.app-tab-bar\{[^}]*border-radius:0;/);
  assert.match(css,/outline-offset:2px/);
});
test('bridge filter keeps a compact visible control inside its full tap target',()=>{
  assert.match(css,/html:root \.bridge-filter-toggle\{[^}]*width:44px;height:44px[^}]*background:transparent/);
  assert.match(css,/html:root \.bridge-filter-toggle::before\{[^}]*width:28px;height:28px[^}]*border-radius:var\(--radius-sm\)/);
});
test('bridge filter shares the yellow active funnel treatment without a separate dot',()=>{
  assert.match(css,/\.bridge-filter-toggle\.filtered::before\{[^}]*border-color:var\(--line-yellow\)[^}]*%23f4b400[^}]*box-shadow:/);
  assert.match(css,/\.bridge-filter-toggle\.filtered::after\{display:none;/);
});
