const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const runnerModule=require('./sync-runner');
const inspections=require('./inspection-api');
const model=require('./entry-model');
const store=require('./local-entry-store');
const auth=require('./auth');
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const clockStart=Date.parse('2026-10-02T02:00:00Z');
const copy=value=>JSON.parse(JSON.stringify(value));
function record(index=1,over={}){
  return model.createEntry({id:`bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12,'0')}`,lat:14,lon:121,type:'Potholes',timestamp:'2026-10-02 10:00:00',lane:'2',km:8.2,photoId:'local-photo',...over},clockStart-index*1000);
}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function events(){
  const handlers=new Map();
  return {hidden:false,addEventListener(name,fn){if(!handlers.has(name))handlers.set(name,new Set());handlers.get(name).add(fn);},removeEventListener(name,fn){handlers.get(name)?.delete(fn);},
    emit:async name=>{await Promise.all([...(handlers.get(name)||[])].map(fn=>fn()));}};
}
function fixture(initial=[record()]){
  let rows=initial,now=clockStart,current={mode:'approved',cloudVerified:true,canUseLocal:true,userId:user,workspaceUserId:user,scopeGeneration:1,sessionGeneration:1,profile:{id:user,role:'inspector',approved:true,team:'roadway'}};
  let connected=true,visible=true,storageFailure=false,verify=async()=>{},active=0,maxActive=0;
  const data=new Map(),cloud=new Map(),operations=[],timers=new Map();let timerId=0;
  const storage={getItem:key=>data.get(key)||null,setItem(key,value){if(storageFailure)throw Error('quota');data.set(key,value);}};
  const persist=()=>{store.save(storage,'account',rows);return true;};persist();
  let send=async row=>{cloud.set(row.id,copy(row));return {data:copy(row)};};
  let read=async id=>({data:cloud.get(id)||null});
  async function network(kind,id,fn){
    operations.push({kind,id,time:now});active++;maxActive=Math.max(maxActive,active);
    try{return await fn();}finally{active--;}
  }
  const api=inspections.createApi({client:{
    auth:{getUser:async()=>({data:{user:{id:current.userId}}})},
    from:table=>{assert.equal(table,'inspections');return {
      insert:row=>{assert.equal(store.contains(storage,'account',rows.find(e=>e.id.toLowerCase()===row.id)),true);assert.equal(row.photo_filename,null);assert.equal(row.photo_path,null);
        return {select:()=>({single:()=>network('insert',row.id,()=>send(row))})};},
      select:()=>({eq:(key,id)=>{assert.equal(key,'id');return {maybeSingle:()=>network('read',id,()=>read(id))};}})
    };}
  },verify:()=>verify(),context:()=>current,durable:e=>store.contains(storage,'account',e),persist,isCurrent:e=>rows.includes(e)});
  const options={api,entries:()=>rows,context:()=>current,durable:e=>store.contains(storage,'account',e),persist,
    now:()=>now,random:()=>0.5,available:()=>connected&&visible,setTimer:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,at:now+delay});return id;},clearTimer:id=>timers.delete(id)};
  let runner=runnerModule.createRunner(options);
  const f={api,storage,data,cloud,operations,timers,persist,options,get rows(){return rows;},get current(){return current;},get now(){return now;},get maxActive(){return maxActive;},get runner(){return runner;},
    setSend:fn=>{send=fn;},setRead:fn=>{read=fn;},setVerify:fn=>{verify=fn;},setState:change=>{current={...current,...change};},setOnline:value=>{connected=value;},setVisible:value=>{visible=value;},setStorageFailure:value=>{storageFailure=value;},replaceRows:next=>{rows=next;persist();},
    restart:()=>{runner.stop();rows=model.normalizeAll(JSON.parse(storage.getItem('account')),undefined,{restart:true});persist();runner=runnerModule.createRunner(options);},
    uncertain(entry=rows[0]){entry.submission_snapshot=inspections.submissionSnapshot(entry,current);entry.submission_retry_allowed=false;entry.sync_outcome_unknown=true;entry.sync_status='needs_review';persist();return copy(entry.submission_snapshot.row);},
    async advance(ms){now+=ms;const due=[...timers].filter(([,t])=>t.at<=now);for(const [id,timer] of due){timers.delete(id);timer.fn();}await runner.whenIdle();}
  };return f;
}

test('eligible pending record submits automatically, preserving local photos and durably resetting retry metadata',async()=>{
  const f=fixture();await f.runner.wake('startup');
  assert.equal(f.rows[0].sync_status,'synced');assert.equal(f.rows[0].remote_id,f.rows[0].id);
  assert.equal(f.rows[0].sync_attempts,0);assert.equal(f.rows[0].sync_next_retry_at,null);assert.equal(f.rows[0].photoId,'local-photo');
  assert.equal(store.contains(f.storage,'account',f.rows[0]),true);assert.equal(f.operations.length,1);assert.equal(f.timers.size,0);
});
test('eligible inspections are processed oldest first with stable original-order ties',async()=>{
  const newer=record(1),oldest=record(3),tie=record(2,{created_at:oldest.created_at});const f=fixture([newer,oldest,tie]);
  await f.runner.wake();assert.deepEqual(f.operations.map(op=>op.id),[oldest.id,tie.id,newer.id]);
});
test('wake storms keep one inspection operation in flight at a time',async()=>{
  const f=fixture([record(1),record(2)]),gate=deferred(),started=deferred();let first=true;
  f.setSend(async row=>{if(first){first=false;started.resolve();await gate.promise;}return {data:row};});
  const run=f.runner.wake();await started.promise;const wakes=Array.from({length:20},()=>f.runner.wake('online'));
  assert.equal(f.operations.length,1);assert.equal(f.runner.status().running,true);gate.resolve();await Promise.all([run,...wakes]);
  assert.equal(f.operations.length,2);assert.equal(f.maxActive,1);
});
test('actual local Save and capture wake the runner only after confirmed durable save, without delaying capture',async()=>{
  const f=fixture([]);const html=fs.readFileSync(require.resolve('./index.html'),'utf8');
  function source(name){const start=html.indexOf(`function ${name}(`);return html.slice(start,html.indexOf('\n    }',start)+6);}
  const status={hidden:true};const app=vm.createContext({SPOTITEntry:model,SPOTITLocalStore:store,localStorage:f.storage,entries:f.rows,storageAvailable:true,authWorkspaceUnlocked:true,
    authDisplayState:f.current,syncRunner:f.runner,queueMicrotask,document:{getElementById:()=>status},console:{error(){}},activeEntriesStorageKey:()=> 'account',
    resolvedLocationCanSave:()=>true,resolvedEntrySnapshot:()=>({lat:14,lon:121,km:8}),fullTimestamp:()=> '2026-10-02 10:00:00',inspectorName:'Inspector',renderLog(){}});
  for(const name of ['saveEntries','logDefect'])vm.runInContext(source(name),app);
  assert.equal(app.logDefect('Potholes','2'),true);assert.equal(f.operations.length,0);assert.equal(store.contains(f.storage,'account',f.rows[0]),true);
  await Promise.resolve();await f.runner.whenIdle();assert.equal(f.operations.length,1);assert.equal(f.rows[0].sync_status,'synced');
});
test('failed durable save never wakes or submits the captured inspection',async()=>{
  const f=fixture([]);f.rows.push(record());f.setStorageFailure(true);assert.throws(()=>f.persist());
  await f.runner.wake('saved');assert.equal(f.operations.length,0);
});
for(const trigger of ['online','visible'])test(`${trigger} event verifies account and wakes the bound runner`,async()=>{
  const f=fixture(),window=events(),document=events();let verified=0;
  f.setOnline(false);await f.runner.wake();assert.equal(f.operations.length,0);
  const detach=f.runner.bindWakeups({window,document,verify:async()=>{verified++;}});
  f.setOnline(true);
  if(trigger==='online')await window.emit('online');else await document.emit('visibilitychange');
  assert.equal(verified,1);assert.equal(f.operations.length,1);detach();
});
test('successful profile verification resumes a previously unauthorized runner',async()=>{
  const f=fixture();f.setState({cloudVerified:false});await f.runner.wake();assert.equal(f.operations.length,0);
  f.setState({cloudVerified:true});await f.runner.wake('verified');assert.equal(f.operations.length,1);
});
test('hidden/offline page neither attempts nor spins timers; foreground resumption honors saved retry time',async()=>{
  const f=fixture(),window=events(),document=events();f.setSend(async()=>{throw Error('offline');});await f.runner.wake();
  const next=f.rows[0].sync_next_retry_at;assert.equal(f.timers.size,1);
  f.runner.bindWakeups({window,document,verify:async()=>{}});document.hidden=true;f.setVisible(false);await document.emit('visibilitychange');
  assert.equal(f.timers.size,0);await f.advance(10000);assert.equal(f.operations.length,1);
  document.hidden=false;f.setVisible(true);await document.emit('visibilitychange');assert.equal(f.operations.length,1);assert.equal(f.rows[0].sync_next_retry_at,next);assert.equal(f.timers.size,1);
});
test('exponential backoff has conservative jitter and a hard delay cap',()=>{
  assert.equal(runnerModule.retryDelay(1,()=>0),24000);assert.equal(runnerModule.retryDelay(1,()=>1),36000);
  assert.equal(runnerModule.retryDelay(2,()=>0.5),60000);
  for(let attempt=1;attempt<=40;attempt++)assert.ok(runnerModule.retryDelay(attempt,()=>1)<=runnerModule.RETRY.MAX_MS);
});
test('lost INSERT response persists uncertainty, attempt count and retry date; restart honors the schedule and reconciles first',async()=>{
  const f=fixture();f.setSend(async()=>{throw Error('lost response');});await f.runner.wake();
  const failed=f.rows[0];assert.equal(failed.sync_attempts,1);assert.equal(failed.sync_status,'failed');assert.equal(failed.sync_outcome_unknown,true);
  assert.equal(failed.sync_next_retry_at,new Date(clockStart+30000).toISOString());assert.equal(store.contains(f.storage,'account',failed),true);
  const snapshot=copy(failed.submission_snapshot);f.restart();f.setSend(async row=>({data:row}));
  await f.runner.wake('startup');assert.equal(f.operations.length,1);await f.advance(29999);assert.equal(f.operations.length,1);
  await f.advance(1);assert.deepEqual(f.operations.map(op=>op.kind),['insert','read','insert']);
  assert.equal(f.rows[0].sync_status,'synced');assert.equal(f.rows[0].sync_attempts,0);assert.equal(f.rows[0].sync_next_retry_at,null);assert.deepEqual(f.rows[0].submission_snapshot,snapshot);
});
test('matching reconciliation acknowledges a lost committed INSERT without a duplicate',async()=>{
  const f=fixture();f.setSend(async row=>{f.cloud.set(row.id,row);throw Error('response lost');});await f.runner.wake();await f.advance(30000);
  assert.deepEqual(f.operations.map(op=>op.kind),['insert','read']);assert.equal(f.rows[0].sync_status,'synced');assert.equal(f.rows[0].remote_id,f.rows[0].id);
});
test('existing interrupted snapshot reconciles NO CLOUD ROW before controlled INSERT',async()=>{
  const f=fixture();const snapshot=f.uncertain();await f.runner.wake();
  assert.deepEqual(f.operations.map(op=>op.kind),['read','insert']);assert.equal(f.rows[0].sync_status,'synced');assert.deepEqual(f.rows[0].submission_snapshot.row,snapshot);
});
test('reconciliation mismatch is held permanently and later eligible records continue',async()=>{
  const first=record(2),later=record(1),f=fixture([first,later]);const row=f.uncertain(first);f.cloud.set(first.id,{...row,user_id:other});
  await f.runner.wake();assert.equal(first.sync_status,'needs_review');assert.equal(first.submission_review_required,true);assert.equal(later.sync_status,'synced');
  assert.deepEqual(f.operations.map(op=>op.kind),['read','insert']);await f.runner.retryNow();assert.equal(f.operations.length,2);
});
test('transient reconciliation failure schedules another read, never an INSERT',async()=>{
  const f=fixture();f.uncertain();f.setRead(async()=>({error:{status:503}}));await f.runner.wake();
  assert.equal(f.rows[0].sync_attempts,1);assert.equal(f.rows[0].submission_retry_allowed,false);
  await f.advance(30000);assert.deepEqual(f.operations.map(op=>op.kind),['read','read']);assert.equal(f.rows[0].sync_attempts,2);assert.equal(f.rows[0].sync_next_retry_at,new Date(f.now+60000).toISOString());
});
test('authorization/profile failure pauses globally without retry timer or inspection requests',async()=>{
  const f=fixture([record(1),record(2)]);f.setVerify(async()=>{throw Error('profile unavailable');});await f.runner.wake();
  assert.equal(f.runner.status().paused,'authorization');assert.equal(f.operations.length,0);assert.equal(f.timers.size,0);
  await f.runner.wake('saved');assert.equal(f.operations.length,0);f.setVerify(async()=>{});await f.runner.wake('verified');assert.equal(f.operations.length,2);
});
test('inaccessible reconciliation pauses without accepting absence or creating another row',async()=>{
  const f=fixture();f.uncertain();f.setRead(async()=>({error:{status:401}}));await f.runner.wake();
  assert.equal(f.runner.status().paused,'authorization');assert.equal(f.rows[0].sync_outcome_unknown,true);assert.equal(f.rows[0].submission_retry_allowed,false);assert.equal(f.timers.size,0);assert.deepEqual(f.operations.map(op=>op.kind),['read']);
});
test('RLS rejection during reconciliation is permanently held while unrelated records continue',async()=>{
  const first=record(2),later=record(1),f=fixture([first,later]);f.uncertain(first);f.setRead(async()=>({error:{code:'42501'}}));
  await f.runner.wake();assert.equal(first.submission_review_required,true);assert.equal(later.sync_status,'synced');
  await f.runner.wake('verified');assert.deepEqual(f.operations.map(op=>op.kind),['read','insert']);assert.equal(f.timers.size,0);
});
for(const error of [{code:'42501',message:'RLS'},{code:'23514',message:'constraint'},{status:400,message:'validation'}])test(`permanent INSERT rejection ${JSON.stringify(error)} holds only that record`,async()=>{
  const first=record(2),later=record(1),f=fixture([first,later]);f.setSend(async row=>row.id===first.id?{error}:{data:row});
  await f.runner.wake();assert.equal(first.sync_status,'needs_review');assert.equal(first.submission_review_required,true);assert.equal(first.sync_attempts,0);assert.equal(later.sync_status,'synced');assert.equal(f.timers.size,0);
  await f.runner.retryNow();assert.equal(f.operations.length,2);
});
test('UUID conflict is review-only, without automatic overwrites or conflict retries',async()=>{
  const f=fixture();f.setSend(async()=>({error:{code:'23505'}}));await f.runner.wake();await f.runner.retryNow();
  assert.equal(f.rows[0].sync_status,'needs_review');assert.equal(f.rows[0].submission_review_required,true);assert.deepEqual(f.operations.map(op=>op.kind),['insert']);
});
for(const over of [{guest_claim_required:true},{preapproval_review_required:true},{sync_status:'local_only'},{sync_status:'synced'},{remote_id:'already-submitted'},{id:'bad-id'},{importBatchId:'batch'},{cloud_source:true},{submission_review_required:true},{sync_status:'needs_review'}])test(`excluded record is not automatically handled: ${JSON.stringify(over)}`,async()=>{
  const f=fixture([record(1,over)]);await f.runner.wake();assert.equal(f.operations.length,0);assert.equal(f.timers.size,0);
});
for(const change of [{mode:'guest',userId:''},{cloudVerified:false},{profile:{id:user,approved:false,role:'inspector',team:'roadway'}},{profile:{id:user,approved:true,role:'administrator',team:'roadway'}},{workspaceUserId:other}])test(`unauthorized context is paused: ${JSON.stringify(change)}`,async()=>{
  const f=fixture();f.setState(change);await f.runner.wake();assert.equal(f.operations.length,0);
});
for(const change of [
  {userId:other,workspaceUserId:other,profile:{id:other,role:'inspector',approved:true,team:'roadway'}},
  {workspaceUserId:other},{profile:{id:user,role:'inspector',approved:true,team:'other'}},{sessionGeneration:2}
])test(`account/workspace/team/session change rejects late INSERT acknowledgement: ${JSON.stringify(change)}`,async()=>{
  const f=fixture(),gate=deferred(),started=deferred();f.setSend(row=>{started.resolve(row);return gate.promise;});
  const running=f.runner.wake();const row=await started.promise;const before=JSON.stringify(f.rows);
  f.setState(change);f.runner.invalidate();gate.resolve({data:row});await running;
  assert.equal(JSON.stringify(f.rows),before);assert.equal(f.rows[0].remote_id,'');assert.equal(f.timers.size,0);
});
test('old operation settles before a verified replacement workspace can begin; late result cannot mutate either workspace',async()=>{
  const f=fixture(),gate=deferred(),started=deferred();f.setSend(row=>{started.resolve(row);return gate.promise;});
  const running=f.runner.wake();const oldRow=await started.promise,old=f.rows[0];
  f.setState({userId:other,workspaceUserId:other,scopeGeneration:2,profile:{id:other,role:'inspector',approved:true,team:'roadway'}});f.runner.invalidate();
  const fresh=record(2);f.replaceRows([fresh]);f.runner.wake('verified');gate.resolve({data:oldRow});await running;
  f.setSend(async row=>({data:row}));await f.advance(0);assert.equal(old.remote_id,'');assert.equal(fresh.sync_status,'synced');assert.equal(f.maxActive,1);
});
test('same-account new session reconciles an in-memory interrupted syncing record after the old operation settles',async()=>{
  const f=fixture(),gate=deferred(),started=deferred();f.setSend(row=>{f.cloud.set(row.id,row);started.resolve(row);return gate.promise;});
  const running=f.runner.wake();const row=await started.promise;f.setState({sessionGeneration:2});f.runner.invalidate();f.runner.wake('verified');gate.resolve({data:row});await running;
  assert.equal(f.rows[0].remote_id,'');await f.advance(0);assert.deepEqual(f.operations.map(op=>op.kind),['insert','read']);assert.equal(f.rows[0].sync_status,'synced');
});
test('record state or review flag change during INSERT cannot receive a late acknowledgement',async()=>{
  for(const change of [{guest_claim_required:true},{preapproval_review_required:true},{sync_status:'local_only'},{remote_id:'changed'}]){
    const f=fixture(),gate=deferred(),started=deferred();f.setSend(row=>{started.resolve(row);return gate.promise;});const run=f.runner.wake();const row=await started.promise;
    Object.assign(f.rows[0],change);f.persist();gate.resolve({data:row});await run;
    assert.equal(f.rows[0].submission_review_required,true);assert.notEqual(f.rows[0].remote_id,f.rows[0].id);
    if(change.sync_status==='local_only')assert.equal(f.rows[0].sync_status,'local_only');
  }
});
test('local_only change during a lost response remains locally held without automatic retry metadata',async()=>{
  const f=fixture(),gate=deferred(),started=deferred();f.setSend(async()=>{started.resolve();await gate.promise;throw Error('lost');});
  const run=f.runner.wake();await started.promise;f.rows[0].sync_status='local_only';f.persist();gate.resolve();await run;
  assert.equal(f.rows[0].sync_status,'local_only');assert.equal(f.rows[0].sync_attempts,0);assert.equal(f.timers.size,0);
});
test('manual action cannot race an automatic attempt for the same UUID',async()=>{
  const f=fixture(),gate=deferred(),started=deferred();f.setSend(row=>{started.resolve(row);return gate.promise;});
  const running=f.runner.wake();const row=await started.promise;assert.equal((await f.runner.submit(f.rows[0])).status,'busy');
  assert.equal((await f.api.insertOne(f.rows[0])).status,'busy');assert.equal((await f.api.reconcileOne(f.rows[0])).status,'busy');
  gate.resolve({data:row});await running;assert.equal(f.operations.length,1);
});
test('automatic wakes cannot race the existing explicit manual path',async()=>{
  const f=fixture(),gate=deferred(),started=deferred();f.setSend(row=>{started.resolve(row);return gate.promise;});
  const manual=f.runner.submit(f.rows[0]);const row=await started.promise;f.runner.wake('saved');gate.resolve({data:row});
  assert.equal((await manual).status,'submitted');await f.advance(0);assert.equal(f.operations.length,1);
});
test('actual manual app action shares the runner lock and reports a submitted local inspection',async()=>{
  const f=fixture();const html=fs.readFileSync(require.resolve('./index.html'),'utf8');const start=html.indexOf('async function submitLocalInspection(');const code=html.slice(start,html.indexOf('\n    }',start)+6);
  let message='';const app=vm.createContext({entries:f.rows,inspectionApi:f.api,syncRunner:f.runner,inspectionScopeGeneration:1,authDisplayState:f.current,
    activeEntriesStorageKey:()=> 'account',cloudAccess:()=>true,setCloudStatus:value=>{message=value;},renderLog(){}});
  vm.runInContext(code,app);const button={disabled:false};await app.submitLocalInspection(f.rows[0].id,button);
  assert.equal(f.operations.length,1);assert.equal(f.rows[0].sync_status,'synced');assert.match(message,/One inspection submitted/);assert.equal(button.disabled,false);
});
test('actual Retry now app action survives the verification wakeup race and brings a delayed reconciliation forward',async()=>{
  const f=fixture();f.setSend(async()=>{throw Error('lost');});await f.runner.wake();f.setSend(async row=>({data:row}));
  const html=fs.readFileSync(require.resolve('./index.html'),'utf8'),start=html.indexOf('async function syncNow(');const code=html.slice(start,html.indexOf('\n    }',start)+6);
  const app=vm.createContext({syncRunner:f.runner,authDisplayState:f.current,SPOTITInspections:inspections,inspectionContext:()=>f.current,
    authController:{verifyOnline:async()=>{queueMicrotask(()=>f.runner.wake('verified'));}},setCloudStatus(){},updateSyncStatus(){}});
  vm.runInContext(code,app);await app.syncNow();assert.deepEqual(f.operations.map(op=>op.kind),['insert','read','insert']);assert.equal(f.rows[0].sync_status,'synced');
});
test('Retry now overrides only transient schedule while retaining snapshot, retry count and reconciliation requirement',async()=>{
  const f=fixture();f.setSend(async()=>{throw Error('lost');});await f.runner.wake();const snapshot=copy(f.rows[0].submission_snapshot);
  f.setSend(async row=>({data:row}));await f.runner.retryNow();assert.deepEqual(f.operations.map(op=>op.kind),['insert','read','insert']);assert.deepEqual(f.rows[0].submission_snapshot,snapshot);assert.equal(f.rows[0].sync_attempts,0);
});
test('automatic retry budget is bounded and remains exhausted after restart',async()=>{
  const f=fixture([record(1,{sync_attempts:7})]);f.setSend(async()=>{throw Error('lost');});await f.runner.wake();
  assert.equal(f.rows[0].sync_attempts,8);assert.equal(f.rows[0].submission_review_required,true);assert.equal(f.timers.size,0);
  f.restart();await f.runner.wake();assert.equal(f.operations.length,1);
});
test('invalid persisted retry schedule is held, never treated as an immediate retry',async()=>{
  const f=fixture([record(1,{sync_next_retry_at:'broken'})]);await f.runner.wake();assert.equal(f.operations.length,0);assert.equal(f.rows[0].sync_status,'needs_review');assert.equal(f.rows[0].submission_review_required,true);
});
test('failure to persist retry metadata pauses and leaves the durable uncertain attempt recoverable',async()=>{
  const f=fixture();f.setSend(async()=>{f.setStorageFailure(true);throw Error('lost');});await f.runner.wake();
  assert.equal(f.runner.status().paused,'storage');assert.equal(f.timers.size,0);assert.equal(f.rows[0].remote_id,'');
  f.setStorageFailure(false);f.restart();f.setSend(async row=>({data:row}));await f.runner.wake();assert.deepEqual(f.operations.map(op=>op.kind),['insert','read','insert']);
});
test('local edit during uncertain recovery cannot alter the original snapshot or be acknowledged',async()=>{
  const f=fixture();const original=f.uncertain(),gate=deferred(),started=deferred();f.setRead(()=>{started.resolve();return gate.promise;});
  const running=f.runner.wake();await started.promise;f.rows[0].type='Cracks';f.persist();gate.resolve({data:original});await running;
  assert.equal(f.rows[0].remote_id,'');assert.equal(f.rows[0].submission_review_required,true);assert.deepEqual(f.rows[0].submission_snapshot.row,original);assert.deepEqual(f.operations.map(op=>op.kind),['read']);
});
test('API classification retries only network/server/rate-limit cases and excludes authorization/storage/permanent rejection',()=>{
  for(const error of [Error('lost response'),{status:503},{status:429},{code:'08006'},{code:'ECONNRESET'}])assert.equal(inspections.classifyFailure(error),'transient');
  for(const error of [{code:'42501'},{code:'23505'},{code:'22003'},{status:400},{code:'PGRST204'}])assert.equal(inspections.classifyFailure(error),'permanent');
  assert.equal(inspections.classifyFailure({status:401}),'authorization');assert.equal(inspections.classifyFailure({syncKind:'storage'}),'storage');
});
test('Auth invalidates the session immediately when sign-out begins, before SDK completion',async()=>{
  const data=new Map(),gate=deferred();let invalidated=0;
  const storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  const controller=auth.createController({client:{auth:{getUser:async()=>({data:{user:{id:user}}}),signOut:()=>gate.promise},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:user,approved:true,role:'inspector',team:'roadway'}})})})})},storage,localCount:()=>0,online:()=>true,onInvalidate:()=>{invalidated++;}});
  await controller.start();const before=controller.sessionGeneration();const pending=controller.signOut();
  assert.equal(controller.sessionGeneration(),before+1);assert.equal(invalidated,1);gate.resolve({});await pending;
});
test('concurrent Auth/runner verification calls share a fresh profile check',async()=>{
  const gate=deferred(),data=new Map();let userChecks=0,profiles=0;
  const storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
  const controller=auth.createController({client:{auth:{getUser:async()=>{userChecks++;return {data:{user:{id:user}}};}},from:()=>({select:()=>({eq:()=>({single:async()=>{profiles++;await gate.promise;return {data:{id:user,role:'inspector',approved:true,team:'roadway'}};}})})})},storage,localCount:()=>0,online:()=>true});
  const first=controller.verifyOnline(),second=controller.verifyOnline();assert.equal(first,second);await Promise.resolve();
  assert.equal(userChecks,1);assert.equal(profiles,1);gate.resolve();await Promise.all([first,second]);assert.equal(controller.getState().cloudVerified,true);
});
test('production app connects guarded runner, caches its module, and invalidates reloads instead of draining twice',()=>{
  const html=fs.readFileSync(require.resolve('./index.html'),'utf8'),sw=fs.readFileSync(require.resolve('./sw.js'),'utf8');
  assert.match(html,/SPOTITSyncRunner\.createRunner\(/);assert.match(html,/syncRunner\.bindWakeups/);assert.match(html,/syncRunner\.submit\(entry\)/);assert.match(html,/syncRunner\.wake\('startup'\)/);assert.match(html,/syncRunner\?\.wake\('verified'\)/);assert.match(html,/syncRunner\.wake\('saved'\)/);
  assert.doesNotMatch(html,/syncQueue\.drain\(/);assert.match(sw,/'\.\/sync-runner\.js'/);assert.match(sw,/'v226'/);
  const source=fs.readFileSync(require.resolve('./sync-runner'),'utf8');assert.doesNotMatch(source,/\.upsert\(|\.update\(|\.storage\b|\.from\(/);
});
