import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../workers/photo-api/worker.mjs';
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function fixture({user={},profile={},row={},empty=false,fail=0}={}){
 const calls=[];
 const worker=createWorker(async(url,options)=>{
  calls.push([url,options]);assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer aa.bb.cc');assert.equal(options.redirect,'manual');assert.equal(options.cache,'no-store');
  if(fail)return Response.json({message:'private upstream detail'},{status:fail});
  return Response.json(url.includes('/auth/v1/user')?{id:uid,role:'authenticated',is_anonymous:false,...user}:url.includes('/profiles?')?[{id:uid,approved:true,role:'inspector',team:'roadway',...profile}]:empty?[]:[{id,user_id:uid,team:'roadway',...row}]);
 });
 const request=(path='/v1/inspections/'+id+'/permissions',headers={},method='GET')=>worker.fetch(new Request('https://worker.invalid'+path,{method,headers:{Origin:'https://kmtrack.pages.dev',Authorization:'Bearer aa.bb.cc',...headers}}));
 return {worker,request,calls};
}
test('owner access uses validated identity and live caller-RLS reads without bucket operations',async()=>{
 const f=fixture(),r=await f.request();assert.equal(r.status,200);assert.deepEqual(await r.json(),{can_view:true,can_attach:true,photo_transport_enabled:false});assert.equal(f.calls.length,3);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('access-control-allow-origin'),'https://kmtrack.pages.dev');
});
for(const role of ['inspector','supervisor'])test(role+' can view teammate but cannot attach to their inspection',async()=>{const r=await fixture({profile:{role},row:{user_id:id}}).request();assert.equal(r.status,200);assert.equal((await r.json()).can_attach,false);});
test('administrator follows RLS visibility but never receives attach permission',async()=>{const r=await fixture({profile:{role:'administrator',team:null},row:{team:'ams',user_id:id}}).request();assert.equal(r.status,200);assert.equal((await r.json()).can_attach,false);});
for(const patch of [{user:{is_anonymous:true}},{user:{role:'anon'}},{profile:{approved:false}},{profile:{role:'invented'}},{profile:{team:null}},{profile:{id}}])test('denies invalid account '+JSON.stringify(patch),async()=>{const r=await fixture(patch).request();assert.equal(r.status,403);assert.equal((await r.json()).can_attach,undefined);});
for(const patch of [{row:{team:'ams'}},{empty:true}])test('cross-team and missing records are indistinguishable '+JSON.stringify(patch),async()=>{const r=await fixture(patch).request();assert.equal(r.status,404);assert.deepEqual(await r.json(),{error:'inspection_unavailable'});});
test('missing, forged and expired sessions fail closed',async()=>{const f=fixture();assert.equal((await f.request(undefined,{Authorization:''})).status,401);assert.equal(f.calls.length,0);assert.equal((await fixture({fail:401}).request()).status,401);});
test('Auth outages do not disclose upstream details',async()=>{const r=await fixture({fail:500}).request();assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'authorization_unavailable'});});

test('Worker-compatible manual redirect mode rejects redirects without forwarding credentials',async()=>{
 let calls=0;const w=createWorker(async(_url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://untrusted.invalid'}});});
 const r=await w.fetch(new Request('https://worker.invalid/v1/inspections/'+id+'/permissions',{headers:{Authorization:'Bearer aa.bb.cc'}}));
 assert.equal(r.status,503);assert.equal(calls,1);assert.deepEqual(await r.json(),{error:'authorization_unavailable'});
});
test('profile revocation is checked again for each request',async()=>{let approved=true;const w=createWorker(async url=>Response.json(url.includes('/auth/')?{id:uid,role:'authenticated'}:url.includes('/profiles?')?[{id:uid,role:'inspector',team:'roadway',approved}]:[{id,user_id:uid,team:'roadway'}]));const req=()=>w.fetch(new Request('https://worker.invalid/v1/inspections/'+id+'/permissions',{headers:{Authorization:'Bearer aa.bb.cc'}}));assert.equal((await req()).status,200);approved=false;assert.equal((await req()).status,403);});
test('demo and arbitrary origins cannot trigger upstream authorization calls',async()=>{for(const origin of ['https://spotit-demo.pages.dev','https://evil.invalid','null']){const f=fixture(),r=await f.request(undefined,{Origin:origin});assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);assert.equal(f.calls.length,0);}});
test('preflight narrowly allows GET and authorization headers',async()=>{const f=fixture();assert.equal((await f.request(undefined,{'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'},'OPTIONS')).status,204);assert.equal((await f.request(undefined,{'Access-Control-Request-Method':'PUT'},'OPTIONS')).status,403);assert.equal(f.calls.length,0);});
test('upload, delete, arbitrary paths and query tokens are unavailable',async()=>{const f=fixture();for(const method of ['PUT','POST','DELETE'])assert.equal((await f.request(undefined,{},method)).status,405);assert.equal((await f.request('/photos/secret')).status,404);assert.equal((await f.request('/v1/inspections/'+id+'/permissions?token=secret')).status,400);assert.equal(f.calls.length,0);});
test('health is not a photo access grant',async()=>{const f=fixture(),r=await f.request('/health',{Authorization:''});assert.equal(r.status,200);assert.equal((await r.json()).photo_transport_enabled,false);assert.equal(f.calls.length,0);});
test('GitHub Pages installed app origin supports authenticated reads and upload preflight',async()=>{const f=fixture();const r=await f.request(undefined,{Origin:'https://roadtrace.github.io'});assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),'https://roadtrace.github.io');const preflight=await f.request('/v1/inspections/'+id+'/uploads/'+uid+'/evidence',{Origin:'https://roadtrace.github.io','Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization, content-type'},'OPTIONS');assert.equal(preflight.status,204);});
