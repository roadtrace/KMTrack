/* Explicit inspection operations and Phase 12.2 recovery foundation.
 * The offline sync queue is not connected. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SPOTITInspections = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const MUTABLE = new Set(['defect_type', 'expressway', 'direction', 'lane_number', 'lane_other', 'km_station', 'interchange_exit', 'interchange_segment']);
  const readText = value => value == null || value === '' ? null : String(value);
  const fail = message => { throw new Error(message); };
  function phTime(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value || ''));
    if (!match) fail('Inspection time needs review: expected Philippine date and time.');
    const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
    const wall = Date.UTC(year, month - 1, day, hour, minute, second || 0);
    const check = new Date(wall);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || check.getUTCHours() !== hour || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== (second || 0)) fail('Inspection time needs review: invalid date or time.');
    return new Date(wall - 8 * 3600000).toISOString();
  }
  function isoInstant(value, label) {
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) fail(`${label} needs review: invalid timestamp.`);
    return new Date(value).toISOString();
  }
  function dmm(value, positive, negative) {
    const absolute = Math.abs(value);
    const degrees = Math.floor(absolute);
    return `${value >= 0 ? positive : negative}${degrees} ${((absolute - degrees) * 60).toFixed(4)}`;
  }
  function requireContext(context, write) {
    if (!context || context.mode !== 'approved' || context.cloudVerified !== true || context.canUseLocal !== true || context.workspaceUserId !== context.userId || !UUID.test(context.userId || '') || context.profile?.id !== context.userId || context.profile.approved !== true) fail('Verify this account online and open its own workspace before using cloud inspections.');
    const role = context.profile.role;
    if (!['inspector', 'supervisor', 'administrator'].includes(role) || !context.profile.team && role !== 'administrator') fail('An approved team profile is required.');
    if (write && role === 'administrator') fail('Administrators cannot write engineering inspections.');
    return context;
  }
  function eligible(entry, context) {
    requireContext(context, true);
    if (!entry || !UUID.test(entry.id || '')) fail('Inspection UUID is missing or invalid; review this local record.');
    if (entry.importBatchId || entry.guest_claim_required === true || entry.preapproval_review_required === true || entry.submission_review_required === true) fail('This inspection requires review before cloud submission.');
    if (entry.cloud_source || entry.remote_id || entry.sync_status === 'synced') fail('This inspection already identifies a cloud record.');
    if (['local_only','needs_review','syncing'].includes(entry.sync_status) || entry.sync_outcome_unknown === true) fail('This inspection is held locally or requires reconciliation before submission.');
    if (entry.submission_snapshot && entry.submission_retry_allowed !== true) fail('Reconcile the previous submission before another insert.');
    return true;
  }
  function laneParts(entry) {
    const lane = String(entry.lane || '').trim();
    return /^[1-4]$/.test(lane) ? { lane_number: Number(lane), lane_other: null } : { lane_number: null, lane_other: lane && lane !== 'Others' ? lane : null };
  }
  function mapEntry(entry, context) {
    eligible(entry, context);
    return submissionContent(entry, context);
  }
  // Shared Phase 11 mapping, also usable for comparing held records. This does
  // not grant permission to send them: mapEntry/authorized enforce that boundary.
  function submissionContent(entry, context) {
    if (!Number.isFinite(entry.lat) || Math.abs(entry.lat) > 90 || !Number.isFinite(entry.lon) || Math.abs(entry.lon) > 180) fail('Inspection coordinates need review.');
    if (!String(entry.type || '').trim()) fail('Defect type is required.');
    const metres = entry.km == null ? null : Math.round(entry.km * 1000);
    if (metres !== null && (!Number.isFinite(entry.km) || !Number.isSafeInteger(metres) || metres < -2147483648 || metres > 2147483647)) fail('KM station needs review.');
    return {
      id: entry.id, created_at: isoInstant(entry.created_at, 'Creation time'),
      user_id: context.userId, team: context.profile.team,
      inspected_at: phTime(entry.timestamp), defect_type: entry.type.trim(),
      latitude: entry.lat, longitude: entry.lon,
      latitude_dmm: dmm(entry.lat, 'N', 'S'), longitude_dmm: dmm(entry.lon, 'E', 'W'),
      expressway: readText(entry.expressway), direction: readText(entry.bound),
      ...laneParts(entry), km_station: metres,
      interchange_exit: readText(entry.interchange), interchange_segment: readText(entry.interchangeSegment),
      photo_filename: null, photo_path: null
    };
  }
  function cloudChanges(changes) {
    if (!changes || typeof changes !== 'object' || !Object.keys(changes).length || Object.keys(changes).some(key => !MUTABLE.has(key))) fail('Only editable inspection fields may be changed.');
    const mapped = {};
    for (const key of Object.keys(changes)) {
      const value = changes[key];
      if (key === 'lane_number' && value !== null && ![1, 2, 3, 4].includes(value)) fail('Invalid lane number.');
      if (key === 'km_station' && value !== null && (!Number.isInteger(value) || value < -2147483648 || value > 2147483647)) fail('Invalid KM station.');
      if (!['lane_number', 'km_station'].includes(key) && value !== null && typeof value !== 'string') fail(`Invalid ${key}.`);
      mapped[key] = value;
    }
    if (mapped.lane_number != null && mapped.lane_other != null) fail('Use either a numbered lane or another position.');
    if (mapped.lane_number != null) mapped.lane_other = null;
    if (mapped.lane_other != null) mapped.lane_number = null;
    return mapped;
  }
  const ROW_FIELDS = Object.freeze(['id','created_at','user_id','team','inspected_at','defect_type','latitude','longitude','latitude_dmm','longitude_dmm','expressway','direction','lane_number','lane_other','km_station','interchange_exit','interchange_segment','photo_filename','photo_path']);
  const NUMERIC_FIELDS = new Set(['latitude','longitude','lane_number','km_station']);
  const NULLABLE_FIELDS = new Set(['expressway','direction','lane_number','lane_other','km_station','interchange_exit','interchange_segment','photo_filename','photo_path']);
  function canonicalRow(row) {
    if (!row || typeof row !== 'object') fail('Submission row is missing.');
    const result = {};
    for (const key of ROW_FIELDS) {
      const value = row[key];
      if (value === null && NULLABLE_FIELDS.has(key)) result[key] = null;
      else if (['id','user_id'].includes(key)) {
        if (!UUID.test(value || '')) fail('Invalid row identity.');
        result[key] = value.toLowerCase();
      } else if (['created_at','inspected_at'].includes(key)) {
        // Do not discard meaningful sub-millisecond precision from a server row.
        if (/\.\d{3}\d*[1-9]\d*(?:Z|[+-]\d\d:\d\d)$/.test(value)) fail('Timestamp precision differs.');
        result[key] = isoInstant(value, key);
      } else if (NUMERIC_FIELDS.has(key)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) fail('Invalid numeric row field.');
        result[key] = value;
      } else {
        if (typeof value !== 'string') fail('Missing or invalid row field.');
        result[key] = value;
      }
    }
    return result;
  }
  function submissionSnapshot(entry, current) {
    return { version: 1, row: canonicalRow(mapEntry(entry, current)) };
  }
  function snapshotRow(snapshot) {
    if (snapshot?.version !== 1) fail('Submission snapshot needs review.');
    const row = canonicalRow(snapshot.row);
    if (row.photo_filename !== null || row.photo_path !== null || !row.team || !row.defect_type || Math.abs(row.latitude) > 90 || Math.abs(row.longitude) > 180 || row.lane_number !== null && ![1,2,3,4].includes(row.lane_number) || row.km_station !== null && !Number.isInteger(row.km_station)) fail('Submission snapshot needs review.');
    return row;
  }
  function matchesSnapshot(snapshot, row) {
    try { return JSON.stringify(snapshotRow(snapshot)) === JSON.stringify(canonicalRow(row)); }
    catch (_) { return false; }
  }
  function localMatchesSnapshot(entry, snapshot, current) {
    try { return matchesSnapshot(snapshot, submissionContent(entry, current)); }
    catch (_) { return false; }
  }
  const scopeKey = current => JSON.stringify([current?.userId, current?.workspaceUserId, current?.profile?.team, current?.profile?.role, current?.scopeGeneration]);
  const authorizationError = error => ['401','403','42501','PGRST301','PGRST302'].includes(String(error?.code)) || [401,403].includes(error?.status);

  function createApi({ client, verify, context, durable, persist, isCurrent }) {
    async function authorized(write) {
      await verify();
      const current = requireContext(context(), write);
      const result = await client.auth.getUser();
      if (result.error || result.data?.user?.id !== current.userId) fail('Authenticated account changed. Verify online again.');
      return current;
    }
    function guard(entry, scope) {
      requireContext(context(), true);
      if (scopeKey(context()) !== scope || typeof isCurrent !== 'function' || !isCurrent(entry)) fail('Account, session, workspace or local record changed.');
    }
    function saveState(entry, changes) {
      const before = { ...entry };
      Object.assign(entry, changes);
      try {
        if (typeof persist !== 'function' || persist(entry) !== true || !durable(entry)) fail('Local confirmation could not be saved.');
      } catch (error) {
        for (const key of Object.keys(entry)) if (!(key in before)) delete entry[key];
        Object.assign(entry, before);
        throw error;
      }
    }
    function hold(entry, message, review = false) {
      saveState(entry, { sync_status: 'needs_review', sync_outcome_unknown: true, submission_retry_allowed: false, ...(review ? { submission_review_required: true } : {}), sync_error: message });
    }
    async function insertOne(entry) {
      // Reject memory-only records before even starting online authorization.
      if (!durable(entry)) fail('Save this inspection locally before cloud submission.');
      const scope = scopeKey(context());
      const current = await authorized(true);
      guard(entry, scope);
      eligible(entry, current);
      if (!durable(entry)) fail('Save this inspection locally before cloud submission.');
      const snapshot = entry.submission_snapshot || submissionSnapshot(entry, current);
      const row = snapshotRow(snapshot);
      if (row.id !== entry.id.toLowerCase() || row.user_id !== current.userId.toLowerCase() || row.team !== current.profile.team || !localMatchesSnapshot(entry, snapshot, current)) {
        hold(entry, 'Local inspection differs from its original submission snapshot. Review required.', true);
        fail('Submission snapshot differs; review required.');
      }
      // One confirmed storage write contains both the immutable intent and the
      // uncertain marker. Any later interruption must reconcile before INSERT.
      saveState(entry, { submission_snapshot: snapshot, submission_retry_allowed: false, sync_status: 'syncing', sync_outcome_unknown: true, sync_error: '' });
      const attempt = JSON.stringify(snapshot);
      let result;
      try { result = await client.from('inspections').insert(row).select().single(); }
      catch (error) {
        guard(entry, scope);
        hold(entry, 'Submission response unavailable; reconcile before another insert.');
        throw error;
      }
      guard(entry, scope);
      if (JSON.stringify(entry.submission_snapshot) !== attempt || !localMatchesSnapshot(entry, snapshot, current)) {
        hold(entry, 'Local inspection changed during submission; review the original snapshot.', true);
        return { status: 'local-changed' };
      }
      if (result.error) {
        if (result.error.code === '23505') {
          // A uniqueness error proves a row exists, even if RLS hides it.
          saveState(entry, { submission_uuid_conflict: true, sync_status: 'needs_review', sync_outcome_unknown: true, sync_error: 'UUID conflict; reconcile before any retry.' });
          return { status: 'id-conflict', row: null };
        }
        hold(entry, 'Submission response failed; reconcile before another insert.');
        throw result.error;
      }
      if (!matchesSnapshot(snapshot, result.data)) {
        hold(entry, 'Server acknowledgement differs from the submission snapshot.', true);
        return { status: 'mismatch' };
      }
      saveState(entry, { remote_id: entry.id, sync_status: 'synced', sync_outcome_unknown: false, sync_error: '', synced_at: new Date().toISOString() });
      return { row: result.data, status: 'inserted' };
    }
    // Explicit one-record recovery seam only. Nothing schedules or invokes this
    // automatically, and this method never writes to the backend.
    async function reconcileOne(entry) {
      const scope = scopeKey(context());
      try { guard(entry, scope); }
      catch (_) { return { status: 'inaccessible', retryAllowed: false }; }
      if (!durable(entry)) return { status: 'not-durable', retryAllowed: false };
      // Revoke any previous absence proof before a fresh verification/read. A
      // failed fresh read must never leave an older retry permission active.
      saveState(entry, { submission_retry_allowed: false, sync_outcome_unknown: true });
      let current;
      try { current = await authorized(true); guard(entry, scope); }
      catch (_) { return { status: 'inaccessible', retryAllowed: false }; }
      if (!durable(entry)) return { status: 'not-durable', retryAllowed: false };
      let snapshot, row;
      try {
        snapshot = JSON.parse(JSON.stringify(entry.submission_snapshot));
        row = snapshotRow(snapshot);
        if (row.id !== entry.id.toLowerCase() || row.user_id !== current.userId.toLowerCase() || row.team !== current.profile.team || entry.guest_claim_required || entry.preapproval_review_required || entry.submission_review_required || entry.importBatchId || entry.cloud_source || entry.sync_status === 'local_only') fail('Snapshot scope requires review.');
        if (!localMatchesSnapshot(entry, snapshot, current)) fail('Local inspection differs from its original snapshot.');
      } catch (_) {
        hold(entry, 'Submission snapshot or local content requires review.', true);
        return { status: 'mismatch', retryAllowed: false };
      }
      const fingerprint = JSON.stringify(entry);
      let found;
      try { found = await client.from('inspections').select(ROW_FIELDS.join(',')).eq('id', row.id).maybeSingle(); }
      catch (error) { found = { error }; }
      try { guard(entry, scope); }
      catch (_) { return { status: 'inaccessible', retryAllowed: false }; }
      if (JSON.stringify(entry) !== fingerprint || !durable(entry)) {
        hold(entry, 'Local inspection changed during reconciliation; review required.', true);
        return { status: 'local-changed', retryAllowed: false };
      }
      if (!found || typeof found !== 'object') return { status: 'transient-failure', retryAllowed: false };
      if (found.error) return { status: authorizationError(found.error) ? 'inaccessible' : 'transient-failure', retryAllowed: false };
      if (!Object.hasOwn(found, 'data') || found.data === undefined) return { status: 'transient-failure', retryAllowed: false };
      if (found.data === null) {
        if (entry.submission_uuid_conflict || entry.remote_id || entry.sync_status === 'synced') {
          hold(entry, 'Previously existing UUID is not visible; absence cannot authorize another insert.');
          return { status: 'inaccessible', retryAllowed: false };
        }
        saveState(entry, { submission_retry_allowed: true, sync_status: 'failed', sync_outcome_unknown: false, sync_error: 'No authorized cloud row found; controlled retry may be considered.' });
        return { status: 'no-row', retryAllowed: true };
      }
      if (!matchesSnapshot(snapshot, found.data)) {
        hold(entry, 'Cloud identity or inspection content differs from the original snapshot.', true);
        return { status: 'mismatch', retryAllowed: false };
      }
      saveState(entry, { remote_id: entry.id, sync_status: 'synced', sync_outcome_unknown: false, submission_retry_allowed: false, sync_error: '', synced_at: new Date().toISOString() });
      return { status: 'matching', retryAllowed: false };
    }
    async function fetchAuthorized({ from = 0, limit = 100 } = {}) {
      await authorized(false);
      if (!Number.isInteger(from) || from < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) fail('Invalid cloud record page.');
      const result = await client.from('inspections').select('*').order('inspected_at', { ascending: false }).range(from, from + limit - 1);
      if (result.error) throw result.error;
      return (result.data || []).map(row => ({ ...row, cloud_source: true }));
    }
    async function updateAuthorized(id, changes, original) {
      const current = await authorized(true);
      if (!UUID.test(id || '') || !original || original.id !== id || original.cloud_source !== true) fail('Select a fetched cloud inspection to edit.');
      if (original.team !== current.profile.team || current.profile.role === 'inspector' && original.user_id !== current.userId) fail('This account cannot edit that inspection.');
      const result = await client.from('inspections').update(cloudChanges(changes)).eq('id', id).select().maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) fail('Inspection was not updated. It may no longer be accessible.');
      return { ...result.data, cloud_source: true };
    }
    return { insertOne, reconcileOne, fetchAuthorized, updateAuthorized };
  }
  return { phTime, dmm, eligible, laneParts, mapEntry, submissionSnapshot, matchesSnapshot, localMatchesSnapshot, ROW_FIELDS, cloudChanges, createApi };
});
