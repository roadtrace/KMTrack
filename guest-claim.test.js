const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const claims=require('./guest-claim'),model=require('./entry-model'),store=require('./local-entry-store'),queue=require('./sync-queue'),runnerModule=require('./sync-runner'),apiModule=require('./inspection-api');
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const clone=v=>JSON.parse(JSON.stringify(v));
function fixture(){
 const map=new Map(),photos=new Map(),source=model.createEntry({lat:14.6,lon:121.02,type:'Potholes',timestamp:'2026-10-02 12:00:00',lane:'2',km:3.1,expressway:'NLEX',notes:'Guest evidence',photoId:'guest-photo',guest_claim_required:true,preapproval_review_required:true});
 const storage={getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 let rows=[],c={mode:'approved',cloudVerified:true,canUseLocal:true,userId:user,workspaceUserId:user,profile:{id:user,role:'inspector',approved:true,team:'roadway'},scopeGeneration:1,sessionGeneration:1},key='account',wakeCount=0,verify=async()=>{},fail=false,tail=Promise.resolve();
 storage.setItem('guest',JSON.stringify([source]));storage.setItem('account','[]');photos.set('guest-photo',new Blob(['stamped']));photos.set('guest-photo:raw',new Blob(['raw']));
 const opts={storage,guestKey:'guest',accountKey:()=>key,entries:()=>rows,context:()=>c,verify:()=>verify(),
 lock:fn=>{const task=tail.then(fn);tail=task.catch(()=>{});return task},
 copyPhoto:(from,to,guard)=>claims.copyLocalPhoto(async id=>photos.get(id)||null,async(id,blob)=>photos.set(id,blob),from,to,guard),
 verifyPhoto:(from,to,guard)=>claims.confirmLocalPhoto(async id=>photos.get(id)||null,from,to,guard),persist:(next,k)=>{if(fail)return false;return store.saveClaim(storage,k,rows,next)},publish:next=>{rows=next},wake:()=>wakeCount++};
 let controller=claims.createClaims(opts);
 return {source,storage,photos,opts,get rows(){return rows},set rows(v){rows=v},get c(){return c},set c(v){c=v},set key(v){key=v},set verify(v){verify=v},set fail(v){fail=v},get wakes(){return wakeCount},get controller(){return controller},restart(){rows=model.normalizeAll(JSON.parse(storage.getItem('account')),undefined,{restart:true});store.save(storage,'account',rows);controller=claims.createClaims(opts)},saveGuest(e=source){storage.setItem('guest',JSON.stringify([e]))}};
}
function open(f){return f.controller.open(f.source.id)}
test('sign-in and runner wake cannot claim; Guest remains durable and excluded',async()=>{
 const f=fixture(),before=f.storage.getItem('guest');f.controller.list();assert.equal(f.rows.length,0);assert.equal(f.storage.getItem(claims.LEDGER_KEY),null);
 assert.equal(queue.automaticEligibility(f.source,f.c,true).eligible,false);let writes=0;
 const runner=runnerModule.createRunner({api:{insertOne:async()=>writes++,reconcileOne:async()=>{}},entries:()=>[f.source],context:()=>f.c,durable:()=>true,persist:()=>true});await runner.wake();runner.stop();assert.equal(writes,0);assert.equal(f.storage.getItem('guest'),before);
});
test('explicit claim creates durable new UUID/current account copy, retaining original bytes and photos',async()=>{
 const f=fixture(),before=f.storage.getItem('guest'),result=await f.controller.claim(open(f)),e=result.entry;
 assert.equal(f.rows.length,1);assert.notEqual(e.id,f.source.id);assert.equal(e.user_id,user);assert.equal(e.team,'roadway');
 for(const field of ['type','timestamp','lat','lon','km','notes','created_at'])assert.equal(e[field],f.source[field]);
 assert.equal(e.guest_claim_required,false);assert.equal(e.preapproval_review_required,false);assert.equal(e.guest_claim_source_id,f.source.id);assert.equal(e.guest_claim_source_record,JSON.stringify(f.source));
 assert.equal(queue.automaticEligibility(e,f.c,store.contains(f.storage,'account',e)).eligible,true);assert.equal(f.wakes,1);
 assert.equal(f.storage.getItem('guest'),before);assert.equal(JSON.parse(before)[0].id,f.source.id);assert.notEqual(e.photoId,f.source.photoId);
 assert.equal(await f.photos.get(e.photoId).text(),'stamped');assert.equal(await f.photos.get(e.photoId+':raw').text(),'raw');assert.equal(await f.photos.get(f.source.photoId).text(),'stamped');
});
test('repeated clicks, reload and restart recover a single claimed UUID',async()=>{
 const f=fixture(),a=open(f),b=open(f);await Promise.all([f.controller.claim(a),f.controller.claim(b)]);const id=f.rows[0].id;
 f.restart();const result=await f.controller.claim(open(f));assert.equal(result.status,'already-claimed');assert.equal(f.rows.length,1);assert.equal(f.rows[0].id,id);assert.equal(f.wakes,1);
});
test('held copy is not eligible before origin completion; interruption recovers existing copy',async()=>{
 const f=fixture(),publish=f.opts.publish;let interrupted=true;
 f.opts.publish=rows=>{publish(rows);if(interrupted){interrupted=false;assert.equal(queue.automaticEligibility(rows[0],f.c,true).eligible,false);throw Error('interrupted after durable copy')}};
 await assert.rejects(f.controller.claim(open(f)));const id=JSON.parse(f.storage.getItem('account'))[0].id;assert.equal(f.wakes,0);f.restart();await f.controller.claim(open(f));assert.equal(f.rows.length,1);assert.equal(f.rows[0].id,id);assert.equal(f.rows[0].guest_claim_required,false);
});
test('interruption after durable release before UI confirmation does not duplicate',async()=>{
 const f=fixture(),wake=f.opts.wake;f.opts.wake=()=>{throw Error('UI response interrupted')};await assert.rejects(f.controller.claim(open(f)));const id=f.rows[0].id;f.opts.wake=wake;f.restart();await f.controller.claim(open(f));assert.equal(f.rows.length,1);assert.equal(f.rows[0].id,id);
});
test('changed Guest original after completed claim is held without overwriting or duplicating',async()=>{
 const f=fixture();await f.controller.claim(open(f));const account=f.storage.getItem('account');f.source.notes='Edited later';f.saveGuest();assert.equal(f.controller.list()[0].status,'source-changed');assert.throws(()=>open(f));assert.equal(f.storage.getItem('account'),account);assert.equal(f.rows.length,1);
});
test('deleted previously claimed copy is not claimed again',async()=>{const f=fixture();await f.controller.claim(open(f));f.rows=[];store.save(f.storage,'account',[]);assert.equal(f.controller.list()[0].status,'copy-missing');assert.throws(()=>open(f));assert.equal(f.rows.length,0);});
for(const [label,change] of [
 ['account switch',f=>f.c.userId=other],['workspace change',f=>f.key='different'],['binding change',f=>f.c.workspaceUserId=other],['team change',f=>f.c.profile.team='other'],['sign out',f=>f.c.mode='signed-out'],['stale verification',f=>f.c.cloudVerified=false],['session change',f=>f.c.sessionGeneration++],['lost approval',f=>f.c.profile.approved=false],['cancel',(_f,t)=>t.cancelled=true],['source edit',f=>{f.source.notes='changed';f.saveGuest()}]
])test(`${label} during verification blocks all durable copy mutations`,async()=>{
 const f=fixture(),t=open(f);f.verify=async()=>change(f,t);await assert.rejects(f.controller.claim(t));assert.equal(f.rows.length,0);assert.equal(f.storage.getItem('account'),'[]');assert.equal(f.storage.getItem(claims.LEDGER_KEY),null);assert.equal(f.wakes,0);
});
test('sign-out during photo copy leaves no account copy and no cloud wake',async()=>{const f=fixture(),copy=f.opts.copyPhoto;f.opts.copyPhoto=async(...args)=>{await copy(...args);f.c.mode='signed-out'};await assert.rejects(f.controller.claim(open(f)));assert.equal(f.rows.length,0);assert.equal(f.storage.getItem('guest'),JSON.stringify([f.source]));assert.equal(f.wakes,0);});
for(const mode of ['guest','pending','signed-out','offline-recent'])test(`${mode} cannot open claim`,()=>{const f=fixture();f.c.mode=mode;assert.throws(()=>open(f));assert.deepEqual(f.controller.list(),[]);});
for(const role of ['administrator','inspector','supervisor'])test(`claim role ${role}`,async()=>{const f=fixture();f.c.profile.role=role;if(role==='administrator'){assert.throws(()=>open(f));return}await f.controller.claim(open(f));assert.equal(f.rows.length,1);});
test('failed copy persistence preserves Guest original and photo; explicit retry reuses reserved UUID',async()=>{
 const f=fixture(),before=f.storage.getItem('guest');f.fail=true;await assert.rejects(f.controller.claim(open(f)),/could not be saved/);assert.equal(f.rows.length,0);assert.equal(f.wakes,0);assert.equal(f.storage.getItem('guest'),before);assert.equal(await f.photos.get('guest-photo').text(),'stamped');
 const id=JSON.parse(f.storage.getItem(claims.LEDGER_KEY)).claims[0].copyId;f.fail=false;await f.controller.claim(open(f));assert.equal(f.rows[0].id,id);
});
test('release failure leaves held copy durable; explicit recovery uses same copy',async()=>{
 const f=fixture(),persist=f.opts.persist;f.opts.persist=(rows,key)=>rows[0]?.guest_claim_pending===false?false:persist(rows,key);
 await assert.rejects(f.controller.claim(open(f)));const id=f.rows[0].id;assert.equal(f.rows[0].guest_claim_required,true);assert.equal(f.wakes,0);f.opts.persist=persist;f.restart();await f.controller.claim(open(f));assert.equal(f.rows[0].id,id);assert.equal(f.rows.length,1);
});
test('missing or failing photo copy cannot make a record eligible',async()=>{const f=fixture();f.photos.delete('guest-photo');await assert.rejects(f.controller.claim(open(f)),/photo is unavailable/);assert.equal(f.rows.length,0);assert.equal(f.wakes,0);});
test('separate photo IDs preserve either record after removing the other photo',async()=>{const f=fixture();await f.controller.claim(open(f));const copy=f.rows[0];f.photos.delete(copy.photoId);f.photos.delete(copy.photoId+':raw');assert.equal(await f.photos.get('guest-photo').text(),'stamped');});
test('no-photo Guest claim works without touching local photo storage',async()=>{const f=fixture();f.source.photoId='';f.saveGuest();f.opts.copyPhoto=()=>assert.fail('no photo expected');await f.controller.claim(open(f));assert.equal(f.rows[0].photoId,'');});
test('local_only and other holds are never claim sources',()=>{for(const over of [{sync_status:'local_only'},{submission_snapshot:{}},{importBatchId:'import'},{remote_id:'cloud'},{submission_review_required:true}]){const f=fixture();Object.assign(f.source,over);f.saveGuest();assert.throws(()=>open(f));assert.equal(f.rows.length,0);}});
test('unsafe missing lock refuses claim without writes',async()=>{const f=fixture();f.opts.lock=null;await assert.rejects(f.controller.claim(open(f)),/locking/);assert.equal(f.storage.getItem(claims.LEDGER_KEY),null);});
test('runner and real API use normal snapshots/acknowledgement; synced claim cannot duplicate',async()=>{
 const f=fixture();let writes=[];const persist=()=>{store.save(f.storage,'account',f.rows);return true};
 const api=apiModule.createApi({client:{auth:{getUser:async()=>({data:{user:{id:user}},error:null})},from:table=>{assert.equal(table,'inspections');return {insert:row=>{writes.push(row);return {select:()=>({single:async()=>({data:row,error:null})})}}}}},verify:async()=>{},context:()=>f.c,durable:e=>store.contains(f.storage,'account',e),persist,isCurrent:e=>f.rows.includes(e)});
 const runner=runnerModule.createRunner({api,entries:()=>f.rows,context:()=>f.c,durable:e=>store.contains(f.storage,'account',e),persist});
 await runner.wake();assert.equal(writes.length,0);await f.controller.claim(open(f));assert.equal(writes.length,0);await runner.wake();assert.equal(writes.length,1);assert.equal(writes[0].photo_filename,null);assert.equal(writes[0].photo_path,null);assert.equal(f.rows[0].sync_status,'synced');assert.deepEqual(f.rows[0].submission_snapshot.row,writes[0]);const id=f.rows[0].id;f.restart();await f.controller.claim(open(f));await runner.wake();runner.stop();assert.equal(writes.length,1);assert.equal(f.rows.length,1);assert.equal(f.rows[0].id,id);assert.equal(f.storage.getItem('guest'),JSON.stringify([f.source]));
});
test('production UI is explicit and caches local module; no new cloud transport',()=>{
 const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8'),source=fs.readFileSync('guest-claim.js','utf8');
 assert.match(html,/Claim to my workspace/);assert.match(html,/Keep as Guest \/ Cancel/);assert.match(html,/Already claimed/);assert.match(html,/syncRunner\?\.wake\('guest-claimed'\)/);assert.match(html,/navigator.locks.request\('kmtrack-guest-claim-v1'/);
 assert.doesNotMatch(source,/\.from\(|\.insert\(|\.storage\(|deletePhoto/);assert.match(sw,/guest-claim.js/);assert.match(sw,/v235/);
 assert.ok(html.indexOf('src="./preapproval-review.js"')<html.indexOf('src="./guest-claim.js"'));
});
test('first claim can initialize a newly bound empty account workspace',async()=>{const f=fixture();f.storage.removeItem('account');await f.controller.claim(open(f));assert.equal(f.rows.length,1);assert.equal(store.contains(f.storage,'account',f.rows[0]),true);});
test('claim storage readback failure restores previous destination; Guest remains untouched',async()=>{
 const f=fixture(),before=f.storage.getItem('guest'),original=f.storage.getItem('account');let intercept=false;
 const storage={getItem:k=>k==='account'&&intercept?(intercept=false,'wrong'):f.storage.getItem(k),setItem:(k,v)=>{f.storage.setItem(k,v);if(k==='account')intercept=true},removeItem:k=>f.storage.removeItem(k)};
 f.opts.persist=(rows,key)=>{try{return store.saveClaim(storage,key,f.rows,rows)}catch(_){return false}};
 await assert.rejects(f.controller.claim(open(f)));assert.equal(f.storage.getItem('account'),original);assert.equal(f.storage.getItem('guest'),before);assert.equal(f.wakes,0);
});
test('missing empty destination is restored after failed write confirmation',()=>{
 const data=new Map();let bad=false;const storage={getItem:k=>bad?'bad':data.get(k)??null,setItem:(k,v)=>{data.set(k,v);bad=true},removeItem:k=>data.delete(k)};
 assert.throws(()=>store.saveClaim(storage,'account',[],[{id:'new'}]));assert.equal(data.has('account'),false);
});
test('ledger completion failure holds existing copy until explicit recovery',async()=>{
 const f=fixture(),set=f.storage.setItem;let fail=true;
 f.storage.setItem=(k,v)=>{if(fail&&k===claims.LEDGER_KEY&&JSON.parse(v).claims[0].status==='complete')throw Error('ledger write failed');set(k,v)};
 await assert.rejects(f.controller.claim(open(f)));const id=f.rows[0].id;assert.equal(f.rows[0].guest_claim_required,true);assert.equal(f.wakes,0);fail=false;f.restart();await f.controller.claim(open(f));assert.equal(f.rows.length,1);assert.equal(f.rows[0].id,id);
});
test('ledger reservation failure cannot create a destination or touch Guest',async()=>{const f=fixture(),before=f.storage.getItem('guest'),set=f.storage.setItem;f.storage.setItem=(k,v)=>{if(k===claims.LEDGER_KEY)throw Error('quota');set(k,v)};await assert.rejects(f.controller.claim(open(f)));assert.equal(f.rows.length,0);assert.equal(f.storage.getItem('guest'),before);assert.equal(f.wakes,0);});
test('account change after durable held creation stops completion/release',async()=>{const f=fixture(),publish=f.opts.publish;f.opts.publish=rows=>{publish(rows);f.c.mode='signed-out'};await assert.rejects(f.controller.claim(open(f)));assert.equal(f.rows[0].guest_claim_required,true);assert.equal(f.wakes,0);assert.equal(JSON.parse(f.storage.getItem(claims.LEDGER_KEY)).claims[0].status,'reserved');});
test('account switch cannot recover another account reserved claim',async()=>{const f=fixture();f.fail=true;await assert.rejects(f.controller.claim(open(f)));f.fail=false;f.c={...f.c,userId:other,workspaceUserId:other,profile:{...f.c.profile,id:other}};assert.equal(f.controller.list()[0].status,'other-account');assert.throws(()=>open(f));assert.equal(f.rows.length,0);});
test('source deletion and external account edits block claim',async()=>{for(const mutate of [f=>f.storage.setItem('guest','[]'),f=>f.storage.setItem('account','[{"id":"external"}]')]){const f=fixture(),t=open(f);f.verify=async()=>mutate(f);await assert.rejects(f.controller.claim(t));assert.equal(f.rows.length,0);assert.equal(f.wakes,0);}});
test('malformed ledger or duplicate source cannot cause new copies',()=>{for(const bad of ['{}','not JSON',JSON.stringify({version:1,claims:[null]})]){const f=fixture();f.storage.setItem(claims.LEDGER_KEY,bad);assert.throws(()=>open(f));assert.equal(f.rows.length,0);}const f=fixture();f.storage.setItem('guest',JSON.stringify([f.source,f.source]));assert.throws(()=>open(f));});
test('copied photo corruption or concurrent source-photo edit blocks durability',async()=>{
 for(const target of ['copy','source']){const f=fixture();f.opts.copyPhoto=(from,to,guard)=>claims.copyLocalPhoto(async id=>f.photos.get(id)||null,async(id,blob)=>{f.photos.set(id,target==='copy'?new Blob(['corrupt']):blob);if(target==='source')f.photos.set(from,new Blob(['edited']))},from,to,guard);
 await assert.rejects(f.controller.claim(open(f)),/photo changed/);assert.equal(f.rows.length,0);assert.equal(f.wakes,0);}
});
test('photo IDs are independent when Guest photo is removed after claim',async()=>{const f=fixture();await f.controller.claim(open(f));f.photos.delete('guest-photo');f.photos.delete('guest-photo:raw');assert.equal(await f.photos.get(f.rows[0].photoId).text(),'stamped');assert.equal(await f.photos.get(f.rows[0].photoId+':raw').text(),'raw');});
test('UUID collision fails closed before reservation',async()=>{const f=fixture();f.opts.uuid=()=>f.source.id;await assert.rejects(f.controller.claim(open(f)),/unique claim UUID/);assert.equal(f.rows.length,0);assert.equal(f.storage.getItem(claims.LEDGER_KEY),null);});
function uiFixture(f){
 const vm=require('node:vm');
 class Element{
  constructor(tag){this.tag=tag;this.children=[];this.style={};this.handlers={};this.hidden=false;this.textContent='';}
  append(...children){this.children.push(...children)}
  replaceChildren(...children){this.children=children}
  setAttribute(){}
  addEventListener(name,fn){this.handlers[name]=fn}
  showModal(){this.open=true}
  close(){this.open=false;this.handlers.close?.()}
  remove(){this.removed=true}
  insertBefore(child,before){this.children.splice(this.children.indexOf(before),0,child)}
 }
 const elements=Object.fromEntries(['guest-claim-panel','guest-claim-list','guest-claim-status'].map(id=>[id,new Element('div')]));
 const body=new Element('body'),html=fs.readFileSync('index.html','utf8');
 const code=html.slice(html.indexOf('    function renderGuestClaims() {'),html.indexOf("    window.addEventListener('storage', event => {"));
 const context=vm.createContext({document:{getElementById:id=>elements[id],createElement:tag=>new Element(tag),body},authDisplayState:true,authWorkspaceUnlocked:true,SPOTITSync:queue,
 inspectionContext:()=>f.c,guestClaimController:()=>f.controller,activeGuestClaimDialog:null,renderLog:()=>{},getPhoto:async id=>f.photos.get(id)||null,URL:{createObjectURL:()=> 'blob:local-test',revokeObjectURL:()=>{}}});
 new vm.Script(code).runInContext(context);return {context,elements,body};
}
test('actual UI surfaces details, photo, explicit Claim/Cancel and already-claimed state without auto-claim',async()=>{
 const f=fixture(),ui=uiFixture(f);ui.context.renderGuestClaims();assert.equal(ui.elements['guest-claim-panel'].hidden,false);assert.equal(f.rows.length,0);
 ui.context.openGuestClaimReview(f.source.id);const dialog=ui.body.children[0];assert.equal(dialog.open,true);assert.match(dialog.children[1].textContent,/Guest evidence/);assert.match(dialog.children[1].textContent,/new account-owned copy/);
 const claim=dialog.children.find(e=>e.textContent==='Claim to my workspace');assert.ok(dialog.children.some(e=>e.textContent==='Keep as Guest / Cancel'));
 await claim.onclick();assert.equal(f.rows.length,1);assert.equal(dialog.removed,true);ui.context.renderGuestClaims();assert.match(ui.elements['guest-claim-list'].children[0].children[0].textContent,/Already claimed/);
});
test('actual Cancel handler during verification prevents late claim mutation',async()=>{
 const f=fixture(),ui=uiFixture(f);let release,started;const gate=new Promise(r=>release=r),ready=new Promise(r=>started=r);f.verify=async()=>{started();await gate};
 ui.context.openGuestClaimReview(f.source.id);const dialog=ui.body.children[0],claim=dialog.children.find(e=>e.textContent==='Claim to my workspace');const operation=claim.onclick();await ready;
 dialog.children.find(e=>e.textContent==='Keep as Guest / Cancel').onclick();release();await operation;assert.equal(f.rows.length,0);assert.equal(f.wakes,0);assert.equal(f.storage.getItem(claims.LEDGER_KEY),null);
});
test('corrupted photo link is held instead of overwriting another local photo',async()=>{const f=fixture();f.fail=true;await assert.rejects(f.controller.claim(open(f)));const ledger=JSON.parse(f.storage.getItem(claims.LEDGER_KEY));ledger.claims[0].photoId='guest-photo';f.storage.setItem(claims.LEDGER_KEY,JSON.stringify(ledger));assert.throws(()=>open(f),/claim history/);assert.equal(await f.photos.get('guest-photo').text(),'stamped');});
test('edited incomplete copy is held instead of releasing unreviewed content',async()=>{const f=fixture(),persist=f.opts.persist;f.opts.persist=(rows,key)=>rows[0]?.guest_claim_pending===false?false:persist(rows,key);await assert.rejects(f.controller.claim(open(f)));f.opts.persist=persist;f.rows[0].notes='edited account copy';store.save(f.storage,'account',f.rows);await assert.rejects(f.controller.claim(open(f)),/copy was edited/);assert.equal(f.rows[0].guest_claim_required,true);assert.equal(f.wakes,0);});
test('missing incomplete-copy photo is held instead of releasing lost evidence',async()=>{const f=fixture(),persist=f.opts.persist;f.opts.persist=(rows,key)=>rows[0]?.guest_claim_pending===false?false:persist(rows,key);await assert.rejects(f.controller.claim(open(f)));f.opts.persist=persist;f.photos.delete(f.rows[0].photoId);await assert.rejects(f.controller.claim(open(f)),/photo is unavailable/);assert.equal(f.rows[0].guest_claim_required,true);assert.equal(f.wakes,0);});
