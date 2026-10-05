const test=require('node:test'),assert=require('node:assert/strict');
const viewer=require('./cloud-photo-viewer'),photo=require('./photo-upload-state');
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function fixture(){
 const blob=new Blob(['evidence'],{type:'image/jpeg'}),hash=await photo.sha256(blob),filename=`photo-v1-${hash}.jpg`;
 const row={id,user_id:user,team:'roadway',photo_filename:filename,photo_path:`roadway/${id}/${filename}`};
 let c={mode:'approved',canUseLocal:true,cloudVerified:true,userId:user,workspaceUserId:user,verifiedAt:Date.now(),profile:{id:user,approved:true,role:'inspector',team:'roadway'},sessionGeneration:1,scopeGeneration:1};
 let local=null,response={data:blob},rowResponse={data:row},readHook=null;const calls=[],revoked=[];let minted=0;
 const item={cloud:row,local:null};
 const client={auth:{getUser:async()=>{calls.push('auth');return {data:{user:{id:user}}};}},from:()=>{
  calls.push('row');const q={select:()=>q,eq:()=>q,maybeSingle:async()=>readHook?readHook():rowResponse};return q;
 },storage:{from:()=>({download:async(path,options,parameters)=>{assert.equal(parameters.cache,'no-store');calls.push('download');return response;}})}};
 const v=viewer.createViewer({client,context:()=>c,key:()=> 'account',online:()=>c.mode!=='offline-recent',verify:async()=>calls.push('verify'),
  current:()=>true,read:async()=>local,urls:{createObjectURL:()=>{minted++;return 'blob:private';},revokeObjectURL:url=>revoked.push(url)}});
 return {v,item,blob,row,calls,revoked,setLocal:b=>{local=b;item.local={photoId:'local-photo',photo_sync_status:'photo_pending'};},setResponse:r=>response=r,setRow:r=>rowResponse=r,
 change:x=>c={...c,...x},hook:h=>readHook=h,minted:()=>minted};
}
test('authorized private viewer verifies association twice/hash and revokes URL on close',async()=>{
 const f=await fixture(),before=JSON.stringify(f.item);assert.equal((await f.v.open(f.item)).source,'private-cloud');assert.deepEqual(f.calls,['verify','auth','row','download','row']);assert.equal(JSON.stringify(f.item),before);f.v.close();assert.deepEqual(f.revoked,['blob:private']);
});
for(const result of [{error:{code:'AccessDenied'}},{error:{code:'NoSuchKey'}},{data:new Blob(['changed'],{type:'image/jpeg'})},{data:new Blob(['evidence'],{type:'text/plain'})}])test('denied/missing/hash/MIME mismatch unavailable without URL',async()=>{
 const f=await fixture();f.setResponse(result);await assert.rejects(f.v.open(f.item));assert.equal(f.minted(),0);
});
test('local photo is preferred without backend reads or state acknowledgement',async()=>{
 const f=await fixture();f.setLocal(f.blob);const before=JSON.stringify(f.item);assert.equal((await f.v.open(f.item)).source,'local');assert.deepEqual(f.calls,[]);assert.equal(JSON.stringify(f.item),before);
});
for(const change of [{photo_path:null},{photo_filename:'legacy.jpg'},{photo_path:'other/invalid/photo.jpg'}])test('unverifiable path unavailable before retrieval',async()=>{
 const f=await fixture();Object.assign(f.row,change);await assert.rejects(f.v.open(f.item));assert.deepEqual(f.calls,[]);
});
test('final changed row denies display',async()=>{
 const f=await fixture();let reads=0;f.hook(async()=>({data:++reads===1?f.row:{...f.row,photo_path:null}}));await assert.rejects(f.v.open(f.item));assert.equal(f.minted(),0);
});
for(const change of [{sessionGeneration:2},{userId:id},{profile:{id:user,approved:true,role:'inspector',team:'other'}},{mode:'offline-recent'},{mode:'signed-out',canUseLocal:false}])test('scope changes while association request pending prevent display',async()=>{
 const f=await fixture();let release;f.hook(()=>new Promise(r=>release=r));const pending=f.v.open(f.item);while(!release)await new Promise(r=>setImmediate(r));f.change(change);release({data:f.row});await assert.rejects(pending);assert.equal(f.minted(),0);
});
test('closing during download ignores late response',async()=>{
 const f=await fixture();let release;f.hook(()=>new Promise(r=>release=r));const pending=f.v.open(f.item);while(!release)await new Promise(r=>setImmediate(r));f.v.close();release({data:f.row});await assert.rejects(pending);assert.equal(f.minted(),0);
});
test('pinned SDK carries no-store to authenticated private download fetch',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');
 const box={URL,URLSearchParams,Blob,Headers,Request,Response,AbortController,WebSocket,console,setTimeout,clearTimeout,setInterval,clearInterval};
 vm.runInNewContext(fs.readFileSync('./vendor/supabase/supabase-js-2.117.1.umd.js','utf8'),box);
 const sdk=box.supabase;let request;
 const client=sdk.createClient('https://synthetic.example.invalid','synthetic-key',{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:async(url,init)=>{request={url:String(url),...init};return new Response(new Blob(['evidence'],{type:'image/jpeg'}),{status:200});}}
 });
 const result=await client.storage.from('inspection-photos').download('roadway/fixture/photo.jpg',{}, {cache:'no-store'});
 assert.equal(result.error,null);assert.equal(request.method,'GET');assert.equal(request.cache,'no-store');assert.match(request.url,/\/storage\/v1\/object\/inspection-photos\//);
});
