// Guards the sync seam: what would be uploaded, in what order, and the
// duplicate-safety property that retries reuse the same UUID.
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('./entry-model.js');
const sync = require('./sync-queue.js');

const entry = (over = {}) => model.createEntry({ lat: 1, lon: 1, ...over });

test('the queue shares the entry model status values', () => {
  assert.equal(sync.STATUS, model.SYNC_STATUS);
  assert.deepEqual(sync.STATUS, { PENDING: 'pending', SYNCED: 'synced', FAILED: 'failed' });
});

test('only records with a permanent UUID are uploadable', () => {
  assert.equal(sync.isUploadable(entry()), true);
  assert.equal(sync.isUploadable({ ...entry(), id: '' }), false);
  assert.equal(sync.isUploadable({ ...entry(), id: null }), false);
  // Already-synced records are not re-sent.
  assert.equal(sync.isUploadable({ ...entry(), sync_status: 'synced' }), false);
});

test('nextBatch takes pending first, then failed retries, within the limit', () => {
  const list = [
    { ...entry(), id: 'p1', sync_status: 'pending' },
    { ...entry(), id: 's1', sync_status: 'synced' },
    { ...entry(), id: 'f1', sync_status: 'failed' },
    { ...entry(), id: 'p2', sync_status: 'pending' },
  ];
  assert.deepEqual(sync.nextBatch(list, 10).map((e) => e.id), ['p1', 'p2', 'f1']);
  assert.deepEqual(sync.nextBatch(list, 2).map((e) => e.id), ['p1', 'p2']);
  assert.deepEqual(sync.nextBatch([], 10), []);
});

test('summary counts every status, treating unknown as pending', () => {
  const counts = sync.summary([
    { sync_status: 'synced' }, { sync_status: 'synced' }, { sync_status: 'failed' },
    { sync_status: 'pending' }, { sync_status: 'nonsense' }, null,
  ]);
  assert.deepEqual(counts, { total: 6, pending: 3, synced: 2, failed: 1 });
  assert.deepEqual(sync.summary([]), { total: 0, pending: 0, synced: 0, failed: 0 });
});

test('a record with an un-uploaded photo is flagged for later upload', () => {
  assert.equal(sync.photoNeedsUpload({ photoId: 'p1', photo_path: '' }), true);
  assert.equal(sync.photoNeedsUpload({ photoId: 'p1', photo_path: 'team/x.jpg' }), false);
  assert.equal(sync.photoNeedsUpload({ photoId: '', photo_path: '' }), false);
  assert.equal(sync.photoNeedsUpload(null), false);
});

test('markSynced and markFailed record the outcome on the record', () => {
  const ok = entry();
  sync.markSynced(ok, { remoteId: 'cloud-7' });
  assert.equal(ok.sync_status, 'synced');
  assert.equal(ok.remote_id, 'cloud-7');
  assert.equal(ok.sync_error, '');
  assert.ok(ok.synced_at);

  const bad = entry();
  sync.markFailed(bad, new Error('network down'));
  assert.equal(bad.sync_status, 'failed');
  assert.equal(bad.sync_error, 'network down');
  assert.equal(bad.sync_attempts, 1);
  sync.markFailed(bad, 'again');
  assert.equal(bad.sync_attempts, 2);

  // The record's own UUID remains the key even after a successful sync.
  const plain = entry();
  sync.markSynced(plain);
  assert.equal(plain.remote_id, plain.id);
});

test('requeue moves failed records back to pending', () => {
  const bad = { ...entry(), sync_status: 'failed' };
  const fine = { ...entry(), sync_status: 'synced' };
  const list = [bad, fine];
  sync.requeueAll(list);
  assert.equal(bad.sync_status, 'pending');
  assert.equal(fine.sync_status, 'synced');
});

test('with no transport the queue is inert and marks nothing', async () => {
  const queue = sync.createQueue({});
  assert.equal(queue.ready(), false);
  const list = [entry(), entry()];
  const result = await queue.drain(list);
  assert.deepEqual(result, { ok: false, reason: 'no-transport', uploaded: 0, failed: 0 });
  // Nothing was silently marked as sent.
  assert.deepEqual(sync.summary(list), { total: 2, pending: 2, synced: 0, failed: 0 });
});

test('drain uploads pending records and marks them synced', async () => {
  const sent = [];
  const queue = sync.createQueue({
    transport: { upload: async (e) => { sent.push(e.id); return { remoteId: `cloud-${e.id}` }; } },
  });
  const list = [entry(), entry()];
  const result = await queue.drain(list);
  assert.deepEqual(result, { ok: true, uploaded: 2, failed: 0 });
  assert.deepEqual(sent, list.map((e) => e.id));
  assert.deepEqual(sync.summary(list).synced, 2);
  // A second drain has nothing left to do.
  assert.deepEqual(await queue.drain(list), { ok: true, uploaded: 0, failed: 0 });
});

test('a failed upload is retried with the SAME uuid, so cloud rows cannot duplicate', async () => {
  const attempts = [];
  let shouldFail = true;
  const queue = sync.createQueue({
    transport: {
      upload: async (e) => {
        attempts.push(e.id);
        if (shouldFail) throw new Error('offline');
        return { remoteId: 'cloud-1' };
      },
    },
  });

  const record = entry();
  const list = [record];
  const first = await queue.drain(list);
  assert.deepEqual(first, { ok: true, uploaded: 0, failed: 1 });
  assert.equal(record.sync_status, 'failed');
  assert.equal(record.sync_error, 'offline');
  const idAfterFailure = record.id;

  // The retry re-uses the identical UUID — this is what makes the future
  // upsert idempotent and prevents a duplicate cloud record.
  shouldFail = false;
  const second = await queue.drain(list);
  assert.deepEqual(second, { ok: true, uploaded: 1, failed: 0 });
  assert.equal(record.sync_status, 'synced');
  assert.deepEqual(attempts, [idAfterFailure, idAfterFailure]);
  assert.equal(attempts[0], attempts[1]);
});

test('drain never throws, and reports progress', async () => {
  const seen = [];
  const queue = sync.createQueue({
    batchSize: 2,
    transport: { upload: async (e) => { if (e.type === 'boom') throw new Error('nope'); } },
    onProgress: (s) => seen.push(s.synced + s.failed),
  });
  const list = [entry(), entry({ type: 'boom' }), entry()];
  const result = await queue.drain(list);
  // The batch limit means only the first two are attempted: one succeeds, the
  // deliberately failing one is recorded as failed.
  assert.deepEqual(result, { ok: true, uploaded: 1, failed: 1 });
  assert.deepEqual(seen, [1, 2]);
  assert.equal(sync.summary(list).pending, 1);
});
