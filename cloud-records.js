/* Phase 14A.1: scoped, read-only cloud pages. No persistence or transport writes. */
(function(root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./inspection-api') : root.SPOTITInspections);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SPOTITCloudRecords = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(inspections) {
  'use strict';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const PAGE_SIZE = 50, MAX_PAGES = 5;
  const COLUMNS = [...inspections.ROW_FIELDS, 'updated_at'].join(',');
  const error = (code, message) => Object.assign(new Error(message), { code });
  function viewName(view) {
    if (!['my','team'].includes(view)) throw error('view', 'Choose My or Team records.');
    return view;
  }
  // Preserve PostgreSQL microseconds, including cursor equality at a timestamp tie.
  // Never run cursors through Date.toISOString() alone (millisecond truncation).
  function timestamp(value) {
    if (value === null) return null;
    const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/.exec(value || '');
    if (!m || !Number.isFinite(Date.parse(m[1] + m[3]))) throw error('row', 'Invalid cloud inspection timestamp.');
    return new Date(Date.parse(m[1] + m[3])).toISOString().slice(0,19) + '.' + (m[2] || '').padEnd(6,'0') + 'Z';
  }
  function position(row) { return { inspected_at: timestamp(row.inspected_at), id: row.id.toLowerCase() }; }
  function compare(a, b) {
    if (a.inspected_at !== b.inspected_at) {
      if (a.inspected_at === null) return 1;
      if (b.inspected_at === null) return -1;
      return a.inspected_at > b.inspected_at ? -1 : 1;
    }
    return a.id === b.id ? 0 : a.id > b.id ? -1 : 1;
  }
  function cursorFilter(cursor) {
    if (!cursor || !UUID.test(cursor.id)) throw error('cursor', 'Invalid record cursor.');
    const time = timestamp(cursor.inspected_at), id = cursor.id.toLowerCase();
    return time === null ? `and(inspected_at.is.null,id.lt.${id})`
      : `inspected_at.lt.${time},and(inspected_at.eq.${time},id.lt.${id}),inspected_at.is.null`;
  }
  function scopeOf(current, workspaceKey, online) {
    if (!online || current?.mode !== 'approved' || current.cloudVerified !== true || current.canUseLocal !== true
      || !UUID.test(current.userId || '') || current.workspaceUserId !== current.userId
      || current.profile?.id !== current.userId || current.profile.approved !== true
      || !['inspector','supervisor','administrator'].includes(current.profile.role)
      || typeof current.profile.team !== 'string' || !current.profile.team.trim()
      || typeof workspaceKey !== 'string' || !workspaceKey
      || !Number.isSafeInteger(current.sessionGeneration) || !Number.isSafeInteger(current.scopeGeneration)) return null;
    const scope = { userId: current.userId.toLowerCase(), workspaceUserId: current.workspaceUserId.toLowerCase(),
      team: current.profile.team, role: current.profile.role, workspaceKey,
      sessionGeneration: current.sessionGeneration, scopeGeneration: current.scopeGeneration };
    return Object.freeze({ ...scope, token: JSON.stringify(scope) });
  }
  function rowInScope(row, scope, view) {
    return !!row && UUID.test(row.id || '') && row.team === scope.team
      && (view === 'my' ? UUID.test(row.user_id || '') && row.user_id.toLowerCase() === scope.userId
        : row.user_id === null || UUID.test(row.user_id || ''));
  }
  function queryPage(client, scope, view, cursor) {
    viewName(view);
    let query = client.from('inspections').select(COLUMNS).eq('team', scope.team);
    if (view === 'my') query = query.eq('user_id', scope.userId);
    if (cursor) query = query.or(cursorFilter(cursor));
    return query.order('inspected_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false }).limit(PAGE_SIZE + 1);
  }
  const empty = () => ({ pages: [], cursor: null, hasMore: true, loaded: false, evicted: false,
    loading: false, error: null, lastRefresh: null, revision: 0, request: 0, promise: null });
  function createStore({ client, verify, context, key, online = () => true, now = Date.now }) {
    let scope = null, epoch = 0, views = { my: empty(), team: empty() };
    function clear() { epoch++; views = { my: empty(), team: empty() }; }
    function invalidate() { clear(); scope = null; }
    function syncScope() {
      const next = scopeOf(context(), key(), online());
      if (next?.token !== scope?.token) { clear(); scope = next; }
      return scope;
    }
    function guard(captured, generation) {
      const current = syncScope();
      if (!current || current.token !== captured.token || epoch !== generation) throw error('scope', 'Cloud record scope changed.');
    }
    function snapshot(view) {
      viewName(view); syncScope();
      const state = views[view], rows = new Map();
      for (const page of state.pages) for (const row of page) rows.set(row.id, row);
      return Object.freeze({ view, scope, rows: Object.freeze([...rows.values()].sort((a,b) => compare(position(a),position(b)))),
        cursor: state.cursor, hasMore: !!scope && state.hasMore, loaded: state.loaded, evicted: state.evicted,
        loading: state.loading, error: state.error, lastRefresh: state.lastRefresh, revision: state.revision,
        pageCount: state.pages.length, coverage: state.evicted ? 'retained-window' : 'loaded-pages' });
    }
    function load(view, { refresh = false } = {}) {
      viewName(view);
      const captured = syncScope();
      if (!captured) return Promise.reject(error('authorization', 'Verify an approved account with an assigned team and its own workspace online.'));
      const state = views[view], generation = epoch;
      if (state.promise && !refresh) return state.promise;
      if (state.loaded && !state.hasMore && !refresh) return Promise.resolve(snapshot(view));
      const request = ++state.request, cursor = refresh ? null : state.cursor;
      state.loading = true; state.error = null;
      const currentRequest = () => {
        guard(captured, generation);
        if (views[view] !== state || state.request !== request) throw error('superseded', 'Cloud record request superseded.');
      };
      const run = async () => {
        try {
          try { await verify(); } catch (_) { currentRequest(); invalidate(); throw error('authorization', 'Online verification unavailable.'); }
          currentRequest();
          let auth;
          try { auth = await client.auth.getUser(); } catch (_) { currentRequest(); invalidate(); throw error('authorization', 'Online authentication unavailable.'); }
          currentRequest();
          if (auth.error || auth.data?.user?.id?.toLowerCase() !== captured.userId) {
            invalidate(); throw error('authorization', 'Authenticated account changed.');
          }
          const result = await queryPage(client, captured, view, cursor);
          currentRequest();
          if (result.error) {
            if (['401','403','42501','PGRST301','PGRST302','PGRST303'].includes(String(result.error.code))
              || [401,403].includes(Number(result.status)) || [401,403].includes(Number(result.error.status))) {
              invalidate(); throw error('authorization', 'Cloud read access unavailable.');
            }
            throw error('read', 'Cloud records could not be loaded.');
          }
          if (!Array.isArray(result.data) || result.data.length > PAGE_SIZE + 1) throw error('row', 'Invalid cloud page.');
          const page = [];
          let previous = cursor;
          for (const raw of result.data) {
            if (!rowInScope(raw, captured, view)) { invalidate(); throw error('authorization', 'Cloud page returned a row outside its scope.'); }
            const pos = position(raw);
            if (previous && compare(previous, pos) >= 0) throw error('row', 'Cloud page order or cursor is invalid.');
            previous = pos;
            // Only scalar table fields, detached and frozen; no SDK/session state.
            const row = {};
            for (const field of COLUMNS.split(',')) {
              if (raw[field] != null && !['string','number','boolean'].includes(typeof raw[field])) throw error('row', 'Invalid cloud row field.');
              row[field] = raw[field] ?? null;
            }
            row.id = pos.id; row.user_id = raw.user_id?.toLowerCase() ?? null; row.cloud_source = true;
            page.push(Object.freeze(row));
          }
          currentRequest();
          const consumed = page.slice(0, PAGE_SIZE);
          const pages = refresh ? [] : state.pages.slice();
          if (consumed.length) pages.push(Object.freeze(consumed));
          const evicted = (!refresh && state.evicted) || pages.length > MAX_PAGES;
          if (pages.length > MAX_PAGES) pages.shift();
          // Atomic commit. A failed refresh retains the earlier valid pages.
          Object.assign(state, { pages, evicted, cursor: consumed.length ? Object.freeze(position(consumed.at(-1))) : cursor,
            hasMore: page.length > PAGE_SIZE, loaded: true, revision: state.revision + 1,
            lastRefresh: refresh || !state.loaded ? now() : state.lastRefresh });
          state.loading = false;
          return snapshot(view);
        } catch (e) {
          if (epoch === generation && state.request === request && views[view] === state) state.error = e.code || 'read';
          throw e;
        } finally {
          if (state.request === request) { state.loading = false; state.promise = null; }
        }
      };
      // Install the shared promise before invoking verification (which may emit).
      state.promise = Promise.resolve().then(run);
      return state.promise;
    }
    return Object.freeze({ load, snapshot, syncScope, invalidate });
  }
  return { PAGE_SIZE, MAX_PAGES, COLUMNS, timestamp, position, compare, cursorFilter, scopeOf, rowInScope, createStore };
});
