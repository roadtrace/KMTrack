const test=require('node:test');
const assert=require('node:assert/strict');
const photo=require('./photo-upload-state');
const model=require('./entry-model');
const ID='5386c5ea-9688-4457-ad56-40d2569e944b',USER='8f590a6a-db13-4c75-8fb8-df9c1786d47c',NOW=Date.parse('2026-10-03T01:00:00Z');
function fixture(){
  let entry=model.normalizeEntry({id:ID,lat:1,lon:2,user_id:USER,team:'roadway',sync_status:'synced',remote_id:ID,photoId:'local-photo'});
  let context={mode:'approved',canUseLocal:true,cloudVerified:true,userId:USER,workspaceUserId:USER,
    profile:{id:USER,approved:true,role:'inspector',team:'roadway'},verifiedAt:NOW,sessionGeneration:1,scopeGeneration:1};
  const disk=new Map([['local-photo',new Blob(['stamped'],{type:'image/jpeg'})],['local-photo:raw',new Blob(['raw'],{type:'image/jpeg'})]]);
  let durable=JSON.stringify(entry),encodes=0,adds=0,locks=0;
  const opts={now:()=>NOW,context:()=>context,key:()=> 'account-workspace',isCurrent:e=>e===entry,
    durable:e=>JSON.stringify(e)===durable,read:async k=>disk.get(k)||null,
    add:async(k,value)=>{adds++;if(disk.has(k)) throw Error('duplicate');disk.set(k,structuredClone(value));},
    lock:async(k,run)=>{locks++;return run();},
    encode:async raw=>{encodes++;assert.equal(await raw.text(),'raw');return {blob:new Blob(['encoded exact bytes'],{type:'image/jpeg'}),width:1600,height:800};},
    save:(e,changes)=>{Object.assign(e,changes);durable=JSON.stringify(e);return true;}};
  return {get entry(){return entry;},set entry(v){entry=v;durable=JSON.stringify(v);},context,disk,opts,
    get encodes(){return encodes;},get adds(){return adds;},get locks(){return locks;},
    prepare:()=>photo.createPreparer(opts).prepare(entry)};
}
test('legacy state is conservative; path never proves synced; separate inspection status retained',()=>{
  for(const [fields,expected] of [[{},'photo_local'],[{photo_path:'reserved/path'},'photo_needs_review'],[{photo_sync_status:'bogus'},'photo_needs_review'],[{photo_sync_status:'photo_synced'},'photo_needs_review'],[{photo_sync_status:'photo_uploading'},'photo_needs_review'],[{photo_sync_status:'photo_pending'},'photo_needs_review'],[{photo_sync_status:'photo_failed'},'photo_failed']]){
    const row=model.normalizeEntry({lat:1,lon:2,sync_status:'synced',...fields});
    assert.equal(row.sync_status,'synced');assert.equal(row.photo_sync_status,expected);
  }
  assert.deepEqual(photo.STATUSES,['photo_local','photo_pending','photo_uploading','photo_synced','photo_failed','photo_needs_review']);
});
test('manifest exact bytes/hash/path persisted; raw preferred; independent originals unchanged',async()=>{
  const f=fixture(),beforeRaw=f.disk.get('local-photo:raw'),beforeStamp=f.disk.get('local-photo');
  const result=await f.prepare(),m=result.manifest;
  assert.equal(result.status,'photo_pending');assert.ok(photo.validManifest(m));
  assert.equal(m.upload_sha256,await photo.sha256(result.payload));
  assert.equal(m.source_sha256,await photo.sha256(beforeRaw));assert.equal(m.stamped_sha256,await photo.sha256(beforeStamp));
  assert.equal(m.object_path,`roadway/${ID}/photo-v1-${m.upload_sha256}.jpg`);
  assert.equal(await f.disk.get(m.payload_key).payload.text(),'encoded exact bytes');
  assert.equal(f.disk.get('local-photo:raw'),beforeRaw);assert.equal(f.disk.get('local-photo'),beforeStamp);
  assert.equal(f.entry.sync_status,'synced');assert.equal(f.entry.photo_path,'');
  assert.equal(m.attempt_count,0);assert.equal(m.next_retry_at,null);assert.equal(f.encodes,1);
  assert.equal(photo.label(f.entry),'Inspection submitted · photo pending');
});
test('reload, sign-out/sign-in and workspace restoration reuse exact established manifest and bytes',async()=>{
  const f=fixture(),first=await f.prepare();
  f.context.mode='signed-out';await assert.rejects(f.prepare(),/verification/);
  f.context.mode='approved';f.context.sessionGeneration++;
  f.entry=model.normalizeAll(JSON.parse(JSON.stringify([f.entry])),NOW,{restart:true})[0];
  const repeated=await f.prepare();
  assert.deepEqual(repeated.manifest,first.manifest);assert.equal(await photo.sha256(repeated.payload),first.manifest.upload_sha256);
  assert.equal(f.encodes,1);assert.equal(f.adds,1);assert.equal(f.locks,2);
});
test('interrupted entry-link save recovers atomic envelope without encode or new identity',async()=>{
  const f=fixture(),before=structuredClone(f.entry),save=f.opts.save;
  f.opts.save=()=>{throw Error('metadata failure');};await assert.rejects(f.prepare(),/metadata failure/);
  assert.equal(f.encodes,1);f.entry=before;f.opts.save=save;
  const result=await f.prepare();assert.equal(result.status,'photo_pending');assert.equal(f.encodes,1);assert.equal(f.adds,1);
});
for(const [name,mutate] of [
  ['raw bytes',f=>f.disk.set('local-photo:raw',new Blob(['changed'],{type:'image/jpeg'}))],
  ['stamp bytes',f=>f.disk.set('local-photo',new Blob(['changed'],{type:'image/jpeg'}))],
  ['source id',f=>{f.entry={...f.entry,photoId:'changed-id'};}],
  ['missing raw',f=>f.disk.delete('local-photo:raw')],
  ['missing payload',f=>f.disk.delete(f.entry.photo_upload_manifest.payload_key)],
  ['corrupt payload',f=>{const key=f.entry.photo_upload_manifest.payload_key;f.disk.set(key,{manifest:f.entry.photo_upload_manifest,payload:new Blob(['corrupt'],{type:'image/jpeg'})});}]
]) test(`${name} after preparation holds review and retains original manifest without regeneration`,async()=>{
  const f=fixture(),first=await f.prepare(),original=structuredClone(first.manifest);mutate(f);
  if(name==='source id'){
    assert.equal(photo.normalize(f.entry).photo_sync_status,'photo_needs_review');await assert.rejects(f.prepare(),/photo-needs-review/);
  }else{const result=await f.prepare();assert.equal(result.status,'photo_needs_review');assert.equal(f.entry.photo_sync_status,'photo_needs_review');}
  assert.deepEqual(f.entry.photo_upload_manifest,original);assert.equal(f.encodes,1);assert.equal(f.adds,1);
});
test('missing legacy raw never encodes stamped fallback',async()=>{
  const f=fixture();f.disk.delete('local-photo:raw');const result=await f.prepare();
  assert.equal(result.status,'photo_needs_review');assert.match(result.reason,/Raw photo missing/);assert.equal(f.encodes,0);assert.equal(f.adds,0);
});
test('missing stamped local photo holds review',async()=>{
  const f=fixture();f.disk.delete('local-photo');assert.equal((await f.prepare()).status,'photo_needs_review');assert.equal(f.encodes,0);
});
test('source changes during encode retains frozen payload and refuses ready state',async()=>{
  const f=fixture(),encode=f.opts.encode;
  f.opts.encode=async raw=>{const encoded=await encode(raw);f.disk.set('local-photo:raw',new Blob(['new source']));return encoded;};
  assert.equal((await f.prepare()).status,'photo_needs_review');assert.equal(f.adds,1);assert.equal(f.encodes,1);
  assert.ok(f.disk.get(photo.payloadKey(USER,'roadway',ID)).payload);
});
test('session change during async encode cannot link into another workspace',async()=>{
  const f=fixture(),encode=f.opts.encode;
  f.opts.encode=async raw=>{const encoded=await encode(raw);f.context.sessionGeneration++;return encoded;};
  assert.equal((await f.prepare()).status,'photo_needs_review');assert.equal(f.entry.photo_sync_status,'photo_local');assert.equal(f.adds,0);
});
test('add/readback failures hold review without modifying originals or establishing manifest',async()=>{
  for(const mode of ['add','readback']){
    const f=fixture(),add=f.opts.add;
    f.opts.add=async(k,v)=>{if(mode==='add') throw Error('quota');await add(k,v);f.disk.set(k,{manifest:v.manifest,payload:new Blob(['bad'])});};
    assert.equal((await f.prepare()).status,'photo_needs_review');assert.equal(f.entry.photo_upload_manifest,undefined);
    assert.equal(await f.disk.get('local-photo:raw').text(),'raw');
  }
});
const exclusions=[
  ['Guest original',e=>e.guest_claim_required=true],['held claim',e=>e.guest_claim_pending=true],
  ['local_only',e=>e.sync_status='local_only'],['needs_review',e=>e.sync_status='needs_review'],
  ['unsynced',e=>e.sync_status='pending'],['remote id mismatch',e=>e.remote_id='other'],
  ['wrong owner',e=>e.user_id=ID],['wrong team',e=>e.team='other-team'],
  ['import',e=>e.importBatchId='import'],['preapproval',e=>e.preapproval_review_required=true],
  ['unknown outcome',e=>e.sync_outcome_unknown=true],['source conflict',e=>e.photo_sync_status='photo_needs_review'],
  ['no photo',e=>e.photoId='']
];
for(const [name,change] of exclusions) test(`${name} excluded before any local processing`,async()=>{
  const f=fixture();f.entry={...f.entry};change(f.entry);
  assert.equal(photo.eligibility(f.entry,f.context,true,NOW).eligible,false);
  await assert.rejects(f.prepare());assert.equal(f.encodes,0);assert.equal(f.adds,0);
});
for(const [name,change] of [
  ['workspace',c=>c.workspaceUserId=ID],['unapproved',c=>c.profile.approved=false],
  ['administrator',c=>c.profile.role='administrator'],['stale verification',c=>c.verifiedAt=NOW-photo.FRESH_MS-1],
  ['cached verification',c=>c.cloudVerified=false],['profile identity',c=>c.profile.id=ID]
]) test(`${name} context excluded`,()=>{const f=fixture();change(f.context);assert.equal(photo.eligibility(f.entry,f.context,true,NOW).eligible,false);});
test('released claimed copy uses its new synced account UUID; owner-only includes Supervisor',async()=>{
  const f=fixture();f.entry={...f.entry,guest_claim_source_id:'bf4573d8-02f9-4884-b8c8-d8f06d5e8a52'};
  assert.equal(photo.eligibility(f.entry,f.context,true,NOW).eligible,true);
  f.context.profile.role='supervisor';assert.equal(photo.eligibility(f.entry,f.context,true,NOW).eligible,true);
  f.entry={...f.entry,user_id:ID};assert.equal(photo.eligibility(f.entry,f.context,true,NOW).eligible,false);
});
test('durability required even for synced record',()=>{const f=fixture();assert.equal(photo.eligibility(f.entry,f.context,false,NOW).eligible,false);});
test('dimensions cap long edge at 1600 with no upscale, preserving aspect and orientation',()=>{
  assert.deepEqual(photo.dimensions(4000,3000),{width:1600,height:1200});
  assert.deepEqual(photo.dimensions(3000,4000),{width:1200,height:1600});
  assert.deepEqual(photo.dimensions(640,480),{width:640,height:480});
  assert.throws(()=>photo.dimensions(0,100));
});
test('encoder draws decoded display orientation into fresh canvas; JPEG quality .80 and cleanup',async()=>{
  let revoked=false,draw,params;
  const env={Image:class{naturalWidth=3000;naturalHeight=4000;set src(v){queueMicrotask(()=>this.onload());}},
    URL:{createObjectURL:()=> 'blob:local',revokeObjectURL:()=>{revoked=true;}},
    document:{createElement:()=>({getContext:()=>({drawImage:(...args)=>draw=args}),toBlob:(done,...args)=>{params=args;done(new Blob(['fresh JPEG'],{type:'image/jpeg'}));}})}};
  const result=await photo.encode(new Blob(['raw with metadata']),env);
  assert.deepEqual(params,['image/jpeg',0.80]);assert.deepEqual(draw.slice(1),[0,0,1200,1600]);assert.equal(result.width,1200);assert.equal(result.height,1600);assert.equal(revoked,true);
});
test('source mutation marker retains manifest, payload identity and inspection sync status',async()=>{
  const f=fixture();const first=await f.prepare();photo.sourceChanged(f.entry);
  assert.equal(f.entry.photo_sync_status,'photo_needs_review');assert.deepEqual(f.entry.photo_upload_manifest,first.manifest);assert.equal(f.entry.sync_status,'synced');
});
test('path rejects unsafe identities and never includes photoId',()=>{
  assert.throws(()=>photo.path('../roadway',ID,'a'.repeat(64)));
  assert.throws(()=>photo.path('roadway','not-uuid','a'.repeat(64)));
});
test('production local preparation handler durably links manifest, renders status and never verifies or wakes cloud',async()=>{
  const fs=require('fs'),vm=require('vm'),store=require('./local-entry-store'),f=fixture();
  const html=fs.readFileSync('index.html','utf8');
  const body=html.slice(html.indexOf('    async function prepareLocalPhoto('),html.indexOf('    function activeExportInspectorStorageKey(')).trim();
  const storage=new Map([['account',JSON.stringify([f.entry])]]);
  const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
  let rendered=0;
  const globals={entries:[f.entry],authController:{verifyOnline:()=>{throw Error('Unexpected backend verification');}},
    SPOTITPhotoUpload:{...photo,createPreparer:o=>photo.createPreparer({...o,encode:f.opts.encode,now:()=>NOW})},
    SPOTITLocalStore:store,localStorage,inspectionContext:()=>f.context,activeEntriesStorageKey:()=> 'account',
    localEntryDurable:e=>store.contains(localStorage,'account',e),authWorkspaceUnlocked:true,
    getPhoto:f.opts.read,addPhotoUploadEnvelope:f.opts.add,navigator:{locks:{request:async(k,run)=>run()}},
    renderLog:()=>rendered++,alert:message=>{throw Error(message);},
    syncRunner:{wake:()=>{throw Error('Unexpected cloud runner wake');}}};
  const handler=vm.runInNewContext(`(${body})`,globals),button={disabled:false};
  await handler(ID,button);
  assert.equal(button.disabled,false);assert.equal(rendered,1);
  assert.equal(f.entry.photo_sync_status,'photo_pending');assert.equal(store.contains(localStorage,'account',f.entry),true);
  assert.equal(f.entry.photo_path,'');assert.equal(f.encodes,1);
});
test('conflicting cloud path with an established intent holds review',async()=>{
  const f=fixture();await f.prepare();f.entry={...f.entry,photo_path:'other-team/other/path.jpg'};
  assert.equal(photo.normalize(f.entry).photo_sync_status,'photo_needs_review');await assert.rejects(f.prepare(),/photo-needs-review/);
});
