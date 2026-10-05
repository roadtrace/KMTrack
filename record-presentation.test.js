const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const api = require('./inspection-api');
const cloud = require('./cloud-records');
const presentation = require('./record-presentation');
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',second='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const context={mode:'approved',cloudVerified:true,canUseLocal:true,userId:user,workspaceUserId:user,
  scopeGeneration:1,sessionGeneration:1,profile:{id:user,approved:true,role:'inspector',team:'roadway'}};
const scope=cloud.scopeOf(context,'account',true);
const local=(over={})=>({id,type:'Potholes',timestamp:'2026-10-05 09:00:00',created_at:'2026-10-05T01:00:01Z',
  lat:14.81969912345678,lon:120.9711,km:8.2,expressway:'NLEX',bound:'NB',lane:'2',interchange:'',interchangeSegment:'',
  notes:'Device notes',inspector:'Device label',photoId:'device-photo',photoFilename:'device.jpg',sync_status:'pending',...over});
function submitted(over={}){
  const record=local(),snapshot=api.submissionSnapshot(record,context);
  return {...record,submission_snapshot:snapshot,sync_status:'synced',remote_id:id,user_id:user,team:'roadway',...over};
}
const remote=(over={})=>({...api.submissionSnapshot(local(),context).row,updated_at:'2026-10-05T02:00:00Z',cloud_source:true,...over});
const page=(rows,over={})=>({view:'my',scope,rows,coverage:'loaded-pages',...over});
test('one UUID card retains separate local/cloud references and local photo without mutation',()=>{
  const record=submitted(),row=remote(),before=JSON.stringify(record),cloudBefore=JSON.stringify(row);
  const result=presentation.mergeMy([record],page([row]),scope),card=result.records[0];
  assert.equal(result.records.length,1);assert.equal(card.source,'combined');assert.equal(card.local,record);assert.equal(card.cloud,row);
  assert.equal(card.primary,'cloud');assert.equal(card.localPhotoId,'device-photo');assert.equal(card.readOnly,true);
  assert.equal(JSON.stringify(record),before);assert.equal(JSON.stringify(row),cloudBefore);
  assert.equal(api.matchesSnapshot(record.submission_snapshot,row),true);
});
test('clean submitted local can show remote edit while preserving original snapshot and local content',()=>{
  const record=submitted(),row=remote({defect_type:'Cracks'}),card=presentation.mergeMy([record],page([row]),scope).records[0];
  assert.equal(card.primary,'cloud');assert.equal(card.display.defect_type,'Cracks');assert.equal(record.type,'Potholes');
  assert.equal(card.divergence.localChanged,false);assert.equal(card.divergence.cloudChanged,true);
  assert.deepEqual(card.divergence.cloudFields,['defect_type']);assert.equal(record.submission_snapshot.row.defect_type,'Potholes');
  assert.equal(api.matchesSnapshot(record.submission_snapshot,row),false); // Strict transport contract unchanged.
});
test('synced status cannot conceal a later local edit; device stays primary with readonly submitted details',()=>{
  const record=submitted({type:'Local edit'}),row=remote({defect_type:'Team edit'});
  const card=presentation.mergeMy([record],page([row]),scope).records[0];
  assert.equal(card.primary,'local');assert.equal(card.display,record);assert.equal(card.submittedDetails,row);
  assert.equal(card.divergence.localChanged,true);assert.equal(card.divergence.cloudChanged,true);
  assert.deepEqual(card.divergence.localFields,['defect_type']);assert.equal(card.readOnly,false);
});
test('tiny local coordinate edits are divergence, server float serialization is not',()=>{
  const record=submitted({lat:14.81969912345679}),row=remote({latitude:Number(local().lat.toPrecision(15))});
  const card=presentation.mergeMy([record],page([row]),scope).records[0];
  assert.equal(card.divergence.localChanged,true);assert.equal(card.divergence.cloudChanged,false);assert.equal(card.primary,'local');
});
for(const [name,changes] of [
  ['review',{sync_status:'needs_review'}],['local only',{sync_status:'local_only'}],['pending',{sync_status:'pending'}],
  ['Guest hold',{guest_claim_required:true}],['preapproval hold',{preapproval_review_required:true}],
  ['submission hold',{submission_review_required:true}],['uncertain',{sync_outcome_unknown:true}],['missing ack',{remote_id:null}],
  ['missing snapshot',{submission_snapshot:null}],['wrong local team',{team:'ams'}]
])test(`${name} preserves local primary and does not release any hold`,()=>{
  const record=submitted(changes),before=JSON.stringify(record),card=presentation.mergeMy([record],page([remote()]),scope).records[0];
  assert.equal(card.primary,'local');assert.equal(JSON.stringify(record),before);
});
test('missing/malformed original snapshot reports unknown comparison instead of declaring equality',()=>{
  for(const snapshot of [null,{version:1,row:{id,user_id:user,team:'roadway'}}]){
    const record=submitted({submission_snapshot:snapshot}),card=presentation.mergeMy([record],page([remote()]),scope).records[0];
    assert.equal(card.divergence.comparisonUnknown,true);assert.equal(card.divergence.localChanged,null);assert.equal(card.primary,'local');
  }
});
test('unmappable local geometry remains visible and device-primary',()=>{
  const card=presentation.mergeMy([submitted({lat:null})],page([remote()]),scope).records[0];
  assert.equal(card.divergence.comparisonUnknown,true);assert.equal(card.primary,'local');
});
test('photo reservation/reference change is separate metadata, never a photo acknowledgement',()=>{
  const record=submitted(),row=remote({photo_path:'roadway/path/reserved.jpg',photo_filename:'reserved.jpg'});
  const card=presentation.mergeMy([record],page([row]),scope).records[0];
  assert.equal(card.divergence.cloudChanged,false);assert.equal(card.divergence.photoReferenceChanged,true);
  assert.equal(record.photo_cloud_ack,undefined);assert.equal(record.photoFilename,'device.jpg');
  assert.equal(api.matchesSnapshot(record.submission_snapshot,row),false);
});
test('local-only notes/inspector/photo source retained and excluded from cloud equality claims',()=>{
  const record=submitted({notes:'new local notes',inspector:'local label'}),card=presentation.mergeMy([record],page([remote()]),scope).records[0];
  assert.equal(card.local.notes,'new local notes');assert.ok(card.divergence.localOnlyFields.includes('notes'));
  assert.ok(card.divergence.localOnlyFields.includes('photoId'));
});
test('imports, other-owner local rows and malformed UUIDs are excluded from My merge',()=>{
  const result=presentation.mergeMy([local({importBatchId:'import'}),local({user_id:other}),local({id:'legacy-id'})],page([]),scope);
  assert.equal(result.records.length,0);assert.deepEqual(result.excluded,{imported:1,invalid:1,otherOwner:1});
});
test('Guest original and claimed account copy keep distinct UUID identities',()=>{
  const guest=local({guest_claim_required:true}),claimed=submitted({id:second,remote_id:second,claim_source_guest_id:id});
  const result=presentation.mergeMy([guest,claimed],page([remote({id:second})]),scope);
  assert.equal(result.records.length,2);assert.equal(result.records[0].id,id);assert.equal(result.records[1].id,second);
  assert.equal(guest.guest_claim_required,true); // Neither identity nor hold changed.
});
test('duplicate local UUIDs yield one device-primary card with collision metadata',()=>{
  const a=submitted(),b=submitted({type:'Other duplicate'}),card=presentation.mergeMy([a,b],page([remote()]),scope).records[0];
  assert.equal(card.duplicateLocal,true);assert.equal(card.localCopies.length,2);assert.equal(card.primary,'local');
});
test('UUID case normalization dedups without rewriting original local id',()=>{
  const record=submitted({id:id.toUpperCase(),remote_id:id.toUpperCase()}),card=presentation.mergeMy([record],page([remote()]),scope).records[0];
  assert.equal(card.id,id);assert.equal(card.local.id,id.toUpperCase());
});
test('cloud-only My records read-only, teammate/other-team rows never merged',()=>{
  const result=presentation.mergeMy([],page([remote(),remote({id:second,user_id:other}),remote({id:other,team:'ams'})]),scope);
  assert.equal(result.records.length,1);assert.equal(result.records[0].source,'cloud');assert.equal(result.records[0].readOnly,true);
});
test('stale session/Team page has no cloud inclusion; current local workspace remains visible',()=>{
  for(const stale of [page([remote()],{scope:{...scope,token:'old-session'}}),page([remote()],{view:'team'})]){
    const result=presentation.mergeMy([local()],stale,scope);assert.equal(result.cloudIncluded,false);
    assert.equal(result.records[0].source,'local');assert.equal(result.coverage,'local-only');
  }
  assert.equal(presentation.mergeMy([local()],page([remote()]),null).records.length,0);
});
test('projection has no storage/photo/network/write operations and no application UI integration',()=>{
  const source=fs.readFileSync('record-presentation.js','utf8');
  assert.doesNotMatch(source,/\.(insert|update|upsert|rpc|channel)\(|localStorage|indexedDB|fetch\(|\.storage\(/);
  assert.doesNotMatch(fs.readFileSync('index.html','utf8'),/SPOTITRecordPresentation\.mergeMy\(/);
});
test('fresh-context projection preserves local account records offline/pending without cached cloud access',()=>{
  for(const mode of ['offline-recent','verification-required','pending','local-only']){
    const result=presentation.projectMy({localEntries:[local()],page:page([remote()]),
      context:{...context,mode,cloudVerified:false},workspaceKey:'account',online:false});
    assert.equal(result.records.length,1);assert.equal(result.cloudIncluded,false);assert.equal(result.records[0].source,'local');
  }
  for(const current of [{...context,mode:'guest',userId:''},{...context,workspaceUserId:other},{...context,canUseLocal:false}]){
    assert.equal(presentation.projectMy({localEntries:[local()],page:page([remote()]),context:current,workspaceKey:'account',online:false}).records.length,0);
  }
});
test('fresh-context projection accepts current pages and rejects old workspace/session generation',()=>{
  assert.equal(presentation.projectMy({localEntries:[],page:page([remote()]),context,workspaceKey:'account',online:true}).records.length,1);
  assert.equal(presentation.projectMy({localEntries:[],page:page([remote()]),context:{...context,sessionGeneration:2},workspaceKey:'account',online:true}).records.length,0);
});
