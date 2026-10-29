/* Read-only My-record projection. Never writes local entries or sync snapshots. */
(function(root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./inspection-api') : root.SPOTITInspections,
    node ? require('./cloud-records') : root.SPOTITCloudRecords);
  if (node) module.exports = api;
  if (root) root.SPOTITRecordPresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(inspections, cloud) {
  'use strict';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  // Photos and server updated_at are separate from immutable inspection intent.
  const CONTENT = inspections.ROW_FIELDS.filter(k => !['photo_filename','photo_path'].includes(k));
  const same = (key, a, b) => {
    if (['latitude','longitude'].includes(key)) return typeof a === 'number' && typeof b === 'number'
      && Number.isFinite(a) && Number.isFinite(b) && (a === b || Number(a.toPrecision(15)) === b);
    if (['created_at','inspected_at'].includes(key)) {
      try { return cloud.timestamp(a) === cloud.timestamp(b); } catch (_) { return false; }
    }
    if (['id','user_id'].includes(key)) return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
    return a === b;
  };
  function differences(a, b, exactCoordinates = false) {
    return CONTENT.filter(k => exactCoordinates && ['latitude','longitude'].includes(k)
      ? a?.[k] !== b?.[k] : !same(k,a?.[k],b?.[k]));
  }
  const held = row => row.guest_claim_required === true || row.preapproval_review_required === true
    || row.submission_review_required === true || row.sync_outcome_unknown === true
    || ['local_only','needs_review','syncing','pending','failed'].includes(row.sync_status);
  function divergence(local, remote, scope) {
    let mapped = null;
    const baseline = local.submission_snapshot?.version === 1 ? local.submission_snapshot.row : null;
    try {
      // Mapping for display comparison grants no submission permission.
      mapped = inspections.submissionContent(local, { userId:scope.userId, profile:{team:scope.team} });
    } catch (_) { /* Unmappable local content stays device-primary. */ }
    const validBaseline = !!baseline && inspections.matchesSnapshot(local.submission_snapshot, baseline)
      && UUID.test(baseline.id || '') && baseline.id.toLowerCase() === local.id.toLowerCase()
      && baseline.user_id?.toLowerCase() === scope.userId && baseline.team === scope.team;
    const localFields = validBaseline && mapped ? differences(baseline,mapped,true) : null;
    const cloudFields = validBaseline ? differences(baseline,remote) : null;
    const displayFields = mapped ? differences(mapped,remote) : null;
    const acknowledged = local.sync_status === 'synced' && local.remote_id?.toLowerCase() === local.id.toLowerCase()
      && local.user_id?.toLowerCase() === scope.userId && local.team === scope.team;
    const clean = acknowledged && !held(local) && validBaseline && localFields?.length === 0;
    return Object.freeze({ localChanged: localFields === null ? null : !!localFields.length,
      cloudChanged: cloudFields === null ? null : !!cloudFields.length,
      localFields: localFields && Object.freeze(localFields), cloudFields: cloudFields && Object.freeze(cloudFields),
      displayFields: displayFields && Object.freeze(displayFields), comparisonUnknown: !mapped || !validBaseline,
      held: held(local), acknowledged, primary: clean ? 'cloud' : 'local',
      photoReferenceChanged: !!baseline && (baseline.photo_path !== remote.photo_path || baseline.photo_filename !== remote.photo_filename),
      localOnlyFields: Object.freeze(['notes','inspector','photoId','photoFilename','guest_claim_required','preapproval_review_required']) });
  }
  function mergeMy(localEntries, page, currentScope) {
    // Caller must supply a freshly captured scope. Stale pages never join locals.
    const authorized = !!currentScope && typeof currentScope.token === 'string' && !!currentScope.token
      && page?.view === 'my' && page.scope?.token === currentScope.token;
    const remote = new Map();
    if (authorized) for (const row of page.rows) if (cloud.rowInScope(row,currentScope,'my')) remote.set(row.id.toLowerCase(),row);
    const grouped = new Map(), excluded = { imported:0, invalid:0, otherOwner:0 };
    for (const row of localEntries || []) {
      if (row.importBatchId || row.cloud_source) { excluded.imported++; continue; }
      if (!UUID.test(row.id || '')) { excluded.invalid++; continue; }
      // Input is the current account workspace, never Guest; explicit other owners rejected.
      if (!currentScope || row.user_id && row.user_id.toLowerCase() !== currentScope.userId) { excluded.otherOwner++; continue; }
      const id = row.id.toLowerCase();
      if (!grouped.has(id)) grouped.set(id,[]);
      grouped.get(id).push(row);
    }
    const records = [];
    for (const [id, locals] of grouped) {
      const local = locals[0], submitted = remote.get(id) || null;
      remote.delete(id);
      const meta = submitted ? divergence(local,submitted,currentScope) : null;
      const primary = locals.length > 1 ? 'local' : meta?.primary || 'local';
      records.push(Object.freeze({ id, source:submitted ? 'combined' : 'local', local, cloud:submitted,
        localCopies:Object.freeze(locals.slice()), duplicateLocal:locals.length > 1, divergence:meta, primary,
        display:primary === 'cloud' ? submitted : local, localPhotoId:local.photoId || null,
        submittedDetails:submitted, readOnly:primary === 'cloud' }));
    }
    for (const [id,row] of remote) records.push(Object.freeze({ id, source:'cloud', local:null, cloud:row,
      localCopies:Object.freeze([]), duplicateLocal:false, divergence:null, primary:'cloud', display:row,
      localPhotoId:null, submittedDetails:row, readOnly:true }));
    // Local workspace insertion order is preserved; cloud-only order is server order.
    return Object.freeze({ records:Object.freeze(records), excluded:Object.freeze(excluded),
      cloudIncluded:authorized, coverage:authorized ? page.coverage : 'local-only' });
  }
  // Public integration helper: pass freshly read context, never a stored scope.
  // Local account records remain usable while cloud verification is unavailable.
  function projectMy({ localEntries, page, context, workspaceKey, online }) {
    const scope = cloud.scopeOf(context,workspaceKey,online);
    const localAllowed = context?.canUseLocal === true && UUID.test(context.userId || '')
      && context.workspaceUserId === context.userId && typeof workspaceKey === 'string' && !!workspaceKey
      && ['approved','pending','offline-recent','verification-required','local-only'].includes(context.mode);
    const localScope = localAllowed ? { userId:context.userId.toLowerCase() } : null;
    return mergeMy(localEntries,page,scope || localScope);
  }
  return { CONTENT, differences, divergence, mergeMy, projectMy };
});
