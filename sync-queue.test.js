const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const model=require('./entry-model.js');
const sync=require('./sync-queue.js');
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const context={mode:'approved',cloudVerified:true,canUseLocal:true,userId:user,workspaceUserId:user,profile:{id:user,approved:true,role:'inspector',team:'roadway'}};
const scope={context,durable:()=>true};
const entry=(over={})=>model.createEntry({lat:1,lon:1,...over});
const blank={total:0,pending:0,syncing:0,synced:0,failed:0,needs_review:0,local_only:0,unsaved:0};

test('six sync states share the entry model contract',()=>{
  assert.equal(sync.STATUS,model.SYNC_STATUS);
  assert.deepEqual(Object.values(sync.STATUS),['pending','syncing','synced','failed','needs_review','local_only']);
});
test('durable pending and failed records in a verified workspace are eligible',()=>{
  assert.equal(sync.automaticEligibility(entry(),context,true).eligible,true);
  assert.equal(sync.isUploadable(entry({sync_status:'failed'}),scope),true);
  assert.equal(sync.isUploadable(entry()),false);
});
for(const [label,extra,reason] of [
  ['Guest',{guest_claim_required:true},'guest-claim-required'],
  ['preapproval',{preapproval_review_required:true},'preapproval-review-required'],
  ['imported',{importBatchId:'batch'},'imported-or-cloud-record'],
  ['cloud source',{cloud_source:true},'imported-or-cloud-record'],
  ['submitted',{remote_id:user},'already-submitted'],
  ['synced',{sync_status:'synced'},'already-submitted'],
  ['local only',{sync_status:'local_only'},'local-only'],
  ['review',{sync_status:'needs_review'},'needs-review'],
  ['unknown outcome',{sync_outcome_unknown:true},'needs-review'],
  ['in flight',{sync_status:'syncing'},'not-pending'],
  ['invalid UUID',{id:'legacy-id'},'invalid-uuid']
]) test(`${label} records cannot enter automatic submissions`,()=>{
  assert.deepEqual(sync.automaticEligibility(entry(extra),context,true),{eligible:false,reason});
});
test('a failed local save and missing storage proof fail closed even with a forged record flag',()=>{
  const record=entry({durable:true});
  assert.equal(sync.automaticEligibility(record,context,false).reason,'not-durable');
  assert.equal(sync.automaticEligibility(record,context).eligible,false);
});
test('Guest, pending, stale, mismatch, Admin and other account/team contexts are excluded',()=>{
  for(const change of [{mode:'guest'},{mode:'pending'},{mode:'verification-required'},{cloudVerified:false},{canUseLocal:false},{workspaceUserId:model.uuid()},{profile:{...context.profile,approved:false}},{profile:{...context.profile,role:'administrator'}},{profile:{...context.profile,team:''}},{profile:{...context.profile,id:model.uuid()}}])
    assert.equal(sync.automaticEligibility(entry(),{...context,...change},true).eligible,false);
  assert.equal(sync.automaticEligibility(entry({user_id:model.uuid()}),context,true).reason,'record-scope-mismatch');
  assert.equal(sync.automaticEligibility(entry({team:'other'}),context,true).reason,'record-scope-mismatch');
  assert.equal(sync.automaticEligibility(entry(),{...context,profile:{...context.profile,role:'supervisor'}},true).eligible,true);
});
test('nextBatch orders eligible pending then failed records within the limit',()=>{
  const list=[entry(),entry({sync_status:'synced'}),entry({sync_status:'failed'}),entry(),entry({guest_claim_required:true})];
  assert.deepEqual(sync.nextBatch(list,10,scope).map(e=>e.id),[list[0].id,list[3].id,list[2].id]);
  assert.equal(sync.nextBatch(list,2,scope).length,2);
  assert.deepEqual(sync.nextBatch(list,10),[]);
});
test('summary separates blocked, local, unknown and unsaved from pending or acknowledged',()=>{
  const submitted=entry({sync_status:'synced'});submitted.remote_id=submitted.id;
  const list=[submitted,entry(),entry({sync_status:'failed'}),entry({sync_status:'syncing'}),entry({sync_status:'needs_review'}),entry({sync_status:'local_only'}),entry({guest_claim_required:true}),entry({importBatchId:'batch'}),entry({sync_status:'synced'}),null];
  assert.deepEqual(sync.summary(list),{...blank,total:10,pending:1,syncing:1,synced:1,failed:1,needs_review:4,local_only:2});
  assert.equal(sync.summary([submitted],{durable:()=>false}).synced,0);
  assert.equal(sync.summary([submitted],{durable:()=>false}).unsaved,1);
  assert.deepEqual(sync.summary([]),blank);
});
test('requeue never clears review flags or releases held/unknown records',()=>{
  for(const state of ['needs_review','local_only','syncing','synced']){
    const record=entry({sync_status:state});sync.requeue(record);assert.equal(record.sync_status,state);
  }
  for(const flag of ['guest_claim_required','preapproval_review_required','sync_outcome_unknown']){
    const record=entry({sync_status:'failed',[flag]:true});sync.requeue(record);
    assert.equal(record[flag],true);assert.equal(record.sync_status,'failed');assert.equal(sync.isUploadable(record,scope),false);
  }
  const list=[entry({sync_status:'failed'}),entry({sync_status:'synced'})];sync.requeueAll(list);
  assert.equal(list[0].sync_status,'pending');assert.equal(list[1].sync_status,'synced');
});
test('mark outcomes retain identity and local photos',()=>{
  const record=entry({photoId:'local-photo'});const id=record.id;
  sync.markFailed(record,new Error('network down'));assert.equal(record.sync_attempts,1);
  sync.markSynced(record,{remoteId:id});
  assert.equal(record.remote_id,id);assert.equal(record.photoId,'local-photo');assert.equal(record.sync_error,'');
  assert.equal(sync.photoNeedsUpload(record),true);
});
test('app queue remains disconnected and cannot alter any records',async()=>{
  const queue=sync.createQueue({});const list=[entry()];const before=JSON.stringify(list);
  assert.equal(queue.ready(),false);
  assert.deepEqual(await queue.drain(list),{ok:false,reason:'no-transport',uploaded:0,failed:0});
  assert.equal(JSON.stringify(list),before);
});
test('an injected mock transport also needs explicit eligibility scope',async()=>{
  let calls=0;const queue=sync.createQueue({transport:{upload:async()=>{calls++;}}});
  await queue.drain([entry()]);assert.equal(calls,0);
  const list=[entry(),entry({sync_status:'local_only'})];
  const permitted=sync.createQueue({scope:()=>scope,transport:{upload:async e=>{calls++;return {remoteId:e.id};}}});
  assert.deepEqual(await permitted.drain(list),{ok:true,uploaded:1,failed:0});assert.equal(calls,1);
});
test('queue contract specifies INSERT and never assumes conflict overwrite',()=>{
  const source=fs.readFileSync(require.resolve('./sync-queue.js'),'utf8');
  assert.doesNotMatch(source,/upsert/i);
  assert.match(source,/INSERT/);assert.match(source,/conflict/);
});

test('missing or mismatched acknowledgement never invents submitted state',()=>{
  for(const acknowledgement of [undefined,{remoteId:model.uuid()}]){
    const record=entry();sync.markSynced(record,acknowledgement);
    assert.equal(record.sync_status,'needs_review');assert.equal(record.remote_id,'');
    assert.equal(record.sync_outcome_unknown,true);sync.markFailed(record,'retry');sync.requeue(record);
    assert.equal(record.sync_status,'needs_review');
  }
  const local=entry({sync_status:'local_only'});sync.markSynced(local,{remoteId:local.id});
  assert.equal(local.sync_status,'local_only');
});
