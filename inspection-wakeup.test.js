const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const wakeup=require('./inspection-wakeup'),queue=require('./sync-queue'),runner=require('./sync-runner'),store=require('./local-entry-store');
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const context={mode:'approved',cloudVerified:true,canUseLocal:true,userId:user,workspaceUserId:user,profile:{id:user,approved:true,role:'inspector',team:'roadway'}};
const row={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',sync_status:'pending',created_at:'2026-10-03T00:00:00Z',sync_attempts:0};
function fixture(){
 let work=true,time=0,key='account',visible=true,verifications=0,wakes=0,registers=0,reads=0;
 const timers=[],tags=new Set(),worker={},serviceWorker={controller:worker,addEventListener(){}};
 let verify=async()=>{verifications++;};
 const c=wakeup.createController({serviceWorker,hasWork:()=>work,now:()=>time,setTimer:fn=>timers.push(fn),scope:()=>key,visible:()=>visible,verify:()=>verify(),wake:()=>wakes++});
 c.setRegistration({sync:{getTags:async()=>{reads++;return [...tags]},register:async tag=>{registers++;tags.add(tag);}}});
 const flush=async()=>{while(timers.length)timers.shift()();await new Promise(setImmediate);};
 return {c,tags,flush,worker,setWork:v=>work=v,setTime:v=>time=v,setScope:v=>key=v,setVisible:v=>visible=v,setVerify:v=>verify=v,event:()=>({data:{type:wakeup.MESSAGE},source:worker}),get registers(){return registers},get reads(){return reads},get wakes(){return wakes},get verifications(){return verifications}};
}
test('eligible work registers stable tag; save bursts and consumed tags are rate bounded',async()=>{
 const f=fixture();for(let i=0;i<100;i++)f.c.changed();await f.flush();assert.equal(f.registers,1);assert.equal(f.reads,1);
 f.tags.clear();for(let i=0;i<100;i++){f.c.changed();await f.flush();}assert.equal(f.registers,1);
 f.setTime(60000);f.c.changed();await f.flush();assert.equal(f.registers,2);
 f.setTime(120000);f.c.changed();await f.flush();assert.equal(f.registers,2);
});
test('no work and unsupported API do not register or change durable records',async()=>{
 const f=fixture();f.setWork(false);await f.flush();assert.equal(f.registers,0);
 f.c.setRegistration({});f.setWork(true);await f.flush();assert.equal(f.registers,0);
});
test('eligibility is rechecked after getTags and registration failures preserve fallback',async()=>{
 const f=fixture();let release;
 f.c.setRegistration({sync:{getTags:()=>new Promise(r=>release=r),register:()=>assert.fail('stale registration')}});
 const flushing=f.flush();await Promise.resolve();f.setWork(false);release([]);await flushing;assert.equal(f.registers,0);
 f.setWork(true);f.setTime(60000);f.c.setRegistration({sync:{getTags:async()=>{throw Error('permission denied')}}});await f.flush();
 await f.c.receive(f.event());assert.equal(f.wakes,1);
});
for(const [name,changes] of Object.entries({Guest:{guest_claim_required:true},preapproval:{preapproval_review_required:true},local_only:{sync_status:'local_only'},needs_review:{sync_status:'needs_review'},review_hold:{submission_review_required:true},wrong_owner:{user_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'},wrong_team:{team:'other'}})){
 test(`${name} excluded using existing queue guards`,()=>{assert.equal(queue.automaticEligibility({...row,...changes},context,true).eligible,false);});
}
test('registration proof uses exact durable state and excludes retry exhaustion',()=>{
 const storage={getItem:()=>JSON.stringify([row])};assert.equal(runner.ordered([row],context,store.snapshotContains(storage,'account')).length,1);
 assert.equal(runner.ordered([{...row,team:'other'}],context,store.snapshotContains(storage,'account')).length,0);
 assert.equal(runner.ordered([row],{...context,workspaceUserId:'other'},()=>true).length,0);
});
test('notification burst reverifies once and wakes only the existing foreground runner',async()=>{
 const f=fixture();const pending=[];for(let i=0;i<100;i++)pending.push(f.c.receive(f.event()));await Promise.all(pending);
 assert.equal(f.verifications,1);assert.equal(f.wakes,1);
});
for(const change of ['sign-out','account-switch','team-switch','workspace-switch'])test(`${change} during verification blocks stale notification wake`,async()=>{
 const f=fixture();let release;f.setVerify(()=>new Promise(r=>release=r));const pending=f.c.receive(f.event());await Promise.resolve();f.setScope(change);release();await pending;assert.equal(f.wakes,0);
});
test('unavailable auth, hidden client and untrusted message never wake',async()=>{
 const f=fixture();f.setVerify(async()=>{throw Error('expired')});await f.c.receive(f.event());assert.equal(f.wakes,0);
 f.setVisible(false);await f.c.receive(f.event());assert.equal(f.wakes,0);
 f.setVisible(true);await f.c.receive({...f.event(),source:{}});assert.equal(f.wakes,0);
});
test('worker with no clients leaves durable work untouched and makes zero network calls',async()=>{
 const before=JSON.stringify(row);let scans=0;
 await wakeup.notifyClients({matchAll:async options=>{scans++;assert.deepEqual(options,{type:'window',includeUncontrolled:false});return [];}},'https://example.test/app/sw.js');
 assert.equal(scans,1);assert.equal(JSON.stringify(row),before);
});
test('worker notifies only controlled KMTrack windows in its exact application directory',async()=>{
 const sent=[];const clients=['https://example.test/app/','https://example.test/app/index.html','https://example.test/other/','https://other.test/app/'].map(url=>({url,postMessage:data=>sent.push({url,data})}));
 await wakeup.notifyClients({matchAll:async()=>clients},'https://example.test/app/sw.js');assert.equal(sent.length,2);assert.deepEqual(sent[0].data,{type:wakeup.MESSAGE});
});
test('actual worker sync handler has no auth/record/photo transport even with no windows',async()=>{
 const handlers={},waits=[];let notifications=0;
 const box={URL,SPOTITInspectionWakeup:wakeup,importScripts:name=>assert.equal(name,'./inspection-wakeup.js'),self:{location:{href:'https://example.test/sw.js'},clients:{matchAll:async()=>{notifications++;return [];}},addEventListener:(name,fn)=>handlers[name]=fn}};
 vm.runInNewContext(fs.readFileSync('sw.js','utf8'),box);handlers.sync({tag:wakeup.TAG,waitUntil:p=>waits.push(p)});await Promise.all(waits);assert.equal(notifications,1);
 const module=fs.readFileSync('inspection-wakeup.js','utf8');assert.doesNotMatch(module,/supabase|localStorage|indexedDB|fetch\(|\.insert\(|\.upsert\(/i);
 const html=fs.readFileSync('index.html','utf8');assert.match(html,/PHOTO_CLOUD_TRANSPORT_ENABLED = false/);assert.doesNotMatch(html,/Syncing in background/);assert.match(html,/scope: \(\) => SPOTITInspections.scopeKey/);
});
