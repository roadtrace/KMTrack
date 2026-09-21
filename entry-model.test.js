// Guards the inspection record shape: permanent UUIDs, the sync-ready fields,
// the structured lane pair, and backward compatibility with existing logs.
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('./entry-model.js');

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('uuid() returns a real v4 UUID and never repeats', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const id = model.uuid();
    assert.match(id, UUID_V4);
    seen.add(id);
  }
  assert.equal(seen.size, 200);
});

test('laneFields splits numbered lanes from the Others free text', () => {
  for (const n of [1, 2, 3, 4]) {
    assert.deepEqual(model.laneFields(String(n)), { lane: String(n), lane_number: n, lane_other: '' });
  }
  // The "Others" checkbox with nothing typed keeps the label but no free text.
  assert.deepEqual(model.laneFields('Others'), { lane: 'Others', lane_number: null, lane_other: '' });
  // A typed description travels in lane_other, and `lane` stays verbatim.
  assert.deepEqual(model.laneFields('Shoulder'), { lane: 'Shoulder', lane_number: null, lane_other: 'Shoulder' });
  assert.deepEqual(model.laneFields(''), { lane: '', lane_number: null, lane_other: '' });
  assert.deepEqual(model.laneFields(null), { lane: '', lane_number: null, lane_other: '' });
  // Out-of-range digits are not lanes.
  assert.equal(model.laneFields('5').lane_number, null);
  assert.equal(model.laneFields('5').lane_other, '5');
});

test('createEntry assigns the permanent id and sync fields at creation time', () => {
  const before = Date.now();
  const entry = model.createEntry({ type: 'Potholes', timestamp: '2026-09-18 10:00:00', lat: 14.6, lon: 121, lane: '2' });
  assert.match(entry.id, UUID_V4);
  assert.equal(entry.sync_status, 'pending');
  assert.equal(entry.lane_number, 2);
  assert.equal(entry.lane_other, '');
  assert.equal(entry.user_id, '');
  assert.equal(entry.team, '');
  assert.equal(entry.photo_path, '');
  assert.equal(entry.sync_attempts, 0);
  // created_at and updated_at are ISO instants, and updated_at never predates.
  assert.ok(Date.parse(entry.created_at) >= before - 1000);
  assert.ok(Date.parse(entry.created_at) <= Date.now() + 1000);
  assert.ok(Date.parse(entry.updated_at) >= Date.parse(entry.created_at) - 1);
});

test('a caller-supplied id is preserved rather than replaced', () => {
  const id = model.uuid();
  assert.equal(model.createEntry({ lat: 1, lon: 1, id }).id, id);
});

test('normalizeEntry backfills a legacy v1 record without altering it', () => {
  // Exactly the shape the previous version persisted.
  const legacy = {
    id: 'abc', type: 'Potholes', timestamp: '2026-09-01 09:00:00', lat: 14.1, lon: 120.2,
    km: 8.2, expressway: 'NLEX', interchange: '', interchangeSegment: '', bound: 'NB',
    lane: '3', photoId: 'p1', photoFilename: 'p.jpg', photoTimestamp: '2026-09-01 09:00:05',
  };
  const out = model.normalizeEntry(legacy, Date.parse('2026-09-18T00:00:00Z'));
  // Original values survive untouched — nothing is reset or silently altered.
  for (const k of Object.keys(legacy)) assert.deepEqual(out[k], legacy[k], `${k} changed`);
  // New fields are derived, not invented.
  assert.equal(out.lane_number, 3);
  assert.equal(out.lane_other, '');
  assert.equal(out.sync_status, 'pending');
  assert.equal(out.user_id, '');
  assert.equal(out.team, '');
  assert.equal(out.created_at, '2026-09-18T00:00:00.000Z');
  assert.equal(out.updated_at, '2026-09-18T00:00:00.000Z');
});

test('normalizeEntry derives the lane pair from a legacy lane-only record', () => {
  const mk = (lane) => model.normalizeEntry({ lat: 1, lon: 1, lane });
  assert.equal(mk('4').lane_number, 4);
  assert.equal(mk('Shoulder').lane_number, null);
  assert.equal(mk('Shoulder').lane_other, 'Shoulder');
  assert.equal(mk('Shoulder').lane, 'Shoulder');
});

test('normalizeEntry preserves unknown fields such as the import photo blob', () => {
  const blob = { name: 'not-a-real-blob' };
  const out = model.normalizeEntry({ lat: 1, lon: 1, photoFile: blob, originId: 'src-1' });
  assert.equal(out.photoFile, blob);
  assert.equal(out.originId, 'src-1');
});

test('normalizeEntry rejects what was never a valid record', () => {
  assert.equal(model.normalizeEntry(null), null);
  assert.equal(model.normalizeEntry('nope'), null);
  assert.equal(model.normalizeEntry([{ lat: 1, lon: 1 }]), null);
  assert.equal(model.normalizeEntry({ lon: 1 }), null);
  assert.equal(model.normalizeEntry({ lat: '1', lon: 1 }), null);
});

test('normalizeAll drops invalid rows and keeps order', () => {
  const out = model.normalizeAll([{ lat: 1, lon: 1, id: 'a' }, null, { lat: 2, lon: 2, id: 'b' }, { nope: true }]);
  assert.deepEqual(out.map((e) => e.id), ['a', 'b']);
  assert.deepEqual(model.normalizeAll('not-an-array'), []);
});

test('setLane keeps lane, lane_number and lane_other in step', () => {
  const entry = model.createEntry({ lat: 1, lon: 1, lane: '1' });
  model.setLane(entry, 'Others');
  assert.equal(entry.lane, 'Others');
  assert.equal(entry.lane_number, null);
  assert.equal(entry.lane_other, '');
  model.setLane(entry, 'Acce');
  assert.equal(entry.lane, 'Acce');
  assert.equal(entry.lane_other, 'Acce');
  model.setLane(entry, '4');
  assert.equal(entry.lane_number, 4);
  assert.equal(entry.lane_other, '');
});

test('touch advances updated_at without disturbing created_at', () => {
  const entry = model.createEntry({ lat: 1, lon: 1 }, Date.parse('2026-01-01T00:00:00Z'));
  const created = entry.created_at;
  model.touch(entry, Date.parse('2026-06-01T00:00:00Z'));
  assert.equal(entry.created_at, created);
  assert.equal(entry.updated_at, '2026-06-01T00:00:00.000Z');
});
