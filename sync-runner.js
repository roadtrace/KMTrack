/* Serial NEW-inspection runner. All cloud access stays in the guarded inspection
 * API; this module never maps rows, patches inspections, or handles photos. */
(function(root,factory){
  const api=factory(typeof module==='object' && module.exports ? require('./sync-queue') : root.SPOTITSync,
    typeof module==='object' && module.exports ? require('./inspection-api') : root.SPOTITInspections);
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SPOTITSyncRunner=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(queue,inspections){
  'use strict';
  const RETRY=Object.freeze({BASE_MS:30000,MAX_MS:1800000,MAX_ATTEMPTS:8,JITTER:0.2,BATCH_SIZE:25});
  function retryDelay(attempt,random=Math.random){
    const base=Math.min(RETRY.MAX_MS,RETRY.BASE_MS*2**Math.min(30,Math.max(0,attempt-1)));
    const sample=Math.max(0,Math.min(1,random()));
    return Math.min(RETRY.MAX_MS,Math.round(base*(1-RETRY.JITTER+2*RETRY.JITTER*sample)));
  }
  function retryTime(entry){
    if(entry.sync_next_retry_at==null || entry.sync_next_retry_at==='') return 0;
    const value=typeof entry.sync_next_retry_at==='string'?Date.parse(entry.sync_next_retry_at):NaN;
    return Number.isFinite(value)?value:Infinity;
  }
  function needsReconciliation(entry){
    return !!entry.submission_snapshot && (entry.sync_outcome_unknown===true || entry.submission_retry_allowed!==true);
  }
  function eligible(entry,context,durable){
    if(!entry) return false;
    // Recovery is permission to SELECT, never permission to INSERT. Permanent
    // review flags and all account/record exclusions remain authoritative.
    // A previous session can leave syncing in memory without a page restart.
    // The global API lock ensures it is reconciled only after that operation ends.
    const recovery=needsReconciliation(entry) && ['pending','failed','needs_review','syncing'].includes(entry.sync_status);
    const candidate=recovery?{...entry,sync_status:'pending',sync_outcome_unknown:false,submission_snapshot:null}:entry;
    return queue.automaticEligibility(candidate,context,durable).eligible;
  }
  function ordered(entries,context,durable){
    return (entries||[]).map((entry,index)=>({entry,index,time:Date.parse(entry?.created_at)}))
      .filter(item=>eligible(item.entry,context,true) && durable(item.entry))
      .sort((a,b)=>(Number.isFinite(a.time)?a.time:Infinity)-(Number.isFinite(b.time)?b.time:Infinity)||a.index-b.index)
      .map(item=>item.entry);
  }
  function createRunner(options){
    const {api,entries,context,durable,persist}=options;
    const now=options.now||Date.now,random=options.random||Math.random;
    const setTimer=options.setTimer||setTimeout,clearTimer=options.clearTimer||clearTimeout;
    const available=options.available||(()=>true);
    let running=null,timer=null,epoch=0,paused='',activeId='',runScope='',rerun=false,closed=false;
    const state=()=>({running:!!running,activeId,paused,waitingUntil:nextTime()});
    const emit=()=>{if(options.onChange) options.onChange(state());};
    const ready=()=>!!api && typeof api.insertOne==='function' && typeof api.reconcileOne==='function';
    const list=()=>ordered(entries(),context(),options.durableSnapshot?options.durableSnapshot():durable);
    function nextTime(){
      if(!ready() || closed || paused || !queue.accountEligible(context())) return null;
      const times=list().map(retryTime).filter(Number.isFinite);
      return times.length?Math.min(...times):null;
    }
    function current(entry,scope,token){
      return !closed && epoch===token && queue.accountEligible(context()) && inspections.scopeKey(context())===scope && entries().includes(entry);
    }
    function save(entry,changes,scope,token){
      if(!current(entry,scope,token)) return false;
      const before={...entry};Object.assign(entry,changes);
      try{
        if(persist(entry)!==true || !durable(entry)) throw Error('Local sync state save could not be confirmed.');
        return true;
      }catch(_){
        for(const key of Object.keys(entry)) if(!(key in before)) delete entry[key];
        Object.assign(entry,before);paused='storage';cancelTimer();return false;
      }
    }
    function review(entry,reason,scope,token,extra={}){
      save(entry,{...extra,sync_status:'needs_review',submission_review_required:true,submission_retry_allowed:false,sync_next_retry_at:null,sync_error:reason},scope,token);
      return {status:'needs-review'};
    }
    function transient(entry,scope,token){
      const count=Math.min(RETRY.MAX_ATTEMPTS,Math.max(0,Math.floor(entry.sync_attempts||0))+1);
      if(count>=RETRY.MAX_ATTEMPTS){
        return review(entry,'Automatic retry limit reached. Review this inspection before further submission.',scope,token,{sync_attempts:count});
      }
      const next=new Date(now()+retryDelay(count,random)).toISOString();
      save(entry,{sync_status:'failed',sync_attempts:count,sync_next_retry_at:next,submission_retry_allowed:false,
        sync_error:entry.submission_snapshot?'Submission unconfirmed; reconciliation will precede retry.':'Connection failed; a later retry is scheduled.'},scope,token);
      return {status:'retrying'};
    }
    async function process(entry,scope,token){
      if(!current(entry,scope,token) || !eligible(entry,context(),durable(entry))) return {status:'skipped'};
      if(!Number.isFinite(retryTime(entry))) return review(entry,'Retry schedule is invalid. Review required before submission.',scope,token);
      if(entry.sync_attempts>=RETRY.MAX_ATTEMPTS) return review(entry,'Automatic retry limit reached. Review this inspection before further submission.',scope,token);
      activeId=entry.id;emit();
      try{
        if(needsReconciliation(entry)){
          const recovered=await api.reconcileOne(entry);
          if(!current(entry,scope,token)) return {status:'scope-changed'};
          if(entry.submission_review_required) return {status:'needs-review'};
          if(recovered.status==='matching') return {status:'submitted'};
          if(recovered.status==='transient-failure') return transient(entry,scope,token);
          if(recovered.status==='permanent-failure') return review(entry,'Cloud read was rejected permanently. Review the submission.',scope,token);
          if(recovered.status==='inaccessible'){
            if(entry.submission_uuid_conflict) return review(entry,'Conflicting UUID is inaccessible; another INSERT is blocked.',scope,token);
            paused='authorization';return {status:'paused'};
          }
          if(recovered.status==='not-durable'){paused='storage';return {status:'paused'};}
          if(recovered.status==='busy'){paused='busy';return recovered;}
          if(recovered.status!=='no-row' || recovered.retryAllowed!==true) return {status:'needs-review'};
        }
        // Recheck after every await. Only the API's durably saved NO ROW proof
        // can release an uncertain original snapshot for a controlled INSERT.
        if(!current(entry,scope,token) || !queue.automaticEligibility(entry,context(),durable(entry)).eligible) return {status:'skipped'};
        const result=await api.insertOne(entry);
        if(!current(entry,scope,token)) return {status:'scope-changed'};
        if(result.status==='inserted') return {status:'submitted'};
        if(result.status==='busy'){paused='busy';return result;}
        if(result.status==='id-conflict') return review(entry,'UUID conflict. Automatic handling stopped; no overwrite occurred.',scope,token);
        return {status:'needs-review'};
      }catch(error){
        if(!current(entry,scope,token)) return {status:'scope-changed'};
        const kind=inspections.classifyFailure(error);
        if(kind==='authorization' || kind==='scope'){paused='authorization';return {status:'paused'};}
        if(kind==='storage'){paused='storage';return {status:'paused'};}
        if(!eligible(entry,context(),durable(entry))) return {status:'needs-review'};
        if(kind==='permanent') return review(entry,'Submission was rejected or invalid. Review the inspection; automatic retry is blocked.',scope,token);
        return transient(entry,scope,token);
      }finally{activeId='';emit();}
    }
    function cancelTimer(){if(timer!==null) clearTimer(timer);timer=null;}
    function schedule(){
      cancelTimer();
      if(running || paused || closed || !available()) return;
      const time=nextTime();
      if(time!==null) timer=setTimer(()=>{timer=null;wake('timer');},Math.max(0,time-now()));
    }
    async function drain(token,scope){
      const seen=new Set();let submitted=0;
      while(!closed && epoch===token && !paused && available() && inspections.scopeKey(context())===scope && queue.accountEligible(context()) && seen.size<RETRY.BATCH_SIZE){
        const entry=list().find(candidate=>!seen.has(candidate) && (retryTime(candidate)<=now() || !Number.isFinite(retryTime(candidate))));
        if(!entry) break;
        seen.add(entry);
        const result=await process(entry,scope,token);
        if(result.status==='submitted') submitted++;
        // Let foreground input/paint run between records. The next iteration
        // rechecks scope, eligibility and fresh persisted state after the yield.
        if(options.yieldToUI) await options.yieldToUI();
      }
      return {submitted,paused};
    }
    function launch(operation){
      cancelTimer();const token=epoch,scope=inspections.scopeKey(context());runScope=scope;
      running=Promise.resolve().then(()=>operation(token,scope)).finally(()=>{
        running=null;activeId='';emit();
        if(rerun){rerun=false; if(!closed) timer=setTimer(()=>{timer=null;wake('saved');},0);}
        else schedule();
      });
      emit();return running;
    }
    function wake(reason='startup'){
      if(closed || !ready()) return Promise.resolve({status:'disabled'});
      if(running){
        if(inspections.scopeKey(context())!==runScope){
          rerun=true;
          if(reason==='verified' && queue.accountEligible(context())) paused='';
        }else if(reason==='saved') rerun=true;
        return running;
      }
      if(['startup','verified','retry-now','manual-finished'].includes(reason)) paused='';
      if(paused || !queue.accountEligible(context()) || !available()){cancelTimer();emit();return Promise.resolve({status:'paused'});}
      return launch((token,scope)=>drain(token,scope));
    }
    function submit(entry){
      if(running || api?.isBusy?.()) return Promise.resolve({status:'busy'});
      if(!ready() || !available() || !queue.accountEligible(context()) || !eligible(entry,context(),durable(entry))) return Promise.resolve({status:'paused'});
      paused='';
      // The same global runner/API lock also covers the explicit manual path.
      return launch((token,scope)=>process(entry,scope,token));
    }
    function invalidate(){epoch++;paused='scope-change';cancelTimer();emit();}
    function reconcileAcknowledgement(entry){
      if(running || api?.isBusy?.()) return Promise.resolve({status:'busy'});
      const candidate={...entry,submission_review_required:false};
      if(!ready() || !available() || !inspections.acknowledgementReview(entry)
        || !eligible(candidate,context(),durable(entry))) return Promise.resolve({status:'paused'});
      paused='';
      // Explicit recovery uses the same runner/API lock and scope guards, but
      // never calls process/insertOne, even when the UUID read returns no row.
      return launch(async(token,scope)=>{
        if(!current(entry,scope,token)) return {status:'scope-changed'};
        const result=await api.reconcileOne(entry,{recheckAcknowledgement:true});
        return current(entry,scope,token)?result:{status:'scope-changed'};
      });
    }
    function stop(){closed=true;invalidate();}
    function retryNow(){
      if(running) return running;
      if(ready() && available() && queue.accountEligible(context())){
        const scope=inspections.scopeKey(context()),token=epoch;
        for(const entry of list()) if(entry.sync_attempts>0 && retryTime(entry)>now() && Number.isFinite(retryTime(entry))) {
          if(!save(entry,{sync_next_retry_at:null},scope,token)) return Promise.resolve({status:'paused'});
        }
      }
      return wake('retry-now');
    }
    function bindWakeups({window,document,verify}){
      const verifyAndWake=()=>{
        const scope=inspections.scopeKey(context()),token=epoch;
        return Promise.resolve().then(verify).then(()=>wake('verified')).catch(()=>{
          if(epoch===token && inspections.scopeKey(context())===scope){paused='authorization';cancelTimer();emit();}
        });
      };
      const online=()=>verifyAndWake();
      const offline=()=>{wake('offline');};
      const visible=()=>!document.hidden?verifyAndWake():wake('hidden');
      window.addEventListener('online',online);window.addEventListener('offline',offline);
      document.addEventListener('visibilitychange',visible);
      return ()=>{window.removeEventListener('online',online);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',visible);};
    }
    return {ready,wake,submit,retryNow,reconcileAcknowledgement,bindWakeups,invalidate,stop,status:state,whenIdle:()=>running||Promise.resolve()};
  }
  return {RETRY,retryDelay,retryTime,needsReconciliation,eligible,ordered,createRunner};
});
