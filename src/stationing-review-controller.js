(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SPOTITStationingReviewController=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 function create({makeWorker,getReference,now,setTimer,clearTimer,onResult,onStatus,onReset=()=>{}}){
  let enabled=false,worker=null,epoch=0,sequence=0,ready=false,busy=0,latest=null,timer=null,inFlightTimestamp=null;
  function status(text){try{onStatus(text,enabled);}catch{}}
  function cancelTimer(){if(timer!==null){const id=timer;timer=null;try{clearTimer(id);}catch{}}}
  function shutdown(){cancelTimer();try{onReset();}catch{}const w=worker;worker=null;ready=false;busy=0;latest=null;if(w){try{w.onmessage=null;w.onerror=null;w.terminate();}catch{}}}
  function disable(reason='Disabled - operational matching unchanged'){enabled=false;epoch++;shutdown();status(reason);}
  function fail(detail=''){disable('Review unavailable'+(detail?' - '+detail:' - operational matching unchanged'));}
  function deadline(ms){cancelTimer();timer=setTimer(()=>{timer=null;fail('worker response timeout ('+ms+' ms)');},ms);}
  function flush(){
   if(!enabled||!ready||busy||!latest)return;
   const item=latest;latest=null;busy=++sequence;inFlightTimestamp=item.fix.timestamp;
   try{worker.postMessage({type:'FIX',epoch,sequence:busy,fix:item.fix,context:{...item.context,evaluationTime:now()}});deadline(1000);}catch{fail();}
  }
  function initialize(){
   shutdown();if(!enabled)return;const ownEpoch=++epoch;
   try{
    const reference=getReference();if(!reference||!Array.isArray(reference.rows)||!reference.rows.length||reference.rows.length>30000)throw Error('REFERENCE_REQUIRED');
    const rows=reference.rows.map(p=>({e:p.e,b:p.b,k:p.k,lat:p.lat,lon:p.lon}));
    const w=makeWorker();worker=w;
    w.onmessage=event=>{
     const m=event.data;if(!enabled||worker!==w||m?.epoch!==epoch)return;
     if(m.type==='READY'){cancelTimer();ready=true;status('Ready - provisional reference review only');flush();}
     else if(m.type==='RESULT'&&busy!==0&&m.sequence===busy){
      cancelTimer();busy=0;
      const r=m.result;
      if(!r||r.provisional!==true||r.operationalUsePermitted!==false||r.operational?.km!==null||r.operational?.bound!==null){fail();return;}
      try{onResult({...r,reviewFixTimestamp:inFlightTimestamp});}catch(error){fail('render '+String(error?.message||'failed').slice(0,160));return;}flush();
     }else if(m.type==='ERROR')fail();
    };
    w.onerror=()=>{if(worker===w)fail('worker error');};deadline(5000);
    w.postMessage({type:'INIT',epoch:ownEpoch,reference:{calibration:rows,conventions:reference.conventions,revision:'active-reference-'+ownEpoch}});status('Preparing reference - operational matching unchanged');
   }catch{fail();}
  }
  function enable(){if(enabled)return;enabled=true;initialize();}
  function observe(fix,context={}){
   if(!enabled)return;
   try{latest={fix:{lat:fix.lat,lon:fix.lon,accuracy:fix.accuracy,timestamp:fix.timestamp,speed:fix.speed??null,heading:fix.heading??null},context:{confirmedCorridor:typeof context.confirmedCorridor==='string'?context.confirmedCorridor:'',manualBound:typeof context.manualBound==='string'?context.manualBound:'',interchange:context.interchange===true,operationalUncertain:context.operationalUncertain===true}};flush();}catch{fail();}
  }
  return Object.freeze({enable,disable,observe,referenceChanged:()=>{if(enabled)initialize();},invalidate:()=>{if(enabled){status('Reference history reset - waiting for fresh GPS');initialize();}},enabled:()=>enabled,state:()=>({enabled,ready,inFlight:busy?1:0,queued:latest?1:0,epoch})});
 }
 return Object.freeze({create});
});
