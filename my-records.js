/* My Log orchestration. Memory only; device records remain separate. */
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(node?require('./record-presentation'):root.SPOTITRecordPresentation,
    node?require('./entry-filters'):root.SPOTITEntryFilters,
    node?require('./photo-upload-state'):root.SPOTITPhotoUpload);
  if(node)module.exports=api;
  root.SPOTITMyRecords=api;
})(globalThis,function(presentation,filters,photo){
  'use strict';
  function cloudDisplay(row){
    const date=row.inspected_at?new Date(row.inspected_at):null;
    const timestamp=date&&!Number.isNaN(+date)?new Intl.DateTimeFormat('sv-SE',{
      timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false
    }).format(date):'';
    return {type:row.defect_type||'Inspection',timestamp,expressway:row.expressway,
      bound:row.direction,lane:row.lane_number??row.lane_other,km:row.km_station==null?null:row.km_station/1000,
      lat:row.latitude,lon:row.longitude};
  }
  function project(options,filter={}){
    const result=presentation.projectMy(options);
    // Inspector names exist only on device imports. Never filter cloud by them.
    const common={...filter,source:'',inspector:''};
    const records=result.records.filter(item=>filters.filterEntries([
      item.local||cloudDisplay(item.cloud)
    ],common).length);
    return {...result,records:records.sort((a,b)=>{
      const time=i=>i.local?.timestamp?i.local.timestamp.replace(' ','T')+'+08:00':i.cloud?.inspected_at||'';
      const date=i=>{const t=Date.parse(time(i));return Number.isFinite(t)?t:0;};
      return date(b)-date(a)||b.id.localeCompare(a.id);
    })};
  }
  function status(item){
    if(!item.local)return 'Submitted record';
    const e=item.local;
    if(e.sync_status==='synced'&&e.remote_id?.toLowerCase()===e.id.toLowerCase()){
      return photo.normalize(e).photo_sync_status==='photo_synced'&&photo.validAcknowledgement(e)?'Inspection and photo submitted':'Inspection submitted';
    }
    if(e.sync_status==='syncing')return 'Submitting inspection';
    if(e.sync_status==='local_only')return 'Saved on device · Kept on this device';
    if(e.preapproval_review_required||e.submission_review_required||e.sync_status==='needs_review')return 'Saved on device · Review required';
    return 'Saved on device · Waiting to submit';
  }
  function differs(item){return !!item.divergence?.displayFields?.length;}
  function photoStatus(e){
    if(photo.normalize(e).photo_sync_status==='photo_synced'&&photo.validAcknowledgement(e))return 'Photo submitted';
    if(e.sync_status==='local_only'||e.preapproval_review_required||e.submission_review_required||e.guest_claim_required)return 'Photo on this device';
    return ({photo_pending:'Photo waiting to upload',photo_uploading:'Uploading photo',photo_failed:'Photo waiting to upload · Retry needed',photo_needs_review:'Photo unavailable · Review required'})[photo.normalize(e).photo_sync_status]||'Photo on this device';
  }
  function createController({store,context,key,online,changed}){
    let attempted=null;
    function invalidate(){attempted=null;store.invalidate();changed(true);}
    async function load(refresh=false){
      const scope=store.syncScope();
      if(!online()||!scope)return;
      attempted=scope.token;
      const request=store.load('my',{refresh});changed(false);
      let denied=false;
      try{await request;}catch(e){denied=e.code==='authorization'&&store.syncScope()?.token===scope.token;}
      finally{changed(denied||!store.snapshot('my').scope);}
    }
    function verified(){
      const scope=store.syncScope();
      if(!scope){attempted=null;return;}
      // Set before load/verify can emit another authentication notification.
      if(attempted===scope.token)return;
      attempted=scope.token;void load(true);
    }
    function snapshot(){return store.snapshot('my');}
    function records(localEntries,filter){return project({localEntries,page:snapshot(),context:context(),workspaceKey:key(),online:online()},filter);}
    return {invalidate,load,verified,snapshot,records};
  }
  return {cloudDisplay,project,status,photoStatus,differs,createController};
});
