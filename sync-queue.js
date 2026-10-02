/* SPOTIT sync queue — the seam a future Supabase backend plugs into.
 *
 * This file deliberately contains NO network code, no Supabase import and no
 * auth. It decides *what* would be uploaded, in what order, and records the
 * outcome. A transport is injected by the caller, so the Supabase client can be
 * added later without touching the inspection system.
 *
 * New submissions use INSERT with the record's permanent UUID. A UUID conflict
 * must never overwrite an existing row. Unknown outcomes require the explicit
 * inspection API reconciliation seam; this queue does not invoke that seam.
 */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SPOTITSync=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  /* Reuse the entry model's status values when available so the two modules
   * cannot drift apart. */
  function resolveStatus(){
    try{
      if(typeof module==='object' && module.exports) return require('./entry-model.js').SYNC_STATUS;
    }catch(e){ /* fall through */ }
    if(root && root.SPOTITEntry && root.SPOTITEntry.SYNC_STATUS) return root.SPOTITEntry.SYNC_STATUS;
    return {PENDING:'pending',SYNCING:'syncing',SYNCED:'synced',FAILED:'failed',NEEDS_REVIEW:'needs_review',LOCAL_ONLY:'local_only'};
  }
  const STATUS=resolveStatus();
  const DEFAULT_BATCH=25;

  const isPending=e=>!!e && e.sync_status===STATUS.PENDING;
  const isFailed=e=>!!e && e.sync_status===STATUS.FAILED;
  const isSynced=e=>!!e && e.sync_status===STATUS.SYNCED;

  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const reviewRequired=e=>!!e && (e.guest_claim_required===true || e.preapproval_review_required===true || e.submission_review_required===true || e.sync_outcome_unknown===true);

  /* Pure eligibility: the caller supplies a fresh account/workspace context and
   * a storage check. Missing proof fails closed. Phase 11 checks still apply. */
  function automaticEligibility(entry,context,durable){
    const reject=reason=>({eligible:false,reason});
    if(!entry || !UUID.test(entry.id||'')) return reject('invalid-uuid');
    if(entry.guest_claim_required===true) return reject('guest-claim-required');
    if(entry.preapproval_review_required===true) return reject('preapproval-review-required');
    if(entry.submission_review_required===true) return reject('submission-review-required');
    if(entry.importBatchId || entry.cloud_source) return reject('imported-or-cloud-record');
    if(entry.remote_id || isSynced(entry)) return reject('already-submitted');
    if(entry.sync_status===STATUS.LOCAL_ONLY) return reject('local-only');
    if(entry.sync_status===STATUS.NEEDS_REVIEW || entry.sync_outcome_unknown===true) return reject('needs-review');
    if(entry.submission_snapshot && entry.submission_retry_allowed!==true) return reject('reconciliation-required');
    if(!isPending(entry) && !isFailed(entry)) return reject('not-pending');
    if(!context || context.mode!=='approved' || context.cloudVerified!==true || context.canUseLocal!==true ||
      !UUID.test(context.userId||'') || context.workspaceUserId!==context.userId || context.profile?.id!==context.userId ||
      context.profile.approved!==true || !['inspector','supervisor'].includes(context.profile.role) || !context.profile.team)
      return reject('account-verification-required');
    if(entry.user_id && entry.user_id!==context.userId || entry.team && entry.team!==context.profile.team) return reject('record-scope-mismatch');
    if(durable!==true) return reject('not-durable');
    return {eligible:true,reason:''};
  }
  function isUploadable(entry,scope){
    return automaticEligibility(entry,scope?.context,scope?.durable?.(entry)).eligible;
  }

  const pending=entries=>(entries||[]).filter(isPending);
  const failed=entries=>(entries||[]).filter(isFailed);
  const synced=entries=>(entries||[]).filter(isSynced);

  /* Pending first, then previously-failed retries, so a failed record is picked
   * up again on the next run without a separate pass. */
  function nextBatch(entries, limit, scope){
    const list=(entries||[]).filter(entry=>isUploadable(entry,scope));
    return list.filter(isPending).concat(list.filter(isFailed)).slice(0, limit||DEFAULT_BATCH);
  }

  function summary(entries, options){
    const list=entries||[];
    const counts={total:list.length,pending:0,syncing:0,synced:0,failed:0,needs_review:0,local_only:0,unsaved:0};
    for(const e of list){
      if(options?.durable && !options.durable(e)) counts.unsaved++;
      else if(!e) counts.needs_review++;
      else if(e.sync_status===STATUS.LOCAL_ONLY || e.importBatchId || e.cloud_source) counts.local_only++;
      else if(reviewRequired(e) || e.sync_status===STATUS.NEEDS_REVIEW) counts.needs_review++;
      else if(isSynced(e) && e.remote_id===e.id) counts.synced++;
      else if(isSynced(e) || e.remote_id) counts.needs_review++;
      else if(e.sync_status===STATUS.SYNCING) counts.syncing++;
      else if(isPending(e)) counts.pending++;
      else if(isFailed(e)) counts.failed++;
      else counts.needs_review++;
    }
    return counts;
  }

  /* True when the record has a photo that has not yet been pushed to a private
   * bucket. `photo_path` is the future object path; until it is set, the local
   * IndexedDB copy (keyed by photoId) is the source for a later upload. */
  function photoNeedsUpload(entry){
    return !!entry && !!entry.photoId && !entry.photo_path;
  }

  function markSynced(entry, meta){
    if(!entry) return entry;
    if(reviewRequired(entry) || [STATUS.LOCAL_ONLY,STATUS.NEEDS_REVIEW].includes(entry.sync_status)) return entry;
    if(!UUID.test(entry.id||'') || meta?.remoteId!==entry.id){
      entry.sync_status=STATUS.NEEDS_REVIEW;
      entry.sync_outcome_unknown=true;
      entry.sync_error='A matching server acknowledgement is required before marking this inspection submitted.';
      return entry;
    }
    entry.sync_status=STATUS.SYNCED;
    /* The server acknowledgement identifies the fixed UUID used by INSERT. */
    entry.remote_id=meta.remoteId;
    entry.sync_error='';
    entry.sync_attempts=entry.sync_attempts||0;
    entry.synced_at=new Date().toISOString();
    return entry;
  }

  function markFailed(entry, error){
    if(!entry || reviewRequired(entry) || [STATUS.LOCAL_ONLY,STATUS.NEEDS_REVIEW,STATUS.SYNCED].includes(entry.sync_status) || entry.remote_id) return entry;
    entry.sync_status=STATUS.FAILED;
    entry.sync_error=error==null?'':String(error && error.message ? error.message : error).slice(0,500);
    entry.sync_attempts=(entry.sync_attempts||0)+1;
    return entry;
  }

  function requeue(entry){
    if(entry && isFailed(entry) && !reviewRequired(entry) && !entry.remote_id) entry.sync_status=STATUS.PENDING;
    return entry;
  }

  function requeueAll(entries){
    for(const e of failed(entries)) requeue(e);
    return entries;
  }

  /* The integration point.
   *
   * A future `transport.upload(entry)` must INSERT using `entry.id` and return
   * an acknowledged `{remoteId}`. Conflicts/unknown outcomes must be handled
   * before acknowledgement. App transport remains disconnected in Phase 12.2.
   */
  function createQueue(options){
    const opts=options||{};
    const transport=opts.transport;
    const batchSize=opts.batchSize||DEFAULT_BATCH;
    const now=opts.now||(()=>Date.now());

    function ready(){
      return !!transport && typeof transport.upload==='function';
    }

    /* Never throws: a failed upload is recorded on the record itself. */
    async function drain(entries){
      if(!ready()) return {ok:false,reason:'no-transport',uploaded:0,failed:0};
      let uploaded=0,failures=0;
      for(const entry of nextBatch(entries,batchSize,opts.scope?.())){
        try{
          const result=await transport.upload(entry,{now});
          markSynced(entry,result);
          if(isSynced(entry)) uploaded++;
          else failures++;
        }catch(error){
          markFailed(entry,error);
          failures++;
        }
        if(typeof opts.onProgress==='function') opts.onProgress(summary(entries));
      }
      if(typeof opts.onChange==='function') opts.onChange(summary(entries));
      return {ok:true,uploaded,failed:failures};
    }

    return {ready,drain,summary:()=>summary([]),nextBatch:(entries,limit)=>nextBatch(entries,limit||batchSize,opts.scope?.())};
  }

  return {STATUS,DEFAULT_BATCH,isPending,isFailed,isSynced,automaticEligibility,isUploadable,pending,failed,synced,nextBatch,summary,photoNeedsUpload,markSynced,markFailed,requeue,requeueAll,createQueue};
});
