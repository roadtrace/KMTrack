/* Log-only presentation helpers. No storage, queries, photo reads or mutations. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SPOTITLogRegister = api;
})(globalThis, function() {
  'use strict';
  const registerTime = new Intl.DateTimeFormat('en-PH', {timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true});
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function historyUnavailable(context = {}, online = true) {
    if (!online) return 'Offline · Records on this device remain available. Submitted history requires a connection.';
    if (context.mode === 'guest') return 'Guest local mode · Records stay on this device.';
    if (!context.canUseLocal) return 'Sign in or use Guest local mode to open inspections on this device.';
    if (!context.profile?.approved) return 'Account approval is required for submitted history. Device records remain available.';
    if (!context.profile?.team) return 'No team is assigned. Submitted history is unavailable. Device records remain available.';
    if (!context.cloudVerified) return 'Verify your account online to load submitted history. Device records remain available.';
    return 'Submitted history permission is unavailable. Device records remain available.';
  }
  function emptyMessage({scope = 'device', filtered = false, loading = false, loaded = false, available = true} = {}) {
    if (loading && scope === 'team') return 'Loading Team history…';
    if (scope === 'team' && !available) return 'Team history is unavailable. Check the account and connection status above.';
    if (filtered) return 'No entries match the current filters.';
    if (scope === 'imported') return 'No imported records on this device.';
    if (scope === 'team') return loaded ? 'No Team inspections in the loaded history.' : 'Open Refresh to load Team history.';
    return 'No inspections on this device or in the loaded history yet.';
  }
  function inspectionState(e, cloud = false) {
    if (cloud) return {key:'submitted', label:'Inspection submitted'};
    if (e.importBatchId) return {key:'imported', label:'Imported'};
    if (e.sync_status === 'synced' && e.remote_id && e.id && e.remote_id.toLowerCase() === e.id.toLowerCase()) return {key:'submitted', label:'Inspection submitted'};
    if (e.preapproval_review_required || e.submission_review_required || e.sync_status === 'needs_review' || e.sync_outcome_unknown) return {key:'review', label:'Needs review'};
    if (e.sync_status === 'syncing') return {key:'submitting', label:'Submitting inspection'};
    if (!e.guest_claim_required && ['pending','failed'].includes(e.sync_status)) return {key:'waiting', label:'Waiting to submit'};
    return {key:'device', label:'Saved on device'};
  }
  function matches(e, f = {}, cloud = false) {
    const normalized = v => String(v ?? '').trim().toLocaleLowerCase();
    const query = normalized(f.search);
    // Deliberately exclude IDs, owner IDs, photo/storage paths and email fields.
    const fields = [e.type, e.km == null ? '' : e.km, e.km == null ? '' : `KM ${km(e.km)}`, e.expressway, e.bound, e.lane, e.inspector, e.interchange, e.interchangeSegment, e.notes];
    if (query && !fields.some(value => normalized(value).includes(query))) return false;
    if (f.corridor && e.expressway !== f.corridor) return false;
    if (f.bound && normalized(e.bound).replace(/[\s_-]/g,'') !== normalized(f.bound).replace(/[\s_-]/g,'')) return false;
    if (f.lane && String(e.lane ?? '') !== f.lane) return false;
    // Cloud association is not proof of bytes. Only local references support this filter.
    if (f.photo && (cloud || (f.photo === 'with') !== Boolean(e.photoId))) return false;
    if (f.status && inspectionState(e, cloud).key !== f.status) return false;
    return true;
  }
  function km(value) {
    if (!Number.isFinite(Number(value))) return 'Unavailable';
    const metres = Math.round(Number(value) * 1000);
    return `${Math.floor(metres / 1000)}+${String(metres % 1000).padStart(3,'0')}`;
  }
  // Calendar strings stay calendar strings: no UTC conversion or DST shift.
  function dateRange(from = '', to = '') {
    const parts = value => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (!match) return null;
      const [, year, month, day] = match;
      const date = new Date(Date.UTC(+year, +month - 1, +day));
      if (date.toISOString().slice(0,10) !== value) return null;
      return {year, month, day: +day, label: date.toLocaleString('en-US', {month:'short', timeZone:'UTC'})};
    };
    const a = parts(from), b = parts(to);
    const full = p => `${p.label} ${p.day}, ${p.year}`;
    if (!a || !b) return a ? `From ${full(a)}` : b ? `Through ${full(b)}` : '';
    if (from === to) return full(a);
    if (a.year !== b.year) return `${full(a)} – ${full(b)}`;
    if (a.month === b.month) return `${a.label} ${a.day} – ${b.day}, ${a.year}`;
    return `${a.label} ${a.day} – ${b.label} ${b.day}, ${a.year}`;
  }
  function todayRecords(entries, day) {
    return entries.filter(e => !e.importBatchId && !e.cloud_source && String(e.timestamp || '').slice(0,10) === day)
      .slice().sort((a,b) => String(b.timestamp).localeCompare(String(a.timestamp)) || String(a.id || '').localeCompare(String(b.id || '')));
  }
  function evidence(e, {cloud = false, team = false, durable = true} = {}) {
    if (cloud || team || !durable) return 'Evidence';
    return String(e.photoId || '').trim() ? 'Photo' : 'No photo';
  }
  function cardHTML(e, {cloud = false, team = false, durable = true, photoLabel = '', notice = '', differs = false} = {}) {
    const state = inspectionState(e, cloud);
    const date = e.timestamp ? new Date(String(e.timestamp).replace(' ','T') + '+08:00') : null;
    const time = date && Number.isFinite(+date) ? registerTime.format(date) : String(e.timestamp || 'Date unavailable');
    const lane = e.lane == null || e.lane === '' ? 'Lane unset' : /^\d+$/.test(String(e.lane)) ? `Lane ${e.lane}` : String(e.lane);
    const station = e.km == null ? (e.interchange || 'KM unavailable') : `KM ${km(e.km)}`;
    const secondary = [lane, e.inspector || '', time].filter(Boolean).join(' · ');
    const source = [team ? 'Team record · Read only' : cloud ? 'Submitted record · Read only' : e.importBatchId ? e.importLabel || 'Device archive' : e.expressway || 'Corridor unset', notice].filter(Boolean).join(' · ');
    return `<div class="register-card-main"><span class="register-evidence"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></svg><span>${evidence(e, {cloud, team, durable})}</span></span><div class="register-card-copy"><div class="register-primary"><strong>${escape(e.type || 'Inspection')}</strong><span> · </span><span class="register-km">${escape(station)}</span>${e.bound ? ` <span>${escape(e.bound)}</span>` : ''}</div><div class="register-secondary">${escape(secondary)}</div><div class="register-source">${escape(source)}</div></div><span class="register-chevron" aria-hidden="true">›</span></div><div class="register-statuses"><span class="register-status state-${state.key}">${escape(state.label)}</span>${photoLabel ? `<span class="register-photo-status">${escape(photoLabel)}</span>` : ''}${!durable ? '<span class="register-alert">Not saved · export before closing</span>' : ''}${differs ? '<span class="register-alert">Device and submitted details differ</span>' : ''}</div>`;
  }
  function decorate(card, e, options) {
    // Move the existing controls; retain their IDs, guards and event wiring.
    const buttons = [...card.querySelectorAll('button')];
    card.innerHTML = cardHTML(e, options);
    const checkbox = buttons.find(b => b.classList.contains('entry-checkbox'));
    if (checkbox) card.prepend(checkbox);
    const actions = buttons.filter(b => b !== checkbox);
    if (actions.length) {
      const details = card.ownerDocument.createElement('details'); details.className = 'register-device-actions';
      const summary = card.ownerDocument.createElement('summary'); summary.textContent = 'Device actions';
      details.append(summary, ...actions); card.append(details);
    }
  }
  return {matches, inspectionState, cardHTML, decorate, km, historyUnavailable, emptyMessage, dateRange, todayRecords, evidence};
});
