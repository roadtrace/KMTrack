const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const r2=require('../src/r2-photos'),photo=require('../src/photo-upload-state');
const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',upload='11111111-1111-4111-8111-111111111111';
function fixture(){
 let now=Date.now(),durable,remote=null,current=null,failFinalize=false;
 const e={id,user_id:uid,team:'roadway',sync_status:'synced',remote_id:id,photoId:'p'};
 const c={mode:'approved',cloudVerified:true,canUseLocal:true,userId:uid,workspaceUserId:uid,
  profile:{id:uid,role:'inspector',approved:true,team:'roadway'},verifiedAt:now,sessionGeneration:1,scopeGeneration:1};
 const disk=new Map([['p:raw',new Blob(['raw'],{type:'image/jpeg'})]]),calls=[],hooks={};
 durable=JSON.stringify(e);
 const options={enabled:true,context:()=>c,key:()=> 'account',now:()=>now,isCurrent:x=>x===e,durable:x=>JSON.stringify(x)===durable,
  verify:async()=>{},read:async key=>disk.get(key),add:async(k,v)=>{assert.equal(disk.has(k),false);disk.set(k,v);},
  save:(entry,changes)=>{Object.assign(entry,changes);durable=JSON.stringify(entry);return true;},lock:async(k,run)=>run(),uuid:()=>upload,
  encode:async(raw,env,size)=>({blob:new Blob([size===400?'thumb':'evidence'],{type:'image/jpeg'}),width:size,height:size/2}),
  client:{auth:{getSession:async()=>({data:{session:{user:{id:uid},access_token:'user-session'}}})}},
  fetch:async(url,o)=>{
   calls.push(url);assert.equal(o.headers.Authorization,'Bearer user-session');assert.equal(o.credentials,'omit');
   const suffix=url.split(id+'/')[1];if(hooks[suffix])await hooks[suffix]();
   if(suffix==='current-info')return Response.json(current);
   if(suffix==='uploads'){
    const m=JSON.parse(o.body);remote=remote||{...m,state:'reserved'};return Response.json(remote);
   }
   if(suffix.endsWith('/evidence')||suffix.endsWith('/thumbnail'))return Response.json({uploaded:true});
   if(suffix.endsWith('/finalize')){remote.state='ready';remote.finalized_at=new Date(now).toISOString();
    if(failFinalize){failFinalize=false;throw Error('connection lost after commit');}return Response.json(remote);}
   return Response.json(remote);
  }};
 return {e,c,disk,calls,hooks,options,run:()=>r2.createController(options).dispatch(e),loseFinalize:()=>{failFinalize=true;},
  advance:()=>{now+=40000;c.verifiedAt=now;},persist:()=>{durable=JSON.stringify(e);},current:v=>{current=v;}};
}
test('pilot disabled makes no authentication, encoding or network calls',async()=>{
 const f=fixture();f.options.enabled=false;assert.equal((await f.run()).status,'disabled');assert.equal(f.calls.length,0);assert.equal(f.disk.size,1);
});
test('durable evidence and thumbnail are acknowledged only after authoritative status',async()=>{
 const f=fixture();assert.equal((await f.run()).status,'synced');
 const state=f.e.r2_photo,envelope=f.disk.get(state.payload_key);
 assert.equal(state.ack.state,'ready');assert.equal(await photo.sha256(envelope.thumbnail),state.manifest.thumb_sha256);
 assert.equal(await photo.sha256(envelope.evidence),state.manifest.sha256);
 assert.equal(f.e.photo_path,undefined);assert.equal(f.disk.has('p:raw'),true);
 assert.ok(f.calls.at(-1).endsWith('/uploads/'+upload));
});
test('lost finalization response retries the same intent without another upload',async()=>{
 const f=fixture();f.loseFinalize();assert.equal((await f.run()).status,'held');const intent=f.e.r2_photo.manifest.upload_id;
 assert.equal((await f.run()).status,'backoff');f.advance();const before=f.calls.length;
 assert.equal((await f.run()).status,'synced');assert.equal(f.e.r2_photo.manifest.upload_id,intent);
 assert.equal(f.calls.slice(before).some(u=>u.endsWith('/evidence')||u.endsWith('/thumbnail')),false);
});
test('changed saved bytes are held before any upload or acknowledgement',async()=>{
 const f=fixture();f.loseFinalize();await f.run();f.advance();
 f.disk.get(f.e.r2_photo.payload_key).evidence=new Blob(['changed'],{type:'image/jpeg'});
 const before=f.calls.length;assert.equal((await f.run()).status,'held');assert.equal(f.e.r2_photo.status,'review');
 assert.equal(f.calls.length,before);
});
test('account change while upload is in flight cannot persist acknowledgement',async()=>{
 const f=fixture();f.hooks['uploads/'+upload+'/evidence']=async()=>{f.c.userId=id;};
 assert.equal((await f.run()).status,'held');assert.notEqual(f.e.r2_photo.status,'synced');assert.equal(f.e.r2_photo.ack,undefined);
 assert.equal(f.calls.some(x=>x.endsWith('/finalize')),false);
});
test('raw bytes changed under the same photo ID block finalization',async()=>{
 const f=fixture();f.hooks['uploads/'+upload+'/thumbnail']=async()=>f.disk.set('p:raw',new Blob(['new raw']));
 assert.equal((await f.run()).status,'held');assert.equal(f.e.r2_photo.status,'review');assert.equal(f.calls.some(x=>x.endsWith('/finalize')),false);
});
test('legacy cloud reference is preserved while R2 replacement uses current ID',async()=>{
 const f=fixture();f.e.photo_path='legacy/path';f.persist();f.current({upload_id:id});
 assert.equal((await f.run()).status,'synced');assert.equal(f.e.photo_path,'legacy/path');assert.equal(f.e.r2_photo.manifest.expected_current_id,id);
});
test('guest, pending, imported and preapproval entries never prepare or dispatch',async()=>{
 for(const patch of [{guest_claim_required:true},{preapproval_review_required:true},{importBatchId:'import'},{sync_status:'pending'}]){
  const f=fixture();Object.assign(f.e,patch);f.persist();assert.equal((await f.run()).status,'held');assert.equal(f.calls.length,0);}
});
test('production R2 is explicit while legacy photo transport remains off',()=>{
 const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
 assert.match(html,/R2_PHOTO_PILOT_ENABLED = true/);assert.match(html,/PHOTO_CLOUD_TRANSPORT_ENABLED = false/);
 assert.match(sw,/src\/r2-photos.js/);assert.match(html,/src\/r2-photos.js/);
 assert.match(fs.readFileSync('workers/photo-api/wrangler.toml','utf8'),/PHOTO_TRANSPORT_ENABLED = "false"/);
});
