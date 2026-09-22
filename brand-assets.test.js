// Guards the supplied Spot It brand assets and their wiring into the shell,
 // manifest and service worker.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(require.resolve('./index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(require.resolve('./manifest.json'), 'utf8'));
const sw = fs.readFileSync(require.resolve('./sw.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SUPPLIED_SVGS = [
  'spot it app icon.svg',
  'spot it header logo dark mode.svg',
  'spot it header logo light mode.svg',
  'spot it header map logo dark mode.svg',
  'spot it header map logo light mode.svg'
];
const GENERATED_ICONS = [
  'spot-it-app-icon-v2-180.png',
  'spot-it-app-icon-v2-192.png',
  'spot-it-app-icon-v2-512.png'
];

test('all supplied Spot It SVGs exist and are self-contained artwork', () => {
  for (const file of SUPPLIED_SVGS) {
    assert.ok(fs.existsSync(path.join(__dirname, file)), `missing ${file}`);
    const svg = read(file);
    assert.match(svg, /<svg\b/);
    assert.match(svg, /viewBox=/);
    assert.doesNotMatch(svg, /<text[\s>]/, `${file} must not depend on a font`);
  }
});

test('the browser and installed app use the supplied app icon', () => {
  assert.match(html, /rel="icon"[^>]*href="spot it app icon\.svg"/);
  assert.match(html, /apple-touch-icon[^>]*sizes="180x180"[^>]*href="spot-it-app-icon-v2-180\.png"/);
  const srcs = manifest.icons.map(icon => icon.src);
  assert.deepEqual(srcs, [
    'spot-it-app-icon-v2-192.png',
    'spot-it-app-icon-v2-512.png',
    'spot-it-app-icon-v2-512.png'
  ]);
  for (const file of GENERATED_ICONS) {
    assert.ok(fs.existsSync(path.join(__dirname, file)), `missing generated icon ${file}`);
  }
});

test('the global header switches among the four supplied theme and view lockups', () => {
  assert.match(html, /id="header-logo" src="spot it header logo dark mode\.svg" alt="Spot It"/);
  for (const file of SUPPLIED_SVGS.slice(1)) assert.ok(html.includes(file), `header does not reference ${file}`);
  assert.doesNotMatch(html, /id="header-wordmark"/);
  assert.match(html, /logo\.dataset\.logoContext = isMap \? 'map' : 'default'/);
});

test('the service worker caches every active brand asset', () => {
  for (const file of [...SUPPLIED_SVGS, ...GENERATED_ICONS]) {
    assert.ok(sw.includes(`./${file}`), `sw.js should cache ${file}`);
  }
  for (const retired of ['spotit-mark.svg','spotit-logo-on-dark.svg','spotit-logo-on-light.svg','spotit-icon-192.png','spotit-icon-512.png','spotit-apple-touch-icon.png']) {
    assert.ok(!sw.includes(`./${retired}`), `sw.js should not cache retired asset ${retired}`);
  }
});
