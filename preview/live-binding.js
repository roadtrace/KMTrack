'use strict';
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.LiveBinding=api;})(typeof globalThis==='object'?globalThis:this,()=>{
 const MAX_MS=300000;
 function create({source,clock,secure,visible,onBlock}){
  let began=null,armed=false,next=0;const watches=new Map();
  function expired(){if(!began)return false;const t=clock();return t.wall-began.wall>=MAX_MS||t.mono-began.mono>=MAX_MS;}
  function allowed(){return armed&&secure()&&visible()&&!expired();}
  function reason(){return expired()?'EXPIRED':!visible()?'HIDDEN':'BLOCKED';}
  function clearWatch(id){const w=watches.get(id);if(!w)return;w.cancelled=true;if(w.ready){w.geo.clearWatch(w.nativeId);watches.delete(id);}}
  const provider=Object.freeze({
   watchPosition(ok,error,options){
    if(!allowed()||watches.size)throw Error('EXPLICIT_LIVE_CONSENT_REQUIRED');
    const id=++next,w={ready:false,cancelled:false,geo:null,nativeId:null};watches.set(id,w);
    function deliver(fn,value){if(w.cancelled)return;if(!allowed()){onBlock(reason());return;}fn(value);}
    try{
     // The native getter is evaluated only here, after explicit Start/Resume confirmation.
     w.geo=source();if(!w.geo||typeof w.geo.watchPosition!=='function'||typeof w.geo.clearWatch!=='function')throw Error('NO_SOURCE');
     w.nativeId=w.geo.watchPosition(p=>deliver(ok,p),e=>deliver(error,e),options);w.ready=true;
     if(w.cancelled||!allowed())clearWatch(id);
     return id;
    }catch(e){if(!w.ready)watches.delete(id);throw Error('LOCATION_SOURCE_UNAVAILABLE');}
   },clearWatch
  });
  return Object.freeze({
   confirm(value){if(value!==true||!secure()||!visible()||expired())return false;if(!began)began={...clock()};armed=true;return true;},
   getGeolocation(){if(!allowed())throw Error('LIVE_SOURCE_LOCKED');return provider;},
   expired,
   reset(){for(const id of watches.keys())clearWatch(id);if(watches.size)throw Error('CLOSE_PAGE_CANCEL_FAILED');armed=false;began=null;},
   active:()=>watches.size,
   remaining(){if(!began)return MAX_MS;const t=clock();return Math.max(0,MAX_MS-Math.max(t.wall-began.wall,t.mono-began.mono));}
  });
 }
 return Object.freeze({create,MAX_MS});
});
