const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const photo=require('./photo-upload-state'),sync=require('./photo-sync'),cloud=require('./photo-cloud-api'),model=require('./entry-model');
const ID='5386c5ea-9688-4457-ad56-40d2569e944b',USER='8f590a6a-db13-4c75-8fb8-df9c1786d47c';
async function fixture(){
  let now=Date.parse('2026-10-03T01:00:00Z');
  const e={id:ID,lat:1,lon:2,user_id:USER,team:'roadway',sync_status:'synced',remote_id:ID,photoId:'p',photo_sync_status:'photo_local',
    submission_snapshot:{version:1,row:{id:ID,user_id:USER,team:'roadway',created_at:'2026-10-01T00:00:00Z',inspected_at:'2026-10-01T00:00:00Z'}}};
  const c={mode:'approved',canUseLocal:true,cloudVerified:true,userId:USER,workspaceUserId:USER,profile:{id:USER,approved:true,role:'inspector',team:'roadway'},verifiedAt:now,sessionGeneration:1,scopeGeneration:1};
  const disk=new Map([['p',new Blob(['stamp'],{type:'image/jpeg'})],['p:raw',new Blob(['raw'],{type:'image/jpeg'})]]);
  let durable=JSON.stringify(e),object=null,row={...e.submission_snapshot.row,photo_filename:null,photo_path:null};
  const calls=[],hooks={};
  const save=(entry,changes)=>{if(hooks.save) return hooks.save(entry,changes);Object.assign(entry,changes);durable=JSON.stringify(entry);return true;};
  const base={context:()=>c,key:()=> 'account',now:()=>now,durable:entry=>JSON.stringify(entry)===durable,isCurrent:entry=>entry===e,
    read:async k=>disk.get(k),save,lock:async(k,run)=>run()};
  await photo.createPreparer({...base,add:async(k,v)=>disk.set(k,v),encode:async()=>({blob:new Blob(['exact upload'],{type:'image/jpeg'}),width:100,height:50})}).prepare(e);
  const m=e.photo_upload_manifest;
  const client={auth:{getUser:async()=>{calls.push('auth');if(hooks.auth)return hooks.auth();return {data:{user:{id:c.userId}}};}},
    from:table=>{
      assert.equal(table,'inspections');const filters=[];let changes=null;
      const q={select:()=>q,eq:(k,v)=>{filters.push(['eq',k,v]);return q;},is:(k,v)=>{filters.push(['is',k,v]);return q;},
        update:value=>{changes=value;return q;},maybeSingle:async()=>{calls.push('row');if(hooks.row)return hooks.row(row);return {data:structuredClone(row)};},
        then:(resolve,reject)=>Promise.resolve().then(async()=>{
          calls.push('reserve');assert.deepEqual(changes,{photo_filename:m.photo_filename_intent,photo_path:m.object_path});
          assert.deepEqual(filters,[['eq','id',ID],['eq','user_id',USER],['eq','team','roadway'],['is','photo_filename',null],['is','photo_path',null]]);
          if(hooks.reserve)return hooks.reserve(row,changes);
          if(row.photo_filename===null&&row.photo_path===null)Object.assign(row,changes);
          return {data:[]};
        }).then(resolve,reject)};return q;
    },storage:{from:bucket=>{assert.equal(bucket,'inspection-photos');return {
      upload:async(path,bytes,options)=>{calls.push('upload');assert.equal(path,m.object_path);assert.deepEqual(options,{contentType:'image/jpeg',upsert:false});assert.equal(await photo.sha256(bytes),m.upload_sha256);
        if(hooks.upload)return hooks.upload(bytes);assert.equal(object,null);object=bytes;return {data:{path}};},
      download:async path=>{calls.push('download');assert.equal(path,m.object_path);if(hooks.download)return hooks.download();return object?{data:object}:{error:{code:'NoSuchKey',statusCode:'404'}};}
    };}}};
  const options={...base,client,verify:async()=>{calls.push('verify');if(hooks.verify)await hooks.verify();},random:()=>0.5,enabled:true};
  return {e,c,disk,calls,hooks,m,options,get row(){return row;},set row(v){row=v;},get object(){return object;},set object(v){object=v;},
    persist:()=>{durable=JSON.stringify(e);},advance:()=>{now+=31000;c.verifiedAt=now;},run:()=>sync.createController(options).dispatch(e)};
}
test('disabled default dispatch and API do no reads, verification, writes or local changes',async()=>{
  const f=await fixture(),before=JSON.stringify(f.e);
  assert.equal((await sync.createController({...f.options,enabled:undefined}).dispatch(f.e)).status,'disabled');
  await assert.rejects(cloud.createApi({client:f.options.client}).readRow(f.m),/disabled/);
  assert.deepEqual(f.calls,[]);assert.equal(JSON.stringify(f.e),before);
});
test('manual retry bypasses time only, preserves exact manifest/payload and inspection snapshot',async()=>{
  const f=await fixture();f.hooks.upload=()=>{throw Error('offline');};await f.run();
  const identity=JSON.stringify(f.m),payload=f.disk.get(f.m.payload_key).payload,snapshot=JSON.stringify(f.e.submission_snapshot);
  const scheduled=f.e.photo_next_retry_at;assert.ok(scheduled);delete f.hooks.upload;
  assert.equal((await sync.createController(f.options).retryNow(f.e)).status,'photo_synced');
  assert.equal(JSON.stringify(f.e.photo_upload_manifest),identity);assert.equal(f.disk.get(f.m.payload_key).payload,payload);
  assert.equal(JSON.stringify(f.e.submission_snapshot),snapshot);assert.equal(f.e.sync_status,'synced');
  assert.equal(f.calls.filter(x=>x==='reserve').length,1);assert.equal(f.e.photo_attempt_count,2);
});
test('disabled manual retry preserves schedule and does not verify, read, encode or save',async()=>{
  const f=await fixture();Object.assign(f.e,{photo_sync_status:'photo_failed',photo_next_retry_at:'2026-10-03T02:00:00Z'});f.persist();
  const before=JSON.stringify(f.e);assert.equal((await sync.createController({...f.options,enabled:false}).retryNow(f.e)).status,'disabled');
  assert.equal(JSON.stringify(f.e),before);assert.deepEqual(f.calls,[]);
});
test('manual retry cannot release needs review or reset exhausted attempts',async()=>{
  const f=await fixture();f.e.photo_sync_status='photo_needs_review';f.persist();
  assert.equal((await sync.createController(f.options).retryNow(f.e)).status,'blocked');assert.deepEqual(f.calls,[]);
  f.e.photo_sync_status='photo_failed';f.e.photo_attempt_count=8;f.persist();
  assert.equal((await sync.createController(f.options).retryNow(f.e)).status,'photo_needs_review');assert.deepEqual(f.calls,[]);
});
test('manual retry validates retained payload without regeneration before upload',async()=>{
  const f=await fixture();f.e.photo_sync_status='photo_failed';f.persist();
  const identity=JSON.stringify(f.m);f.disk.delete(f.m.payload_key);
  assert.equal((await sync.createController(f.options).retryNow(f.e)).status,'photo_needs_review');
  assert.equal(JSON.stringify(f.e.photo_upload_manifest),identity);assert.ok(!f.calls.includes('upload'));assert.ok(!f.calls.includes('reserve'));
});
test('manual retry uses existing busy guard and leaves schedule until attempt validation',async()=>{
  const f=await fixture();f.e.photo_sync_status='photo_failed';f.e.photo_next_retry_at='2026-10-03T02:00:00Z';f.persist();
  let release;f.hooks.verify=()=>new Promise(resolve=>release=resolve);const controller=sync.createController(f.options);
  const running=controller.retryNow(f.e);await new Promise(r=>setImmediate(r));
  assert.equal(f.e.photo_next_retry_at,'2026-10-03T02:00:00Z');assert.equal((await controller.retryNow(f.e)).status,'busy');
  delete f.hooks.verify;release();assert.equal((await running).status,'photo_synced');
});
test('null/null reserves conditionally, exact payload uploads, object and final row precede durable ack',async()=>{
  const f=await fixture(),snapshot=structuredClone(f.e.submission_snapshot);
  assert.equal((await f.run()).status,'photo_synced');assert.equal(f.e.sync_status,'synced');assert.deepEqual(f.e.submission_snapshot,snapshot);
  assert.ok(photo.validAcknowledgement(f.e));assert.equal(f.e.photo_attempt_count,1);assert.equal(f.calls.filter(x=>x==='upload').length,1);
  assert.ok(f.calls.lastIndexOf('row')>f.calls.lastIndexOf('download'));
  assert.equal(model.normalizeEntry(f.e).photo_sync_status,'photo_synced');
});
for(const [name,change] of [
  ['no auth',f=>f.c.mode='signed-out'],['wrong owner',f=>f.e.user_id=ID],['wrong team',f=>f.c.profile.team='other'],
  ['stale verification',f=>f.c.verifiedAt-=300001],['wrong workspace',f=>f.c.workspaceUserId=ID],
  ['unapproved',f=>f.c.profile.approved=false],['administrator',f=>f.c.profile.role='administrator'],
  ['Guest original',f=>f.e.guest_claim_required=true],['held claimed copy',f=>f.e.guest_claim_pending=true],
  ['unsynced claimed copy',f=>f.e.sync_status='pending'],['remote mismatch',f=>f.e.remote_id=USER],
  ['preapproval',f=>f.e.preapproval_review_required=true],['unknown inspection outcome',f=>f.e.sync_outcome_unknown=true]
])test(`${name} cannot dispatch`,async()=>{const f=await fixture();change(f);f.persist();assert.equal((await f.run()).status,'photo_needs_review');assert.equal(f.calls.length,0);});
test('released claimed copy and owning Supervisor can proceed',async()=>{const f=await fixture();f.e.guest_claim_origin={source_id:USER};f.c.profile.role='supervisor';f.persist();assert.equal((await f.run()).status,'photo_synced');});
for(const variant of ['path','filename','partial','owner','team','time'])test(`conflicting cloud ${variant} held without mutation`,async()=>{
  const f=await fixture();if(variant==='path')f.row.photo_path='other';if(variant==='filename')f.row.photo_filename='other';if(variant==='partial')f.row.photo_path=f.m.object_path;
  if(variant==='owner')f.row.user_id=ID;if(variant==='team')f.row.team='other';if(variant==='time')f.row.inspected_at='2026-10-02T00:00:00Z';
  assert.equal((await f.run()).status,'photo_needs_review');assert.ok(!f.calls.includes('reserve'));assert.ok(!f.calls.includes('upload'));
});
test('exact reservation plus matching object recovers without reserve/upload, after hash proof',async()=>{
  const f=await fixture();Object.assign(f.row,{photo_filename:f.m.photo_filename_intent,photo_path:f.m.object_path});f.object=f.disk.get(f.m.payload_key).payload;
  assert.equal((await f.run()).status,'photo_synced');assert.ok(f.calls.includes('download'));assert.ok(!f.calls.includes('reserve'));assert.ok(!f.calls.includes('upload'));
});
test('reservation lost response rereads and resumes same intent',async()=>{const f=await fixture();f.hooks.reserve=(row,changes)=>{Object.assign(row,changes);throw Error('lost');};assert.equal((await f.run()).status,'photo_synced');assert.equal(f.e.photo_path,f.m.object_path);});
test('reservation denied and still null holds review',async()=>{const f=await fixture();f.hooks.reserve=()=>({error:{code:'42501'}});assert.equal((await f.run()).status,'photo_needs_review');assert.ok(!f.calls.includes('upload'));});
test('conditional race cannot replace another reservation',async()=>{const f=await fixture();f.hooks.reserve=row=>{row.photo_path='other';row.photo_filename='other';return {data:[]};};assert.equal((await f.run()).status,'photo_needs_review');assert.equal(f.row.photo_path,'other');assert.ok(!f.calls.includes('upload'));});
test('upload lost response reconciles exact uploaded bytes',async()=>{const f=await fixture();f.hooks.upload=bytes=>{f.object=bytes;throw Error('lost');};assert.equal((await f.run()).status,'photo_synced');assert.equal(f.calls.filter(x=>x==='upload').length,1);});
test('collision with matching object succeeds only after download proof',async()=>{const f=await fixture();f.hooks.upload=bytes=>{f.object=bytes;return {error:{code:'Duplicate',statusCode:409}};};assert.equal((await f.run()).status,'photo_synced');});
test('collision different bytes held without overwrite',async()=>{const f=await fixture();f.hooks.upload=()=>{f.object=new Blob(['bad']);return {error:{code:'Duplicate',statusCode:409}};};assert.equal((await f.run()).status,'photo_needs_review');});
test('existing object hash mismatch holds review, zero upload',async()=>{const f=await fixture();f.object=new Blob(['bad']);assert.equal((await f.run()).status,'photo_needs_review');assert.ok(!f.calls.includes('upload'));});
test('missing after upload is retryable with persisted bounded backoff',async()=>{
  const f=await fixture();f.hooks.upload=()=>{throw Error('offline');};assert.equal((await f.run()).status,'photo_failed');
  assert.equal(f.e.photo_next_retry_at,'2026-10-03T01:00:30.000Z');assert.equal((await f.run()).status,'backoff');
  f.advance();delete f.hooks.upload;assert.equal((await f.run()).status,'photo_synced');assert.equal(f.e.photo_attempt_count,2);assert.equal(f.calls.filter(x=>x==='reserve').length,1);
});
for(const error of [{statusCode:404},{code:'AccessDenied',statusCode:403},{}])test(`uncertain or denied read ${JSON.stringify(error)} never permits upload`,async()=>{const f=await fixture();f.hooks.download=()=>({error});await f.run();assert.ok(!f.calls.includes('upload'));assert.notEqual(f.e.photo_sync_status,'photo_synced');});
for(const stage of ['reservation','upload'])test(`restart after ${stage} reconciles same intent`,async()=>{
  const f=await fixture();Object.assign(f.row,{photo_filename:f.m.photo_filename_intent,photo_path:f.m.object_path});
  if(stage==='upload')f.object=f.disk.get(f.m.payload_key).payload;
  f.e.photo_sync_status='photo_uploading';Object.assign(f.e,photo.normalize(f.e));f.persist();
  const original=JSON.stringify(f.m);assert.equal((await f.run()).status,'photo_synced');assert.equal(JSON.stringify(f.e.photo_upload_manifest),original);
  assert.equal(f.calls.filter(x=>x==='upload').length,stage==='upload'?0:1);
});
for(const stage of ['verify','row','upload','download'])for(const action of ['switch','signout'])test(`${action} during ${stage} ignores stale results`,async()=>{
  const f=await fixture();f.hooks[stage]=()=>{f.c.sessionGeneration++;if(action==='signout')f.c.mode='signed-out';else f.c.userId=ID;
    if(stage==='row')return {data:f.row};if(stage==='upload')return {data:{path:f.m.object_path}};if(stage==='download')return {error:{code:'NoSuchKey'}};};
  assert.equal((await f.run()).status,'stale');assert.notEqual(f.e.photo_sync_status,'photo_synced');assert.equal(f.e.photo_cloud_ack,undefined);
});
for(const source of ['raw','stamp','payload'])test(`${source} divergence prevents cloud dispatch`,async()=>{
  const f=await fixture();if(source==='raw')f.disk.set('p:raw',new Blob(['changed']));if(source==='stamp')f.disk.set('p',new Blob(['changed']));
  if(source==='payload')f.disk.set(f.m.payload_key,{manifest:f.m,payload:new Blob(['changed'],{type:'image/jpeg'})});
  assert.equal((await f.run()).status,'photo_needs_review');assert.ok(!f.calls.includes('reserve'));assert.ok(!f.calls.includes('upload'));
});
test('source changes during online authorization before upload prevent dispatch',async()=>{const f=await fixture();f.hooks.verify=()=>{if(f.calls.includes('reserve'))f.disk.set('p:raw',new Blob(['changed']));};assert.equal((await f.run()).status,'photo_needs_review');assert.ok(!f.calls.includes('upload'));});
test('final row change prevents acknowledgement after exact object proof',async()=>{const f=await fixture();f.hooks.row=row=>({data:{...row,...(f.object?{photo_path:'other'}:{})}});assert.equal((await f.run()).status,'photo_needs_review');assert.equal(f.e.photo_cloud_ack,undefined);});
test('durable ack failure leaves recoverable intent, restart performs no duplicate upload',async()=>{
  const f=await fixture();f.hooks.save=(e,changes)=>{if(changes.photo_sync_status==='photo_synced')return false;Object.assign(e,changes);f.persist();return true;};
  assert.equal((await f.run()).status,'storage-error');delete f.hooks.save;assert.equal((await f.run()).status,'photo_synced');assert.equal(f.calls.filter(x=>x==='upload').length,1);
});
test('path alone cannot establish photo_synced',async()=>{const f=await fixture();f.e.photo_path=f.m.object_path;f.e.photo_sync_status='photo_synced';assert.equal(photo.normalize(f.e).photo_sync_status,'photo_needs_review');});
test('single controller serializes photos independently of inspection runner',async()=>{
  const f=await fixture();let release;f.hooks.verify=()=>new Promise(r=>release=r);const controller=sync.createController(f.options);const first=controller.dispatch(f.e);
  await new Promise(r=>setImmediate(r));assert.equal((await controller.dispatch(f.e)).status,'busy');delete f.hooks.verify;release();assert.equal((await first).status,'photo_synced');
  assert.equal(controller.isBusy(),false);
});
test('retry exhaustion and malformed counters hold, no mutation',async()=>{const f=await fixture();f.e.photo_attempt_count=8;f.persist();assert.equal((await f.run()).status,'photo_needs_review');assert.equal(f.calls.length,0);});
test('throwing persistence prevents mutations and does not silently retry',async()=>{const f=await fixture();f.hooks.save=()=>{throw Error('quota');};assert.equal((await f.run()).status,'storage-error');assert.ok(!f.calls.includes('reserve'));assert.ok(!f.calls.includes('upload'));});
test('authorization refresh failure never dispatches mutations',async()=>{const f=await fixture();f.hooks.verify=()=>{throw Error('offline');};assert.equal((await f.run()).status,'photo_needs_review');assert.ok(!f.calls.includes('reserve'));});
test('positive jitter never exceeds thirty minute retry cap',async()=>{const f=await fixture();f.e.photo_attempt_count=6;f.persist();f.options.random=()=>1;f.hooks.download=()=>({error:{status:503}});assert.equal((await f.run()).status,'photo_failed');assert.equal(f.e.photo_next_retry_at,'2026-10-03T01:30:00.000Z');});
test('invalid counter and retry date hold without cloud operations',async()=>{for(const changes of [{photo_attempt_count:-1},{photo_attempt_count:1.5},{photo_next_retry_at:'invalid'}]){const f=await fixture();Object.assign(f.e,changes);f.persist();assert.equal((await f.run()).status,'photo_needs_review');assert.equal(f.calls.length,0);}});
test('fresh verified account mismatch prevents reservation',async()=>{const f=await fixture();f.hooks.auth=()=>({data:{user:{id:ID}}});assert.equal((await f.run()).status,'photo_needs_review');assert.ok(!f.calls.includes('reserve'));});
test('source divergence after upload prevents final acknowledgement',async()=>{const f=await fixture();f.hooks.upload=bytes=>{f.object=bytes;f.disk.set('p:raw',new Blob(['changed']));return {data:{path:f.m.object_path}};};assert.equal((await f.run()).status,'photo_needs_review');assert.equal(f.e.photo_cloud_ack,undefined);});
test('source change while final row is in flight prevents durable acknowledgement',async()=>{const f=await fixture();f.hooks.row=row=>{if(f.object)f.disk.set('p:raw',new Blob(['changed']));return {data:structuredClone(row)};};assert.equal((await f.run()).status,'photo_needs_review');assert.equal(f.e.photo_cloud_ack,undefined);});
test('valid durable ack survives preparation checks without resetting transport state',async()=>{const f=await fixture();await f.run();const before=JSON.stringify(f.e);const result=await photo.createPreparer(f.options).prepare(f.e);assert.equal(result.status,'photo_synced');assert.equal(JSON.stringify(f.e),before);});
test('production gate static false, no auto dispatch; assets cached; forbidden operations absent',()=>{
  const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
  assert.match(html,/const PHOTO_CLOUD_TRANSPORT_ENABLED = false/);assert.doesNotMatch(html,/\.dispatch\(/);
  for(const asset of ['photo-cloud-api.js','photo-sync.js'])assert.ok(sw.includes(asset)&&html.includes(asset));
  assert.match(sw,/v242/);
  for(const file of ['photo-cloud-api.js','photo-sync.js'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/\.remove\(|\.delete\(|\.upsert\(|getPublicUrl|\.insert\(/);
  assert.doesNotMatch(fs.readFileSync('sync-runner.js','utf8'),/SPOTITPhoto|photo-sync|photo-cloud/);
});
test('pinned Supabase SDK serializes atomic null guards, immutable upload and private download with mocked fetch',async()=>{
  const sdk=require('node:vm').runInThisContext(fs.readFileSync('vendor/supabase/supabase-js-2.117.1.umd.js','utf8')+';supabase;');
  const {createClient}=sdk;
  const f=await fixture(),requests=[];
  const client=createClient('https://phase13c.invalid','public-fixture-key',{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:async(url,options)=>{
      requests.push({url:String(url),options});
      if(String(url).includes('/rest/v1/'))return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});
      if(options.method==='POST')return new Response(JSON.stringify({Key:'inspection-photos/'+f.m.object_path,Id:'fixture'}),{status:200,headers:{'Content-Type':'application/json'}});
      return new Response(JSON.stringify({code:'NoSuchKey',message:'Object not found'}),{status:404,headers:{'Content-Type':'application/json'}});
    }}
  });
  const api=cloud.createApi({client,enabled:true,authorize:async()=>{},validate:async()=>{}});
  await api.reserve(f.m);
  const reservation=new URL(requests[0].url);
  assert.equal(requests[0].options.method,'PATCH');assert.equal(reservation.searchParams.get('photo_filename'),'is.null');assert.equal(reservation.searchParams.get('photo_path'),'is.null');
  assert.equal(reservation.searchParams.get('user_id'),'eq.'+USER);assert.equal(reservation.searchParams.get('team'),'eq.roadway');
  assert.deepEqual(JSON.parse(requests[0].options.body),{photo_filename:f.m.photo_filename_intent,photo_path:f.m.object_path});
  await api.upload(f.m,f.disk.get(f.m.payload_key).payload);
  assert.equal(new Headers(requests[1].options.headers).get('x-upsert'),'false');
  assert.ok(requests[1].url.endsWith('/object/inspection-photos/'+f.m.object_path));
  assert.deepEqual(await api.download(f.m),{missing:true});
  assert.ok(requests[2].url.includes('/object/inspection-photos/'));assert.ok(!requests[2].url.includes('/public/'));
  assert.ok(new Headers(requests[2].options.headers).has('authorization'));assert.equal(requests.length,3);
});
