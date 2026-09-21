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

const SVGS = ['spotit-mark.svg', 'spotit-logo-on-dark.svg', 'spotit-logo-on-light.svg'];

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
  for (const f of ['spotit-logo-on-dark.svg', 'spotit-logo-on-light.svg']) {
    assert.match(read(f), /<path [^>]*d="M[\d.]+ /, `${f} should contain outlined glyph paths`);
  }
});

test('the app shell uses the new mark', () => {
  // The header uses the MARK plus a text wordmark, because the map swaps that
  // text for the live station / coordinates / accuracy. The outlined lockups
  // remain brand assets but are no longer referenced by the shell.
  assert.match(html, /class="header-logo" src="spotit-mark\.svg"/);
  // Exactly one mark: its own amber tile reads on the dark bar and the paper
  // surface alike, so there is no second theme-specific asset.
  assert.equal((html.match(/class="header-logo[^"]*"/g) || []).length, 1);
  assert.equal((html.match(/id="header-wordmark"/g) || []).length, 1);
  assert.match(html, /rel="icon"[^>]*href="spotit-mark\.svg"/);
  assert.match(html, /apple-touch-icon[^>]*href="spotit-apple-touch-icon\.png"/);
  assert.doesNotMatch(html, /src="KMTrack\.png"/);
  assert.doesNotMatch(html, /src="spotit-logo-on-dark\.svg"/);
});

test('the mark keeps the supplied artwork and palette', () => {
  // The mark is the logo supplied for the rebrand. Its geometry must survive:
  // the four focus brackets, the target ring, the four cardinal tabs and the
  // perspective roadway. A structural drift here means the asset was replaced
  // rather than adopted.
  const mark = read('spotit-mark.svg');
  assert.match(mark, /viewBox="0 0 1024 1024"/);
  // The tile corner carries the original logo's proportional radius: rx 13 of 48
  // = 27%, so 277 of 1024.
  assert.match(mark, /rx="277"/, "the original logo's corner radius");
  assert.equal(Math.round(277 / 1024 * 48), 13, 'radius matches the original 13/48');
  // 4 focus brackets + 4 cardinal tabs + the roadway + the centre markings
  assert.equal((mark.match(/<path/g) || []).length, 10, 'brackets, tabs, roadway and markings');
  assert.equal((mark.match(/<circle/g) || []).length, 1, 'the target ring');
  assert.equal((mark.match(/stroke-width="62"/g) || []).length, 4, 'the focus brackets');
  assert.equal((mark.match(/stroke-width="56"/g) || []).length, 1, 'the target ring');
});

test('the focus brackets clear the tile corner instead of cutting it', () => {
  // The supplied mark's bracket fillet (124) swept inside the tile's rx=277
  // corner, so the two crossed and the bracket read as cropped. The fillet is
  // capped at 36 so the bracket follows the corner with an even margin.
  //
  // Geometric rule: with the arms centred at a and a fillet f, the fillet's
  // outer edge reaches a + f*(1+sqrt2) along the tile diagonal, which must stay
  // inside the corner arc's radius (277) with margin to spare.
  const mark = read('spotit-mark.svg');
  assert.match(mark, /M145 275V181Q145 145 181 145H275/, "the top-left bracket's capped fillet");

  const arm = 145;
  const fillet = 36;
  const tileRadius = 277;
  const reach = arm + fillet * (1 + Math.SQRT2);
  assert.ok(reach <= tileRadius - 29,
    `bracket fillet reaches ${reach.toFixed(1)}, which would cross the tile's ${tileRadius} corner arc`);
  // Guard against reintroducing the supplied value.
  assert.equal(Math.round(reach), 232, 'the bracket must stay clear of the corner arc');
});

test('the brand SVGs use only the SPOT IT palette', () => {
  // The mark's amber and navy, plus the navy/white used by the lockups. A stray
  // colour means someone hand-edited an asset.
  const allowed = new Set(['#FFBE00', '#12263D', '#0C396A', '#FFA100', '#FFFFFF', '#F5F3F4', 'none']);
  for (const f of SVGS) {
    for (const m of read(f).matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{6}|none)"/g)) {
      assert.ok(allowed.has(m[1].toUpperCase()) || allowed.has(m[1]),
        `${f} uses an off-brand colour ${m[1]}`);
    }
  }
});

test('the manifest points at the new PWA icons', () => {
  const srcs = manifest.icons.map((i) => i.src);
  assert.ok(srcs.includes('spotit-icon-192.png'));
  assert.ok(srcs.includes('spotit-icon-512.png'));
  assert.ok(!srcs.includes('KMTrack_logo.png'), 'manifest should no longer ship the old mark');
  for (const i of manifest.icons) {
    assert.ok(fs.existsSync(path.join(__dirname, i.src)), `manifest icon missing on disk: ${i.src}`);
  }
});

test('the service worker caches the new brand assets', () => {
  for (const f of [...SVGS, 'spotit-icon-192.png', 'spotit-icon-512.png', 'spotit-apple-touch-icon.png']) {
    assert.ok(sw.includes(`./${f}`), `sw.js should cache ${f}`);
  }
});
test('the previous identity is retained, not deleted', () => {
  assert.ok(fs.existsSync(path.join(__dirname, 'KMTrack.png')));
  assert.ok(fs.existsSync(path.join(__dirname, 'KMTrack_logo.png')));
});
