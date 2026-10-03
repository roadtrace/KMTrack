const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const photo=require('./photo-upload-state'),pilot=require('./photo-pilot'),model=require('./entry-model');
const ID='5386c5ea-9688-4457-ad56-40d2569e944b',USER='8f590a6a-db13-4c75-8fb8-df9c1786d47c',NOW=Date.parse('2026-10-03T01:00:00Z');
async function fixture(){
  const e={id:ID,user_id:USER,team:'roadway',sync_status:'synced',remote_id:ID,photoId:'p'};
  const c={mode:'approved',canUseLocal:true,cloudVerified:true,userId:USER,workspaceUserId:USER,profile:{id:USER,approved:true,role:'inspector',team:'roadway'},verifiedAt:NOW,sessionGeneration:1,scopeGeneration:1};
  const disk=new Map([['p',new Blob(['local stamp'],{type:'image/jpeg'})],['p:raw',new Blob(['raw'],{type:'image/jpeg'})]]);
  const opts={context:()=>c,key:()=> 'account',now:()=>NOW,isCurrent:entry=>entry===e,durable:()=>true,
    read:async k=>disk.get(k),save:(entry,changes)=>{Object.assign(entry,changes);return true;},
    add:async(k,v)=>disk.set(k,v),lock:async(k,run)=>run(),encode:async()=>({blob:new Blob(['cloud evidence'],{type:'image/jpeg'}),width:100,height:50})};
  await photo.createPreparer(opts).prepare(e);
  const m=e.photo_upload_manifest,calls=[],hooks={};
  const row={id:ID,user_id:USER,team:'roadway',photo_path:m.object_path,photo_filename:m.photo_filename_intent};
  const client={auth:{getUser:async()=>{calls.push('auth');return hooks.auth?hooks.auth():{data:{user:{id:USER}}};}},
    from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>{calls.push('row');return hooks.row?hooks.row():{data:{...row}};}};return q;},
    storage:{from:bucket=>{assert.equal(bucket,'inspection-photos');return {download:async path=>{
      calls.push('download');assert.equal(path,m.object_path);return hooks.download?hooks.download():{data:disk.get(m.payload_key).payload};
    }};}}};
  const options={...opts,client,verify:async()=>{calls.push('verify');if(hooks.verify)await hooks.verify();},
    unavailable:(entry,message)=>{calls.push('hold');Object.assign(entry,{photo_sync_status:'photo_needs_review',photo_sync_error:message});}};
  const acknowledge=()=>Object.assign(e,{photo_sync_status:'photo_synced',photo_path:m.object_path,photo_filename:m.photo_filename_intent,
    photo_cloud_ack:{version:1,inspection_id:ID,user_id:USER,team:'roadway',object_path:m.object_path,upload_sha256:m.upload_sha256,verified_at:new Date(NOW).toISOString()}});
  return {e,c,disk,m,row,calls,hooks,options,acknowledge,load:()=>pilot.createViewer(options).load(e)};
}
for(const [status,label] of [
  ['photo_local','Inspection submitted · photo local'],['photo_pending','Inspection submitted · photo pending'],
  ['photo_uploading','Photo uploading'],['photo_failed','Photo retry needed'],['photo_needs_review','Photo needs review']
])test(`pilot wording ${status}`,async()=>{const f=await fixture();f.e.photo_sync_status=status;assert.equal(pilot.presentation(f.e).label,label);});
test('synced wording requires valid acknowledgement',async()=>{const f=await fixture();f.acknowledge();assert.equal(pilot.presentation(f.e).label,'Inspection submitted · photo synced');});
test('retry schedule is displayed and preserved verbatim',async()=>{const f=await fixture();Object.assign(f.e,{photo_sync_status:'photo_failed',photo_next_retry_at:'2026-10-03T02:00:00Z'});
  const before=JSON.stringify(f.e),p=pilot.presentation(f.e);assert.equal(p.label,'Photo retry scheduled');assert.match(p.detail,/2026-10-03T02:00:00Z/);assert.equal(p.retry,true);assert.equal(JSON.stringify(f.e),before);});
test('reserved path without proof never advertises synced or licenses a cloud read',async()=>{
  const f=await fixture();f.disk.delete('p');f.e.photo_path=f.m.object_path;f.e.photo_sync_status='photo_synced';
  const p=pilot.presentation(f.e);assert.equal(p.label,'Photo needs review');assert.equal(p.reserved,true);assert.match(p.unavailable,/reserved but not yet uploaded/);
  await assert.rejects(f.load(),/unavailable/);assert.deepEqual(f.calls,[]);
});
test('separate observed reservation hint survives missing-object retry without setting photo_path',async()=>{
  const f=await fixture();Object.assign(f.e,{photo_reserved_path:f.m.object_path,photo_sync_status:'photo_failed'});
  assert.equal(pilot.presentation(f.e).reserved,true);assert.equal(f.e.photo_path,undefined);assert.equal(photo.validAcknowledgement(f.e),false);
});
for(const status of ['photo_pending','photo_failed','photo_needs_review','photo_synced'])test(`local preview preferred during ${status}`,async()=>{
  const f=await fixture();f.e.photo_sync_status=status;if(status==='photo_synced')f.acknowledge();
  const result=await f.load();assert.equal(result.source,'local');assert.equal(await result.blob.text(),'local stamp');assert.deepEqual(f.calls,[]);
});
test('source-change warning retains immutable evidence and offers review only',async()=>{
  const f=await fixture(),before=JSON.stringify(f.m);photo.sourceChanged(f.e);const p=pilot.presentation(f.e);
  assert.equal(p.label,'Photo needs review');assert.match(p.detail,/no longer matches the current local photo/);assert.equal(p.review,true);assert.equal(p.retry,false);assert.equal(JSON.stringify(f.m),before);
});
for(const [name,fields] of [
  ['Guest original',{guest_claim_required:true}],['held claimed copy',{guest_claim_pending:true}],
  ['Keep local',{sync_status:'local_only'}],['preapproval held',{preapproval_review_required:true}]
])test(`${name} never shows cloud pending/uploading/retry`,async()=>{const f=await fixture();for(const status of photo.STATUSES){Object.assign(f.e,fields,{photo_sync_status:status});const p=pilot.presentation(f.e);assert.equal(p.label,'Photo local');assert.equal(p.retry,false);assert.equal(p.review,false);assert.equal(p.reserved,false);}});
for(const [name,fields] of [['released claimed copy',{guest_claim_origin:{source_id:USER},guest_claim_pending:false}],['preapproval Submit',{preapproval_review_required:false,preapproval_review_decision:'submit'}]])test(`${name} can show independent pending after row sync`,async()=>{
  const f=await fixture();Object.assign(f.e,fields);assert.equal(pilot.presentation(f.e).label,'Inspection submitted · photo pending');assert.equal(photo.eligibility(f.e,f.c,true,NOW).eligible,true);
});
test('private fallback verifies auth, row, exact bytes and final row, without changing local photo',async()=>{
  const f=await fixture();f.acknowledge();f.disk.delete('p');const before=JSON.stringify(f.e),result=await f.load();
  assert.equal(result.source,'private-cloud');assert.equal(await photo.sha256(result.blob),f.m.upload_sha256);
  assert.deepEqual(f.calls,['verify','auth','row','download','row']);assert.equal(JSON.stringify(f.e),before);
});
for(const [name,result] of [['missing',{error:{code:'NoSuchKey'}}],['denied',{error:{code:'AccessDenied'}}],['ambiguous 404',{error:{status:404}}],['wrong bytes',{data:new Blob(['bad'])}]])test(`private viewer ${name} shows unavailable and holds review without clearing reservation`,async()=>{
  const f=await fixture();f.acknowledge();f.disk.delete('p');f.hooks.download=()=>result;await assert.rejects(f.load(),/unavailable|evidence/);
  assert.equal(f.e.photo_sync_status,'photo_needs_review');assert.equal(f.e.photo_path,f.m.object_path);assert.equal(pilot.presentation(f.e).reserved,true);
});
test('changed cloud row before retrieval never downloads',async()=>{const f=await fixture();f.acknowledge();f.disk.delete('p');f.row.photo_path='other';await assert.rejects(f.load(),/association/);assert.ok(!f.calls.includes('download'));});
test('changed row during private download is not displayed as valid',async()=>{const f=await fixture();f.acknowledge();f.disk.delete('p');f.hooks.download=()=>{f.row.photo_path='other';return {data:f.disk.get(f.m.payload_key).payload};};await assert.rejects(f.load(),/association changed/);assert.equal(f.e.photo_sync_status,'photo_needs_review');});
for(const stage of ['verify','download'])test(`late ${stage} result after sign-out cannot display or hold another workspace`,async()=>{
  const f=await fixture();f.acknowledge();f.disk.delete('p');f.hooks[stage]=()=>{f.c.sessionGeneration++;f.c.mode='signed-out';return {data:f.disk.get(f.m.payload_key).payload};};
  await assert.rejects(f.load(),/scope changed/);assert.ok(!f.calls.includes('hold'));assert.equal(f.e.photo_sync_status,'photo_synced');
});
test('local preview late result after workspace switch is rejected',async()=>{const f=await fixture();f.options.read=async()=>{f.c.scopeGeneration++;return new Blob(['local']);};await assert.rejects(f.load(),/scope changed/);assert.deepEqual(f.calls,[]);});
for(const [name,change] of [['wrong owner',f=>f.e.user_id=ID],['wrong team',f=>f.c.profile.team='other'],['wrong workspace',f=>f.c.workspaceUserId=ID],['held claim',f=>f.e.guest_claim_pending=true],['revoked approval',f=>f.c.profile.approved=false]])test(`private viewer blocks ${name}`,async()=>{const f=await fixture();f.acknowledge();f.disk.delete('p');change(f);await assert.rejects(f.load());assert.deepEqual(f.calls,[]);});
test('stale verification and auth mismatch cannot reach private row/object',async()=>{
  for(const mode of ['stale','auth']){const f=await fixture();f.acknowledge();f.disk.delete('p');if(mode==='stale')f.c.verifiedAt=NOW-300001;else f.hooks.auth=()=>({data:{user:{id:ID}}});await assert.rejects(f.load());assert.ok(!f.calls.includes('row'));}
});
const html=fs.readFileSync('index.html','utf8');
function fn(name){const start=html.indexOf(`    ${name.startsWith('async ')?name:'function '+name}`);assert.ok(start>=0,name);const end=html.indexOf('\n    }',start)+6;return html.slice(start,end);}
test('actual retry UI handler exits at disabled gate before controller, preserves state/schedule',async()=>{
  const f=await fixture();f.e.photo_sync_status='photo_failed';let review=0,transport=0;
  const ctx={entries:[f.e],PHOTO_CLOUD_TRANSPORT_ENABLED:false,photoCloudController:{retryNow:()=>{transport++;}},reviewPhotoIssue:()=>review++};
  vm.createContext(ctx);vm.runInContext(fn('async function retryPhotoNow'),ctx);const before=JSON.stringify(f.e);await ctx.retryPhotoNow(ID,{});
  assert.equal(review,1);assert.equal(transport,0);assert.equal(JSON.stringify(f.e),before);
});
test('actual local photo UI opens local blob even for retry, without cloud calls',async()=>{
  const f=await fixture();f.e.photo_sync_status='photo_failed';const elements=new Map();
  for(const id of ['photo-preview','photo-download','photo-modal'])elements.set(id,{classList:{add(){}},setAttribute(){},focus(){}});
  const ctx={entries:[f.e],pilotPhotoViewer:pilot.createViewer(f.options),activePhotoObjectUrl:null,URL:{createObjectURL:()=> 'blob:local',revokeObjectURL(){}},document:{getElementById:id=>elements.get(id)},requestAnimationFrame:run=>run(),alert:message=>assert.fail(message)};
  vm.createContext(ctx);vm.runInContext(fn('async function viewPhotoForEntry'),ctx);await ctx.viewPhotoForEntry(0);
  assert.equal(elements.get('photo-preview').src,'blob:local');assert.deepEqual(f.calls,[]);
});
test('actual Log markup exposes compact states, review, disabled retry and local/private viewer',()=>{
  assert.match(html,/const photoState = SPOTITPhotoPilot.presentation\(e\)/);assert.match(html,/xmlEscape\(photoState.label\)/);
  assert.match(html,/xmlEscape\(photoState.unavailable\)/);assert.match(html,/Review photo issue/);assert.match(html,/!PHOTO_CLOUD_TRANSPORT_ENABLED \? 'disabled'/);
  assert.match(html,/Inspection rows are submitted\. Check each record for its separate photo status/);assert.match(html,/<dt>Submitted<\/dt>/);
});
test('production gate, independent runner and cached pilot asset remain explicit',()=>{
  const sw=fs.readFileSync('sw.js','utf8');assert.match(html,/const PHOTO_CLOUD_TRANSPORT_ENABLED = false/);assert.doesNotMatch(html,/\.dispatch\(/);
  assert.match(html,/enabled: PHOTO_CLOUD_TRANSPORT_ENABLED/);assert.match(sw,/'v234'/);assert.ok(sw.includes('./photo-pilot.js')&&html.includes('./photo-pilot.js'));
  assert.doesNotMatch(fs.readFileSync('sync-runner.js','utf8'),/SPOTITPhoto|photo-pilot|photo-sync/);
  assert.doesNotMatch(fs.readFileSync('photo-pilot.js','utf8'),/\.upload\(|\.update\(|\.remove\(|getPublicUrl|createSignedUrl/);
});
test('actual workbook builder preserves schema, local image bytes and every photo status',async()=>{
  const f=await fixture();Object.assign(f.e,{lat:14.6,lon:121,km:12.5,type:'Potholes',timestamp:'2026-10-03 09:00:00',photoFilename:'local.jpg'});
  const rows=photo.STATUSES.map((status,i)=>({...f.e,id:'entry-'+i,photo_sync_status:status}));
  const jpeg=new Blob([new Uint8Array([255,216,255,224]),'local evidence'],{type:'image/jpeg'});let captured;
  const context={Blob,SPOTITSwipe:require('./swipe-actions'),toDMM:v=>String(v),kmToCsvNumber:v=>v*1000,
    accessibleEntries:()=>rows,getPhoto:async()=>jpeg,addSharingWorksheet:async()=>{},createStoredZip:async files=>{captured=files;return new Blob(['zip']);}};
  vm.createContext(context);
  for(const name of ['xmlEscape','excelColumnName','inspectionWorkbookRows','async function collectWorkbookPhotos','addInCellPhotoParts','async function buildInspectionWorkbook'])vm.runInContext(fn(name),context);
  const before=JSON.stringify(rows);await context.buildInspectionWorkbook(new Date(NOW),rows,true);
  const sheet=await captured.find(f=>f.name==='xl/worksheets/sheet1.xml').blob.text();
  assert.match(sheet,/A1:P7/);assert.equal((sheet.match(/t="e" vm=/g)||[]).length,6);
  assert.equal(captured.filter(f=>f.name.startsWith('xl/media/')).length,6);
  for(const image of captured.filter(f=>f.name.startsWith('xl/media/')))assert.equal(await photo.sha256(image.blob),await photo.sha256(jpeg));
  assert.equal(JSON.stringify(rows),before);assert.doesNotMatch(sheet,/photo_pending|photo_synced|photo_uploading/);
});
test('actual map pipeline and workspace scope retain status-bearing local rows and exclude Guest imports',async()=>{
  const f=await fixture();Object.assign(f.e,{lat:14.6,lon:121,type:'Potholes',timestamp:'2026-10-03 09:00:00'});
  const rows=photo.STATUSES.map((status,i)=>({...f.e,id:'local-'+i,photo_sync_status:status}));rows.push({...f.e,id:'imported',importBatchId:'batch'});
  const controls=new Map(),control=id=>{if(!controls.has(id))controls.set(id,{value:'',checked:true,classList:{toggle(){}}});return controls.get(id);};
  let rendered,counts;const context={entries:rows,authDisplayState:{mode:'guest'},document:{getElementById:control},
    SPOTITEntryFilters:require('./entry-filters'),osmMap:{},osmEntryLayer:{clearLayers(){},addTo(){},remove(){}},
    SPOTITMap:{legend(){},renderEntries:(map,layer,rows)=>rendered=rows},updateMapWorkspaceCounts:rows=>counts=rows,openMapEntry(){},formatKmStation:v=>v};
  vm.createContext(context);for(const name of ['canViewTeamRecords','accessibleEntries','updateMapEntries'])vm.runInContext(fn(name),context);
  context.updateMapEntries();assert.deepEqual(Array.from(rendered,r=>r.id),rows.slice(0,6).map(r=>r.id));assert.equal(counts.length,6);
  context.authDisplayState.mode='approved';context.updateMapEntries();assert.equal(rendered.length,7);
});
test('actual Log renderer retains local preview and separates row/photo state for every status',async()=>{
  const f=await fixture();Object.assign(f.e,{lat:14.6,lon:121,type:'Potholes',timestamp:'2026-10-03 09:00:00',expressway:'NLEX',km:12.5,lane:'1'});
  const rows=photo.STATUSES.map((status,i)=>({...f.e,id:'local-'+i,photo_sync_status:status}));
  // Each prepared intent must match its row identity.
  for(const row of rows){row.id=ID;row.photo_sync_status==='photo_synced'&&Object.assign(row,{photo_path:f.m.object_path,photo_filename:f.m.photo_filename_intent,photo_cloud_ack:{version:1,inspection_id:ID,user_id:USER,team:'roadway',object_path:f.m.object_path,upload_sha256:f.m.upload_sha256,verified_at:new Date(NOW).toISOString()}});}
  const element=()=>({dataset:{},classList:{},children:[],appendChild(v){this.children.push(v);},setAttribute(){},addEventListener(){},querySelectorAll(){return [];}});
  const controls=new Map(),control=id=>{if(!controls.has(id))controls.set(id,element());return controls.get(id);};
  const context={entries:rows,visibleEntries:()=>rows,accessibleEntries:()=>rows,document:{getElementById:control,createElement:element},
    SPOTITPhotoPilot:pilot,SPOTITPhotoUpload:photo,SPOTITPreapprovalReview:{reviewable:()=>false},authDisplayState:null,authController:null,
    PHOTO_CLOUD_TRANSPORT_ENABLED:false,photoCloudController:null,selectedEntryIds:new Set(),selectMode:false,logRegisterView:'log',CAPTURE_RECENT_LIMIT:10,
    typeClass:()=> 'potholes',localEntryDurable:()=>true,formatKmStation:()=> '12+500',getLogFilters:()=>({}),cloudAccess:()=>false,
    renderGuestClaims(){},syncEntryFilterOptions(){},syncInspectorFilterOptions(){},syncSharingFilters(){},updateMapEntries(){},wireSwipeRows(){},updateSyncStatus(){}};
  vm.createContext(context);vm.runInContext(fn('xmlEscape'),context);vm.runInContext(fn('renderLog'),context);context.renderLog();
  const markup=control('log-list').children.map(row=>row.children[0].innerHTML).join('\n');
  for(const label of ['Inspection submitted · photo local','Inspection submitted · photo pending','Photo uploading','Inspection submitted · photo synced','Photo retry needed','Photo needs review'])assert.ok(markup.includes(label),label);
  assert.equal((markup.match(/>View Photo</g)||[]).length,6);assert.match(markup,/photo-retry[^>]*disabled/);assert.match(markup,/Review photo issue/);
});
