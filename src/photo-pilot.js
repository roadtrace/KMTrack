/* Photo presentation and explicit read-only private viewing. No upload wakeups. */
(function(root,factory){
  const api=typeof module==='object'&&module.exports
    ? factory(require('./photo-upload-state'),require('./inspection-api'))
    : factory(root.SPOTITPhotoUpload,root.SPOTITInspections);
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.SPOTITPhotoPilot=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(photo,inspection){
  'use strict';
  const DISABLED='Photo uploads are disabled for this pilot. Retry time and saved upload evidence are retained.';
  function localOnly(e){
    return !!(e.guest_claim_required||e.guest_claim_pending||e.preapproval_review_required||e.submission_review_required||e.sync_status==='local_only');
  }
  function presentation(e){
    const status=photo.normalize(e).photo_sync_status,held=localOnly(e);
    const reserved=!!(e.photo_path||e.photo_reserved_path)&&status!=='photo_synced'&&!held;
    const review=!held&&status==='photo_needs_review';
    const retry=!held&&status==='photo_failed'&&photo.validManifest(e.photo_upload_manifest);
    const sourceMismatch=review&&(/source|local.*changed|payload hash|payload\/source identity mismatch/i.test(e.photo_sync_error||'')||
      e.photo_upload_manifest&&e.photo_upload_manifest.source_photo_id!==e.photoId);
    let detail=held?'This photo stays on this device.':sourceMismatch
      ? 'Saved upload evidence no longer matches the current local photo. The saved payload and intent are retained; replacement is unavailable.'
      : review?'The photo could not be verified. Saved upload evidence is retained; review is required before any recovery.'
      : retry?'Retry uses the same saved photo and path.':'';
    if(e.photo_next_retry_at&&!held) detail+=` Retry scheduled: ${e.photo_next_retry_at}.`;
    if(reserved) detail+=' Photo unavailable / reserved but not yet uploaded or verified. The reserved path is retained.';
    return {label:photo.label(e),detail:detail.trim(),review,retry,reserved,
      unavailable:reserved?'Photo unavailable / reserved but not yet uploaded':'',
      hasPhoto:!!(e.photoId||e.photo_upload_manifest||e.photo_path)};
  }
  function createViewer(o){
    async function load(e){
      const scope=inspection.scopeKey(o.context()),key=o.key(),photoId=e.photoId;
      const guard=()=>{
        if(scope!==inspection.scopeKey(o.context())||key!==o.key()||!o.isCurrent(e)||photoId!==e.photoId) throw Error('Photo viewing scope changed.');
      };
      guard();
      const local=photoId?await o.read(photoId):null;guard();
      if(local) return {blob:local,source:'local'};
      // Metadata alone never licenses retrieval or success. Missing sources do
      // not invalidate historical ack evidence, but held/source-change state does.
      const identity=JSON.stringify([e.photo_upload_manifest,e.photo_cloud_ack,e.photo_path,e.photo_filename]);
      let verified=false;
      const cloudGuard=()=>{
        guard();const c=o.context();
        if(localOnly(e)||photo.normalize(e).photo_sync_status!=='photo_synced'||!photo.validAcknowledgement(e)||
          e.sync_status!=='synced'||e.remote_id!==e.id||e.importBatchId||e.cloud_source||e.sync_outcome_unknown||
          JSON.stringify([e.photo_upload_manifest,e.photo_cloud_ack,e.photo_path,e.photo_filename])!==identity||
          !o.durable(e)||c.mode!=='approved'||c.cloudVerified!==true||c.canUseLocal!==true||
          c.userId!==e.user_id||c.workspaceUserId!==c.userId||c.profile?.id!==c.userId||c.profile.approved!==true||
          !['inspector','supervisor'].includes(c.profile.role)||c.profile.team!==e.team||verified&&
          (!Number.isFinite(c.verifiedAt)||(o.now||Date.now)()<c.verifiedAt||(o.now||Date.now)()-c.verifiedAt>photo.FRESH_MS)) throw Error('Photo unavailable. Use the local photo or review the photo issue.');
      };
      cloudGuard();
      await o.verify();cloudGuard();
      const c=o.context(),now=(o.now||Date.now)();
      if(!Number.isFinite(c.verifiedAt)||now<c.verifiedAt||now-c.verifiedAt>photo.FRESH_MS) throw Error('Fresh photo authorization required.');
      verified=true;
      const auth=await o.client.auth.getUser();cloudGuard();
      if(auth.error||auth.data?.user?.id!==e.user_id) throw Error('Photo owner authorization changed.');
      const row=await o.client.from('inspections').select('id,user_id,team,photo_filename,photo_path').eq('id',e.id).maybeSingle();cloudGuard();
      const matches=r=>r&&r.id===e.id&&r.user_id===e.user_id&&r.team===e.team&&r.photo_path===e.photo_path&&r.photo_filename===e.photo_filename;
      const unavailable=message=>{cloudGuard();if(o.unavailable) o.unavailable(e,message);throw Error(message);};
      if(row.error||!matches(row.data)) unavailable('Cloud photo association is unavailable or changed.');
      const result=await o.client.storage.from('inspection-photos').download(e.photo_path);cloudGuard();
      const m=e.photo_upload_manifest;
      if(result.error||!result.data||result.data.size!==m.size||await photo.sha256(result.data)!==m.upload_sha256) unavailable('Cloud photo unavailable or does not match saved evidence.');
      cloudGuard();
      // A changed reservation during download must not be presented as valid.
      const final=await o.client.from('inspections').select('id,user_id,team,photo_filename,photo_path').eq('id',e.id).maybeSingle();cloudGuard();
      if(final.error||!matches(final.data)) unavailable('Cloud photo association changed during viewing.');
      return {blob:result.data,source:'private-cloud'};
    }
    return {load};
  }
  return {DISABLED,localOnly,presentation,createViewer};
});
