import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWorker,jpegDimensions} from '../workers/photo-api/worker.mjs';
const bytes=new Uint8Array(await readFile(new URL('./fixtures/r2-test.jpg',import.meta.url)));
const digest=async b=>Buffer.from(await crypto.subtle.digest('SHA-256',b)).toString('hex');
const hash=await digest(bytes),owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',upload='11111111-1111-4111-8111-111111111111';
test('pilot console is test-only, nonce protected, and contains no server credential',async()=>{
 const w=createWorker(()=>{throw Error('Page rendering must not contact Supabase');});
 const req=()=>new Request('https://spotit-photo-api-test.mmatriano19.workers.dev/pilot');
 assert.equal((await w.fetch(req(),{})).status,404);
 const response=await w.fetch(req(),{PHOTO_ENVIRONMENT:'test',SUPABASE_SERVICE_ROLE_KEY:'never-render-this-server-key'});
 assert.equal(response.status,200);const html=await response.text();
 assert.match(response.headers.get('content-security-policy'),/script-src 'nonce-/);
 assert.match(response.headers.get('cache-control'),/no-store/);assert.doesNotMatch(html,/never-render-this-server-key|__NONCE__/);
 assert.match(html,/Synthetic evidence/);assert.doesNotMatch(html,/localStorage|sessionStorage/);
});
test('test-console origin is narrowly allowed only in the test environment',async()=>{
 const w=createWorker(()=>{throw Error('Preflight must not contact Supabase');});
 const req=()=>new Request('https://spotit-photo-api-test.mmatriano19.workers.dev/v1/inspections/'+id+'/uploads',{
  method:'OPTIONS',headers:{Origin:'https://spotit-photo-api-test.mmatriano19.workers.dev','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
 assert.equal((await w.fetch(req(),{PHOTO_ENVIRONMENT:'test'})).status,204);
 assert.equal((await w.fetch(req(),{PHOTO_ENVIRONMENT:'production'})).status,403);
});
test('scheduled cleanup uses private RPCs, deletes only test keys, and acknowledges the lease',async()=>{
 const key='v1/'+id+'/'+upload+'/evidence.jpg',deleted=[],operations=[],waiting=[];
 const w=createWorker(async(url,options)=>{
  assert.ok(url.endsWith('/rpc/r2_photo_cleanup'));assert.equal(options.redirect,'manual');
  const body=JSON.parse(options.body);operations.push(body);
  if(body.operation==='claim')return Response.json([{bucket_name:'spotit-inspection-photos-test',object_key:key,lease_id:upload}]);
  return Response.json(true);
 });
 const env={PHOTO_TRANSPORT_ENABLED:'true',PHOTO_ENVIRONMENT:'test',SUPABASE_SERVICE_ROLE_KEY:'test-server-secret',PHOTOS_BUCKET:{delete:async k=>deleted.push(k)}};
 await w.scheduled({},env,{waitUntil:p=>waiting.push(p)});await Promise.all(waiting);
 assert.deepEqual(deleted,[key]);assert.equal(operations[1].operation,'ack');assert.equal(operations[1].args.ok,true);
 assert.equal(operations[1].args.lease_id,upload);
 operations.length=0;await w.scheduled({},{...env,PHOTO_TRANSPORT_ENABLED:'false'},{waitUntil(){throw Error('Disabled cleanup ran');}});assert.equal(operations.length,0);
});
function fixture(deployment='test'){
 let approved=true,deleted=false,current=null,intent=null;const objects=new Map(),calls=[],writes=[];
 const env={PHOTO_TRANSPORT_ENABLED:'true',PHOTO_ENVIRONMENT:deployment,SUPABASE_SERVICE_ROLE_KEY:'server-only-test-key',PHOTOS_BUCKET:{
   async put(key,b,options){writes.push(key);assert.equal(options.onlyIf.etagDoesNotMatch,'*');if(objects.has(key))return null;objects.set(key,new Uint8Array(b));return {};},
   async get(key){const b=objects.get(key);return b?{size:b.length,body:new Blob([b]).stream()}:null;},async delete(key){objects.delete(key);}
 }};
 const worker=createWorker(async(url,options)=>{
  calls.push(url);
  if(url.includes('/auth/v1/user'))return Response.json({id:owner,role:'authenticated'});
  if(url.includes('/profiles?'))return Response.json([{id:owner,role:'inspector',approved,team:'roadway'}]);
  if(url.includes('/inspections?'))return Response.json(deleted?[]:[{id,user_id:owner,team:'roadway'}]);
  assert.equal(options.headers.apikey,'server-only-test-key');const {operation,args,actor}=JSON.parse(options.body);
  assert.equal(actor,owner);assert.equal(args.environment,deployment);assert.equal(args.bucket_name,deployment==='test'?'spotit-inspection-photos-test':'spotit-inspection-photos');
  if(deleted)return Response.json({code:'42501'},{status:403});
  if(operation==='current')return Response.json(current?intent:null);
  if(operation==='reserve')intent=intent||{...args,id:args.upload_id,object_key:'v1/'+id+'/'+upload+'/evidence.jpg',state:'reserved'};
  if(!intent)return Response.json({code:'42501'},{status:403});
  if(operation==='finalize'){intent.state='ready';intent.finalized_at=new Date().toISOString();current=upload;}
  return Response.json(intent);
 },deployment);
 const manifest={upload_id:upload,sha256:hash,byte_size:bytes.length,width:12,height:8,thumb_sha256:hash,thumb_byte_size:bytes.length,thumb_width:12,thumb_height:8,expected_current_id:null};
 const request=(suffix,method='GET',body,extra={})=>worker.fetch(new Request('https://worker.invalid/v1/inspections/'+id+'/'+suffix,{method,headers:{Origin:'https://kmtrack.pages.dev',Authorization:'Bearer aa.bb.cc',...(body?{'Content-Type':body instanceof Uint8Array?'image/jpeg':'application/json'}:{}),...extra},body:body instanceof Uint8Array?body:body?JSON.stringify(body):undefined}),env);
 return {request,manifest,objects,writes,calls,env,worker,revoke:()=>{approved=false;},deleteInspection:()=>{deleted=true;}};
}
test('valid JPEG parser reads actual encoded image and rejects truncation, bad markers and dimensions',()=>{
 assert.deepEqual(jpegDimensions(bytes),{width:12,height:8});
 for(const bad of [bytes.slice(0,-1),new Uint8Array([1,2,3]),new Uint8Array(bytes.length)])assert.throws(()=>jpegDimensions(bad));
});
test('complete private immutable upload, two-object finalization, retry and private view',async()=>{
 const f=fixture();assert.equal((await f.request('uploads','POST',f.manifest)).status,200);
 assert.equal((await f.request('uploads/'+upload+'/finalize','POST')).status,409);
 for(const variant of ['evidence','thumbnail']){
  assert.equal((await f.request('uploads/'+upload+'/'+variant,'PUT',bytes)).status,200);
  assert.equal((await f.request('uploads/'+upload+'/'+variant,'PUT',bytes)).status,200);
 }
 assert.equal(f.objects.size,2);
 assert.equal((await f.request('uploads/'+upload+'/finalize','POST')).status,200);
 assert.equal((await f.request('uploads/'+upload+'/finalize','POST')).status,200);
 const r=await f.request('current');assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/jpeg');
 assert.match(r.headers.get('cache-control'),/no-store/);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);
 assert.equal((await f.request('current-thumbnail')).status,200);
 assert.equal((await f.request('uploads/'+upload+'/evidence','PUT',bytes)).status,409);
});
test('oversize, wrong MIME, digest and dimension mismatches cannot write an object',async()=>{
 const f=fixture();await f.request('uploads','POST',f.manifest);
 assert.equal((await f.request('uploads/'+upload+'/evidence','PUT',bytes,{'Content-Type':'text/plain'})).status,415);
 assert.equal((await f.request('uploads/'+upload+'/evidence','PUT',new Uint8Array(bytes.length+1))).status,413);
 const changed=bytes.slice();changed[10]^=1;
 assert.equal((await f.request('uploads/'+upload+'/evidence','PUT',changed)).status,409);
 assert.equal(f.writes.length,0);
 const other=fixture();await other.request('uploads','POST',{...other.manifest,width:13});
 assert.equal((await other.request('uploads/'+upload+'/evidence','PUT',bytes)).status,409);
});
test('conflicting existing immutable object is never overwritten or finalized',async()=>{
 const f=fixture();await f.request('uploads','POST',f.manifest);
 f.objects.set('v1/'+id+'/'+upload+'/evidence.jpg',new Uint8Array([1]));
 assert.equal((await f.request('uploads/'+upload+'/evidence','PUT',bytes)).status,409);
 assert.equal(f.objects.values().next().value.length,1);
});
test('approval revocation and inspection deletion stop subsequent writes',async()=>{
 for(const action of ['revoke','deleteInspection']){const f=fixture();await f.request('uploads','POST',f.manifest);f[action]();
  assert.ok([403,404].includes((await f.request('uploads/'+upload+'/evidence','PUT',bytes)).status));assert.equal(f.writes.length,0);}
});
test('no public cleanup route or direct object-key route exists',async()=>{
 const f=fixture();for(const suffix of ['cleanup','v1/'+id+'/'+upload+'/evidence.jpg'])assert.equal((await f.request(suffix)).status,404);
});
test('server flag, binding, secret and environment fail closed',async()=>{
 for(const patch of [{PHOTO_TRANSPORT_ENABLED:'false'},{PHOTO_ENVIRONMENT:'production'},{SUPABASE_SERVICE_ROLE_KEY:''},{PHOTOS_BUCKET:null}]){
  const f=fixture();Object.assign(f.env,patch);assert.equal((await f.request('uploads','POST',f.manifest)).status,503);assert.equal(f.writes.length,0);}
});
test('untrusted bucket/key fields and huge intent bodies are rejected before reservation',async()=>{
 const f=fixture();assert.equal((await f.request('uploads','POST',{...f.manifest,bucket_name:'public'})).status,400);
 assert.equal((await f.request('uploads','POST',{...f.manifest,padding:'x'.repeat(5000)})).status,413);
 assert.equal(f.calls.filter(x=>x.includes('/rpc/')).length,0);
});

test('phone pilot preflight permits only the exact test hostname',async()=>{const w=createWorker(()=>{throw Error('Preflight contacted backend');});for(const origin of ['https://spotit-photo-pilot.pages.dev','https://evil.spotit-photo-pilot.pages.dev','https://spotit-demo.pages.dev','http://localhost:8123']){const r=await w.fetch(new Request('https://spotit-photo-api-test.mmatriano19.workers.dev/v1/inspections/'+id+'/uploads',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST'}}),{PHOTO_ENVIRONMENT:'test'});assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin==='https://spotit-photo-pilot.pages.dev'?origin:null);}});

test('production entry rejects pilot origins and never serves test console',async()=>{const w=createWorker(()=>{throw Error('No backend reads expected');},'production');for(const origin of ['https://spotit-photo-pilot.pages.dev','https://spotit-photo-api-test.mmatriano19.workers.dev','https://spotit-demo.pages.dev']){const r=await w.fetch(new Request('https://spotit-photo-api.example/v1/inspections/'+id+'/uploads',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST'}}),{PHOTO_ENVIRONMENT:'test'});assert.equal(r.status,403);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);}assert.equal((await w.fetch(new Request('https://spotit-photo-api.example/pilot'),{PHOTO_ENVIRONMENT:'test'})).status,404);const r=await w.fetch(new Request('https://spotit-photo-api.example/health'),{PHOTO_ENVIRONMENT:'production',PHOTO_TRANSPORT_ENABLED:'true'});assert.equal((await r.json()).stage,'production-photo-api');});

test('production scheduled cleanup claims only the production bucket',async()=>{const calls=[],deleted=[],wait=[];const w=createWorker(async(url,options)=>{const b=JSON.parse(options.body);calls.push(b);return Response.json(b.operation==='claim'?[{bucket_name:'spotit-inspection-photos-test',object_key:'v1/'+id+'/'+upload+'/evidence.jpg',lease_id:upload}]:true);},'production');await w.scheduled({},{PHOTO_ENVIRONMENT:'production',PHOTO_TRANSPORT_ENABLED:'true',PHOTOS_BUCKET:{delete:async k=>deleted.push(k)},SUPABASE_SERVICE_ROLE_KEY:'synthetic'}, {waitUntil:p=>wait.push(p)});await Promise.all(wait);assert.equal(calls[0].args.bucket_name,'spotit-inspection-photos');assert.deepEqual(deleted,[]);});

test('production upload and private read use the production metadata bucket only',async()=>{
 const f=fixture('production');assert.equal((await f.request('uploads','POST',f.manifest)).status,200);
 for(const v of ['evidence','thumbnail'])assert.equal((await f.request('uploads/'+upload+'/'+v,'PUT',bytes)).status,200);
 assert.equal((await f.request('uploads/'+upload+'/finalize','POST')).status,200);
 assert.equal((await f.request('current')).status,200);
 f.env.PHOTO_ENVIRONMENT='test';assert.equal((await f.request('current')).status,503);
});
