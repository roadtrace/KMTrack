/* Private R2 photos. Explicit dispatch; originals remain on the device. */
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(node?require('./photo-upload-state'):root.SPOTITPhotoUpload,
    node?require('./inspection-api'):root.SPOTITInspections);
  if(node)module.exports=api;root.SPOTITR2Photos=api;
})(globalThis,function(photo,inspection){
  'use strict';
  const ENDPOINT='https://spotit-photo-api.mmatriano19.workers.dev';
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const HASH=/^[a-f0-9]{64}$/;
  // Reuse inspection/account review gates while keeping legacy Storage state
  // separate. R2 replacement never mutates the legacy photo_path/manifest.
  const eligibility=(e,c,durable,now)=>photo.eligibility({...e,photo_path:'',photo_upload_manifest:null,
    photo_cloud_ack:null,photo_sync_status:'photo_local'},c,durable,now);
  const failure=(code,status=409)=>Object.assign(Error(code),{status});
  function createApi(o){
    async function request(id,suffix,method='GET',body){
      if(o.enabled!==true)throw failure('R2 photo uploads disabled',503);
      if(!UUID.test(id))throw failure('Invalid inspection');
      o.guard();const auth=await o.client.auth.getSession();o.guard();
      const session=auth.data?.session;
      if(auth.error||!session?.access_token||session.user?.id!==o.context().userId)throw failure('Sign in again',401);
      const headers={Authorization:'Bearer '+session.access_token};
      if(body)headers['Content-Type']=body instanceof Blob?'image/jpeg':'application/json';
      const r=await (o.fetch||fetch)(ENDPOINT+'/v1/inspections/'+id+'/'+suffix,{method,headers,
        body:body instanceof Blob?body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(60000)});
      o.guard();if(!r.ok){let code;try{code=(await r.json()).error;}catch{}throw failure(code||'Photo request failed',r.status);}
      return r;
    }
    const json=async(...args)=>(await request(...args)).json();
    return {current:id=>json(id,'current-info'),reserve:(id,m)=>json(id,'uploads','POST',m),
      status:(id,u)=>json(id,'uploads/'+u),upload:(id,u,variant,blob)=>json(id,'uploads/'+u+'/'+variant,'PUT',blob),
      finalize:(id,u)=>json(id,'uploads/'+u+'/finalize','POST'),
      remove:(id,u)=>json(id,'uploads/'+u+'/remove','POST'),abandon:(id,u)=>json(id,'uploads/'+u+'/abandon','POST'),
      async view(id,thumbnail=false){
        const r=await request(id,thumbnail?'current-thumbnail':'current');
        if(r.headers.get('Content-Type')?.startsWith('application/json')){if(await r.json()===null)return null;throw failure('Invalid photo response');}
        if(!r.headers.get('Content-Type')?.startsWith('image/jpeg'))throw failure('Invalid photo response');
        const limit=thumbnail?524288:5242880,reader=r.body.getReader(),chunks=[];let size=0;
        try{while(true){const next=await reader.read();o.guard();if(next.done)break;size+=next.value.byteLength;
          if(size>limit){await reader.cancel();throw failure('Photo exceeds limit');}chunks.push(next.value);}}
        finally{reader.releaseLock();}
        if(size<1)throw failure('Empty photo');return new Blob(chunks,{type:'image/jpeg'});
      }};
  }
  function matches(result,m){
    return result?.upload_id===m.upload_id&&['sha256','byte_size','width','height','thumb_sha256','thumb_byte_size','thumb_width','thumb_height']
      .every(k=>result[k]===m[k]);
  }
  function createController(o){
    let busy=false;
    async function dispatch(e){
      if(o.enabled!==true)return {status:'disabled'};
      if(busy)return {status:'busy'};
      busy=true;
      try{return await o.lock('spotit-r2-photo-v1',async()=>{
        const scope=inspection.scopeKey(o.context()),key=o.key(),source=e.photoId,clock=o.now||Date.now;
        const guard=()=>{
          if(scope!==inspection.scopeKey(o.context())||key!==o.key()||!o.isCurrent(e)||e.photoId!==source)throw failure('Photo account or source changed');
          const eligible=eligibility(e,o.context(),o.durable(e),clock());if(!eligible.eligible)throw failure(eligible.reason);
        };
        const save=state=>{guard();if(o.save(e,{r2_photo:state})!==true||!o.durable(e))throw failure('Photo state persistence unconfirmed');};
        const api=createApi({...o,guard});let state=e.r2_photo?.status==='removed'?null:e.r2_photo,manifest;
        try{
          await o.verify();guard();
          if(state?.source_id===source&&state.retry_at>clock())return {status:'backoff'};
          const raw=await o.read(source+':raw');guard();if(!raw)throw failure('Original photo unavailable');
          const sourceHash=await photo.sha256(raw);guard();
          const validateSource=async()=>{const latest=await o.read(source+':raw');guard();
            if(!latest||await photo.sha256(latest)!==sourceHash)throw failure('Original photo changed');guard();};
          let envelope=state?.source_id===source?await o.read(state.payload_key):null;guard();
          if(envelope){
            manifest=envelope.manifest;
            if(state.source_sha256!==sourceHash||!matches(manifest,state.manifest)||!UUID.test(manifest.upload_id)
              ||!HASH.test(manifest.sha256)||!envelope.evidence||!envelope.thumbnail)throw failure('Saved photo intent changed');
          }else{
            if(state?.source_id===source)throw failure('Saved upload payload missing; review before creating another intent');
            const encode=o.encode||photo.encode;
            const evidence=await encode(raw,o.env||globalThis,1600);guard();
            const thumbnail=await encode(raw,o.env||globalThis,400);guard();
            if(thumbnail.blob.size>524288)throw failure('Thumbnail exceeds limit');
            const current=await api.current(e.id);guard();
            manifest={upload_id:(o.uuid||(()=>crypto.randomUUID()))(),sha256:await photo.sha256(evidence.blob),byte_size:evidence.blob.size,width:evidence.width,height:evidence.height,
              thumb_sha256:await photo.sha256(thumbnail.blob),thumb_byte_size:thumbnail.blob.size,thumb_width:thumbnail.width,thumb_height:thumbnail.height,
              expected_current_id:current?.upload_id||null};guard();
            const payloadKey='r2-upload-v1:'+manifest.upload_id;
            envelope={manifest,evidence:evidence.blob,thumbnail:thumbnail.blob};
            await o.add(payloadKey,envelope);guard();
            state={source_id:source,source_sha256:sourceHash,payload_key:payloadKey,manifest,status:'pending',attempts:0};save(state);
          }
          // Confirm both durable derivatives against their immutable digests on every retry.
          if(envelope.evidence.size!==manifest.byte_size||envelope.thumbnail.size!==manifest.thumb_byte_size
            ||await photo.sha256(envelope.evidence)!==manifest.sha256||await photo.sha256(envelope.thumbnail)!==manifest.thumb_sha256)throw failure('Saved upload bytes changed');guard();
          if(state.attempts>=8||state.status==='synced'){
            const recovered=await api.status(e.id,manifest.upload_id);guard();await validateSource();
            if(matches(recovered,manifest)&&recovered.state==='ready'&&recovered.finalized_at){
              save({...state,status:'synced',ack:recovered,error:'',retry_at:null});return {status:'synced'};
            }
            throw failure('Photo retry limit reached or current photo changed');
          }
          state={...state,status:'uploading',attempts:state.attempts+1,retry_at:null,error:''};save(state);
          let remote=await api.reserve(e.id,manifest);guard();
          if(!matches(remote,manifest))throw failure('Upload reservation differs');
          if(remote.state!=='ready'){
            if(!['reserved','uploaded'].includes(remote.state))throw failure('Upload is no longer active');
            await api.upload(e.id,manifest.upload_id,'evidence',envelope.evidence);guard();
            await api.upload(e.id,manifest.upload_id,'thumbnail',envelope.thumbnail);guard();
            await validateSource();
            remote=await api.finalize(e.id,manifest.upload_id);guard();
          }
          const confirmed=await api.status(e.id,manifest.upload_id);guard();
          if(!matches(confirmed,manifest)||confirmed.state!=='ready'||!confirmed.finalized_at)throw failure('Photo completion unconfirmed');
          await validateSource();
          save({...state,status:'synced',ack:confirmed,error:'',retry_at:null});return {status:'synced'};
        }catch(error){
          // Never write into a different account/workspace/source after awaits.
          try{guard();if(state?.source_id===source){const retry=!error.status||error.status>=500||[408,429].includes(error.status);
            save({...state,status:retry?'failed':'review',retry_at:retry?clock()+Math.min(1800000,30000*2**Math.max(0,state.attempts-1)):null,error:error.message});}}
          catch{}return {status:'held',reason:error.message};
        }
      });}finally{busy=false;}
    }
    return {dispatch,retryNow:dispatch,isBusy:()=>busy};
  }
  return {ENDPOINT,createApi,createController,matches,eligibility};
});
