// Guards the brand assets: they must stay font-independent and stay wired into
// the shell, manifest and service worker.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(require.resolve('./index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(require.resolve('./manifest.json'), 'utf8'));
const sw = fs.readFileSync(require.resolve('./sw.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SVGS = ['kmtrack-mark.svg', 'kmtrack-logo-on-dark.svg', 'kmtrack-logo-on-light.svg'];

test('every brand SVG exists', () => {
  for (const f of SVGS) assert.ok(fs.existsSync(path.join(__dirname, f)), `missing ${f}`);
});

test('the wordmark is outlined, not live text', () => {
  // An <img>-loaded SVG cannot load a webfont, so a <text> element would
  // silently fall back to a system font. The wordmark must be paths.
  for (const f of SVGS) {
    const svg = read(f);
    assert.doesNotMatch(svg, /<text[\s>]/, `${f} must not use <text>`);
    assert.doesNotMatch(svg, /font-family/, `${f} must not depend on a font`);
  }
  // The lockups must actually carry outline data for the lettering.
  for (const f of ['kmtrack-logo-on-dark.svg', 'kmtrack-logo-on-light.svg']) {
    assert.match(read(f), /<path [^>]*d="M[\d.]+ /, `${f} should contain outlined glyph paths`);
  }
});

test('the app shell uses the new marks', () => {
  // The header uses the MARK plus a text wordmark, because the map swaps that
  // text for the live station / coordinates / accuracy. The outlined lockups
  // remain brand assets but are no longer referenced by the shell.
  assert.match(html, /class="header-logo" src="kmtrack-mark\.svg"/);
  assert.match(html, /id="header-wordmark"/);
  assert.match(html, /rel="icon"[^>]*href="kmtrack-mark\.svg"/);
  assert.match(html, /apple-touch-icon[^>]*href="kmtrack-apple-touch-icon\.png"/);
  assert.doesNotMatch(html, /src="KMTrack\.png"/);
  assert.doesNotMatch(html, /src="kmtrack-logo-on-dark\.svg"/);
});

test('the manifest points at the new PWA icons', () => {
  const srcs = manifest.icons.map((i) => i.src);
  assert.ok(srcs.includes('kmtrack-icon-192.png'));
  assert.ok(srcs.includes('kmtrack-icon-512.png'));
  assert.ok(!srcs.includes('KMTrack_logo.png'), 'manifest should no longer ship the old mark');
  for (const i of manifest.icons) {
    assert.ok(fs.existsSync(path.join(__dirname, i.src)), `manifest icon missing on disk: ${i.src}`);
  }
});

test('the service worker caches the new brand assets', () => {
  for (const f of [...SVGS, 'kmtrack-icon-192.png', 'kmtrack-icon-512.png', 'kmtrack-apple-touch-icon.png']) {
    assert.ok(sw.includes(`./${f}`), `sw.js should cache ${f}`);
  }
});

test('the previous identity is retained, not deleted', () => {
  assert.ok(fs.existsSync(path.join(__dirname, 'KMTrack.png')));
  assert.ok(fs.existsSync(path.join(__dirname, 'KMTrack_logo.png')));
});
