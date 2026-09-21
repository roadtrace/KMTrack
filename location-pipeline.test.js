// Regression checks for the seams between GPS, stationing, capture and storage.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const entryModel = require('./entry-model.js');

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const end = source.indexOf('\n}', start);
  assert.ok(end >= 0, `${name} closes`);
  return source.slice(start, end + 2);
}

function context(functions, values = {}) {
  const sandbox = vm.createContext({ ...values, console: { error() {}, warn() {} } });
  vm.runInContext(functions.map(functionSource).join('\n'), sandbox);
  return sandbox;
}

test('stationing interpolates within the confirmed corridor and bound, never across a stacked road', () => {
  const points = [
    { lat: 0, lon: 0, k: 10, e: 'NLEX', b: 'NB' },
    { lat: 0, lon: 0.002, k: 10.2, e: 'NLEX', b: 'NB' },
    { lat: 0, lon: 0.001, k: 99, e: 'SEG 8.1', b: 'EB' },
    { lat: 0, lon: 0.0011, k: 99.1, e: 'SEG 8.1', b: 'EB' }
  ];
  const app = context(['computeKmStation'], {
    calibData: points,
    nearbyIndices: () => [0, 1, 2, 3],
    nearestFrom: (indices, lat, lon, skip = -1) => {
      const choices = indices.filter(i => i !== skip).map(idx => ({ idx, dist: Math.abs(points[idx].lon - lon) }));
      return choices.sort((a, b) => a.dist - b.dist)[0] || null;
    },
    corridorKey: (e, b) => `${e}|${b}`,
    corridorIndex: new Map([['NLEX|NB', [0, 1]], ['SEG 8.1|EB', [2, 3]]])
  });
  const result = app.computeKmStation(0, 0.001, 'NLEX');
  assert.equal(result.expressway, 'NLEX');
  assert.equal(result.bound, 'NB');
  assert.ok(Math.abs(result.km - 10.1) < 1e-9);
  assert.equal(app.computeKmStation(0, 0.001, 'UNKNOWN'), null);
});

test('GPS callback rejects old and duplicate fixes, then expires capture eligibility', () => {
  const start = source.indexOf('if(navigator.geolocation){');
  const end = source.indexOf('// ---------- Defect logging ----------', start);
  assert.ok(start >= 0 && end > start);
  let success, failure, expiration, updates = 0, uncertain = 0, filtered = 0;
  const app = vm.createContext({
    navigator: { geolocation: { watchPosition: (onSuccess, onFailure) => { success = onSuccess; failure = onFailure; } } },
    Date: { now: () => 20000 }, GPS_FRESH_MS: 12000,
    currentPos: null, currentResolvedLocation: null, gpsFreshnessTimer: null,
    gpsPermissionDenied: false,
    updateGpsConfidence: () => {},
    gpsFilter: { process: (lat, lon) => { filtered++; return { lat, lon }; } },
    resolveFreshLocation: () => ({ confirmed: true, uncertain: false }),
    markGpsUncertain: () => { uncertain++; if (app.currentPos) app.currentPos.fresh = false; },
    gpsStatus: { textContent: '', className: '' }, updateReadout: () => { updates++; },
    setGpsCaptureReady: () => {}, clearTimeout: () => {},
    setTimeout: callback => { expiration = callback; return 1; }
  });
  vm.runInContext(source.slice(start, end), app);
  const fix = timestamp => ({ timestamp, coords: { latitude: 15, longitude: 120.7, accuracy: 8, speed: 2 } });
  success(fix(7000)); // Too old on arrival.
  assert.equal(app.currentPos, null);
  assert.equal(uncertain, 1);
  success(fix(19000));
  assert.equal(app.currentPos.fresh, true);
  assert.equal(filtered, 1);
  success(fix(19000)); // Duplicate timestamp cannot overwrite the accepted position.
  assert.equal(filtered, 1);
  assert.equal(updates, 1);
  expiration();
  assert.equal(app.currentPos.fresh, false);
  assert.equal(uncertain, 2);
  failure({ message: 'unavailable' });
  assert.equal(uncertain, 3);
});

test('stale GPS blocks both defect and camera capture; a fresh confirmed fix shares one location snapshot', () => {
  const alerts = [];
  const app = context(['offNetworkThresholdKm', 'isInterchangeLocationMode', 'interchangeSegmentLabel',
    'resolvedLocationCanSave', 'resolvedEntrySnapshot', 'logDefect', 'getCameraSnapshot'], {
    OFF_NETWORK_KM: 0.08,
    currentPos: { lat: 15, lon: 120.7, acc: 8, fresh: false },
    currentResolvedLocation: { saveAllowed: true, result: { km: 80.125, expressway: 'NLEX', distance: 0.005 } },
    KMTrackLocation: { isInterchangeMode: () => false },
    userBound: 'NB', entries: [], KMTrackEntry: entryModel, inspectorName: 'Inspector',
    fullTimestamp: () => '2026-09-20 10:00:00', saveEntries: () => {}, renderLog: () => {},
    alert: message => alerts.push(message)
  });
  app.logDefect('Potholes', '2');
  assert.equal(app.getCameraSnapshot('Photo'), null);
  assert.equal(app.entries.length, 0);
  assert.equal(alerts.length, 2);
  app.currentPos.fresh = true;
  app.logDefect('Potholes', '2');
  const photo = app.getCameraSnapshot('Photo');
  assert.equal(app.entries.length, 1);
  assert.equal(app.entries[0].km, 80.125);
  assert.equal(app.entries[0].expressway, photo.expressway);
  assert.equal(app.entries[0].lat, photo.lat);
  assert.equal(app.entries[0].bound, photo.bound);
  assert.equal(app.entries[0].lane_number, 2);
  assert.ok(app.entries[0].id);
});

test('local storage migrates legacy rows once and reports a failed save without dropping in-memory entries', () => {
  const values = new Map([['nlex_inspection_entries_v1', JSON.stringify([{ type: 'Cracks', lat: 15, lon: 120 }])]]);
  let writes = 0;
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { writes++; values.set(key, value); },
    removeItem: key => values.delete(key)
  };
  const warning = { hidden: true, textContent: '' };
  const app = context(['testStorageWritable', 'loadFromStorage', 'saveEntries'], {
    localStorage: storage, STORAGE_KEY_ENTRIES: 'nlex_inspection_entries_v1',
    STORAGE_KEY_BOUND: 'nlex_user_bound_v1', KMTrackEntry: entryModel,
    storageAvailable: false, entries: [], userBound: '',
    document: { getElementById: () => warning }
  });
  app.loadFromStorage();
  assert.equal(app.entries.length, 1);
  assert.ok(app.entries[0].id);
  assert.equal(JSON.parse(values.get('nlex_inspection_entries_v1'))[0].id, app.entries[0].id);
  const migratedId = app.entries[0].id;
  app.loadFromStorage();
  assert.equal(app.entries[0].id, migratedId);
  assert.equal(writes, 3); // Two writable probes and one migration write.
  storage.setItem = () => { throw new Error('quota exceeded'); };
  assert.equal(app.saveEntries(), false);
  assert.equal(app.storageAvailable, false);
  assert.equal(app.entries.length, 1);
  assert.equal(warning.hidden, false);
  assert.match(warning.textContent, /Save failed/);
});

test('map initialization restores the saved view and does not recenter it on GPS', async () => {
  const calls = { views: [], events: [], fetches: 0, location: 0, entries: 0 };
  const map = {
    setView(point, zoom) { calls.views.push({ point, zoom }); return this; },
    on(event) { calls.events.push(event); return this; }
  };
  const app = context(['initOsmMap'], {
    osmMap: null, osmHasCenteredOnLocation: false,
    L: { map: () => map }, loadMapView: () => ({ lat: 14.7, lng: 120.9, zoom: 14 }),
    updateOsmBasemap: () => {}, updateMapLandmarks: () => {},
    updateOsmLocation: () => { calls.location++; },
    updateMapEntries: () => { calls.entries++; }, rememberMapView: () => {},
    fetch: () => { calls.fetches++; return Promise.resolve({ ok: true, json: () => Promise.resolve({ assets: [] }) }); },
    supplementalMapLandmarks: []
  });
  app.initOsmMap();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(Array.from(calls.views[0].point), [14.7, 120.9]);
  assert.equal(calls.views[0].zoom, 14);
  assert.equal(app.osmHasCenteredOnLocation, true);
  assert.equal(calls.location, 1);
  assert.equal(calls.entries, 1);
  app.initOsmMap();
  assert.equal(calls.views.length, 1);
  assert.equal(calls.fetches, 1);
  assert.ok(calls.events.includes('moveend'));
});
