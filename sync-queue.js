/* SPOTIT sync queue — the seam a future Supabase backend plugs into.
 *
 * This file deliberately contains NO network code, no Supabase import and no
 * auth. It decides *what* would be uploaded, in what order, and records the
 * outcome. A transport is injected by the caller, so the Supabase client can be
 * added later without touching the inspection system.
 *
 * Duplicate safety: uploads are addressed by the record's permanent UUID
 * (`entry.id`) and applied as an upsert, so retrying a failed upload — or
 * re-running the whole queue — can never create a second cloud row.
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
    return {PENDING:'pending',SYNCED:'synced',FAILED:'failed'};
  }
  const STATUS=resolveStatus();
  const DEFAULT_BATCH=25;

  const isPending=e=>!!e && e.sync_status===STATUS.PENDING;
  const isFailed=e=>!!e && e.sync_status===STATUS.FAILED;
  const isSynced=e=>!!e && e.sync_status===STATUS.SYNCED;

  /* A record is uploadable only once it has a permanent UUID. Without one a
   * retry could not be de-duplicated, so it is never sent. */
  function isUploadable(entry){
    return !!entry && typeof entry.id==='string' && entry.id.length>0 && !isSynced(entry);
  }

  const pending=entries=>(entries||[]).filter(isPending);
  const failed=entries=>(entries||[]).filter(isFailed);
  const synced=entries=>(entries||[]).filter(isSynced);

  /* Pending first, then previously-failed retries, so a failed record is picked
   * up again on the next run without a separate pass. */
  function nextBatch(entries, limit){
    const list=(entries||[]).filter(isUploadable);
    return list.filter(isPending).concat(list.filter(isFailed)).slice(0, limit||DEFAULT_BATCH);
  }

  function summary(entries){
    const list=entries||[];
    let p=0,s=0,f=0;
    for(const e of list){
      if(isSynced(e)) s++;
      else if(isFailed(e)) f++;
      else p++;
    }
    return {total:list.length,pending:p,synced:s,failed:f};
  }

  /* True when the record has a photo that has not yet been pushed to a private
   * bucket. `photo_path` is the future object path; until it is set, the local
   * IndexedDB copy (keyed by photoId) is the source for a later upload. */
  function photoNeedsUpload(entry){
    return !!entry && !!entry.photoId && !entry.photo_path;
  }

  function markSynced(entry, meta){
    if(!entry) return entry;
    entry.sync_status=STATUS.SYNCED;
    /* Keep the server's id when it returns one, but the record's own UUID is
     * always a valid key — upsert is keyed on that. */
    entry.remote_id=(meta && meta.remoteId) || entry.remote_id || entry.id;
    entry.sync_error='';
    entry.sync_attempts=entry.sync_attempts||0;
    entry.synced_at=new Date().toISOString();
    return entry;
  }

  function markFailed(entry, error){
    if(!entry) return entry;
    entry.sync_status=STATUS.FAILED;
    entry.sync_error=error==null?'':String(error && error.message ? error.message : error).slice(0,500);
    entry.sync_attempts=(entry.sync_attempts||0)+1;
    return entry;
  }

  function requeue(entry){
    if(entry) entry.sync_status=STATUS.PENDING;
    return entry;
  }

  function requeueAll(entries){
    for(const e of failed(entries)) requeue(e);
    return entries;
  }

  /* The integration point.
   *
   * `transport.upload(entry)` must upsert by `entry.id` and resolve to an
   * optional `{remoteId}`. Anything it throws marks the record failed and it is
   * retried on the next drain with the same UUID.
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
      for(const entry of nextBatch(entries,batchSize)){
        try{
          const result=await transport.upload(entry,{now});
          markSynced(entry,result);
          uploaded++;
        }catch(error){
          markFailed(entry,error);
          failures++;
        }
        if(typeof opts.onProgress==='function') opts.onProgress(summary(entries));
      }
      if(typeof opts.onChange==='function') opts.onChange(summary(entries));
      return {ok:true,uploaded,failed:failures};
    }

    return {ready,drain,summary:()=>summary([]),nextBatch:(entries,limit)=>nextBatch(entries,limit||batchSize)};
  }

  return {STATUS,DEFAULT_BATCH,isPending,isFailed,isSynced,isUploadable,pending,failed,synced,nextBatch,summary,photoNeedsUpload,markSynced,markFailed,requeue,requeueAll,createQueue};
});
