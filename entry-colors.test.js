const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('light-mode entry surfaces preserve the shared defect accent borders', () => {
  const html = fs.readFileSync(require.resolve('./index.html'), 'utf8');
  const rules = [...html.matchAll(/html\[data-theme="light"\] \.log-entry(?:\.selected)?\s*\{([^}]+)\}/g)];
  assert.ok(rules.length >= 2);
  for (const [, declarations] of rules) {
    assert.doesNotMatch(declarations, /(?:^|;)\s*border(?:-color|-left(?:-color)?)?\s*:/);
  }
  assert.match(html, /\.log-entry\{[^}]*border-left:4px solid var\(--line-yellow\)/);
  assert.match(html, /\.log-entry\.shoving\{border-left-color:var\(--safety-orange\)/);
  assert.match(html, /\.log-entry\.cracks\{border-left-color:#c9c9c9/);
  assert.match(html, /\.log-entry\.other\{border-left-color:#c1707a/);
});
