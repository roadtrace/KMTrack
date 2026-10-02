/* Explicit, local-only Guest -> account copy. No cloud transport. */
(function(root,factory){
  const node=typeof module==='object' && module.exports;
  const api=factory(node?require('./sync-queue'):root.SPOTITSync,node?require('./entry-model'):root.SPOTITEntry,
    node?require('./local-entry-store'):root.SPOTITLocalStore,node?require('./preapproval-review'):root.SPOTITPreapprovalReview);
  if(node) module.exports=api;
  if(root) root.SPOTITGuestClaim=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(sync,model,store,review){
  'use strict';
  const LEDGER_KEY='kmtrack_guest_claims_v1';
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const content=['type','timestamp','lat','lon','km','expressway','interchange','interchangeSegment','bound','lane','notes','inspector','photoFilename','photoTimestamp','photoAvailable','created_at'];
  function sourceEligible(e){
    return !!e && UUID.test(e.id||'') && Number.isFinite(e.lat) && Math.abs(e.lat)<=90 && Number.isFinite(e.lon) && Math.abs(e.lon)<=180 && e.guest_claim_required===true && !e.importBatchId && !e.cloud_source &&
      !e.remote_id && !e.submission_snapshot && !e.submission_review_required && !e.sync_outcome_unknown &&
      ['pending','failed'].includes(e.sync_status);
  }
  function validLink(c){
    try{
      const source=JSON.parse(c.source);
      return UUID.test(c.guestId||'') && UUID.test(c.copyId||'') && c.copyId!==c.guestId && UUID.test(c.userId||'') &&
        sourceEligible(source) && source.id===c.guestId && typeof c.team==='string' && !!c.team &&
        c.photoId===(source.photoId?`${c.copyId}:claim-photo`:'') && ['reserved','complete'].includes(c.status);
    }catch(_){return false;}
  }
  async function confirmLocalPhoto(read,sourceId,copyId,guard){
    guard();
    for(const suffix of ['',':raw']){
      const source=await read(sourceId+suffix);guard();const copy=await read(copyId+suffix);guard();
      if(!suffix && !source) throw Error('Guest photo is unavailable. Claim remains incomplete.');
      if(!source || !copy){if(source!==copy) throw Error('Claim photo is unavailable or changed.');continue;}
      const [a,b]=await Promise.all([source.arrayBuffer(),copy.arrayBuffer()]);guard();
      const x=new Uint8Array(a),y=new Uint8Array(b);
      if(x.length!==y.length || !x.every((v,i)=>v===y[i])) throw Error('Claim photo differs from the Guest evidence.');
    }
  }
  async function copyLocalPhoto(read,write,sourceId,copyId,guard){
    if(!sourceId || !copyId || sourceId===copyId) throw Error('A separate local claim photo is required.');
    guard();
    const stamped=await read(sourceId); guard();
    const raw=await read(sourceId+':raw'); guard();
    if(!stamped) throw Error('Guest photo is unavailable. Claim remains incomplete.');
    await write(copyId,stamped); guard();
    if(raw){await write(copyId+':raw',raw);guard();}
    async function same(a,b){
      if(!a || !b) return a===b;
      const [x,y]=await Promise.all([a.arrayBuffer(),b.arrayBuffer()]);guard();
      const aBytes=new Uint8Array(x),bBytes=new Uint8Array(y);
      return x.byteLength===y.byteLength && aBytes.every((value,i)=>value===bBytes[i]);
    }
    for(const [from,to,original] of [[sourceId,copyId,stamped],[sourceId+':raw',copyId+':raw',raw]]){
      const source=await read(from);guard();const copied=await read(to);guard();
      if(!await same(original,source) || !await same(original,copied)) throw Error('Local photo changed or could not be confirmed. Claim remains incomplete.');
    }
  }
  function createClaims(opts){
    function guests(){
      const rows=JSON.parse(opts.storage.getItem(opts.guestKey)||'[]');
      if(!Array.isArray(rows)) throw Error('Guest workspace could not be read safely.');
      return rows;
    }
    function ledger(){
      const raw=opts.storage.getItem(LEDGER_KEY), value=raw===null?{version:1,claims:[]}:JSON.parse(raw);
      if(value?.version!==1 || !Array.isArray(value.claims) ||
        value.claims.some(c=>!validLink(c)) ||
        new Set(value.claims.map(c=>c.guestId)).size!==value.claims.length ||
        new Set(value.claims.map(c=>c.copyId)).size!==value.claims.length) throw Error('Guest claim history needs review; no new copy will be created.');
      return value;
    }
    function linked(source){return ledger().claims.find(c=>c.guestId===source.id);}
    function status(source){
      const link=linked(source);
      if(!link) return opts.entries().some(e=>e.guest_claim_source_id===source.id)?'conflict':'unclaimed';
      if(link.source!==JSON.stringify(source)) return 'source-changed';
      if(link.userId!==opts.context()?.userId) return 'other-account';
      const copies=opts.entries().filter(e=>e.guest_claim_source_id===source.id);
      if(copies.length>1 || copies.some(e=>e.id!==link.copyId)) return 'conflict';
      if(copies[0] && copies[0].guest_claim_pending!==true) return 'claimed';
      if(link.status==='complete' && !copies[0]) return 'copy-missing';
      return 'recoverable';
    }
    function list(){
      if(!sync.accountEligible(opts.context())) return [];
      return guests().filter(sourceEligible).map(source=>({source,status:status(source)}));
    }
    function open(id){
      if(!sync.accountEligible(opts.context())) throw Error('Verify an approved Inspector or Supervisor in its bound workspace online first.');
      const matches=guests().filter(e=>e.id===id), source=matches[0];
      if(matches.length!==1 || !sourceEligible(source)) throw Error('This Guest inspection cannot be claimed.');
      const state=status(source);
      if(!['unclaimed','recoverable','claimed'].includes(state)) throw Error('This Guest inspection has a previous claim or changed content. No new copy will be created.');
      return {id,source:JSON.stringify(source),scope:review.scope(opts.context()),key:opts.accountKey(),cancelled:false};
    }
    function check(ticket){
      const c=opts.context(), matches=guests().filter(e=>e.id===ticket.id);
      if(ticket.cancelled || !sync.accountEligible(c) || review.scope(c)!==ticket.scope ||
        opts.accountKey()!==ticket.key || matches.length!==1 || JSON.stringify(matches[0])!==ticket.source || !sourceEligible(matches[0]))
        throw Error('Account, workspace, team or Guest inspection changed. Reopen the claim review.');
      // The complete destination must still match memory before any local mutation.
      if((opts.storage.getItem(ticket.key)??'[]')!==JSON.stringify(opts.entries())) throw Error('Account workspace changed or is not saved. Reopen after reload.');
      return {c,source:matches[0]};
    }
    function saveLedger(ticket,updated){
      check(ticket);
      const previous=opts.storage.getItem(LEDGER_KEY);
      try { store.save(opts.storage,LEDGER_KEY,updated); }
      catch(error){
        if(previous===null) opts.storage.removeItem(LEDGER_KEY); else opts.storage.setItem(LEDGER_KEY,previous);
        throw error;
      }
    }
    function persistRows(ticket,rows){
      check(ticket);
      if(opts.persist(rows,ticket.key)!==true) throw Error('Claim copy could not be saved. Guest original remains untouched.');
      opts.publish(rows);
    }
    async function claim(ticket){
      if(typeof opts.lock!=='function') throw Error('Safe claim locking is unavailable in this browser. No copy was created.');
      return opts.lock(async()=>{
        check(ticket);
        await opts.verify();
        const {c,source}=check(ticket);
        let history=ledger(), link=history.claims.find(row=>row.guestId===ticket.id);
        if(link && (link.source!==ticket.source || link.userId!==c.userId || link.team!==c.profile.team))
          throw Error('Previous claim has different content, owner or team. No new copy will be created.');
        let copies=opts.entries().filter(e=>e.guest_claim_source_id===ticket.id);
        if(copies.length>1 || copies.length && (!link || copies[0].id!==link.copyId)) throw Error('Conflicting claim history. No new copy will be created.');
        if(copies[0] && (!store.contains(opts.storage,ticket.key,copies[0]) || copies[0].guest_claim_source_record!==ticket.source || copies[0].user_id!==c.userId || copies[0].team!==c.profile.team))
          throw Error('Existing claimed copy cannot be safely recovered.');
        if(link?.status==='complete' && !copies.length) throw Error('Claimed copy is missing locally. The original will not be claimed again.');
        if(copies[0] && copies[0].guest_claim_pending!==true) return {status:'already-claimed',entry:copies[0]};
        if(copies[0]){
          const expected=model.createEntry({...Object.fromEntries(content.filter(key=>Object.hasOwn(source,key)).map(key=>[key,source[key]])),id:link.copyId});
          if(content.some(key=>(key!=='created_at' || source.created_at) && copies[0][key]!==expected[key]) ||
            copies[0].photoId!==link.photoId || copies[0].preapproval_review_required || copies[0].submission_review_required || copies[0].sync_outcome_unknown)
            throw Error('Incomplete claimed copy was edited or held. No automatic release is allowed.');
          if(source.photoId){await opts.verifyPhoto(source.photoId,link.photoId,()=>check(ticket));check(ticket);}
        }
        if(!link){
          const id=(opts.uuid||model.uuid)();
          if(!UUID.test(id) || id===source.id || opts.entries().some(e=>e.id===id) || history.claims.some(row=>row.copyId===id)) throw Error('A unique claim UUID could not be created.');
          link={guestId:source.id,source:ticket.source,userId:c.userId,team:c.profile.team,copyId:id,
            photoId:source.photoId?`${id}:claim-photo`:'',status:'reserved'};
          history={version:1,claims:[...history.claims,link]};
          saveLedger(ticket,history);
        }
        if(!copies.length){
          if(source.photoId){await opts.copyPhoto(source.photoId,link.photoId,()=>check(ticket));check(ticket);}
          const fields=Object.fromEntries(content.filter(key=>Object.hasOwn(source,key)).map(key=>[key,source[key]]));
          const copy=model.createEntry({...fields,id:link.copyId,photoId:link.photoId,user_id:c.userId,team:c.profile.team,
            guest_claim_source_id:source.id,guest_claim_source_record:ticket.source,guest_claim_pending:true,
            guest_claim_required:true,preapproval_review_required:false,sync_status:'pending'});
          persistRows(ticket,[...opts.entries(),copy]);
          copies=[copy];
        }
        // Completion tombstone precedes eligibility. Deleted copies cannot be re-claimed.
        history=ledger();
        if(link.status!=='complete') saveLedger(ticket,{...history,claims:history.claims.map(row=>row.guestId===ticket.id?{...row,status:'complete'}:row)});
        const held=copies[0];
        if(held.guest_claim_required!==true || held.submission_snapshot || held.remote_id || held.sync_status!=='pending') throw Error('Claimed copy needs manual review before release.');
        const released={...held,guest_claim_pending:false,guest_claim_required:false};
        persistRows(ticket,opts.entries().map(e=>e.id===held.id?released:e));
        opts.wake();
        return {status:'claimed',entry:released};
      });
    }
    return {list,open,claim,status};
  }
  return {LEDGER_KEY,sourceEligible,copyLocalPhoto,confirmLocalPhoto,createClaims};
});
