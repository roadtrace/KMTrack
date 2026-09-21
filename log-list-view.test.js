// Guards the Log tab's list behaviour: the capped Capture copy, and the owner's
// rejection of the search/segments/record-card experiments.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(require.resolve('./index.html'), 'utf8');
const design = fs.readFileSync(require.resolve('./design-system.css'), 'utf8');
const controls = fs.readFileSync(require.resolve('./log-controls.js'), 'utf8');
const filterSrc = fs.readFileSync(require.resolve('./entry-filters.js'), 'utf8');

test('the Capture tab is capped; the Log tab owns the full list', () => {
  assert.match(html, /const CAPTURE_RECENT_LIMIT = 10;/);
  assert.match(html, /const capped = logRegisterView === 'inspection';/);
  assert.match(html, /visible\.slice\(-CAPTURE_RECENT_LIMIT\)/);
  // The cap must not be a second renderer.
  assert.equal((html.match(/id="log-list"/g) || []).length, 1, 'exactly one list');
  assert.equal((html.match(/function renderLog\(/g) || []).length, 1, 'exactly one renderer');
  // Every count still comes from the uncapped set.
  assert.match(html, /if\(capped && visible\.length > shown\.length\)/);
  assert.match(html, /View all \$\{visible\.length\} entries/);
  assert.match(html, /showAppView\('log'\)/);
});

test('switching tabs re-renders so each mount gets the right amount of list', () => {
  assert.match(html, /if\(moved \|\| logRegisterView !== viewName\)\{/);
  assert.match(html, /logRegisterView = viewName;/);
  assert.match(html, /logRegisterView = viewName;[\s\S]{0,160}?renderLog\(\);/);
});

test('the Log tab has no search field and no source segments', () => {
  // Tried and rejected by the owner — do not reinstate.
  assert.doesNotMatch(html, /id="log-search"/);
  assert.doesNotMatch(html, /log-segments/);
  assert.doesNotMatch(html, /wireLogSearchAndSegments/);
  assert.doesNotMatch(design, /\.log-search\{/);
  assert.doesNotMatch(design, /\.log-segment\{/);
  // No dead search plumbing is left behind in the filter module.
  assert.doesNotMatch(filterSrc, /entryHaystack|formatStationShort|query/);
  assert.doesNotMatch(html, /query:search/);
});

test('inspection rows carry no warning tile', () => {
  assert.doesNotMatch(design, /\.log-entry::before/);
  assert.doesNotMatch(design, /--row-tile/);
  assert.doesNotMatch(design, /2\.4 20\.4h19\.2z/);
  // The rows are back to the app's own three-column grid (sharing.css owns it).
  assert.doesNotMatch(design, /\.inspection-record-list \.record-type\{grid-column:2/);
});

test('the records chip doubles as the selection readout', () => {
  // "5 of 12 selected" — the word "records" is dropped while selecting so the
  // chip still fits beside the 30px title without wrapping (371px needed vs
  // 358px available when the word is kept).
  assert.match(controls, /`\$\{n\} of \$\{visible\.length\} selected`/);
  assert.doesNotMatch(controls, /records'\} selected/);
  assert.doesNotMatch(controls, /selection-count/);
  assert.doesNotMatch(controls, /`\$\{n\} selected`/);
});

test('Select rides at the right of the Export row', () => {
  // Row one: title + chip, chip flushed right.
  assert.match(html, /<div class="log-head-row">\s*<h2>Inspection log<\/h2>[\s\S]{0,400}?id="log-records-chip"/);
  assert.match(design, /\.log-head-row\{[\s\S]{0,220}?justify-content:space-between/);
  // Select sits in the Export row (which ends just before the import-status
  // line), not the Import row.
  const exportRow = html.slice(html.indexOf('id="log-export-actions"'), html.indexOf('id="import-status"'));
  assert.match(exportRow, /id="log-select-actions"/);
  const importRow = html.slice(html.indexOf('id="log-import-actions"'), html.indexOf('log-data-hint'));
  assert.doesNotMatch(importRow, /id="log-select-actions"/);
  assert.match(design, /\.log-select-actions\{[\s\S]{0,220}?margin-left:auto/);
});

test('Import shares its row with the bulk actions; Export with Select', () => {
  // Row 1: Import + the bulk actions (revealed on Select). Row 2: Export +
  // Select/Cancel. The hint stays directly under Import, the button it describes.
  const view = html.slice(html.indexOf('id="log-view"'), html.indexOf('id="log-host-log"'));
  const importAt = view.indexOf('id="log-import-actions"');
  const bulkAt = view.indexOf('id="log-bulk-actions"');
  const hintAt = view.indexOf('log-data-hint');
  const exportAt = view.indexOf('id="log-export-actions"');
  const selectAt = view.indexOf('id="log-select-actions"');
  assert.ok(importAt < bulkAt, 'Import and the bulk actions share row 1');
  assert.ok(bulkAt < hintAt, 'the hint follows row 1');
  assert.ok(hintAt < exportAt, 'Export row follows the hint');
  assert.ok(exportAt < selectAt, 'Export and Select share row 2');
  // Both right-hand groups are pushed to their row's right edge.
  assert.match(design, /\.log-bulk-actions\{[\s\S]{0,260}?margin-left:auto/);
  assert.match(design, /\.log-select-actions\{[\s\S]{0,220}?margin-left:auto/);
  // The `[hidden]` guard is required: display:flex outranks it otherwise.
  assert.match(design, /\.log-bulk-actions\[hidden\]\{display:none;\}/);
  // Mounted separately from the toggle.
  assert.match(controls, /\(bulkMount \|\| actions\)\.append\(selectAll,deleteSelected\)/);
  assert.match(controls, /bulkMount\.hidden=!selectMode/);
  assert.match(controls, /actions\.append\(toggle\)/);
});

test('the two data rows do not overflow the way a single row did', () => {
  // Measured: one row needed 386px in selection mode against 362px available at
  // 390px, so Cancel wrapped to a second line. Splitting it so each row carries
  // one data action plus one right-hand control keeps both under.
  assert.match(design, /\.log-data-row\{[\s\S]{0,160}?flex-wrap:wrap/);
  // The hint is spaced between the rows, not flush against the first.
  assert.match(design, /\.log-data-hint\{[\s\S]{0,80}?margin:8px 0 10px/);
});

test('the bulk controls share the Select button geometry', () => {
  // These have been re-parented twice and each time silently lost their
  // geometry when the old mount's scoped rule stopped matching. Target by ID
  // only, so a future move cannot orphan the styling.
  assert.match(design, /#bulk-select-all-btn,#bulk-delete-btn\{/);
  assert.doesNotMatch(design, /#log-select-actions :is\(#bulk-select-all-btn/);
  assert.doesNotMatch(design, /#log-select-actions #bulk-delete-btn/);
  const block = design.slice(design.indexOf('#bulk-select-all-btn,#bulk-delete-btn{'));
  assert.match(block.slice(0, 420), /min-height:var\(--ds-control-min\)/);
  assert.match(block.slice(0, 420), /border-radius:var\(--radius-md\)/);
  assert.match(block.slice(0, 420), /font-size:12px/);
  assert.doesNotMatch(design, /selection-count/);
});

test('the Capture tab keeps the record-card header', () => {
  assert.match(html, /<h2>Today's record<\/h2>/);
  assert.match(design, /\.inspection-view \.log-header\{/);
  assert.match(design, /\.inspection-view \.log-count-badge\{/);
  assert.match(design, /\.inspection-view \.log-header h2\{[\s\S]{0,200}?flex-direction:column/);
  assert.match(design, /\.inspection-view \.log-header #select-toggle-btn\{display:none;\}/);
});

test('the Capture tab renders the register as ONE card with hairline dividers', () => {
  // Header and rows share one shell instead of floating blocks.
  assert.match(design, /\.inspection-view #log-register\{/);
  assert.match(design, /\.inspection-view \.log-header\{[\s\S]{0,300}?border-bottom:1px solid var\(--ds-border\)/);
  assert.match(design, /html:root \.inspection-view \.inspection-record-list \.swipe-row\{/);
  assert.match(design, /html:root \.inspection-view \.inspection-record-list \.log-entry\{/);
  assert.match(design, /\.swipe-row \+ \.swipe-row \.log-entry\{[\s\S]{0,80}?border-top:1px solid var\(--ds-border\)/);
  // "View all" is the card's footer.
  assert.match(design, /\.inspection-view \.inspection-record-list \.log-view-all\{/);
  // Carded ONLY on Capture — the Log tab keeps its plain list.
  assert.doesNotMatch(design, /^\.log-view #log-register\{/m);
});

test('the Capture card has no filter row, and ignores the Log tab filters', () => {
  // The row is hidden on this mount...
  assert.match(design, /\.inspection-view \.log-date-filters\{display:none;\}/);
  // ...and the data follows suit, so a filter set on the Log tab cannot leave
  // this card showing a subset the user has no way to clear from here.
  assert.match(html, /function visibleEntries\(\)\{[\s\S]{0,320}?if\(logRegisterView === 'inspection'\) return entries;/);
  assert.match(html, /if\(logRegisterView === 'inspection'\) return entries;[\s\S]{0,160}?SPOTITEntryFilters\.filterEntries\(entries,getLogFilters\(\)\)/);
});

test('the card resets only the non-left edges, preserving per-defect colours', () => {
  // sharing.css owns the left border AND the per-type overrides. Resetting the
  // `border-left` shorthand here would repaint every row yellow.
  const i = design.indexOf('html:root .inspection-view .inspection-record-list .log-entry{');
  assert.ok(i > -1, 'card row rule exists');
  const block = design.slice(i, i + 320);
  assert.match(block, /border-left-width:4px/);
  assert.doesNotMatch(block, /border-left:4px solid var\(--line-yellow\)/);
  // No stray `border:0` that would drop the left strip entirely.
  assert.doesNotMatch(block, /border:0;/);
});
