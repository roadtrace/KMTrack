/* Explicit Phase 11 inspection operations. The offline sync queue is not connected. */
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
    if (entry.importBatchId || entry.guest_claim_required === true || entry.preapproval_review_required === true) fail('This inspection requires review before cloud submission.');
    if (entry.cloud_source || entry.remote_id || entry.sync_status === 'synced') fail('This inspection already identifies a cloud record.');
    return true;
  }
  function laneParts(entry) {
    const lane = String(entry.lane || '').trim();
    return /^[1-4]$/.test(lane) ? { lane_number: Number(lane), lane_other: null } : { lane_number: null, lane_other: lane && lane !== 'Others' ? lane : null };
  }
  function mapEntry(entry, context) {
    eligible(entry, context);
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
  function createApi({ client, verify, context, durable }) {
    async function authorized(write) {
      await verify();
      const current = requireContext(context(), write);
      const result = await client.auth.getUser();
      if (result.error || result.data?.user?.id !== current.userId) fail('Authenticated account changed. Verify online again.');
      return current;
    }
    async function insertOne(entry) {
      const current = await authorized(true);
      eligible(entry, current);
      if (!durable(entry)) fail('Save this inspection locally before cloud submission.');
      const row = mapEntry(entry, current);
      const result = await client.from('inspections').insert(row).select().single();
      if (!result.error) return { row: result.data, status: 'inserted' };
      if (result.error.code === '23505') {
        const found = await client.from('inspections').select('*').eq('id', entry.id).maybeSingle();
        if (found.error) throw found.error;
        return { row: found.data || null, status: 'id-conflict' };
      }
      throw result.error;
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
    return { insertOne, fetchAuthorized, updateAuthorized };
  }
  return { phTime, dmm, eligible, laneParts, mapEntry, cloudChanges, createApi };
});
