const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const foreground=require('./foreground-sync'),store=require('./local-entry-store');
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function source(name){const html=fs.readFileSync('index.html','utf8'),start=html.indexOf(`function ${name}(`);assert.ok(start>=0);return (html.slice(start-6,start).endsWith('async ') ? 'async ' : '')+html.slice(start,html.indexOf('\n    }',start)+6);}
function app(){
 const timers=[],cloud=deferred(),photo=deferred(),data=new Map();let wakes=0,renders=0,photoCalls=0;
 const scheduler=foreground.createScheduler({wake:()=>{wakes++;return cloud.promise;},render:()=>renders++,setTimer:(fn,delay)=>{timers.push({fn,delay});return timers.length;}});
 const box=vm.createContext({entries:[],storageAvailable:true,authWorkspaceUnlocked:true,SPOTITLocalStore:store,SPOTITPhotoUpload:{sourceChanged(){}},localStorage:{setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k)||null},activeEntriesStorageKey:()=> 'account',syncRunner:{},foregroundSync:scheduler,document:{getElementById:()=>({hidden:true})},console:{error(){}},prepareLocalPhoto(){photoCalls++;return photo.promise;}});
 vm.runInContext(source('saveEntries'),box);return {box,data,timers,scheduler,cloud,photo,get wakes(){return wakes},get renders(){return renders},get photoCalls(){return photoCalls}};
}
test('actual durable Save and second Save finish while cloud and photo work remain unresolved',async()=>{
 const a=app();const preparing=a.box.prepareLocalPhoto();a.box.entries.push({id:'one'});assert.equal(a.box.saveEntries(),true);assert.equal(a.wakes,0);assert.equal(a.photoCalls,1);assert.equal(JSON.parse(a.data.get('account')).length,1);
 a.timers.shift().fn();await Promise.resolve();assert.equal(a.wakes,1);
 a.box.entries.push({id:'two'});assert.equal(a.box.saveEntries(),true);assert.equal(JSON.parse(a.data.get('account')).length,2);assert.equal(a.photoCalls,1);
 a.cloud.resolve();a.photo.resolve();await preparing;
});
test('failed local persistence never schedules foreground cloud work',()=>{
 const a=app();a.box.localStorage.setItem=()=>{throw Error('quota')};assert.equal(a.box.saveEntries(),false);assert.equal(a.timers.length,0);
});
test('sync-internal durable saves do not wake the runner again',()=>{
 const a=app();a.box.entries.push({id:'one'});assert.equal(a.box.saveEntries(false),true);assert.equal(a.timers.length,0);
});
test('save storms and status storms coalesce independently; slow network never holds render/navigation task',async()=>{
 const a=app();for(let i=0;i<100;i++){a.scheduler.saved();a.scheduler.changed();}assert.equal(a.timers.length,2);
 const wake=a.timers.find(t=>t.delay===0),render=a.timers.find(t=>t.delay===100);wake.fn();await Promise.resolve();assert.equal(a.wakes,1);
 let navigated=false;await Promise.resolve().then(()=>{navigated=true});render.fn();assert.equal(navigated,true);assert.equal(a.renders,1);
 a.scheduler.changed();assert.equal(a.timers.length,3);a.cloud.resolve();
});
test('fresh queue snapshot preserves exact equality, fails closed, and is renewed after storage changes',()=>{
 let reads=0,text=JSON.stringify([{id:'one',sync_status:'pending'},{id:'one',sync_status:'synced'}]);const storage={getItem:()=>{reads++;return text}};
 const check=store.snapshotContains(storage,'x');assert.equal(check({id:'one',sync_status:'pending'}),true);assert.equal(check({id:'one',sync_status:'synced'}),true);assert.equal(check({id:'one',sync_status:'failed'}),false);assert.equal(reads,1);
 text='[]';assert.equal(store.snapshotContains(storage,'x')({id:'one',sync_status:'pending'}),false);
 text='{bad';assert.equal(store.snapshotContains(storage,'x')({id:'one'}),false);assert.equal(store.snapshotContains({getItem(){throw Error('unavailable')}},'x')({id:'one'}),false);
});
test('actual camera Save waits for local photo durability only, not slow photo preparation or cloud',async()=>{
 const a=app(),local=deferred();let puts=0,closed=0,nav=0;
 Object.assign(a.box,{pendingCaptureBlob:new Blob(['stamped']),pendingCaptureRawBlob:new Blob(['raw']),cameraDraftEntry:{type:'Potholes'},cameraEditTargetIndex:null,pendingCaptureFilename:'test.jpg',pendingCaptureStamp:new Date(),newId:()=> 'photo',putPhoto:async()=>{puts++;await local.promise},SPOTITEntry:{createEntry:e=>({id:'inspection',...e})},captureNeedsPreapproval:()=>false,authDisplayState:{mode:'approved'},fullTimestamp:()=> '2026-10-03 21:00:00',inspectorName:'Test',formatPhotoDate:()=> 'date',playConfirmSound(){},clearCaptureReview(){},closeCamera:()=>closed++,renderLog(){},cameraErrorEl:{classList:{add(){}}}});
 vm.runInContext(source('saveCapturedPhoto'),a.box);const saved=a.box.saveCapturedPhoto();await Promise.resolve();assert.equal(puts,1);assert.equal(a.data.size,0);
 await Promise.resolve().then(()=>nav++);assert.equal(nav,1);local.resolve();await saved;assert.equal(puts,2);assert.equal(closed,1);assert.equal(JSON.parse(a.data.get('account')).length,1);assert.equal(a.wakes,0);assert.equal(a.photoCalls,0);a.cloud.resolve();a.photo.resolve();
});
test('foreground integration is cached, keeps photo gate disabled and has no background sync',()=>{
 const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');assert.match(html,/PHOTO_CLOUD_TRANSPORT_ENABLED = false/);assert.match(html,/onChange: \(\) => foregroundSync.changed\(\)/);assert.match(sw,/\.\/foreground-sync.js/);assert.match(sw,/v240/);assert.doesNotMatch(fs.readFileSync('foreground-sync.js','utf8'),/SyncManager|serviceWorker|\.register\(/);
});
