const { test } = require('node:test');
const assert = require('node:assert/strict');
const api = require('./inspection-api');
const sync = require('./sync-queue');
const fs = require('node:fs');

const user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const state = (over = {}) => ({ mode: 'approved', cloudVerified: true, canUseLocal: true, userId: user, workspaceUserId: user, profile: { id: user, approved: true, role: 'inspector', team: 'roadway' }, ...over });
const entry = (over = {}) => ({ id, type: 'Potholes', timestamp: '2026-09-24 01:27:00', created_at: '2026-09-23T17:27:01.000Z', updated_at: '2026-09-23T17:27:01.000Z', lat: 14.819699, lon: 120.9711, km: 8.2, expressway: 'NLEX', bound: 'NB', lane: '2', interchange: '', interchangeSegment: '', photoId: 'local-photo', photoFilename: 'local.jpg', user_id: 'forged', team: 'forged', ...over });
function fixture(over = {}) {
  let current = state(over);
  let stored = entry();
  let operation = '';
  let written = null;
  let rows = [];
  let writeError = null;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: current.userId } }, error: null }) },
    from: table => {
      assert.equal(table, 'inspections');
      return {
        insert: value => { operation = 'insert'; written = value; return { select: () => ({ single: async () => ({ data: value, error: writeError }) }) }; },
        select: () => ({
          order: () => ({ range: async () => ({ data: rows, error: null }) }),
          eq: () => ({ maybeSingle: async () => ({ data: rows[0] || null, error: null }) })
        }),
        update: value => { operation = 'update'; written = value; return { eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { ...rows[0], ...value }, error: writeError }) }) }) }; }
      };
    }
  };
  const transport = api.createApi({ client, verify: async () => {}, context: () => current,
    durable: candidate => JSON.stringify(candidate) === JSON.stringify(stored),
    persist: candidate => { stored = JSON.parse(JSON.stringify(candidate)); return true; }, isCurrent: () => true });
  return { transport, get operation() { return operation; }, get written() { return written; }, setState: value => { current = state(value); }, setRows: value => { rows = value; }, setError: value => { writeError = value; }, setStored: value => { stored = value; } };
}

test('complete mapping preserves UUID, identity, Philippine time, DMM, lane and KM while omitting photos', () => {
  const mapped = api.mapEntry(entry(), state());
  assert.deepEqual(mapped, {
    id, created_at: '2026-09-23T17:27:01.000Z', user_id: user, team: 'roadway', inspected_at: '2026-09-23T17:27:00.000Z',
    defect_type: 'Potholes', latitude: 14.819699, longitude: 120.9711, latitude_dmm: api.dmm(14.819699, 'N', 'S'), longitude_dmm: api.dmm(120.9711, 'E', 'W'),
    expressway: 'NLEX', direction: 'NB', lane_number: 2, lane_other: null, km_station: 8200,
    interchange_exit: null, interchange_segment: null, photo_filename: null, photo_path: null
  });
  assert.equal(mapped.latitude_dmm, 'N14 49.1819');
  assert.equal(mapped.longitude_dmm, 'E120 58.2660');
  assert.equal(api.mapEntry(entry({ lane: 'Shoulder', km: null, interchange: 'Exit 1', interchangeSegment: 'Ramp' }), state()).lane_other, 'Shoulder');
  assert.equal(api.mapEntry(entry({ lane: 'Shoulder', km: null, interchange: 'Exit 1', interchangeSegment: 'Ramp' }), state()).km_station, null);
});
test('Philippine timestamps are independent of device timezone and malformed values are rejected', () => {
  assert.equal(api.phTime('2026-09-24 01:27:00'), '2026-09-23T17:27:00.000Z');
  for (const value of ['2026-02-30 01:00:00', '2026-09-24', '2026-09-24 25:00:00', 'tomorrow']) assert.throws(() => api.phTime(value));
});
test('submission rejects invalid UUID, Guest, Pending, stale verification, mismatch, review, import and Admin', () => {
  const cases = [
    [entry({ id: 'old-id' }), state()], [entry(), state({ mode: 'guest' })], [entry(), state({ mode: 'pending', profile: { approved: false, role: 'inspector', team: null } })],
    [entry(), state({ cloudVerified: false })], [entry(), state({ workspaceUserId: id })],
    [entry({ guest_claim_required: true }), state()], [entry({ preapproval_review_required: true }), state()],
    [entry({ sync_status: 'local_only' }), state()], [entry({ sync_status: 'needs_review' }), state()],
    [entry({ sync_status: 'syncing' }), state()], [entry({ sync_outcome_unknown: true }), state()],
    [entry({ importBatchId: 'batch' }), state()], [entry({ remote_id: id }), state()], [entry({ cloud_source: true }), state()],
    [entry(), state({ profile: { id: user, approved: true, role: 'administrator', team: null } })]
  ];
  for (const [record, context] of cases) assert.throws(() => api.eligible(record, context));
});
test('Inspector and Supervisor insert only one durable eligible inspection; failures leave local/photo untouched', async () => {
  const f = fixture(); const local = entry();
  assert.equal((await f.transport.insertOne(local)).status, 'inserted');
  assert.equal(f.operation, 'insert'); assert.equal(f.written.user_id, user); assert.equal(f.written.team, 'roadway');
  assert.equal(local.photoId, 'local-photo'); assert.equal(local.sync_status, 'synced');
  f.setState({ profile: { id: user, approved: true, role: 'supervisor', team: 'roadway' } });
  const supervisorLocal = entry(); f.setStored(supervisorLocal);
  assert.equal((await f.transport.insertOne(supervisorLocal)).status, 'inserted');
  f.setError(new Error('offline'));
  const failedLocal = entry(); f.setStored(failedLocal);
  await assert.rejects(f.transport.insertOne(failedLocal), /offline/);
  assert.equal(failedLocal.photoFilename, 'local.jpg'); assert.equal(failedLocal.remote_id, undefined);
  f.setStored(entry({ updated_at: 'older' }));
  await assert.rejects(f.transport.insertOne(local), /Save this inspection locally/);
});
test('duplicate UUID is held for explicit reconciliation, never upserted or overwritten', async () => {
  const f = fixture(); f.setError({ code: '23505', message: 'duplicate' }); f.setRows([{ id, user_id: user }]);
  assert.deepEqual((await f.transport.insertOne(entry())).status, 'id-conflict');
  assert.equal(f.operation, 'insert');
});
test('authorized fetch stays a distinct cloud collection', async () => {
  const f = fixture(); const local = [entry()]; f.setRows([{ id, team: 'roadway' }]);
  const cloud = await f.transport.fetchAuthorized();
  assert.equal(cloud[0].cloud_source, true); assert.equal(local[0].cloud_source, undefined); assert.equal(local.length, 1);
  f.setState({ mode: 'guest' }); await assert.rejects(f.transport.fetchAuthorized());
});
test('app keeps fetched rows separate from local Map, Log, export and the disconnected queue', () => {
  const source = fs.readFileSync(require.resolve('./inspection-api.js').replace('inspection-api.js', 'index.html'), 'utf8');
  assert.match(source, /let cloudRows = \[\]/);
  assert.match(source, /SPOTITSync\.createQueue\(\{\}\)/);
  assert.match(source, /return canViewTeamRecords\(\) \? entries : entries\.filter/);
  assert.match(source, /cloudRows = rows; cloudRowsOwnerId = userId/);
  assert.doesNotMatch(source, /entries\.(?:push|concat)\([^\n]*cloudRows/);
});
test('Inspector own and Supervisor teammate update; nonowner and Admin rejected', async () => {
  const f = fixture(); const original = { id, cloud_source: true, team: 'roadway', user_id: user };
  f.setRows([original]);
  assert.equal((await f.transport.updateAuthorized(id, { defect_type: 'Cracks' }, original)).defect_type, 'Cracks');
  assert.deepEqual(f.written, { defect_type: 'Cracks' });
  await assert.rejects(f.transport.updateAuthorized(id, { team: 'other' }, original));
  const teammate = { ...original, user_id: id }; f.setRows([teammate]);
  await assert.rejects(f.transport.updateAuthorized(id, { defect_type: 'Cracks' }, teammate));
  f.setState({ profile: { id: user, approved: true, role: 'supervisor', team: 'roadway' } });
  assert.equal((await f.transport.updateAuthorized(id, { defect_type: 'Cracks' }, teammate)).defect_type, 'Cracks');
  f.setState({ profile: { id: user, approved: true, role: 'administrator', team: null } });
  await assert.rejects(f.transport.updateAuthorized(id, { defect_type: 'Cracks' }, teammate));
});
test('Phase 11 keeps the sync queue without transport', async () => {
  const queue = sync.createQueue({});
  assert.equal(queue.ready(), false);
  assert.deepEqual(await queue.drain([entry()]), { ok: false, reason: 'no-transport', uploaded: 0, failed: 0 });
});

test('non-durable submission is rejected before any authorization or inspection request',async()=>{
  let requests=0;
  const instance=api.createApi({client:{auth:{getUser:async()=>{requests++;}},from:()=>{requests++;}},verify:async()=>{requests++;},context:()=>state(),durable:()=>false});
  await assert.rejects(instance.insertOne(entry()),/Save this inspection locally/);
  assert.equal(requests,0);
});
