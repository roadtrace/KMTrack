/* Durable own-inspection actions. Kept in the account workspace, never Guest. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./inspection-api'):root.SPOTITInspections);if(typeof module==='object'&&module.exports)module.exports=api;root.SPOTITInspectionActions=api;})(globalThis,function(inspections){
'use strict';
const fields=['defect_type','expressway','direction','lane_number','lane_other','km_station','interchange_exit','interchange_segment'];
const copy=x=>JSON.parse(JSON.stringify(x));
function content(row){return Object.fromEntries(fields.map(k=>[k,row[k]??null]));}
function editable(e,c){return !!e&&!e.importBatchId&&!e.cloud_source&&c.canUseLocal===true&&c.userId===c.workspaceUserId&&c.profile?.approved===true&&['inspector','supervisor'].includes(c.profile.role)&&e.user_id?.toLowerCase()===c.userId?.toLowerCase()&&e.team===c.profile.team&&e.remote_id===e.id&&e.sync_status==='synced';}
function append(entry,kind,payload,uuid=()=>crypto.randomUUID()){
 if(entry.record_deleted)throw Error('This inspection was deleted.');
 if((entry.record_actions||[]).some(a=>a.error))throw Error('Resolve the pending change before editing again.');
 return [...(entry.record_actions||[]),{id:uuid(),kind,payload:copy(payload),attempts:0,retry_at:0}];
}
function clearedPhoto(){return {photo_path:'',photo_filename:null,photo_upload_manifest:null,photo_cloud_ack:null,photo_reserved_path:'',photo_sync_status:'photo_local',photo_sync_error:'',r2_photo:{status:'removed'}};}
function createController(o){
 let running=null,timer=null;
 const now=o.now||Date.now;
 function wake(){if(running)return running;if(!o.available())return Promise.resolve();
 running=(async()=>{
  const key=o.key(),start=o.context(),scope=inspections.scopeKey(start);
  const guard=e=>{if(key!==o.key()||scope!==inspections.scopeKey(o.context())||!o.entries().includes(e)||o.blocked?.(e)||!editable(e,o.context())||!o.durable(e))throw Error('Account or inspection changed.');};
  await o.verify();
  // A verification may update the scope; defer until the next verified wake.
  if(key!==o.key()||scope!==inspections.scopeKey(o.context()))return;
  for(const e of [...o.entries()]){
   if(!editable(e,o.context()))continue;
   for(const action of [...(e.record_actions||[])]){
    if(action.error||action.retry_at>now())break;
    try{
     guard(e);const result=await o.client.rpc('apply_inspection_action',{action_id:action.id,inspection_id:e.id,kind:action.kind,payload:action.payload});guard(e);
     if(result.error)throw result.error;
     if(result.data?.done!==true)throw Error('Change not confirmed.');
     const remaining=e.record_actions.filter(a=>a.id!==action.id);
     o.save(e,{record_actions:remaining,...(action.kind==='delete'?{record_deleted:true}:{}),record_action_error:''});
     if(action.kind==='delete')await o.deleted?.(e);
     o.changed();
    }catch(error){
     try{guard(e);const permanent=['42501','23514','22023','22P02'].includes(error.code);
      o.save(e,{record_actions:e.record_actions.map(a=>a.id===action.id?{...a,attempts:a.attempts+1,retry_at:now()+Math.min(1800000,30000*2**Math.min(a.attempts,6)),error:permanent?'This inspection changed or access was removed. Reopen it online to review.':''}:a),record_action_error:permanent?'Changes need review':'Waiting to sync'});
     }catch{}break;
    }
   }
   if(!e.record_deleted&&!e.record_actions?.length&&e.photoId&&e.photo_auto_sync&&!e.record_action_error&&!(e.r2_photo?.status==='review'&&e.r2_photo?.source_id===e.photoId)){
    guard(e);await o.upload(e);guard(e);
   }
  }
 })().catch(()=>{}).finally(()=>{running=null;clearTimeout(timer);if(o.available()){
  const due=o.entries().flatMap(e=>[...(e.record_actions||[]).filter(a=>!a.error).map(a=>a.retry_at||now()+30000),...(e.photo_auto_sync&&e.photoId&&!e.record_deleted&&!(e.r2_photo?.status==='review'&&e.r2_photo?.source_id===e.photoId)&&(e.r2_photo?.attempts||0)<8?[e.r2_photo?.retry_at||now()+30000]:[])]);
  if(due.length)timer=setTimeout(wake,Math.max(1000,Math.min(...due)-now()));
 }});return running;
 }
 return {wake,retryNow(){for(const e of o.entries())if(editable(e,o.context())&&e.record_actions?.some(a=>!a.error&&a.retry_at))o.save(e,{record_actions:e.record_actions.map(a=>a.error?a:{...a,retry_at:0})});return wake();},stop(){clearTimeout(timer);},isBusy:()=>!!running};
}
return {content,editable,append,clearedPhoto,createController};
});
