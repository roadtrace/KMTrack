const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const review=require('./preapproval-review');
const queue=require('./sync-queue');
const model=require('./entry-model');
const store=require('./local-entry-store');
const runners=require('./sync-runner');
function fixture(){
 const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 let c={mode:'approved',cloudVerified:true,canUseLocal:true,userId:user,workspaceUserId:user,scopeGeneration:1,sessionGeneration:1,profile:{id:user,approved:true,role:'inspector',team:'new-team'}};
 let rows=[model.createEntry({lat:14,lon:121,type:'Potholes',timestamp:'2026-10-02 10:00:00',preapproval_review_required:true,team:'old-team',photoId:'saved-photo'})];
 const data=new Map(),storage={setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k)};store.save(storage,'account',rows);
 let key='account',wakes=0,fail=false,verify=async()=>{};
 const opts={context:()=>c,entries:()=>rows,key:()=>key,durable:e=>store.contains(storage,key,e),verify:()=>verify(),persist:(next,k)=>{if(fail)return false;store.save(storage,k,next);return true;},wake:()=>wakes++};
 const controller=review.createReview(opts);
 return {controller,opts,storage,get c(){return c},set c(v){c=v},get rows(){return rows},set rows(v){rows=v},set key(v){key=v},set fail(v){fail=v},set verify(v){verify=v},get wakes(){return wakes}};
}
test('approval and runner wake never release hold; record surfaces for review',async()=>{
 const f=fixture(),e=f.rows[0];assert.equal(queue.automaticEligibility(e,f.c,true).eligible,false);
 let inserts=0;const runner=runners.createRunner({api:{insertOne:async()=>inserts++,reconcileOne:async()=>{}},entries:()=>f.rows,context:()=>f.c,durable:()=>true,persist:()=>true});
 await runner.wake();runner.stop();assert.equal(inserts,0);assert.equal(e.preapproval_review_required,true);assert.deepEqual(f.controller.pending(),[e]);
});
for(const decision of ['submit','local'])test(`${decision} is durable before wake, preserves photo and restart status`,async()=>{
 const f=fixture(),ticket=f.controller.open(f.rows[0].id),original=JSON.parse(ticket.record);
 await f.controller.decide(ticket,decision);const e=f.rows[0];assert.equal(e.preapproval_review_required,false);assert.equal(e.photoId,original.photoId);assert.equal(e.id,original.id);assert.equal(e.timestamp,original.timestamp);assert.equal(store.contains(f.storage,'account',e),true);
 assert.equal(e.sync_status,decision==='submit'?'pending':'local_only');assert.equal(f.wakes,decision==='submit'?1:0);
 assert.equal(queue.automaticEligibility(e,f.c,true).eligible,decision==='submit');
 const restarted=model.normalizeEntry(JSON.parse(f.storage.getItem('account'))[0]);assert.equal(restarted.sync_status,e.sync_status);
 if(decision==='submit'){assert.equal(e.team,'new-team');assert.equal(e.user_id,f.c.userId);assert.equal(e.submission_snapshot,undefined);}
});
test('failed persistence retains exact held record and never wakes',async()=>{const f=fixture(),t=f.controller.open(f.rows[0].id);f.fail=true;await assert.rejects(f.controller.decide(t,'submit'),/could not be saved/);assert.equal(JSON.stringify(f.rows[0]),t.record);assert.equal(f.wakes,0);assert.equal(store.contains(f.storage,'account',f.rows[0]),true);});
for(const [name,change] of [
 ['account switch',f=>f.c={...f.c,userId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}],
 ['workspace switch',f=>f.key='guest'],['team switch',f=>f.c.profile.team='other'],
 ['sign out',f=>f.c.mode='signed-out'],['stale verification',f=>f.c.cloudVerified=false],
 ['lost approval',f=>f.c.profile.approved=false],['session replacement',f=>f.c.sessionGeneration++],
 ['record edit',f=>f.rows[0].type='Edited']
])test(`${name} during verification blocks mutation`,async()=>{
 const f=fixture(),t=f.controller.open(f.rows[0].id);f.verify=async()=>change(f);
 await assert.rejects(f.controller.decide(t,'submit'));assert.equal(f.rows[0].preapproval_review_required,true);assert.equal(f.wakes,0);
});
test('switch before decision blocks verification and mutation',async()=>{const f=fixture(),t=f.controller.open(f.rows[0].id);f.c.scopeGeneration++;f.verify=async()=>assert.fail('verification should not start');await assert.rejects(f.controller.decide(t,'local'));assert.equal(f.rows[0].preapproval_review_required,true);});
for(const overrides of [{guest_claim_required:true},{sync_status:'local_only'},{submission_snapshot:{}},{submission_review_required:true},{remote_id:'cloud'},{importBatchId:'import'}])test(`unrelated hold is untouched ${JSON.stringify(overrides)}`,()=>{const f=fixture();Object.assign(f.rows[0],overrides);assert.equal(f.controller.pending().length,0);assert.throws(()=>f.controller.open(f.rows[0].id));assert.equal(f.rows[0].preapproval_review_required,true);});
for(const role of ['administrator','inspector','supervisor'])test(`review role ${role}`,()=>{const f=fixture();f.c.profile.role=role;assert.equal(f.controller.pending().length,role==='administrator'?0:1);});
test('restart preserves unresolved flags',()=>{const f=fixture();const e=model.normalizeEntry(JSON.parse(f.storage.getItem('account'))[0]);assert.equal(e.preapproval_review_required,true);assert.equal(queue.automaticEligibility(e,f.c,true).eligible,false);});
test('UI uses explicit details and runner wake only; new asset is cached',()=>{const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');assert.match(html,/Review inspection/);assert.match(html,/record.notes/);assert.match(html,/controller.decide\(ticket, decision\)/);assert.match(html,/syncRunner\?\.wake\('preapproval-reviewed'\)/);assert.match(sw,/preapproval-review.js/);assert.match(sw,/v240/);});
test('readback failure rolls durable decision back to original hold',()=>{
 const f=fixture(),before=f.storage.getItem('account'),candidate=f.rows.map(e=>({...e,preapproval_review_required:false}));
 let written=false;const storage={setItem:(k,v)=>{f.storage.setItem(k,v);written=true},getItem:k=>written?(written=false,'mismatched'):f.storage.getItem(k)};
 assert.throws(()=>store.saveReview(storage,'account',f.rows,candidate));assert.equal(f.storage.getItem('account'),before);
});
test('changed disk workspace is not overwritten',()=>{const f=fixture();f.storage.setItem('account','[]');assert.throws(()=>store.saveReview(f.storage,'account',f.rows,[]));assert.equal(f.storage.getItem('account'),'[]');});
test('closing review during verification cancels decision',async()=>{const f=fixture(),t=f.controller.open(f.rows[0].id);f.verify=async()=>{t.cancelled=true};await assert.rejects(f.controller.decide(t,'submit'));assert.equal(f.rows[0].preapproval_review_required,true);});
test('reviewed record enters existing runner only after durable release',async()=>{
 const f=fixture();let calls=0;
 const runner=runners.createRunner({api:{insertOne:async e=>{calls++;assert.equal(e.preapproval_review_required,false);assert.equal(store.contains(f.storage,'account',e),true);return {status:'synced'}},reconcileOne:async()=>assert.fail('new record must use normal insert path')},entries:()=>f.rows,context:()=>f.c,durable:e=>store.contains(f.storage,'account',e),persist:()=>true});
 await runner.wake();assert.equal(calls,0);await f.controller.decide(f.controller.open(f.rows[0].id),'submit');assert.equal(calls,0);await runner.wake();runner.stop();assert.equal(calls,1);
});
test('browser asset order resolves review dependency',()=>{const html=fs.readFileSync('index.html','utf8');assert.ok(html.indexOf('src="./sync-queue.js"')<html.indexOf('src="./preapproval-review.js"'));});
test('storage quota failure leaves persisted review flag intact',()=>{
 const f=fixture(),original=f.storage.getItem('account');const storage={getItem:k=>f.storage.getItem(k),setItem:()=>{throw Error('quota')}};
 assert.throws(()=>store.saveReview(storage,'account',f.rows,f.rows.map(e=>({...e,preapproval_review_required:false}))));
 assert.equal(f.storage.getItem('account'),original);assert.equal(model.normalizeEntry(JSON.parse(original)[0]).preapproval_review_required,true);
});
test('failed Keep local save does not clear hold or change status',async()=>{const f=fixture(),t=f.controller.open(f.rows[0].id);f.fail=true;await assert.rejects(f.controller.decide(t,'local'));assert.equal(JSON.stringify(f.rows[0]),t.record);});
test('decision cannot be repeated after durable review',async()=>{const f=fixture(),t=f.controller.open(f.rows[0].id);await f.controller.decide(t,'local');await assert.rejects(f.controller.decide(t,'submit'));assert.equal(f.rows[0].sync_status,'local_only');assert.equal(f.wakes,0);});
test('unverified and signed-out accounts cannot even open review',()=>{for(const change of [f=>f.c.cloudVerified=false,f=>f.c.mode='signed-out',f=>f.c.mode='guest']){const f=fixture();change(f);assert.throws(()=>f.controller.open(f.rows[0].id));assert.equal(f.rows[0].preapproval_review_required,true);}});
test('Submit uses real runner/API snapshot and acknowledgement without duplicates or photo transport',async()=>{
 const f=fixture(),api=require('./inspection-api');let writes=[];
 const persist=()=>{store.save(f.storage,'account',f.rows);return true};
 const client={auth:{getUser:async()=>({data:{user:{id:f.c.userId}},error:null})},from:table=>{assert.equal(table,'inspections');return {insert:row=>{writes.push(row);return {select:()=>({single:async()=>({data:row,error:null})})}}}}};
 const transport=api.createApi({client,verify:async()=>{},context:()=>f.c,durable:f.opts.durable,persist,isCurrent:e=>f.rows.includes(e)});
 const runner=runners.createRunner({api:transport,entries:()=>f.rows,context:()=>f.c,durable:f.opts.durable,persist});
 await runner.wake();assert.equal(writes.length,0);
 await f.controller.decide(f.controller.open(f.rows[0].id),'submit');assert.equal(writes.length,0);
 await runner.wake();await runner.wake();runner.stop();
 assert.equal(writes.length,1);assert.equal(writes[0].team,'new-team');assert.equal(writes[0].photo_path,null);assert.equal(writes[0].photo_filename,null);
 assert.equal(f.rows[0].sync_status,'synced');assert.equal(f.rows[0].remote_id,f.rows[0].id);assert.deepEqual(f.rows[0].submission_snapshot.row,writes[0]);assert.equal(f.rows[0].photoId,'saved-photo');assert.equal(store.contains(f.storage,'account',f.rows[0]),true);
});
