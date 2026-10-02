const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const store=require('./local-entry-store');
const model=require('./entry-model');
const sync=require('./sync-queue');
const inspections=require('./inspection-api');
const html=fs.readFileSync(require.resolve('./index.html'),'utf8');
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const context={mode:'approved',cloudVerified:true,canUseLocal:true,userId:user,workspaceUserId:user,profile:{id:user,approved:true,role:'inspector',team:'roadway'}};
function source(name){
  const start=html.indexOf(`function ${name}(`);
  assert.ok(start>=0);
  return html.slice(html.slice(start-6,start)==='async '?start-6:start,html.indexOf('\n    }',start)+6);
}
function fixture({failure='',mode='approved'}={}){
  const data=new Map(),status={hidden:true,textContent:''};let rendered=0;
  const storage={getItem:key=>data.get(key)||null,setItem(key,value){if(failure==='write')throw Error('quota');if(failure!=='readback')data.set(key,value);}};
  const state=vm.createContext({SPOTITLocalStore:store,SPOTITEntry:model,localStorage:storage,entries:[],storageAvailable:true,authWorkspaceUnlocked:true,
    authDisplayState:{...context,mode},inspectionScopeGeneration:0,syncRunner:null,document:{getElementById:()=>status},console:{error(){}},
    activeEntriesStorageKey:()=>mode==='guest'?'guest':'account',renderLog(){rendered++;},resolvedLocationCanSave:()=>true,
    resolvedEntrySnapshot:()=>({lat:14,lon:121,km:8}),fullTimestamp:()=>'2026-10-02 10:00:00',inspectorName:'Inspector'});
  for(const name of ['localEntryDurable','saveEntries','logDefect','syncState'])vm.runInContext(source(name),state);
  return {state,data,status,storage,rendered:()=>rendered};
}
function manualApi(f, send) {
  f.state.inspectionApi=inspections.createApi({
    client:{auth:{getUser:async()=>({data:{user:{id:user}}})},from:()=>({insert:row=>({select:()=>({single:()=>send(row)})})})},
    verify:async()=>{},context:()=>context,durable:f.state.localEntryDurable,
    persist:()=>f.state.saveEntries(),isCurrent:e=>f.state.entries.includes(e)
  });
}
test('normal local Save confirms persisted record before it can be eligible',()=>{
  const f=fixture();assert.equal(f.state.logDefect('Potholes','2'),true);
  const record=f.state.entries[0];assert.equal(f.state.localEntryDurable(record),true);
  assert.equal(sync.automaticEligibility(record,context,f.state.localEntryDurable(record)).eligible,true);
  assert.equal(JSON.parse(f.data.get('account'))[0].id,record.id);assert.equal(f.rendered(),1);
});
for(const failure of ['write','readback'])test(`failed ${failure} leaves record exportable in memory but cannot queue or claim saved/submitted`,()=>{
  const f=fixture({failure});assert.equal(f.state.logDefect('Potholes','2'),false);
  const record=f.state.entries[0];assert.ok(record);assert.equal(f.state.localEntryDurable(record),false);
  assert.equal(sync.automaticEligibility(record,context,f.state.localEntryDurable(record)).eligible,false);
  assert.deepEqual(sync.nextBatch(f.state.entries,25,{context,durable:f.state.localEntryDurable}),[]);
  const counts=sync.summary(f.state.entries,{durable:f.state.localEntryDurable});
  assert.equal(counts.pending,0);assert.equal(counts.synced,0);assert.equal(counts.unsaved,1);
  assert.equal(f.state.syncState(counts,true,false,false,f.state.entries),'unsaved');
  assert.equal(f.status.hidden,false);assert.match(f.status.textContent,/only in memory/);assert.equal(f.rendered(),1);
});
test('durability checks reject changed snapshots and other workspace copies, not flags',()=>{
  const f=fixture();f.state.logDefect('Potholes','2');const record=f.state.entries[0];
  record.lane='3';assert.equal(f.state.localEntryDurable(record),false);
  assert.equal(store.contains(f.storage,'guest',record),false);
  record.durable=true;assert.equal(f.state.localEntryDurable(record),false);
});
test('Guest saves stay in Guest storage with both review flags, even if approved later',()=>{
  const f=fixture({mode:'guest'});assert.equal(f.state.logDefect('Potholes','2'),true);
  const record=f.state.entries[0];assert.equal(f.data.has('account'),false);assert.equal(f.data.has('guest'),true);
  assert.equal(record.guest_claim_required,true);assert.equal(record.preapproval_review_required,true);
  assert.equal(sync.automaticEligibility(record,context,true).eligible,false);
});
test('submitted indicator requires every record to be durably acknowledged with no holds',()=>{
  const f=fixture();const record=model.createEntry({lat:1,lon:1,sync_status:'synced'});record.remote_id=record.id;
  const state=(rows,durable=()=>true)=>f.state.syncState(sync.summary(rows,{durable}),true,false,false,rows);
  assert.equal(state([record]),'synced');
  for(const sync_status of ['pending','failed','syncing','needs_review','local_only'])assert.notEqual(state([record,model.createEntry({lat:1,lon:1,sync_status})]),'synced');
  assert.notEqual(state([{...record,guest_claim_required:true}]),'synced');
  assert.notEqual(state([{...record,preapproval_review_required:true}]),'synced');
  assert.notEqual(state([record],()=>false),'synced');
});
test('load path migrates interrupted syncing once and proves its new snapshot is saved',()=>{
  const f=fixture();const record=model.createEntry({lat:1,lon:1,sync_status:'syncing',sync_attempts:2});
  f.data.set('account',JSON.stringify([record]));
  Object.assign(f.state,{testStorageWritable:()=>true,STORAGE_KEY_BOUND:'bound'});
  vm.runInContext(source('loadFromStorage'),f.state);f.state.loadFromStorage();
  const recovered=f.state.entries[0];assert.equal(recovered.sync_status,'needs_review');
  assert.equal(recovered.sync_outcome_unknown,true);assert.equal(f.state.localEntryDurable(recovered),true);
  assert.equal(sync.automaticEligibility(recovered,context,true).eligible,false);
});
test('storage proof handles corrupt JSON and blocked reads safely',()=>{
  assert.equal(store.contains({getItem(){throw Error('blocked');}},'account',{}),false);
  assert.equal(store.contains({getItem:()=>'{broken'},'account',{}),false);
});

test('Phase 11 manual submission saves its acknowledgement and preserves the local photo',async()=>{
  const f=fixture();f.state.logDefect('Potholes','2');const record=f.state.entries[0];
  record.photoId='local-photo';f.state.saveEntries();let calls=0;
  Object.assign(f.state,{cloudAccess:()=>true,setCloudStatus:message=>{f.status.textContent=message;}});
  manualApi(f,async row=>{calls++;return {data:row};});
  vm.runInContext(source('submitLocalInspection'),f.state);
  await f.state.submitLocalInspection(record.id,{disabled:false});
  assert.equal(calls,1);assert.equal(record.sync_status,'synced');assert.equal(record.remote_id,record.id);
  assert.equal(record.photoId,'local-photo');assert.equal(f.state.localEntryDurable(record),true);
});
test('Phase 11 failed acknowledgement persistence rolls back local success markers',async()=>{
  const f=fixture();f.state.logDefect('Potholes','2');const record=f.state.entries[0];
  Object.assign(f.state,{cloudAccess:()=>true,setCloudStatus:message=>{f.status.textContent=message;}});
  manualApi(f,async row=>{f.storage.setItem=()=>{throw Error('quota');};return {data:row};});
  vm.runInContext(source('submitLocalInspection'),f.state);
  await f.state.submitLocalInspection(record.id,{disabled:false});
  assert.equal(record.sync_status,'syncing');assert.equal(record.remote_id,'');
  assert.equal(JSON.parse(f.data.get('account'))[0].sync_status,'syncing');
  assert.equal(record.sync_outcome_unknown,true);assert.ok(record.submission_snapshot);
  assert.match(f.status.textContent,/confirmation could not be saved/i);
});
test('Phase 11 UUID conflict remains review-only with no acknowledgement or overwrite',async()=>{
  const f=fixture();f.state.logDefect('Potholes','2');const record=f.state.entries[0];
  Object.assign(f.state,{cloudAccess:()=>true,setCloudStatus:message=>{f.status.textContent=message;}});
  manualApi(f,async()=>({error:{code:'23505'}}));
  vm.runInContext(source('submitLocalInspection'),f.state);
  await f.state.submitLocalInspection(record.id,{disabled:false});
  assert.equal(record.sync_status,'needs_review');assert.equal(record.remote_id,'');
  assert.equal(record.submission_uuid_conflict,true);assert.ok(record.submission_snapshot);
  assert.match(f.status.textContent,/No overwrite occurred/);
});

test('failed restart migration keeps outcome unknown blocked and reports the save failure',()=>{
  const f=fixture({failure:'write'});const record=model.createEntry({lat:1,lon:1,sync_status:'syncing'});
  f.data.set('account',JSON.stringify([record]));
  Object.assign(f.state,{testStorageWritable:()=>true,STORAGE_KEY_BOUND:'bound'});
  vm.runInContext(source('loadFromStorage'),f.state);f.state.loadFromStorage();
  assert.equal(f.state.entries[0].sync_outcome_unknown,true);
  assert.equal(f.state.localEntryDurable(f.state.entries[0]),false);
  assert.equal(f.status.hidden,false);assert.match(f.status.textContent,/migration saved safely/);
});
test('continuous photo capture keeps the local image but reports no success when the record write fails',async()=>{
  const f=fixture({failure:'write'});let confirmations=0;const images=new Map();
  Object.assign(f.state,{cameraDraftEntry:{lat:14,lon:121,type:'Potholes'},continuousCapturing:false,
    updateCameraOverlay(){},buildStampedPhotoBlob:async()=>({blob:'image',rawBlob:'raw',filename:'local.jpg',stamp:0}),
    newId:model.uuid,putPhoto:async(id,blob)=>images.set(id,blob),formatPhotoDate:()=>'',
    playConfirmSound(){confirmations++;},flashCameraCapture(){confirmations++;},cameraErrorEl:{textContent:'',classList:{add(){}}}});
  f.state.document.querySelectorAll=()=>[];
  vm.runInContext(source('captureContinuousLane'),f.state);
  await f.state.captureContinuousLane('2');
  const record=f.state.entries[0];assert.equal(images.get(record.photoId),'image');
  assert.equal(images.get(record.photoId+':raw'),'raw');assert.equal(confirmations,0);
  assert.equal(f.state.localEntryDurable(record),false);assert.match(f.state.cameraErrorEl.textContent,/only in memory/);
});
test('photo replacement failure keeps the previously persisted photo and suppresses save confirmation',async()=>{
  const f=fixture();f.state.logDefect('Potholes','2');const record=f.state.entries[0];
  record.photoId='old-photo';f.state.saveEntries();f.storage.setItem=()=>{throw Error('quota');};
  const deleted=[];let confirmations=0;
  Object.assign(f.state,{cameraDraftEntry:{lane:'2'},cameraEditTargetIndex:0,pendingCaptureBlob:'new-image',pendingCaptureRawBlob:'raw',pendingCaptureFilename:'new.jpg',pendingCaptureStamp:0,
    newId:model.uuid,putPhoto:async()=>{},formatPhotoDate:()=>'',deletePhoto:async id=>deleted.push(id),
    playConfirmSound(){confirmations++;},clearCaptureReview(){},closeCamera(){},cameraErrorEl:{textContent:'',classList:{add(){}}}});
  vm.runInContext(source('saveCapturedPhoto'),f.state);await f.state.saveCapturedPhoto();
  assert.deepEqual(deleted,[]);assert.equal(confirmations,0);
  assert.equal(JSON.parse(f.data.get('account'))[0].photoId,'old-photo');
  assert.equal(f.state.localEntryDurable(record),false);
});
