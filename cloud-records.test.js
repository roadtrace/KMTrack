const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cloud = require('./cloud-records');
const user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context = () => ({ mode:'approved',cloudVerified:true,canUseLocal:true,userId:user,workspaceUserId:user,
  scopeGeneration:1,sessionGeneration:1,profile:{id:user,approved:true,role:'inspector',team:'roadway'} });
const row = (n, over={}) => ({ id:id(n),user_id:user,team:'roadway',inspected_at:'2026-10-05T01:00:00.123456+00:00',...over });
const descending = (start,count) => Array.from({length:count},(_,i)=>row(start-i));
const deferred = () => { let resolve; const promise = new Promise(r=>resolve=r); return {promise,resolve}; };
function fixture() {
  let current=context(), online=true, key='account', verify=async()=>{}, auth=async()=>({data:{user:{id:current.userId}}});
  let response=async()=>({data:[],error:null});
  const calls=[];
  const client={auth:{getUser:()=>{calls.push(['getUser']);return auth();}},from:table=>{
    calls.push(['from',table]);
    const q={};for(const name of ['select','eq','or','order','limit'])q[name]=(...args)=>{calls.push([name,...args]);return q;};
    q.then=(yes,no)=>Promise.resolve().then(response).then(yes,no);return q;
  }};
  const store=cloud.createStore({client,context:()=>current,key:()=>key,online:()=>online,verify:()=>verify(),now:()=>123});
  return {store,calls,current,client,setContext:c=>current=c,setOnline:b=>online=b,setKey:k=>key=k,
    setVerify:f=>verify=f,setAuth:f=>auth=f,setResponse:f=>response=f,setRows:rows=>response=async()=>({data:rows,error:null})};
}
test('My and Team queries contain explicit equality scope, stable order and 51-row lookahead',async()=>{
  const f=fixture();f.setRows([row(1)]);await f.store.load('my');
  assert.deepEqual(f.calls.filter(c=>['eq','order','limit'].includes(c[0])),[
    ['eq','team','roadway'],['eq','user_id',user],['order','inspected_at',{ascending:false,nullsFirst:false}],['order','id',{ascending:false}],['limit',51]]);
  f.calls.length=0;await f.store.load('team');assert.deepEqual(f.calls.filter(c=>c[0]==='eq'),[['eq','team','roadway']]);
  assert.deepEqual(f.calls.find(c=>c[0]==='select'),['select',cloud.COLUMNS]);
});
test('pinned Supabase SDK produces correct GET filters, null ordering and escaped cursor',async()=>{
  const vm=require('node:vm');const box={URL,Headers,Request,Response,AbortController,WebSocket,console,setTimeout,clearTimeout,setInterval,clearInterval};
  vm.runInNewContext(fs.readFileSync('./vendor/supabase/supabase-js-2.117.1.umd.js','utf8'),box);
  const sdk=box.supabase,requests=[];
  const client=sdk.createClient('https://example.supabase.co','public-test-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:async(url,options)=>{requests.push({url:new URL(url),options});return new Response(JSON.stringify(requests.length === 1 ? descending(51,51) : []),{status:200,headers:{'Content-Type':'application/json'}});}}});
  // Exercise the guarded store using the real pinned query builder and a fake
  // authenticated identity/network. No external requests can escape this fetch.
  const store=cloud.createStore({client:{auth:{getUser:async()=>({data:{user:{id:user}}})},from:client.from.bind(client)},
    context,verify:async()=>{},key:()=> 'account'});
  await store.load('my');
  await store.load('my');
  const {url,options}=requests[0];assert.equal(options.method,'GET');
  assert.equal(url.searchParams.get('team'),'eq.roadway');assert.equal(url.searchParams.get('user_id'),`eq.${user}`);
  assert.equal(url.searchParams.get('order'),'inspected_at.desc.nullslast,id.desc');assert.equal(url.searchParams.get('limit'),'51');
  assert.equal(requests[1].url.searchParams.get('or'),
    `(inspected_at.lt.2026-10-05T01:00:00.123456Z,and(inspected_at.eq.2026-10-05T01:00:00.123456Z,id.lt.${id(2)}),inspected_at.is.null)`);
});
test('lookahead is not consumed; timestamp tie pagination follows server cursor',async()=>{
  const f=fixture();f.setRows(descending(101,51));const first=await f.store.load('my');
  assert.equal(first.rows.length,50);assert.equal(first.cursor.id,id(52));assert.equal(first.hasMore,true);assert.equal(first.loading,false);
  f.setRows(descending(51,51));const second=await f.store.load('my');assert.equal(second.rows.length,100);assert.equal(second.cursor.id,id(2));
  assert.match(f.calls.find(c=>c[0]==='or')[1],/123456Z/);
  f.setRows([row(1)]);const end=await f.store.load('my');assert.equal(end.hasMore,false);assert.equal(end.rows.length,101);
  const before=f.calls.length;await f.store.load('my');assert.equal(f.calls.length,before);
});
test('null inspected_at appears after dated records, then UUID-only null cursor advances',async()=>{
  const f=fixture();const values=descending(60,49).concat([row(11,{inspected_at:null}),row(10,{inspected_at:null})]);
  f.setRows(values);let s=await f.store.load('my');assert.deepEqual(s.cursor,{inspected_at:null,id:id(11)});
  f.setRows([row(10,{inspected_at:null})]);s=await f.store.load('my');assert.equal(s.rows.length,51);
  assert.equal(f.calls.find(c=>c[0]==='or')[1],`and(inspected_at.is.null,id.lt.${id(11)})`);
});
test('cursor preserves microseconds and validates input instead of interpolating arbitrary filters',()=>{
  assert.equal(cloud.timestamp('2026-10-05T09:00:00.000001+08:00'),'2026-10-05T01:00:00.000001Z');
  assert.throws(()=>cloud.cursorFilter({id:'x),team.eq.other',inspected_at:null}));
  assert.throws(()=>cloud.cursorFilter({id:id(1),inspected_at:'y),team.eq.other'}));
  assert.equal(cloud.compare(cloud.position(row(1,{inspected_at:'2026-10-05T01:00:00.000002Z'})),cloud.position(row(100,{inspected_at:'2026-10-05T01:00:00.000001Z'}))),-1);
});
test('five retained pages bound memory while continuation survives page eviction',async()=>{
  const f=fixture();for(let i=0;i<7;i++){f.setRows(descending(500-i*50,51));await f.store.load('my');}
  const s=f.store.snapshot('my');assert.equal(s.rows.length,250);assert.equal(s.pageCount,5);assert.equal(s.evicted,true);
  assert.equal(s.coverage,'retained-window');assert.equal(s.cursor.id,id(151));assert.equal(s.rows[0].id,id(400));
});
test('UUID overlap after timestamp changes renders once and cursor still advances from server page',async()=>{
  const f=fixture();f.setRows(descending(100,51));await f.store.load('my');
  f.setRows([row(100,{inspected_at:'2026-10-04T00:00:00Z'}),row(1,{inspected_at:'2026-10-03T00:00:00Z'})]);
  const s=await f.store.load('my');assert.equal(s.rows.length,51);assert.equal(s.rows.filter(r=>r.id===id(100)).length,1);
  assert.equal(s.cursor.id,id(1));assert.equal(s.rows.find(r=>r.id===id(100)).inspected_at,'2026-10-04T00:00:00Z');
});
test('cloud rows are detached/frozen and a new store has no retained cloud state',async()=>{
  const f=fixture(),raw=row(1);f.setRows([raw]);const s=await f.store.load('my');raw.team='changed';assert.equal(s.rows[0].team,'roadway');
  assert.ok(Object.isFrozen(s.rows)&&Object.isFrozen(s.rows[0])&&Object.isFrozen(s.scope));
  assert.equal(fixture().store.snapshot('my').rows.length,0);
});
for(const [name,mutate] of [
  ['Guest',c=>({...c,mode:'guest'})],['pending',c=>({...c,mode:'pending'})],['expired verification',c=>({...c,cloudVerified:false})],
  ['workspace mismatch',c=>({...c,workspaceUserId:other})],['locked workspace',c=>({...c,canUseLocal:false})],
  ['unapproved',c=>({...c,profile:{...c.profile,approved:false}})],['missing team',c=>({...c,profile:{...c.profile,team:null}})],
  ['missing generation',c=>({...c,sessionGeneration:undefined})],['profile identity mismatch',c=>({...c,profile:{...c.profile,id:other}})]
])test(`${name} prevents requests and exposes no cloud pages`,async()=>{
  const f=fixture();f.setContext(mutate(context()));await assert.rejects(f.store.load('my'));assert.equal(f.calls.length,0);assert.equal(f.store.snapshot('my').scope,null);
});
test('admin assigned team remains narrowed; no-team admin is unavailable; Supervisor permitted',async()=>{
  const f=fixture();f.setContext({...context(),profile:{...context().profile,role:'administrator'}});await f.store.load('team');
  assert.deepEqual(f.calls.find(c=>c[0]==='eq'),['eq','team','roadway']);
  f.setContext({...context(),profile:{...context().profile,role:'administrator',team:null}});await assert.rejects(f.store.load('team'));
  f.setContext({...context(),profile:{...context().profile,role:'supervisor'}});await f.store.load('my');
});
for(const [name,change] of [
  ['account',f=>f.setContext({...context(),userId:other,workspaceUserId:other,profile:{...context().profile,id:other}})],
  ['team',f=>f.setContext({...context(),profile:{...context().profile,team:'ams'}})],
  ['role',f=>f.setContext({...context(),profile:{...context().profile,role:'supervisor'}})],
  ['session',f=>f.setContext({...context(),sessionGeneration:2})],['workspace generation',f=>f.setContext({...context(),scopeGeneration:2})],
  ['workspace key',f=>f.setKey('different')],['offline',f=>f.setOnline(false)],['signout',f=>f.setContext({...context(),mode:'signed-out'})]
])test(`${name} invalidates both views and late rows`,async()=>{
  const f=fixture();f.setRows([row(100)]);await f.store.load('my');await f.store.load('team');
  const wait=deferred();f.setResponse(()=>wait.promise);const pending=f.store.load('my',{refresh:true});
  await new Promise(setImmediate);change(f);assert.equal(f.store.snapshot('team').rows.length,0);
  wait.resolve({data:[row(1)],error:null});await assert.rejects(pending,/scope changed/);assert.equal(f.store.snapshot('my').rows.length,0);
});
test('signout and same-account return cannot revive an old request',async()=>{
  const f=fixture(),wait=deferred();f.setResponse(()=>wait.promise);const pending=f.store.load('my');await new Promise(setImmediate);
  f.store.invalidate();f.setContext(context());wait.resolve({data:[row(1)],error:null});await assert.rejects(pending,/scope changed/);
  assert.equal(f.store.snapshot('my').rows.length,0);
});
test('scope changes during verification or getUser prevent inspection SELECT',async()=>{
  for(const boundary of ['verify','auth']){
    const f=fixture(),wait=deferred();if(boundary==='verify')f.setVerify(()=>wait.promise);else f.setAuth(()=>wait.promise);
    const pending=f.store.load('my');await new Promise(setImmediate);f.setKey('new');wait.resolve({data:{user:{id:user}}});
    await assert.rejects(pending);assert.equal(f.calls.filter(c=>c[0]==='from').length,0);
  }
});
test('simultaneous load-more coalesces but refresh supersedes earlier request',async()=>{
  const f=fixture(),wait=deferred();f.setResponse(()=>wait.promise);const a=f.store.load('my'),b=f.store.load('my');assert.equal(a,b);
  await new Promise(setImmediate);f.setRows([row(2)]);const fresh=await f.store.load('my',{refresh:true});
  wait.resolve({data:[row(1)],error:null});await assert.rejects(a,/superseded/);assert.equal(fresh.rows[0].id,id(2));
});
test('failed refresh retains prior valid page atomically; successful empty refresh resets continuation',async()=>{
  const f=fixture();f.setRows(descending(100,51));await f.store.load('my');f.setResponse(async()=>({error:{status:500}}));
  await assert.rejects(f.store.load('my',{refresh:true}));assert.equal(f.store.snapshot('my').rows.length,50);
  f.setRows([]);const s=await f.store.load('my',{refresh:true});assert.equal(s.rows.length,0);assert.equal(s.cursor,null);assert.equal(s.evicted,false);assert.equal(s.hasMore,false);
});
test('authorization failures discard both collections, not just the failing view',async()=>{
  for(const boundary of ['verify','auth','read','httpStatus']){
    const f=fixture();f.setRows([row(1)]);await f.store.load('my');await f.store.load('team');
    if(boundary==='verify')f.setVerify(async()=>{throw Error('offline');});
    if(boundary==='auth')f.setAuth(async()=>({error:{status:401}}));
    if(boundary==='read')f.setResponse(async()=>({error:{code:'42501'}}));
    if(boundary==='httpStatus')f.setResponse(async()=>({error:{message:'denied'},status:403}));
    await assert.rejects(f.store.load('my',{refresh:true}));assert.equal(f.store.snapshot('team').rows.length,0);
  }
});
test('foreign rows, invalid order, duplicate IDs and malformed timestamps fail closed',async()=>{
  for(const rows of [[row(1,{team:'ams'})],[row(1,{user_id:other})],[row(1),row(2)],[row(1),row(1)],[row(1,{inspected_at:'invalid'})]]){
    const f=fixture();f.setRows(rows);await assert.rejects(f.store.load('my'));assert.equal(f.store.snapshot('my').rows.length,0);
  }
});
test('Team accepts teammate within current team; query does not confer writes',async()=>{
  const f=fixture();f.setRows([row(1,{user_id:other})]);assert.equal((await f.store.load('team')).rows.length,1);
  assert.doesNotMatch(fs.readFileSync('cloud-records.js','utf8'),/\.(insert|update|upsert|delete|rpc|channel)\(|localStorage|indexedDB|\.storage\(/);
});
test('nullable legacy Team owner remains read-only data; My never includes unowned records',async()=>{
  const f=fixture();f.setRows([row(1,{user_id:null})]);assert.equal((await f.store.load('team')).rows[0].user_id,null);
  await assert.rejects(f.store.load('my'));
});
test('app lifecycle invalidates read store; My consumer stays separate from Map/export',()=>{
  const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
  assert.match(html,/cloudRecordStore = SPOTITCloudRecords.createStore/);
  assert.match(html,/onInvalidate:.*invalidateMyRecords/);
  assert.match(html,/window.addEventListener\('offline', \(\) => myRecords.invalidate\(\)\)/);
  assert.doesNotMatch(html,/cloudRecordStore\.load\(/);assert.doesNotMatch(html,/SPOTITRecordPresentation\.mergeMy\(/);
  assert.match(sw,/'v238'/);for(const name of ['cloud-records.js','record-presentation.js'])assert.ok(sw.includes(`./${name}`)&&html.includes(`./${name}`));
  assert.match(html,/PHOTO_CLOUD_TRANSPORT_ENABLED = false/);
});
