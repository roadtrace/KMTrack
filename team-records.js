/* Team read presentation. No persistence, ownership grants or write transport. */
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(node?require('./cloud-records'):root.SPOTITCloudRecords,
    node?require('./my-records'):root.SPOTITMyRecords,
    node?require('./entry-filters'):root.SPOTITEntryFilters,
    node?require('./sync-queue'):root.SPOTITSync,
    node?require('./photo-upload-state'):root.SPOTITPhotoUpload);
  if(node)module.exports=api;root.SPOTITTeamRecords=api;
})(globalThis,function(cloud,my,filters,sync,photo){
  'use strict';
  function project({localEntries,page,context,workspaceKey,online},filter={}){
    const scope=cloud.scopeOf(context,workspaceKey,online);
    if(!scope||page?.view!=='team'||page.scope?.token!==scope.token)return {records:[]};
    const own=new Map();
    for(const e of localEntries||[])if(!e.importBatchId&&!e.cloud_source&&!e.guest_claim_required
      &&e.user_id?.toLowerCase()===scope.userId&&e.team===scope.team&&!own.has(e.id?.toLowerCase()))own.set(e.id.toLowerCase(),e);
    const rows=new Map();
    for(const row of page.rows)if(cloud.rowInScope(row,scope,'team'))rows.set(row.id.toLowerCase(),row);
    return {records:[...rows.values()].filter(row=>filters.filterEntries([my.cloudDisplay(row)],{...filter,source:'',inspector:''}).length)
      .map(row=>Object.freeze({id:row.id,cloud:row,local:null,localContext:row.user_id===scope.userId?own.get(row.id)||null:null,
        source:'cloud',readOnly:true,primary:'cloud'}))};
  }
  function createController(o){
    let attempted=null,activated=false;
    async function load(refresh=false){
      activated=true;const scope=o.store.syncScope();if(!scope)return;
      attempted=scope.token;const pending=o.store.load('team',{refresh});o.changed(false);
      let denied=false;
      try{await pending;}catch(e){denied=e.code==='authorization';}finally{o.changed(denied||!o.store.snapshot('team').scope);}
    }
    function verified(){
      const scope=o.store.syncScope();if(!scope){attempted=null;return;}
      const page=o.store.snapshot('team');
      if(!activated||attempted===scope.token&&(page.loaded||page.loading||page.error))return;
      attempted=scope.token;void load(true);
    }
    function activate(){activated=true;const page=o.store.snapshot('team');if(!page.loaded&&!page.loading)verified();}
    function snapshot(){return o.store.snapshot('team');}
    function records(localEntries,filter){return project({localEntries,page:snapshot(),context:o.context(),workspaceKey:o.key(),online:o.online()},filter);}
    return {load,verified,activate,snapshot,records};
  }
  function deviceCounts(entries,durable){
    const local=(entries||[]).filter(e=>!e.importBatchId&&!e.cloud_source&&durable(e));
    const counts=sync.summary(local);
    const photos=local.filter(e=>e.photoId);
    return {waiting:counts.pending+counts.failed+counts.syncing,submitted:counts.synced,review:counts.needs_review,
      photosOnDevice:photos.length,photosWaiting:photos.filter(e=>!photo.validAcknowledgement(e)
        &&['photo_pending','photo_failed','photo_uploading'].includes(photo.normalize(e).photo_sync_status)
        &&!e.guest_claim_required&&!e.preapproval_review_required&&!e.submission_review_required&&e.sync_status!=='local_only').length};
  }
  function route(view){return ['tools','tools-tab','tools-view'].includes(view)?'settings':view;}
  return {project,createController,deviceCounts,route};
});
