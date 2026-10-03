/* Disabled-by-default, explicit first-photo protocol. No timers or runner wakeups. */
(function(root,factory){
  const api=typeof module==='object'&&module.exports
    ? factory(require('./photo-upload-state'),require('./photo-cloud-api'),require('./inspection-api'))
    : factory(root.SPOTITPhotoUpload,root.SPOTITPhotoCloud,root.SPOTITInspections);
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.SPOTITPhotoSync=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(photo,cloud,inspection){
  'use strict';
  const LOCK='kmtrack-photo-cloud-v1';
  function createController(o){
    const enabled=o.enabled===true,now=o.now||Date.now,random=o.random||Math.random;
    let busy=false;
    async function dispatch(e){
      if(!enabled) return {status:'disabled'};
      if(busy) return {status:'busy'};
      busy=true;
      try{
        if(typeof o.lock!=='function') return {status:'blocked',reason:'Safe photo locking unavailable.'};
        return await o.lock(LOCK,async()=>{
          const initial=o.context(),scope=inspection.scopeKey(initial),key=o.key();
          const m=structuredClone(e.photo_upload_manifest),identity=JSON.stringify(m);
          let payload;
          const guard=()=>{
            if(scope!==inspection.scopeKey(o.context())||key!==o.key()||!o.isCurrent(e)) cloud.failure('Photo scope changed.','scope');
            if(identity!==JSON.stringify(e.photo_upload_manifest)) cloud.failure('Immutable manifest changed.');
            const eligible=photo.eligibility(e,o.context(),o.durable(e),now());
            if(!eligible.eligible) cloud.failure(eligible.reason);
            if(!photo.validManifest(m)||m.inspection_id!==e.id||m.user_id!==e.user_id||m.team!==e.team) cloud.failure('Invalid photo manifest.');
          };
          const save=changes=>{
            guard();
            try{
              if(o.save(e,changes)!==true||!o.durable(e)) cloud.failure('Photo state persistence unconfirmed.','storage');
            }catch(_){cloud.failure('Photo state persistence unconfirmed.','storage');}
          };
          async function validate(){
            guard();
            const envelope=await o.read(m.payload_key);guard();
            const raw=await o.read(m.source_key);guard();
            const stamped=await o.read(m.source_photo_id);guard();
            if(!envelope||JSON.stringify(envelope.manifest)!==identity||!raw||!stamped||!envelope.payload||
              envelope.payload.type!==m.mime||envelope.payload.size!==m.size) cloud.failure('Immutable photo evidence missing or changed.');
            const hashes=await Promise.all([photo.sha256(raw),photo.sha256(stamped),photo.sha256(envelope.payload)]);guard();
            if(hashes[0]!==m.source_sha256||hashes[1]!==m.stamped_sha256||hashes[2]!==m.upload_sha256) cloud.failure('Photo source or payload hash changed.');
            payload=envelope.payload;
          }
          async function authorize(){
            // Fresh online profile verification before each API operation,
            // including each mutation; guards reject late account/team changes.
            try{await o.verify();}catch(_){cloud.failure('Fresh photo authorization unavailable.');}
            guard();
            const user=await o.client.auth.getUser();guard();
            if(user.error||user.data?.user?.id!==m.user_id) cloud.failure('Authenticated photo owner changed.');
          }
          const api=cloud.createApi({client:o.client,enabled,authorize,validate});
          function rowState(row){
            guard();
            let expected;
            try{expected=e.submission_snapshot?.row||inspection.submissionSnapshot({...e,sync_status:'pending',remote_id:'',submission_snapshot:null},o.context()).row;}
            catch(_){cloud.failure('Synced inspection identity unavailable.');}
            if(row.id!==m.inspection_id||row.user_id!==m.user_id||row.team!==m.team||
              expected.id!==row.id||expected.user_id!==row.user_id||expected.team!==row.team||
              !Number.isFinite(Date.parse(row.created_at))||Date.parse(row.created_at)!==Date.parse(expected.created_at)||
              !Number.isFinite(Date.parse(row.inspected_at))||Date.parse(row.inspected_at)!==Date.parse(expected.inspected_at)) cloud.failure('Cloud inspection identity differs.');
            if(row.photo_filename===null&&row.photo_path===null) return 'empty';
            if(row.photo_filename===m.photo_filename_intent&&row.photo_path===m.object_path) return 'reserved';
            cloud.failure('Cloud photo association conflicts with immutable intent.');
          }
          async function objectProof(){
            const result=await api.download(m);guard();
            if(result.missing) return false;
            if(result.path!==m.object_path||result.blob.size!==m.size||await photo.sha256(result.blob)!==m.upload_sha256) cloud.failure('Cloud object hash differs.');
            guard();return true;
          }
          try{
            // Cached approval alone cannot authorize even a recovery read.
            guard();
            if(e.photo_sync_status==='photo_synced') return {status:'photo_synced'};
            const attempts=e.photo_attempt_count??0;
            if(!Number.isInteger(attempts)||attempts<0||attempts>=8) cloud.failure('Photo retry limit or counter requires review.');
            if(e.photo_next_retry_at && (!Number.isFinite(Date.parse(e.photo_next_retry_at)))) cloud.failure('Invalid photo retry time.');
            if(e.photo_next_retry_at&&Date.parse(e.photo_next_retry_at)>now()) return {status:'backoff'};
            await authorize();await validate();
            // Persist unknown-in-flight state before any cloud dispatch.
            save({photo_sync_status:'photo_uploading',photo_sync_error:'',photo_attempt_count:attempts+1,photo_next_retry_at:null});
            let state=rowState(await api.readRow(m));guard();
            if(state==='empty'){
              let reservationError;
              try{await api.reserve(m);}catch(error){reservationError=error;}
              guard();
              state=rowState(await api.readRow(m));
              if(state!=='reserved'){
                if(reservationError) throw reservationError;
                cloud.failure('Reservation not confirmed.');
              }
            }
            // Every attempt/restart downloads before uploading. Unknown reads
            // never authorize upload; explicit absence permits same-path INSERT.
            let verified=await objectProof();
            if(!verified){
              await validate();
              // Recheck row directly before upload (reservation can change).
              if(rowState(await api.readRow(m))!=='reserved') cloud.failure('Reservation changed before upload.');
              let uploadError;
              try{await api.upload(m,payload);}catch(error){uploadError=error;}
              guard();
              verified=await objectProof();
              if(!verified){
                if(uploadError&&cloud.errorKind(uploadError)==='review'&&!['Duplicate','ResourceAlreadyExists','23505'].includes(String(uploadError.code))) throw uploadError;
                cloud.failure('Reserved object is missing; reconcile on retry.','retry');
              }
            }
            await authorize();await validate();
            if(rowState(await api.readRow(m))!=='reserved') cloud.failure('Final reservation changed.');
            // The final row request is asynchronous too: source may have
            // changed while it was in flight. Check exact bytes once more.
            await validate();
            guard();
            save({photo_sync_status:'photo_synced',photo_sync_error:'',photo_next_retry_at:null,
              photo_cloud_ack:{version:1,inspection_id:m.inspection_id,user_id:m.user_id,team:m.team,
                object_path:m.object_path,upload_sha256:m.upload_sha256,verified_at:new Date(now()).toISOString()},
              photo_filename:m.photo_filename_intent,photo_path:m.object_path});
            return {status:'photo_synced'};
          }catch(error){
            if(error.photoKind==='scope') return {status:'stale'};
            // Never persist into a changed account or a changed workspace.
            if(scope!==inspection.scopeKey(o.context())||key!==o.key()||!o.isCurrent(e)) return {status:'stale'};
            if(error.photoKind==='storage') return {status:'storage-error'};
            const retry=cloud.errorKind(error)==='retry'&&(e.photo_attempt_count||0)<8;
            const count=e.photo_attempt_count||0;
            const delay=Math.min(30*60*1000,30000*2**Math.max(0,count-1)*(0.8+0.4*random()));
            // Guard-free hold can preserve a conflicting source/manifest, but
            // the adapter must still compare/save/readback the whole workspace.
            const changes={photo_sync_status:retry?'photo_failed':'photo_needs_review',photo_sync_error:error.message||'Photo operation unconfirmed.',
              photo_next_retry_at:retry?new Date(now()+delay).toISOString():null};
            try{if(o.save(e,changes)!==true||!o.durable(e)) return {status:'storage-error'};}
            catch(_){return {status:'storage-error'};}
            return {status:changes.photo_sync_status};
          }
        });
      }finally{busy=false;}
    }
    return {dispatch,isBusy:()=>busy,enabled};
  }
  return {LOCK,createController};
});
