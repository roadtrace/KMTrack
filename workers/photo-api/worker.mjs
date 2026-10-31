/* Private photo API. Transport is off unless explicitly configured server-side. */
import PILOT_PAGE from './pilot-page.mjs';
const TEST_ORIGIN='https://spotit-photo-api-test.mmatriano19.workers.dev';
const PHONE_PILOT_ORIGIN='https://spotit-photo-pilot.pages.dev';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_CONFIG=Object.freeze({
  url:'https://lgflqsowtkrtxhmibyoq.supabase.co',
  key:'sb_publishable_rRKaaq_2cOWC5L7Zd79-3g_2o_CzG6e',
  origin:'https://kmtrack.pages.dev'
});
class Denied extends Error {constructor(status,code){super(code);this.status=status;this.code=code;}}
export function createWorker(fetcher=fetch,deployment='test'){
  if(!['test','production'].includes(deployment))throw Error('Invalid deployment');
  const expectedBucket=deployment==='test'?'spotit-inspection-photos-test':'spotit-inspection-photos';
  async function read(path,token){
    let response;
    try{response=await fetcher(PUBLIC_CONFIG.url+path,{method:'GET',headers:{apikey:PUBLIC_CONFIG.key,Authorization:'Bearer '+token,Accept:'application/json'},cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(8000)});}
    catch{throw new Denied(503,'authorization_unavailable');}
    if(!response.ok){if(response.status===401)throw new Denied(401,'invalid_session');if(response.status===403)throw new Denied(403,'access_denied');throw new Denied(503,'authorization_unavailable');}
    try{return await response.json();}catch{throw new Denied(503,'authorization_unavailable');}
  }
  async function authorize(request,id){
    const match=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(request.headers.get('Authorization')||'');
    if(!match||match[1].length>8192)throw new Denied(401,'session_required');
    const token=match[1],user=await read('/auth/v1/user',token);
    if(!UUID.test(user?.id||'')||user.is_anonymous===true||user.role!=='authenticated')throw new Denied(403,'account_required');
    const profiles=await read('/rest/v1/profiles?select=id,role,approved,team&id=eq.'+user.id+'&limit=1',token);
    const p=Array.isArray(profiles)&&profiles.length===1?profiles[0]:null;
    if(!p||p.id!==user.id||p.approved!==true||!['inspector','supervisor','administrator'].includes(p.role))throw new Denied(403,'approved_account_required');
    if(p.role!=='administrator'&&(typeof p.team!=='string'||!p.team.trim()))throw new Denied(403,'assigned_team_required');
    // Caller JWT keeps inspection SELECT protected by Supabase RLS. No service key.
    const rows=await read('/rest/v1/inspections?select=id,user_id,team&id=eq.'+id+'&limit=1',token);
    const row=Array.isArray(rows)&&rows.length===1?rows[0]:null;
    // Same response for missing and inaccessible rows; do not disclose another team's records.
    if(!row||String(row.id).toLowerCase()!==id||p.role!=='administrator'&&row.team!==p.team)throw new Denied(404,'inspection_unavailable');
    const canAttach=['inspector','supervisor'].includes(p.role)&&row.user_id===user.id&&row.team===p.team;
    return {can_view:true,can_attach:canAttach,actor:user.id};
  }
  async function rpc(env,name,body){
    let r;
    try{r=await fetcher(PUBLIC_CONFIG.url+'/rest/v1/rpc/'+name,{method:'POST',
      headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},
      body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(10000)});}
    catch{throw new Denied(503,'metadata_unavailable');}
    if(!r.ok){let code;try{code=(await r.json()).code;}catch{}
      throw new Denied(code==='42501'?403:['23514','23505','22023','22P02'].includes(code)?409:503,
        code==='42501'?'access_denied':['23514','23505','22023','22P02'].includes(code)?'photo_conflict':'metadata_unavailable');}
    return r.json();
  }
  const config=env=>{
    // Deployment identity is fixed by its entry point, not an environment toggle.
    if(env.PHOTO_TRANSPORT_ENABLED!=='true'||env.PHOTO_ENVIRONMENT!==deployment||!env.PHOTOS_BUCKET||!env.SUPABASE_SERVICE_ROLE_KEY)
      throw new Denied(503,'photo_transport_disabled');
    return {environment:deployment,bucket_name:expectedBucket};
  };
  async function command(env,actor,operation,args){return rpc(env,'r2_photo_command',{actor,operation,args:{...args,...config(env)}});}
  async function verifiedObject(env,u,variant){
    const thumbnail=variant==='thumbnail',key=thumbnail?u.object_key.replace('/evidence.jpg','/thumbnail.jpg'):u.object_key;
    const object=await env.PHOTOS_BUCKET.get(key);
    if(!object)throw new Denied(409,'image_not_uploaded');
    const size=thumbnail?u.thumb_byte_size:u.byte_size;
    if(object.size!==size)throw new Denied(409,'image_mismatch');
    const bytes=await boundedBytes(object.body,size);
    await verifyImage(bytes,u,thumbnail);
    return {bytes,key};
  }
  async function cleanup(env){
    const cfg=config(env),jobs=await rpc(env,'r2_photo_cleanup',{operation:'claim',args:cfg});
    for(const job of jobs){
      // Never trust an arbitrary locator returned by a misconfigured backend.
      if(job.bucket_name!==cfg.bucket_name||!/^v1\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/(evidence|thumbnail)\.jpg$/.test(job.object_key))continue;
      let ok=false;try{await env.PHOTOS_BUCKET.delete(job.object_key);ok=true;}catch{}
      await rpc(env,'r2_photo_cleanup',{operation:'ack',args:{...cfg,object_key:job.object_key,lease_id:job.lease_id,ok}});
    }
  }
  async function cleanupLegacy(env){
    // Production only; never let the phone pilot delete legacy production images.
    if(deployment!=='production')return;
    config(env);
    const jobs=await rpc(env,'legacy_photo_cleanup',{operation:'claim',args:{}});
    for(const job of jobs){
      if(!/^[a-zA-Z0-9_-]+\/[0-9a-f-]{36}\/photo-v1-[a-f0-9]{64}\.jpg$/.test(job.object_key))continue;
      let ok=false;
      try{
        const result=await fetcher(PUBLIC_CONFIG.url+'/storage/v1/object/inspection-photos',{method:'DELETE',
          headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},
          body:JSON.stringify({prefixes:[job.object_key]}),redirect:'manual',signal:AbortSignal.timeout(10000)});
        ok=result.ok;
      }catch{}
      await rpc(env,'legacy_photo_cleanup',{operation:'ack',args:{object_key:job.object_key,lease_id:job.lease_id,ok}});
    }
  }
  return {async scheduled(_event,env,ctx){
    // No public cleanup HTTP route; Cloudflare Cron invokes this server-side.
    if(env.PHOTO_TRANSPORT_ENABLED==='true')ctx.waitUntil(Promise.all([cleanup(env),cleanupLegacy(env)]));
  },async fetch(request,env={}){
    const origin=request.headers.get('Origin'),cors=origin===PUBLIC_CONFIG.origin
      ||deployment==='test'&&env.PHOTO_ENVIRONMENT==='test'&&(origin===TEST_ORIGIN||origin===PHONE_PILOT_ORIGIN);
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
    if(cors)headers['Access-Control-Allow-Origin']=origin;
    const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
    try{
      if(origin&&!cors)throw new Denied(403,'origin_not_allowed');
      const url=new URL(request.url),path=url.pathname;
      if(url.search)throw new Denied(400,'query_not_allowed');
      if(path==='/pilot'&&deployment==='test'&&env.PHOTO_ENVIRONMENT==='test'){
        if(request.method!=='GET')return json({error:'method_not_allowed'},405);
        const nonce=crypto.randomUUID();
        return new Response(PILOT_PAGE.replaceAll('__NONCE__',nonce),{headers:{...headers,'Content-Type':'text/html; charset=utf-8',
          'Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; connect-src 'self' "+PUBLIC_CONFIG.url+"; img-src blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
      }
      const route=/^\/v1\/inspections\/([0-9a-f-]+)\/(permissions|current|current-info|current-thumbnail|uploads)(?:\/([0-9a-f-]+)(?:\/(evidence|thumbnail|finalize|abandon|remove))?)?$/i.exec(path);
      if(path!=='/health'&&(!route||!UUID.test(route[1])))throw new Denied(404,'not_found');
      if(route&&(route[3]&&!UUID.test(route[3])||route[2]!=='uploads'&&route[3]))throw new Denied(404,'not_found');
      const methods=route?.[2]==='uploads'?route[4]==='evidence'||route[4]==='thumbnail'?['PUT']:route[4]?['POST']:route[3]?['GET']:['POST']:['GET'];
      if(request.method==='OPTIONS'){
        if(!cors||!methods.includes(request.headers.get('Access-Control-Request-Method')))throw new Denied(403,'preflight_denied');
        const asked=(request.headers.get('Access-Control-Request-Headers')||'').toLowerCase().split(',').map(v=>v.trim()).filter(Boolean);
        if(asked.some(v=>!['authorization','content-type'].includes(v)))throw new Denied(403,'preflight_denied');
        return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':methods.join(', ')+', OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'}});
      }
      if(!methods.includes(request.method))return json({error:'method_not_allowed'},405);
      if(path==='/health')return json({service:'spotit-photo-api',stage:env.PHOTO_TRANSPORT_ENABLED==='true'?(deployment==='test'?'test-photo-pilot':'production-photo-api'):'authorization-only',photo_transport_enabled:env.PHOTO_TRANSPORT_ENABLED==='true'&&env.PHOTO_ENVIRONMENT===deployment});
      const permission=await authorize(request,route[1].toLowerCase());
      if(route[2]==='permissions')return json({can_view:true,can_attach:permission.can_attach,photo_transport_enabled:env.PHOTO_TRANSPORT_ENABLED==='true'&&env.PHOTO_ENVIRONMENT===deployment});
      config(env);
      const args={inspection_id:route[1].toLowerCase(),upload_id:route[3]?.toLowerCase()};
      if(['current','current-info','current-thumbnail'].includes(route[2])){
        const u=await command(env,permission.actor,'current',args);
        if(!u)return json(null);
        if(route[2]==='current-info')return json(publicIntent(u));
        const {bytes}=await verifiedObject(env,u,route[2]==='current-thumbnail'?'thumbnail':'evidence');
        const latest=await command(env,permission.actor,'current',args);
        if(latest?.id!==u.id)throw new Denied(409,'photo_changed');
        return new Response(bytes,{headers:{...headers,'Content-Type':'image/jpeg','Content-Length':String(bytes.byteLength)}});
      }
      if(!permission.can_attach)throw new Denied(403,'own_inspection_required');
      if(!args.upload_id){
        const body=await boundedJSON(request);
        if(!UUID.test(body.upload_id||'')||!HASH.test(body.sha256||'')||!HASH.test(body.thumb_sha256||''))throw new Denied(400,'invalid_intent');
        const allowed=['upload_id','sha256','byte_size','width','height','thumb_sha256','thumb_byte_size','thumb_width','thumb_height','expected_current_id'];
        if(Object.keys(body).some(k=>!allowed.includes(k)))throw new Denied(400,'invalid_intent');
        for(const [key,max] of [['byte_size',5242880],['width',1600],['height',1600],['thumb_byte_size',524288],['thumb_width',400],['thumb_height',400]])
          if(!Number.isInteger(body[key])||body[key]<1||body[key]>max)throw new Denied(400,'invalid_intent');
        return json(publicIntent(await command(env,permission.actor,'reserve',{...body,...args,upload_id:body.upload_id})));
      }
      let u=await command(env,permission.actor,'status',args);
      if(!route[4])return json(publicIntent(u));
      if(['abandon','remove'].includes(route[4]))return json(publicIntent(await command(env,permission.actor,route[4],args)));
      if(!['reserved','uploaded','ready'].includes(u.state))throw new Denied(409,'photo_conflict');
      if(route[4]==='finalize'){
        await verifiedObject(env,u,'evidence');await verifiedObject(env,u,'thumbnail');
        u=await command(env,permission.actor,'finalize',args);
        return json(publicIntent(u));
      }
      if(u.state==='ready')throw new Denied(409,'already_finalized');
      if(request.headers.get('Content-Type')?.split(';')[0]!=='image/jpeg')throw new Denied(415,'jpeg_required');
      const thumb=route[4]==='thumbnail',size=thumb?u.thumb_byte_size:u.byte_size;
      const bytes=await boundedBytes(request.body,size);await verifyImage(bytes,u,thumb);
      // Recheck live approval/inspection/deletion/expiry after reading the body.
      const latest=await command(env,permission.actor,'status',args);
      if(!['reserved','uploaded'].includes(latest.state))throw new Denied(409,'photo_conflict');
      const key=thumb?u.object_key.replace('/evidence.jpg','/thumbnail.jpg'):u.object_key;
      await env.PHOTOS_BUCKET.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'},sha256:await crypto.subtle.digest('SHA-256',bytes),httpMetadata:{contentType:'image/jpeg'}});
      // Existing immutable objects are allowed only when their actual bytes match.
      await verifiedObject(env,u,route[4]);
      return json({uploaded:true});
    }catch(error){return json({error:error instanceof Denied?error.code:'authorization_unavailable'},error instanceof Denied?error.status:503);}
  }};
}
const HASH=/^[a-f0-9]{64}$/;
function publicIntent(u){return {upload_id:u.id,state:u.state,sha256:u.sha256,byte_size:u.byte_size,width:u.width,height:u.height,
  thumb_sha256:u.thumb_sha256,thumb_byte_size:u.thumb_byte_size,thumb_width:u.thumb_width,thumb_height:u.thumb_height,finalized_at:u.finalized_at};}
async function boundedBytes(stream,limit){
  if(!stream||!Number.isInteger(limit)||limit<1||limit>5242880)throw new Denied(400,'invalid_image_size');
  const reader=stream.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>limit){await reader.cancel();throw new Denied(413,'image_too_large');}chunks.push(value);}}
  finally{reader.releaseLock();}
  if(size!==limit)throw new Denied(400,'image_size_mismatch');
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
async function boundedJSON(request){
  const reader=request.body?.getReader();if(!reader)throw new Denied(400,'invalid_intent');
  const chunks=[];let size=0;
  try{while(true){const x=await reader.read();if(x.done)break;size+=x.value.byteLength;if(size>4096){await reader.cancel();throw new Denied(413,'intent_too_large');}chunks.push(x.value);}}
  finally{reader.releaseLock();}
  try{const body=JSON.parse(chunks.map(x=>new TextDecoder().decode(x)).join(''));if(!body||Array.isArray(body)||typeof body!=='object')throw Error();return body;}
  catch{throw new Denied(400,'invalid_intent');}
}
export function jpegDimensions(b){
  if(b.length<12||b[0]!==255||b[1]!==216||b.at(-2)!==255||b.at(-1)!==217)throw new Denied(415,'invalid_jpeg');
  let at=2,dimensions,scanned=false;
  while(at<b.length-2){
    if(b[at++]!==255)throw new Denied(415,'invalid_jpeg');while(b[at]===255)at++;
    const marker=b[at++];
    if(marker===0||marker===216||marker===217)throw new Denied(415,'invalid_jpeg');
    const length=b[at]*256+b[at+1];if(length<2||at+length>b.length-2)throw new Denied(415,'invalid_jpeg');
    if([192,193,194].includes(marker)){
      if(length<8||length!==8+3*b[at+7]||![1,3,4].includes(b[at+7])||b[at+2]!==8||dimensions)throw new Denied(415,'invalid_jpeg');
      dimensions={height:b[at+3]*256+b[at+4],width:b[at+5]*256+b[at+6]};
      if(!dimensions.width||!dimensions.height)throw new Denied(415,'invalid_jpeg');
    }
    if(marker===218){
      if(!dimensions||length!==6+2*b[at+2]||b[at+2]<1||b[at+2]>4)throw new Denied(415,'invalid_jpeg');
      at+=length;scanned=true;
      // Walk entropy data (including byte stuffing/restarts) to the next marker.
      while(at<b.length-2){if(b[at]!==255){at++;continue;}
        let next=at+1;while(b[next]===255)next++;
        if(b[next]===0||b[next]>=208&&b[next]<=215){at=next+1;continue;}break;}
      continue;
    }
    at+=length;
  }
  if(at===b.length-2&&dimensions&&scanned)return dimensions;
  throw new Denied(415,'invalid_jpeg');
}
async function verifyImage(bytes,u,thumb){
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const d=jpegDimensions(bytes);
  if(hash!==(thumb?u.thumb_sha256:u.sha256)||d.width!==(thumb?u.thumb_width:u.width)||d.height!==(thumb?u.thumb_height:u.height))throw new Denied(409,'image_mismatch');
}
export default createWorker();
