/* Phase 13B: local preparation only. No client, fetch, reservation or upload. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SPOTITPhotoUpload=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const STATUSES=Object.freeze(['photo_local','photo_pending','photo_uploading','photo_synced','photo_failed','photo_needs_review']);
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const HASH=/^[a-f0-9]{64}$/;
  const TEAM=/^[a-zA-Z0-9_-]+$/;
  const FRESH_MS=5*60*1000;
  function path(team,id,hash){
    if(!TEAM.test(team||'') || !UUID.test(id||'') || !HASH.test(hash||'')) throw Error('Invalid photo identity.');
    return `${team}/${id}/photo-v1-${hash}.jpg`;
  }
  function payloadKey(user,team,id){
    if(!UUID.test(user||'')) throw Error('Invalid owner.');
    path(team,id,'0'.repeat(64));
    return `photo-upload-v1:${user}:${team}:${id}`;
  }
  function validManifest(m){
    try{
      return !!m && m.version===1 && UUID.test(m.user_id) && m.workspace_user_id===m.user_id &&
        typeof m.source_photo_id==='string' && !!m.source_photo_id && m.source_key===m.source_photo_id+':raw' &&
        HASH.test(m.source_sha256) && HASH.test(m.stamped_sha256) && HASH.test(m.upload_sha256) &&
        m.payload_key===payloadKey(m.user_id,m.team,m.inspection_id) &&
        m.object_path===path(m.team,m.inspection_id,m.upload_sha256) && m.photo_path_intent===m.object_path &&
        m.photo_filename_intent===m.object_path.split('/').pop() &&
        m.intent_id===m.object_path && m.mime==='image/jpeg' && Number.isInteger(m.size) && m.size>0 && m.size<=5*1024*1024 &&
        Number.isInteger(m.width) && m.width>0 && Number.isInteger(m.height) && m.height>0 && Math.max(m.width,m.height)<=1600 &&
        m.quality===0.80 && m.stage==='prepared' && m.status==='photo_pending' && m.attempt_count===0 && m.next_retry_at===null &&
        Number.isFinite(Date.parse(m.created_at)) && Number.isFinite(Date.parse(m.updated_at));
    }catch(_){return false;}
  }
  function normalize(entry){
    const m=entry.photo_upload_manifest;
    let status=entry.photo_sync_status;
    if(m && (!validManifest(m) || m.inspection_id!==entry.id || m.user_id!==entry.user_id || m.team!==entry.team || m.source_photo_id!==entry.photoId || entry.photo_path && entry.photo_path!==m.object_path)) status='photo_needs_review';
    else if(!STATUSES.includes(status)) status=status ? 'photo_needs_review' : m ? 'photo_pending' : entry.photo_path ? 'photo_needs_review' : 'photo_local';
    // Interrupted dispatch retains immutable intent and must reconcile before
    // mutation. A path alone never supplies a durable cloud acknowledgement.
    if(status==='photo_uploading') status=validManifest(m)?'photo_pending':'photo_needs_review';
    if(status==='photo_synced' && !validAcknowledgement(entry)) status='photo_needs_review';
    if(status==='photo_pending' && !validManifest(m)) status='photo_needs_review';
    return {photo_sync_status:status,photo_sync_error:typeof entry.photo_sync_error==='string'?entry.photo_sync_error:''};
  }
  function validAcknowledgement(e){
    const m=e.photo_upload_manifest,a=e.photo_cloud_ack;
    return validManifest(m)&&!!a&&a.version===1&&a.inspection_id===e.id&&a.inspection_id===m.inspection_id&&
      a.user_id===e.user_id&&a.user_id===m.user_id&&a.team===e.team&&a.team===m.team&&
      a.object_path===m.object_path&&a.upload_sha256===m.upload_sha256&&e.photo_path===m.object_path&&
      e.photo_filename===m.photo_filename_intent&&Number.isFinite(Date.parse(a.verified_at));
  }
  function eligibility(e,c,durable,now=Date.now()){
    const no=reason=>({eligible:false,reason});
    if(!e || !UUID.test(e.id||'')) return no('invalid-uuid');
    if(e.guest_claim_required || e.guest_claim_pending) return no('guest-original-or-held-copy');
    if(e.importBatchId || e.cloud_source) return no('imported-record');
    if(e.sync_status==='local_only') return no('local-only');
    if(e.sync_status==='needs_review' || e.preapproval_review_required || e.submission_review_required || e.sync_outcome_unknown) return no('inspection-needs-review');
    if(e.sync_status!=='synced' || e.remote_id!==e.id) return no('inspection-not-synced');
    if(!c || c.mode!=='approved' || c.cloudVerified!==true || c.canUseLocal!==true ||
      !UUID.test(c.userId||'') || c.workspaceUserId!==c.userId || c.profile?.id!==c.userId ||
      c.profile.approved!==true || !['inspector','supervisor'].includes(c.profile.role) || !TEAM.test(c.profile.team||'') ||
      !Number.isFinite(c.verifiedAt) || now<c.verifiedAt || now-c.verifiedAt>FRESH_MS) return no('fresh-account-verification-required');
    if(e.user_id!==c.userId) return no('wrong-owner');
    if(e.team!==c.profile.team) return no('wrong-team');
    if(durable!==true) return no('not-durable');
    if(normalize(e).photo_sync_status==='photo_needs_review') return no('photo-needs-review');
    if(e.photo_path && !e.photo_upload_manifest) return no('existing-cloud-association');
    if(!e.photoId) return no('no-local-photo');
    return {eligible:true,reason:''};
  }
  function dimensions(width,height){
    if(!Number.isInteger(width) || !Number.isInteger(height) || width<1 || height<1) throw Error('Invalid source dimensions.');
    const scale=Math.min(1,1600/Math.max(width,height));
    return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
  }
  async function sha256(blob){
    const bytes=await blob.arrayBuffer();
    const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  }
  async function encode(raw,env=globalThis){
    // Browser image decoding applies EXIF display orientation; drawing to a
    // fresh canvas and JPEG encoding retains that appearance, not EXIF bytes.
    const image=new env.Image(),url=env.URL.createObjectURL(raw);
    try{
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Raw photo could not be decoded.'));image.src=url;});
      const size=dimensions(image.naturalWidth,image.naturalHeight);
      const canvas=env.document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
      const ctx=canvas.getContext('2d');if(!ctx) throw Error('Photo encoding unavailable.');
      ctx.drawImage(image,0,0,size.width,size.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.80));
      if(!blob || blob.type!=='image/jpeg' || !blob.size || blob.size>5*1024*1024) throw Error('Upload derivative could not be encoded within the pilot limit.');
      return {blob,...size};
    }finally{env.URL.revokeObjectURL(url);}
  }
  function sourceChanged(entry,reason='Local photo changed; immutable upload intent is held for review.'){
    if(entry.photo_upload_manifest){entry.photo_sync_status='photo_needs_review';entry.photo_sync_error=reason;}
  }
  function label(e){
    if(!e.photoId && !e.photo_upload_manifest && !e.photo_path) return '';
    // Held originals and local-only decisions never advertise cloud work.
    if(e.guest_claim_required || e.guest_claim_pending || e.preapproval_review_required || e.submission_review_required || e.sync_status==='local_only') return 'Photo local';
    const status=normalize(e).photo_sync_status;
    if(status==='photo_needs_review') return 'Photo needs review';
    const prefix=e.sync_status==='synced' && e.remote_id===e.id ? 'Inspection submitted · ' : '';
    if(e.photo_sync_status==='photo_uploading' && validManifest(e.photo_upload_manifest)) return 'Photo uploading';
    if(status==='photo_failed') return e.photo_next_retry_at ? 'Photo retry scheduled' : 'Photo retry needed';
    return prefix+(status==='photo_synced'?'photo synced':status==='photo_pending'?'photo pending':'photo local');
  }
  function createPreparer(o){
    const clock=o.now||Date.now;
    async function prepare(e){
      const c=o.context(),scope=JSON.stringify([c.userId,c.profile?.team,c.workspaceUserId,c.sessionGeneration,c.scopeGeneration,o.key()]);
      const sourceId=e.photoId;
      const guard=()=>{
        const n=o.context();
        if(scope!==JSON.stringify([n.userId,n.profile?.team,n.workspaceUserId,n.sessionGeneration,n.scopeGeneration,o.key()]) || !o.isCurrent(e)) throw Error('Photo preparation scope changed.');
        if(e.photoId!==sourceId) throw Error('Photo source changed during preparation.');
        const result=eligibility(e,n,o.durable(e),clock());if(!result.eligible) throw Error(result.reason);
      };
      const hold=reason=>{
        const n=o.context();
        if(scope===JSON.stringify([n.userId,n.profile?.team,n.workspaceUserId,n.sessionGeneration,n.scopeGeneration,o.key()]) && o.isCurrent(e))
          o.save(e,{photo_sync_status:'photo_needs_review',photo_sync_error:reason});
        return {status:'photo_needs_review',reason};
      };
      guard();
      if(normalize(e).photo_sync_status==='photo_synced') return {status:'photo_synced'};
      return o.lock(payloadKey(c.userId,c.profile.team,e.id),async()=>{
        guard();
        try{
          const key=payloadKey(c.userId,c.profile.team,e.id);
          const saved=await o.read(key);guard();
          const raw=await o.read(sourceId+':raw');guard();
          const stamped=await o.read(sourceId);guard();
          if(!raw) return hold('Raw photo missing; stamped fallback is not enabled.');
          if(!stamped) return hold('Local photo missing.');
          const rawHash=await sha256(raw);guard();const stampedHash=await sha256(stamped);guard();
          let envelope=saved;
          if(envelope){
            const m=envelope.manifest;
            if(!validManifest(m) || m.payload_key!==key || m.source_photo_id!==sourceId || m.source_sha256!==rawHash || m.stamped_sha256!==stampedHash ||
              !envelope.payload || envelope.payload.type!==m.mime || envelope.payload.size!==m.size || await sha256(envelope.payload)!==m.upload_sha256) return hold('Saved photo payload/source identity mismatch. Existing evidence retained.');
            guard();
            if(e.photo_upload_manifest && JSON.stringify(e.photo_upload_manifest)!==JSON.stringify(m)) return hold('Photo manifest conflicts with persisted intent.');
          }else{
            if(e.photo_upload_manifest) return hold('Immutable upload payload is missing. It will not be regenerated.');
            const derivative=await (o.encode||encode)(raw);guard();
            const hash=await sha256(derivative.blob);guard();
            const objectPath=path(c.profile.team,e.id,hash),stamp=new Date(clock()).toISOString();
            const m={version:1,inspection_id:e.id,user_id:c.userId,workspace_user_id:c.workspaceUserId,team:c.profile.team,
              source_photo_id:sourceId,source_key:sourceId+':raw',source_sha256:rawHash,stamped_sha256:stampedHash,
              payload_key:key,upload_sha256:hash,object_path:objectPath,intent_id:objectPath,
              photo_filename_intent:objectPath.split('/').pop(),photo_path_intent:objectPath,
              mime:derivative.blob.type,size:derivative.blob.size,width:derivative.width,height:derivative.height,quality:0.80,
              stage:'prepared',status:'photo_pending',attempt_count:0,next_retry_at:null,created_at:stamp,updated_at:stamp};
            if(!validManifest(m)) throw Error('Invalid upload derivative.');
            // An add-only atomic envelope joins manifest and payload. Never put
            // over an established intent, even after interrupted metadata save.
            await o.add(key,{manifest:m,payload:derivative.blob});guard();
            envelope=await o.read(key);guard();
            if(!envelope || JSON.stringify(envelope.manifest)!==JSON.stringify(m) || envelope.payload?.type!==m.mime || envelope.payload?.size!==m.size || await sha256(envelope.payload)!==hash) throw Error('Immutable photo save could not be confirmed.');
            guard();
          }
          // Detect same-key mutations during async decoding/persistence.
          const latestRaw=await o.read(sourceId+':raw');guard();const latestStamp=await o.read(sourceId);guard();
          if(!latestRaw || !latestStamp || await sha256(latestRaw)!==rawHash || await sha256(latestStamp)!==stampedHash) return hold('Photo source changed during preparation; payload retained.');
          guard();
          if(o.save(e,{photo_upload_manifest:envelope.manifest,photo_sync_status:'photo_pending',photo_sync_error:''})!==true) throw Error('Local manifest save could not be confirmed.');
          return {status:'photo_pending',manifest:envelope.manifest,payload:envelope.payload};
        }catch(error){return hold(error.message||'Photo preparation could not be confirmed.');}
      });
    }
    return {prepare};
  }
  return {STATUSES,FRESH_MS,path,payloadKey,validManifest,validAcknowledgement,normalize,eligibility,dimensions,sha256,encode,sourceChanged,label,createPreparer};
});
