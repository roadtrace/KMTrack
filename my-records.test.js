const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const my=require('./my-records'),cloud=require('./cloud-records'),api=require('./inspection-api'),entry=require('./entry-model');
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id=n=>`bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12,'0')}`;
function fixture(recursive=false){
  let c={mode:'approved',cloudVerified:true,canUseLocal:true,userId:user,workspaceUserId:user,profile:{id:user,approved:true,role:'inspector',team:'roadway'},sessionGeneration:1,scopeGeneration:1},online=true,rows=[],fail=false,verifies=0,reads=0;
  const local=n=>entry.createEntry({id:id(n),type:'Potholes',timestamp:'2026-10-05 10:00:00',lat:14.6,lon:121,km:12.5,lane:'2',expressway:'NLEX',bound:'NB',user_id:user,team:'roadway'});
  const row=n=>({...api.submissionContent(local(n),c),updated_at:null,cloud_source:true});
  const client={auth:{getUser:async()=>({data:{user:{id:c.userId}}})},from:()=>{
    const q={select:()=>q,eq:()=>q,or:()=>q,order:()=>q,limit:()=>q,then:(ok,no)=>{reads++;return Promise.resolve(fail?{error:{code:'500'}}:{data:rows}).then(ok,no);}};return q;
  }};
  const options={client,context:()=>c,key:()=> 'account',online:()=>online,verify:async()=>{verifies++;if(recursive)controller?.verified();}};
  const store=cloud.createStore(options);let controller;
  controller=my.createController({...options,store,changed:()=>{}});
  return {store,controller,local,row,setRows:r=>rows=r,setFail:()=>fail=true,setContext:change=>c={...c,...change},offline:()=>online=false,online:()=>online=true,
    options:()=>({localEntries:[],page:store.snapshot('my'),context:c,workspaceKey:'account',online}),counts:()=>({reads,verifies})};
}
test('empty second device shows cloud history without modifying entries',async()=>{
 const f=fixture();f.setRows([f.row(1)]);const locals=[];await f.store.load('my');const result=my.project({...f.options(),localEntries:locals});assert.equal(result.records.length,1);assert.equal(result.records[0].source,'cloud');assert.equal(result.records[0].readOnly,true);assert.deepEqual(locals,[]);
});
for(const status of ['pending','local_only','needs_review','failed'])test(`${status} local remains device primary with one UUID card`,async()=>{
 const f=fixture(),local={...f.local(1),sync_status:status};f.setRows([f.row(1),f.row(0)]);await f.store.load('my');const result=my.project({...f.options(),localEntries:[local,f.local(2)]});assert.equal(result.records.length,3);const item=result.records.find(r=>r.id===local.id);assert.equal(item.local,local);assert.equal(item.primary,'local');assert.equal(item.readOnly,false);
});
test('clean combined retains local reference and divergent data is indicated',async()=>{
 const f=fixture(),local={...f.local(1),sync_status:'synced',remote_id:id(1)};local.submission_snapshot={version:1,row:api.submissionContent(local,f.options().context)};
 f.setRows([local.submission_snapshot.row]);await f.store.load('my');let item=my.project({...f.options(),localEntries:[local]}).records[0];assert.equal(item.source,'combined');assert.equal(my.status(item),'Inspection submitted');assert.equal(my.differs(item),false);
 local.type='Others';item=my.project({...f.options(),localEntries:[local]}).records[0];assert.equal(item.primary,'local');assert.equal(my.differs(item),true);
});
test('imported archive is excluded and cloud filters use Manila inspection date',async()=>{
 const f=fixture();f.setRows([{...f.row(1),inspected_at:'2026-10-04T18:00:00Z'}]);await f.store.load('my');const result=my.project({...f.options(),localEntries:[{...f.local(2),importBatchId:'archive'}]},{from:'2026-10-05',to:'2026-10-05',inspector:'unknown'});assert.equal(result.records.length,1);assert.equal(result.excluded.imported,1);assert.equal(my.project(f.options(),{type:'Others'}).records.length,0);
});
test('first page autoload is bounded despite recursive verification notifications',async()=>{
 const f=fixture(true);f.setRows([f.row(1)]);f.controller.verified();await new Promise(r=>setTimeout(r,15));f.controller.verified();assert.deepEqual(f.counts(),{reads:1,verifies:1});assert.equal(f.controller.snapshot().rows.length,1);
});
test('refresh failure preserves device records and prior authorized pages',async()=>{
 const f=fixture();f.setRows([f.row(1)]);await f.controller.load(true);f.setFail();await f.controller.load(true);const local=f.local(2);assert.equal(f.controller.records([local],{}).records.length,2);assert.equal(local.sync_status,'pending');assert.ok(f.controller.snapshot().error);
});
test('load more appends and retains five pages',async()=>{
 const f=fixture();for(let p=0;p<7;p++){f.setRows(Array.from({length:51},(_,i)=>f.row(1000-p*50-i)));await f.controller.load(p===0);}const page=f.controller.snapshot();assert.equal(page.pageCount,5);assert.equal(page.rows.length,250);assert.equal(page.evicted,true);
});
for(const change of [{mode:'signed-out',canUseLocal:false},{userId:id(9)},{profile:{id:user,approved:true,role:'inspector',team:'other'}},{sessionGeneration:2},{scopeGeneration:2}])test(`scope clears cloud ${JSON.stringify(change)}`,async()=>{
 const f=fixture();f.setRows([f.row(1)]);await f.controller.load(true);f.setContext(change);assert.equal(f.controller.snapshot().rows.length,0);
});
test('offline retains local usability and reconnect safely reloads',async()=>{
 const f=fixture();f.setRows([f.row(1)]);await f.controller.load(true);f.offline();f.controller.invalidate();assert.equal(f.controller.records([f.local(2)],{}).records.length,1);f.online();f.controller.verified();await new Promise(r=>setTimeout(r,15));assert.equal(f.controller.snapshot().rows.length,1);
});
test('Guest projection does not include account history',()=>{
 const f=fixture();f.setContext({mode:'guest',userId:'',workspaceUserId:''});assert.equal(my.project({...f.options(),localEntries:[f.local(1)]}).records.length,0);
});
// Exercise the production renderer, rather than a duplicate card implementation.
const html=fs.readFileSync('index.html','utf8');
function fn(name){const start=html.indexOf('    function '+name+'('),end=html.indexOf('\n    }',start)+6;assert.ok(start>=0);return html.slice(start,end);}
function render(items){
 const element=()=>({dataset:{},classList:{},children:[],appendChild(e){this.children.push(e);},append(e){this.children.push(e);},setAttribute(){},addEventListener(){},querySelectorAll(){return [];}});
 const controls=new Map(),control=id=>{if(!controls.has(id))controls.set(id,element());return controls.get(id);};const locals=items.filter(r=>r.local).map(r=>r.local);
 const c={entries:locals,visibleEntries:()=>locals,accessibleEntries:()=>locals,document:{getElementById:control,createElement:element},authWorkspaceUnlocked:true,
 SPOTITLocalStore:{snapshotContains:()=>()=>true},localStorage:{},activeEntriesStorageKey:()=> 'account',myLogEnabled:()=>true,myRecords:{records:()=>({records:items}),snapshot:()=>({scope:{},loaded:true})},SPOTITMyRecords:my,SPOTITLogRegister:require('./log-register'),
 SPOTITPhotoPilot:require('./photo-pilot'),SPOTITPhotoUpload:require('./photo-upload-state'),SPOTITPreapprovalReview:{reviewable:()=>false},authDisplayState:null,authController:null,
 PHOTO_CLOUD_TRANSPORT_ENABLED:false,photoCloudController:null,selectedEntryIds:new Set(),selectMode:false,logRegisterView:'log',CAPTURE_RECENT_LIMIT:10,
 typeClass:()=> 'potholes',formatKmStation:v=>String(v),getLogFilters:()=>({}),cloudAccess:()=>false,openSubmittedDetail(){},renderMyControls(){},
 renderGuestClaims(){},syncEntryFilterOptions(){},syncInspectorFilterOptions(){},syncSharingFilters(){},updateMapEntries(){},wireSwipeRows(){},updateSyncStatus(){}};
 c.activeRecordController=()=>c.myRecords;c.logRecordScope='my';c.renderTeamWorkspace=()=>{};
 vm.createContext(c);for(const name of ['xmlEscape','cloudCard','renderLog'])vm.runInContext(fn(name),c);c.renderLog();return {controls,c};
}
test('production Log renders cloud-only history and supplies no device mutation controls',async()=>{
 const f=fixture();f.setRows([f.row(1)]);await f.store.load('my');const items=my.project(f.options()).records,{controls}=render(items),cards=controls.get('log-list').children;
 assert.equal(cards.length,1);assert.match(cards[0].innerHTML,/Submitted record · Read only/);assert.equal(cards[0].dataset.idx,undefined);assert.doesNotMatch(cards[0].innerHTML,/swipe-action|photo-retry|cloud-submit|preapproval-review|checkbox|Save|Delete/);assert.equal(controls.get('export-btn').disabled,true);
});
test('production Log deduplicates combined record, retains pending action and divergence detail',async()=>{
 const f=fixture(),local=f.local(1);local.type='Others';f.setRows([f.row(1)]);await f.store.load('my');const items=my.project({...f.options(),localEntries:[local]}).records,{controls}=render(items),cards=controls.get('log-list').children;assert.equal(cards.length,1);assert.match(cards[0].children[0].innerHTML,/Waiting to submit|Device and submitted details differ/);assert.match(cards[0].innerHTML,/swipe-action delete/);
});
test('old cloud edit panel retired and exports still operate on local device arrays',()=>{
 assert.doesNotMatch(html,/id="cloud-inspections"|Save cloud edit|Edit cloud details/);assert.match(html,/Export device records/);
 const filters=require('./entry-filters'),f=fixture(),locals=[f.local(1)];assert.deepEqual(filters.exportScope(locals).entries,locals);
 assert.doesNotMatch(fn('accessibleEntries'),/myRecords|cloud/);
});
