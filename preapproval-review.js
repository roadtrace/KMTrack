/* Explicit local review only. Submission remains the existing runner's job. */
(function(root,factory){
  const api=factory(typeof module==='object' && module.exports ? require('./sync-queue') : root.SPOTITSync);
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SPOTITPreapprovalReview=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(sync){
  'use strict';
  const scope=c=>JSON.stringify([c?.userId,c?.workspaceUserId,c?.profile?.team,c?.profile?.role,c?.scopeGeneration,c?.sessionGeneration]);
  function reviewable(e,c){
    return sync.accountEligible(c) && !!e && e.preapproval_review_required===true &&
      !e.guest_claim_required && !e.importBatchId && !e.cloud_source && !e.remote_id &&
      !e.submission_snapshot && !e.submission_review_required && !e.sync_outcome_unknown &&
      ['pending','failed'].includes(e.sync_status) && (!e.user_id || e.user_id===c.userId);
  }
  function createReview(opts){
    function open(id){
      const c=opts.context(), entry=opts.entries().find(e=>e.id===id);
      if(!reviewable(entry,c) || !opts.durable(entry)) throw new Error('Verify an approved account online to review its saved inspections.');
      return {id,scope:scope(c),key:opts.key(),record:JSON.stringify(entry)};
    }
    async function decide(ticket,decision){
      if(!['submit','local'].includes(decision)) throw new Error('Choose Submit or Keep local.');
      const check=()=>{
        const c=opts.context(), rows=opts.entries(), e=rows.find(row=>row.id===ticket.id);
        if(ticket.cancelled || scope(c)!==ticket.scope || opts.key()!==ticket.key || !reviewable(e,c) ||
          JSON.stringify(e)!==ticket.record || !opts.durable(e)) throw new Error('Account, workspace, team or inspection changed. Reopen the review.');
        return {c,rows,e};
      };
      check();
      await opts.verify();
      const {c,rows,e}=check();
      const next={...e,preapproval_review_required:false,sync_status:decision==='local'?'local_only':'pending'};
      if(decision==='submit'){next.user_id=c.userId;next.team=c.profile.team;}
      // No await between final scope check, synchronous durable commit and publication.
      // The live entry stays held until readback succeeds. Persistence must fail closed.
      if(opts.persist(rows.map(row=>row===e?next:row),ticket.key)!==true) throw new Error('Review decision could not be saved. The inspection remains held.');
      Object.assign(e,next);
      if(decision==='submit') opts.wake();
      return next;
    }
    return {open,decide,pending:()=>opts.entries().filter(e=>reviewable(e,opts.context()))};
  }
  return {scope,reviewable,createReview};
});
