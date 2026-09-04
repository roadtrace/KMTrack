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
  assert.match(css,/html:root \.app-tab-btn\{[^}]*border-radius:var\(--radius-md\)/);
  assert.match(html,/\.app-tab-btn\.active\{background:/);
});
test('application corner declarations use tokens, zero, inheritance or inset formulas',()=>{
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match=>match[1]).join('\n')+'\n'+css;
  for(const [,radius] of styles.matchAll(/border-radius\s*:\s*([^;}]+)/g)){
    assert.doesNotMatch(radius,/(?<![\w-])[1-9]\d*(?:\.\d+)?(?:px|%|rem|em)/,`One-off radius: ${radius}`);
  }
  for(const [name,value] of Object.entries({xs:4,sm:8,md:12,lg:16,full:9999})){
    assert.match(styles,new RegExp(`--radius-${name}:\\s*${value}px`));
  }
  assert.doesNotMatch(styles,/--radius-pill/);
});
test('flush swipe cards share clipping radius and images delegate clipping to parents',()=>{
  assert.match(css,/\.swipe-row \.log-entry\{border-radius:inherit;/);
  assert.match(css,/\.edit-photo-thumb-wrap img\{border-radius:0;display:block;/);
  assert.match(css,/\.photo-card\{border-radius:var\(--radius-sm\);overflow:hidden;/);
  assert.match(css,/#photo-preview\{border-radius:0;/);
});
test('geometry stylesheet loads after legacy CSS and is cached offline',()=>{
  assert.ok(html.indexOf('href="radius-system.css"') > html.lastIndexOf('</style>'));
  assert.match(fs.readFileSync(require.resolve('./sw.js'),'utf8'),/\.\/radius-system\.css/);
  assert.match(css,/html:root \.app-tab-bar\{[^}]*border-radius:0;/);
  assert.match(css,/outline-offset:2px/);
});
