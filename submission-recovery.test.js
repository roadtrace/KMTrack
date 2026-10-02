const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const api = require('./inspection-api');
const model = require('./entry-model');
const store = require('./local-entry-store');
const sync = require('./sync-queue');
const user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const copy = value => JSON.parse(JSON.stringify(value));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture() {
  let current = { mode:'approved', cloudVerified:true, canUseLocal:true, userId:user, workspaceUserId:user, scopeGeneration:1, profile:{id:user, approved:true, role:'inspector', team:'roadway'} };
  let record = model.createEntry({id, lat:14.819699, lon:120.9711, type:'Potholes', timestamp:'2026-10-02 10:00:00', lane:'2', km:8.2, expressway:'NLEX', bound:'NB', photoId:'local-photo'}, Date.parse('2026-10-02T02:00:01Z'));
  const values = new Map();
  let writeFailure = '', reads = 0, inserts = 0, checks = 0, validRecord = true;
  let send = async row => ({data:row});
  let read = async () => ({data:null});
  let verify = async () => {};
  let authResult = () => ({data:{user:{id:current.userId}}});
  const storage = {getItem:key=>values.get(key)||null, setItem(key,value) { if(writeFailure==='write') throw Error('quota'); if(writeFailure!=='readback') values.set(key,value); }};
  const persist = () => { store.save(storage, 'account', [record]); return true; };
  persist();
  const instance = api.createApi({
    client:{auth:{getUser:async()=>{checks++;return authResult();}},from:()=>({
      insert:row=>{inserts++;assert.equal(store.contains(storage,'account',record),true);assert.equal(record.sync_outcome_unknown,true);assert.equal(record.submission_retry_allowed,false);assert.deepEqual(row,record.submission_snapshot.row);return {select:()=>({single:()=>send(copy(row))})};},
      select:columns=>{assert.equal(columns,api.ROW_FIELDS.join(','));return {eq:(key,value)=>{assert.equal(key,'id');assert.equal(value,id);return {maybeSingle:()=>{reads++;return read();}};}}}
    })}, verify:()=>verify(),context:()=>current,durable:e=>store.contains(storage,'account',e),persist,isCurrent:e=>validRecord && e===record
  });
  function uncertain() {
    record.submission_snapshot=api.submissionSnapshot(record,current);
    record.sync_status='needs_review';record.sync_outcome_unknown=true;record.submission_retry_allowed=false;persist();
    return copy(record.submission_snapshot.row);
  }
  return {instance,storage,values,persist,uncertain,get record(){return record;},get current(){return current;},get reads(){return reads;},get inserts(){return inserts;},get checks(){return checks;},
    setSend:fn=>{send=fn;},setRead:fn=>{read=fn;},setVerify:fn=>{verify=fn;},setAuth:fn=>{authResult=fn;},setFailure:value=>{writeFailure=value;},setState:changes=>{current={...current,...changes};},remove:()=>{validRecord=false;},
    restart:()=>{record=model.normalizeAll(JSON.parse(storage.getItem('account')),undefined,{restart:true})[0];persist();}};
}

test('snapshot deterministically reuses Phase 11 mapping and contains only server intent',()=>{
  const f=fixture(); const snapshot=api.submissionSnapshot(f.record,f.current);
  assert.deepEqual(snapshot,api.submissionSnapshot(copy(f.record),copy(f.current)));
  assert.deepEqual(snapshot.row,api.mapEntry(f.record,f.current));
  assert.deepEqual(Object.keys(snapshot.row),api.ROW_FIELDS);
  assert.equal(snapshot.row.updated_at,undefined);assert.equal(snapshot.row.photo_path,null);assert.equal(snapshot.row.photo_filename,null);
  assert.equal(snapshot.row.km_station,8200);assert.equal(snapshot.row.lane_number,2);
  assert.equal(snapshot.row.inspected_at,'2026-10-02T02:00:00.000Z');
});
test('snapshot and uncertain marker are confirmed before INSERT; success persists acknowledgement and retains intent',async()=>{
  const f=fixture();const expected=api.submissionSnapshot(f.record,f.current);
  assert.equal((await f.instance.insertOne(f.record)).status,'inserted');
  assert.equal(f.inserts,1);assert.deepEqual(f.record.submission_snapshot,expected);
  assert.equal(f.record.remote_id,id);assert.equal(f.record.sync_status,'synced');assert.equal(f.record.sync_outcome_unknown,false);
  assert.equal(f.record.photoId,'local-photo');assert.equal(store.contains(f.storage,'account',f.record),true);
  await assert.rejects(f.instance.insertOne(f.record));assert.equal(f.inserts,1);
});
for(const failure of ['write','readback'])test(`snapshot ${failure} failure prevents INSERT`,async()=>{
  const f=fixture();f.setFailure(failure);await assert.rejects(f.instance.insertOne(f.record));
  assert.equal(f.inserts,0);assert.equal(f.record.submission_snapshot,undefined);assert.equal(f.record.sync_status,'pending');
});
test('lost response survives restart and cannot silently regenerate or resend snapshot',async()=>{
  const f=fixture();f.setSend(async()=>{throw Error('lost response');});
  await assert.rejects(f.instance.insertOne(f.record),/lost response/);
  const snapshot=copy(f.record.submission_snapshot);f.restart();
  assert.deepEqual(f.record.submission_snapshot,snapshot);assert.equal(f.record.sync_outcome_unknown,true);
  await assert.rejects(f.instance.insertOne(f.record));assert.equal(f.inserts,1);
  assert.equal(sync.automaticEligibility(f.record,f.current,true).eligible,false);
});
test('no authorized row permits only a later controlled INSERT using the original snapshot',async()=>{
  const f=fixture();const row=f.uncertain();
  assert.deepEqual(await f.instance.reconcileOne(f.record),{status:'no-row',retryAllowed:true});
  assert.equal(f.record.sync_status,'failed');assert.equal(f.record.sync_outcome_unknown,false);
  assert.equal(f.inserts,0);assert.equal(sync.automaticEligibility(f.record,f.current,true).eligible,true);
  f.setSend(async sent=>{assert.deepEqual(sent,row);return {data:sent};});
  await f.instance.insertOne(f.record);assert.equal(f.inserts,1);
});
test('matching authorized row restores remote_id and durable synced state without writes, import or photo upload',async()=>{
  const f=fixture();const row=f.uncertain();
  f.setRead(async()=>({data:{...row,created_at:'2026-10-02T10:00:01+08:00',inspected_at:'2026-10-02T10:00:00+08:00',updated_at:'server value ignored'}}));
  assert.deepEqual(await f.instance.reconcileOne(f.record),{status:'matching',retryAllowed:false});
  assert.equal(f.record.remote_id,id);assert.equal(f.record.sync_status,'synced');assert.equal(f.record.photoId,'local-photo');
  assert.equal(f.inserts,0);assert.equal(JSON.parse(f.storage.getItem('account')).length,1);assert.equal(store.contains(f.storage,'account',f.record),true);
});
test('canonical UUID comparison retains permanent local UUID spelling for acknowledged status',async()=>{
  const f=fixture();f.record.id=id.toUpperCase();f.persist();const row=f.uncertain();
  f.setRead(async()=>({data:row}));assert.equal((await f.instance.reconcileOne(f.record)).status,'matching');
  assert.equal(f.record.id,id.toUpperCase());assert.equal(f.record.remote_id,f.record.id);
  assert.equal(sync.summary([f.record],{durable:e=>store.contains(f.storage,'account',e)}).synced,1);
});
for(const [label,changes] of [
  ['owner',{user_id:other}],['team',{team:'other'}],['UUID',{id:other}],['created timestamp',{created_at:'2026-10-02T02:00:02Z'}],
  ['inspection timestamp',{inspected_at:'2026-10-02T02:00:00.0001Z'}],['defect',{defect_type:'Cracks'}],['latitude',{latitude:14.8197}],['longitude',{longitude:120.9712}],
  ['DMM',{latitude_dmm:'N14 49.1800'}],['longitude DMM',{longitude_dmm:'E120 58.2700'}],['road',{expressway:'SCTEX'}],['direction',{direction:'SB'}],
  ['lane',{lane_number:3}],['other lane',{lane_other:'Shoulder'}],['KM',{km_station:8201}],['exit',{interchange_exit:'Exit'}],['segment',{interchange_segment:'Ramp'}],
  ['photo path',{photo_path:'private/object.jpg'}],['photo filename',{photo_filename:'photo.jpg'}],['missing null',{photo_path:undefined}],['numeric string',{latitude:'14.819699'}]
])test(`same UUID with different ${label} is held for review`,async()=>{
  const f=fixture();const row=f.uncertain();f.setRead(async()=>({data:{...row,...changes}}));
  assert.equal((await f.instance.reconcileOne(f.record)).status,'mismatch');assert.equal(f.record.sync_status,'needs_review');
  assert.equal(f.record.submission_review_required,true);assert.equal(f.record.remote_id,'');assert.equal(f.record.submission_retry_allowed,false);
  f.setRead(async()=>({data:null}));assert.equal((await f.instance.reconcileOne(f.record)).retryAllowed,false);assert.equal(f.reads,1);
  assert.equal(f.inserts,0);await assert.rejects(f.instance.insertOne(f.record));
});
for(const error of [{code:'42501'},{status:401},{code:'PGRST301'}])test(`authorization read error ${JSON.stringify(error)} never grants retry`,async()=>{
  const f=fixture();f.uncertain();f.setRead(async()=>({error}));
  assert.deepEqual(await f.instance.reconcileOne(f.record),{status:'inaccessible',retryAllowed:false});
  assert.equal(f.record.sync_outcome_unknown,true);assert.equal(f.record.submission_retry_allowed,false);assert.equal(f.inserts,0);
});
test('verification/authentication failure is held without an inspection read',async()=>{
  for(const kind of ['verify','profile','user']){
    const f=fixture();f.uncertain();
    if(kind==='verify')f.setVerify(async()=>{throw Error('unavailable');});
    if(kind==='profile')f.setVerify(async()=>f.setState({cloudVerified:false}));
    if(kind==='user')f.setAuth(()=>({data:{user:{id:other}}}));
    assert.equal((await f.instance.reconcileOne(f.record)).status,'inaccessible');assert.equal(f.reads,0);assert.equal(f.record.sync_outcome_unknown,true);
  }
});
test('transient returned or thrown read failure revokes previous absence proof',async()=>{
  for(const throws of [false,true]){
    const f=fixture();f.uncertain();await f.instance.reconcileOne(f.record);
    f.setRead(async()=>{if(throws)throw Error('offline');return {error:{status:503}};});
    assert.equal((await f.instance.reconcileOne(f.record)).status,'transient-failure');
    assert.equal(f.record.submission_retry_allowed,false);assert.equal(f.record.sync_outcome_unknown,true);
    await assert.rejects(f.instance.insertOne(f.record));assert.equal(f.inserts,0);
  }
});
test('malformed read response cannot count as definitive row absence',async()=>{
  for(const response of [null,{}, {data:undefined}]){
    const f=fixture();f.uncertain();f.setRead(async()=>response);
    assert.equal((await f.instance.reconcileOne(f.record)).status,'transient-failure');
    assert.equal(f.record.submission_retry_allowed,false);assert.equal(f.record.sync_outcome_unknown,true);
  }
});
test('a known UUID conflict hidden by RLS is inaccessible, never proof of absence',async()=>{
  const f=fixture();f.setSend(async()=>({error:{code:'23505'}}));
  assert.equal((await f.instance.insertOne(f.record)).status,'id-conflict');
  assert.equal((await f.instance.reconcileOne(f.record)).status,'inaccessible');
  assert.equal(f.record.submission_retry_allowed,false);assert.equal(f.record.sync_status,'needs_review');assert.equal(f.inserts,1);
});
test('matching row can recover a previous UUID conflict without another INSERT',async()=>{
  const f=fixture();f.setSend(async()=>({error:{code:'23505'}}));await f.instance.insertOne(f.record);
  f.setRead(async()=>({data:copy(f.record.submission_snapshot.row)}));
  assert.equal((await f.instance.reconcileOne(f.record)).status,'matching');assert.equal(f.inserts,1);assert.equal(f.record.remote_id,id);
});
for(const change of [{userId:other},{workspaceUserId:other},{scopeGeneration:3},{profile:{id:user,approved:true,role:'inspector',team:'other'}}])test(`late recovery discarded after scope change ${JSON.stringify(change)}`,async()=>{
  const f=fixture();const row=f.uncertain();const gate=deferred(),started=deferred();
  f.setRead(()=>{started.resolve();return gate.promise;});
  const pending=f.instance.reconcileOne(f.record);await started.promise;
  const before=JSON.stringify(f.record);f.setState(change);gate.resolve({data:row});
  assert.equal((await pending).status,'inaccessible');assert.equal(JSON.stringify(f.record),before);assert.equal(f.record.remote_id,'');
});
test('removed/replaced local record cannot receive late acknowledgement',async()=>{
  const f=fixture();const row=f.uncertain();const gate=deferred(),started=deferred();
  f.setRead(()=>{started.resolve();return gate.promise;});const pending=f.instance.reconcileOne(f.record);await started.promise;
  const before=JSON.stringify(f.record);f.remove();gate.resolve({data:row});
  assert.equal((await pending).status,'inaccessible');assert.equal(JSON.stringify(f.record),before);
});
for(const timing of ['before','during'])test(`local server-content edit ${timing} reconciliation preserves original intent and requires review`,async()=>{
  const f=fixture();const row=f.uncertain();const snapshot=copy(f.record.submission_snapshot);
  let pending;
  if(timing==='during'){
    const gate=deferred(),started=deferred();f.setRead(()=>{started.resolve();return gate.promise;});
    pending=f.instance.reconcileOne(f.record);await started.promise;f.record.lane='3';f.persist();gate.resolve({data:row});
  }else{f.record.lane='3';f.persist();pending=f.instance.reconcileOne(f.record);}
  assert.equal((await pending).retryAllowed,false);assert.equal(f.record.sync_status,'needs_review');assert.equal(f.record.remote_id,'');
  assert.deepEqual(f.record.submission_snapshot,snapshot);assert.equal(f.record.lane,'3');assert.equal(f.record.submission_review_required,true);
});
test('local edit after no-row proof cannot reinterpret a retry',async()=>{
  const f=fixture();f.uncertain();await f.instance.reconcileOne(f.record);const snapshot=copy(f.record.submission_snapshot);
  f.record.type='Cracks';f.persist();await assert.rejects(f.instance.insertOne(f.record),/differs/);
  assert.equal(f.inserts,0);assert.deepEqual(f.record.submission_snapshot,snapshot);assert.equal(f.record.sync_status,'needs_review');
});
test('failed recovered acknowledgement persistence rolls back success and remains reconcilable after restart',async()=>{
  const f=fixture();const row=f.uncertain();f.setRead(async()=>{f.setFailure('write');return {data:row};});
  await assert.rejects(f.instance.reconcileOne(f.record),/quota/);
  assert.equal(f.record.remote_id,'');assert.equal(f.record.sync_outcome_unknown,true);
  f.setFailure('');f.restart();f.setRead(async()=>({data:row}));assert.equal((await f.instance.reconcileOne(f.record)).status,'matching');
});
test('failed direct acknowledgement persistence leaves the pre-request snapshot durably uncertain',async()=>{
  const f=fixture();f.setSend(async row=>{f.setFailure('write');return {data:row};});
  await assert.rejects(f.instance.insertOne(f.record));assert.equal(f.record.remote_id,'');assert.equal(f.record.sync_status,'syncing');
  f.setFailure('');f.restart();assert.equal(f.record.sync_status,'needs_review');assert.equal(f.record.sync_outcome_unknown,true);
});
test('snapshot corruption, missing snapshot and review flags fail closed',async()=>{
  for(const change of [{submission_snapshot:null},{submission_snapshot:{version:2,row:{}}},{guest_claim_required:true},{preapproval_review_required:true},{importBatchId:'batch'},{cloud_source:true},{sync_status:'local_only'}]){
    const f=fixture();f.uncertain();Object.assign(f.record,change);f.persist();
    assert.equal((await f.instance.reconcileOne(f.record)).retryAllowed,false);assert.equal(f.reads,0);assert.equal(f.inserts,0);
  }
});
test('old session results from INSERT also cannot mutate the active workspace',async()=>{
  const f=fixture();const gate=deferred(),started=deferred();f.setSend(row=>{started.resolve(row);return gate.promise;});
  const pending=f.instance.insertOne(f.record);const row=await started.promise;const before=JSON.stringify(f.record);
  f.setState({scopeGeneration:3});gate.resolve({data:row});await assert.rejects(pending,/changed/);assert.equal(JSON.stringify(f.record),before);
});
test('content edited during INSERT is held with unchanged original snapshot',async()=>{
  const f=fixture();const gate=deferred(),started=deferred();f.setSend(row=>{started.resolve(row);return gate.promise;});
  const pending=f.instance.insertOne(f.record);const row=await started.promise;f.record.type='Cracks';f.persist();gate.resolve({data:row});
  assert.equal((await pending).status,'local-changed');assert.equal(f.record.submission_snapshot.row.defect_type,'Potholes');assert.equal(f.record.remote_id,'');
});
test('mismatched direct response never acknowledges UUID alone',async()=>{
  const f=fixture();f.setSend(async row=>({data:{...row,team:'other'}}));assert.equal((await f.instance.insertOne(f.record)).status,'mismatch');assert.equal(f.record.remote_id,'');
});
test('restart retains snapshot and sticky review flags; missing absence proof fails queue eligibility',()=>{
  const f=fixture();f.uncertain();f.record.submission_review_required=true;f.persist();const before=copy(f.record);f.restart();assert.deepEqual(f.record,before);
  const record={...f.record,sync_status:'failed',sync_outcome_unknown:false,submission_review_required:false};
  assert.equal(sync.automaticEligibility(record,f.current,true).reason,'reconciliation-required');
});
test('production wiring shares guarded recovery with the serial runner without overwrite or photo transport',()=>{
  const source=fs.readFileSync(require.resolve('./inspection-api'),'utf8');const html=fs.readFileSync(require.resolve('./index.html'),'utf8');
  assert.doesNotMatch(source,/\.upsert\s*\(/);assert.doesNotMatch(source,/\.storage\b|setInterval\(/);
  assert.match(html,/SPOTITSyncRunner\.createRunner\(/);assert.doesNotMatch(html,/\.reconcileOne\(/);
  assert.match(html,/scopeGeneration: inspectionScopeGeneration/);assert.match(html,/sessionGeneration: authController\.sessionGeneration\(\)/);assert.match(html,/isCurrent: entry => authWorkspaceUnlocked && entries\.includes\(entry\)/);
});

// Real float8 JSON fixture: binary storage retained all submitted bits, while
// extra_float_digits=0 returned these exact 15-significant-digit numbers.
const liveCoordinates={latitude:14.679362999296158,longitude:121.00064099999909};
const serializedCoordinates={latitude:14.6793629992962,longitude:121.000640999999};
function coordinateSnapshot(){
  const f=fixture();Object.assign(f.record,{lat:liveCoordinates.latitude,lon:liveCoordinates.longitude});f.persist();
  return {f,snapshot:api.submissionSnapshot(f.record,f.current)};
}
for(const [label,values] of [['identical',liveCoordinates],['observed float8 serialization',serializedCoordinates]])test(`coordinate acknowledgement accepts ${label} without changing persisted intent`,()=>{
  const {f,snapshot}=coordinateSnapshot(),original=JSON.stringify(snapshot);
  assert.equal(api.matchesSnapshot(snapshot,{...snapshot.row,...values}),true);
  assert.equal(JSON.stringify(snapshot),original);assert.equal(api.localMatchesSnapshot(f.record,snapshot,f.current),true);
});
for(const [label,change] of [
  ['changed latitude',{latitude:14.679363}],['changed longitude',{longitude:121.000642}],
  ['adjacent 15-digit latitude',{latitude:14.6793629992963}],['adjacent 15-digit longitude',{longitude:121.000641}],
  ['different full-precision value in same rounding bucket',{latitude:14.67936299929616}],
  ['null latitude',{latitude:null}],['null longitude',{longitude:null}],['NaN',{latitude:NaN}],
  ['infinity',{longitude:Infinity}],['non-numeric',{longitude:'not a number'}],
  ['numeric string (float8 endpoint returns JSON numbers)',{latitude:'14.6793629992962'}],
  ['owner',{user_id:other}],['team',{team:'another'}],['defect',{defect_type:'Cracks'}],
  ['strict KM',{km_station:8200.00000000001}],['strict lane',{lane_number:'2'}]
])test(`coordinate normalization still rejects ${label}`,()=>{
  const {snapshot}=coordinateSnapshot();assert.equal(api.matchesSnapshot(snapshot,{...snapshot.row,...serializedCoordinates,...change}),false);
});
test('even an exact server-serialization coordinate edit fails the local-content guard',()=>{
  const {f,snapshot}=coordinateSnapshot();f.record.lat=serializedCoordinates.latitude;
  assert.equal(api.localMatchesSnapshot(f.record,snapshot,f.current),false);
});
test('rounded INSERT acknowledgement succeeds while retaining full original snapshot and local photo',async()=>{
  const {f,snapshot}=coordinateSnapshot();f.setSend(async row=>({data:{...row,...serializedCoordinates}}));
  assert.equal((await f.instance.insertOne(f.record)).status,'inserted');
  assert.deepEqual(f.record.submission_snapshot,snapshot);assert.equal(f.record.sync_status,'synced');assert.equal(f.record.photoId,'local-photo');assert.equal(f.inserts,1);
});
function acknowledgementFixture(){
  const {f}=coordinateSnapshot();const row=f.uncertain();
  Object.assign(f.record,{submission_review_required:true,sync_error:'Server acknowledgement differs from the submission snapshot.',sync_attempts:3,sync_next_retry_at:'2026-10-02T03:00:00Z'});f.persist();
  return {f,row};
}
test('explicit acknowledgement recheck performs SELECT only, clears hold only after durable full match',async()=>{
  const {f,row}=acknowledgementFixture(),snapshot=copy(f.record.submission_snapshot);f.setRead(async()=>({data:{...row,...serializedCoordinates}}));
  assert.equal((await f.instance.reconcileOne(f.record)).status,'mismatch');assert.equal(f.reads,0);
  // Default still holds. Restore the original acknowledgement reason to exercise
  // the explicitly requested read-only reconsideration (no record content edit).
  f.record.sync_error='Server acknowledgement differs from the submission snapshot.';f.persist();
  assert.equal((await f.instance.reconcileOne(f.record,{recheckAcknowledgement:true})).status,'matching');
  assert.equal(f.reads,1);assert.equal(f.inserts,0);assert.equal(f.record.remote_id,id);assert.equal(f.record.submission_review_required,false);
  assert.equal(f.record.sync_outcome_unknown,false);assert.equal(f.record.submission_retry_allowed,false);assert.equal(f.record.sync_attempts,0);assert.equal(f.record.sync_next_retry_at,null);
  assert.deepEqual(f.record.submission_snapshot,snapshot);assert.equal(store.contains(f.storage,'account',f.record),true);
});
for(const [label,result,status] of [['no row',{data:null},'inaccessible'],['transient',{error:{status:503}},'transient-failure'],['RLS',{error:{code:'42501'}},'inaccessible']])test(`explicit acknowledgement recheck ${label} never clears hold or permits INSERT`,async()=>{
  const {f}=acknowledgementFixture(),snapshot=copy(f.record.submission_snapshot);f.setRead(async()=>result);
  assert.equal((await f.instance.reconcileOne(f.record,{recheckAcknowledgement:true})).status,status);
  assert.equal(f.record.submission_review_required,true);assert.equal(f.record.submission_retry_allowed,false);assert.equal(f.record.remote_id,'');assert.equal(f.inserts,0);
  assert.deepEqual(f.record.submission_snapshot,snapshot);await assert.rejects(f.instance.insertOne(f.record));
});
for(const change of [{sync_error:'Different review reason'},{guest_claim_required:true},{preapproval_review_required:true},{sync_status:'local_only'},{submission_uuid_conflict:true},{lane:'3'}])test(`explicit recheck cannot bypass another hold/content change: ${JSON.stringify(change)}`,async()=>{
  const {f,row}=acknowledgementFixture();Object.assign(f.record,change);f.persist();f.setRead(async()=>({data:row}));
  assert.equal((await f.instance.reconcileOne(f.record,{recheckAcknowledgement:true})).status,'mismatch');assert.equal(f.reads,0);assert.equal(f.inserts,0);
});
test('explicit recheck rejects changed review reason during authorization',async()=>{
  const {f}=acknowledgementFixture();f.setVerify(async()=>{f.record.sync_error='Different review';f.persist();});
  assert.equal((await f.instance.reconcileOne(f.record,{recheckAcknowledgement:true})).status,'mismatch');assert.equal(f.reads,0);
});
test('explicit recheck discards late scoped result and rolls back a failed acknowledgement save',async()=>{
  for(const failure of ['scope','save']){
    const {f,row}=acknowledgementFixture(),gate=deferred(),started=deferred();f.setRead(()=>{started.resolve();return gate.promise;});
    const pending=f.instance.reconcileOne(f.record,{recheckAcknowledgement:true});await started.promise;
    if(failure==='scope')f.setState({sessionGeneration:99});else f.setFailure('write');
    gate.resolve({data:{...row,...serializedCoordinates}});
    if(failure==='scope')assert.equal((await pending).status,'inaccessible');else await assert.rejects(pending,error=>error.syncKind==='storage');
    assert.equal(f.record.remote_id,'');assert.equal(f.record.submission_review_required,true);assert.equal(f.inserts,0);
  }
});
