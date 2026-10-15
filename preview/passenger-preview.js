'use strict';
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./live-binding.js'):root.LiveBinding);if(typeof module==='object'&&module.exports)module.exports=api;else{root.PassengerPreview=api;api.install();}})(typeof globalThis==='object'?globalThis:this,function(LiveBinding){
 function createBridge({source,clock,secure,visible,setTimer,clearTimer,onState}){
  let running=false,fatal=false,nativeId=null,timer=null,next=0,generation=0,count=0;const consumers=new Map();
  const notify=(status,accuracy=null)=>onState({status,running,fatal,count,accuracy,remainingMs:binding.remaining()});
  const binding=LiveBinding.create({source,clock,secure,visible,onBlock:reason=>stop(reason)});
  function stop(reason='STOPPED'){
   running=false;generation++;if(timer!==null){try{clearTimer(timer);}catch{}timer=null;}
   try{binding.reset();nativeId=null;}catch{fatal=true;reason='CLOSE_PAGE_LOCATION_CANCELLATION_FAILED';}
   for(const c of consumers.values())try{c.error?.({code:2,message:'Passenger preview: '+reason});}catch{}
   notify(reason);
  }
  function start(confirmed){
   if(confirmed!==true||running||fatal||!secure()||!visible())return false;
   try{
    binding.reset();if(!binding.confirm(true))return false;running=true;count=0;const own=++generation;
    nativeId=binding.getGeolocation().watchPosition(position=>{
     if(!running||own!==generation)return;
     const p=position?.coords,t=clock();if(!p||![p.latitude,p.longitude,p.accuracy,position.timestamp].every(Number.isFinite)||Math.abs(p.latitude)>90||Math.abs(p.longitude)>180||p.accuracy<0){stop('INVALID_GPS_METADATA');return;}
     count++;
     if(position.timestamp>t.wall||t.wall-position.timestamp>12000){for(const c of consumers.values())try{c.error?.({code:2,message:'Stale GPS fix - match withheld'});}catch{}notify('STALE_FIX_WITHHELD',p.accuracy);return;}
     for(const c of consumers.values())try{c.success(position);}catch{}
     notify('OBSERVING_PROVISIONAL_ONLY',p.accuracy);
    },error=>{if(!running||own!==generation)return;if(error?.code===1){stop('PERMISSION_DENIED');return;}for(const c of consumers.values())try{c.error?.(error);}catch{}notify(error?.code===3?'GPS_TIMEOUT_MATCH_WITHHELD':'GPS_UNAVAILABLE_MATCH_WITHHELD');},{enableHighAccuracy:true,maximumAge:0,timeout:10000});
    if(running){timer=setTimer(()=>{if(!visible())stop('PAUSED_HIDDEN');else if(binding.expired())stop('FIVE_MINUTE_LIMIT');},1000);notify('WAITING_FOR_PHONE_GPS');}return running;
   }catch{stop('GPS_SOURCE_UNAVAILABLE');return false;}
  }
  const geolocation=Object.freeze({watchPosition(success,error){const id=++next;consumers.set(id,{success,error});return id;},clearWatch(id){consumers.delete(id);},getCurrentPosition(success,error){queueMicrotask(()=>error?.({code:1,message:'Use explicit passenger-preview Start; one-shot GPS blocked'}));}});
  return Object.freeze({start,stop,geolocation,state:()=>({running,fatal,count,activeNativeWatches:binding.active()})});
 }
 function install(){
  const memory=()=>{const data=new Map();return {get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(String(k))??null,setItem:(k,v)=>data.set(String(k),String(v)),removeItem:k=>data.delete(String(k)),clear:()=>data.clear()};};
  Object.defineProperty(window,'localStorage',{value:memory()});Object.defineProperty(window,'sessionStorage',{value:memory()});
  Object.defineProperty(window,'indexedDB',{value:{open(){const request={};queueMicrotask(()=>request.onerror?.({target:{error:new Error('Inspection/photo persistence unavailable in observation preview')}}));return request;}}});
  const existingWorker=!!navigator.serviceWorker?.controller;
  Object.defineProperty(navigator,'serviceWorker',{value:{controller:null,register:()=>Promise.reject(Error('Preview service workers disabled')),addEventListener(){},ready:new Promise(()=>{})}});
  const nativeFetch=window.fetch.bind(window),allowed=new Set(['/calibration.json','/interchanges.json','/stationing-reconstruction-evidence.json','/map-landmarks.json']);
  window.fetch=(input,options={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);return url.origin===location.origin&&allowed.has(url.pathname)&&!url.search&&(options.method||input?.method||'GET').toUpperCase()==='GET'?nativeFetch(input,options):Promise.reject(Error('Preview network transport blocked'));};
  window.WebSocket=class{constructor(){throw Error('Preview transport blocked');}};window.XMLHttpRequest=class{open(){throw Error('Preview transport blocked');}};Object.defineProperty(navigator,'sendBeacon',{value:()=>false});
  let owner=navigator,descriptor;while(owner&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(owner,'geolocation');owner=Object.getPrototypeOf(owner);}
  // Capture the getter, not a GPS reading. It is invoked only by confirmed Start.
  const source=()=>descriptor?.get?descriptor.get.call(navigator):descriptor?.value;
  let statusElement=null,startButton=null,stopButton=null;
  const secure=()=>window===window.top&&location.protocol==='https:'&&location.hostname==='stationing-app-review.kmtrack-gpskm-synthetic.pages.dev'&&location.hash==='#kmtrack-stationing-review-v1'&&!existingWorker;
  const bridge=createBridge({source,clock:()=>({wall:Date.now(),mono:performance.now()}),secure,visible:()=>!document.hidden,setTimer:(fn,ms)=>globalThis.setInterval(fn,ms),clearTimer:id=>globalThis.clearInterval(id),onState:s=>{if(statusElement)statusElement.textContent=`${s.status} | GPS observations received: ${s.count} | accuracy: ${s.accuracy===null?'--':s.accuracy.toFixed(1)+' m'} | five-minute session; no trace saved`;if(startButton)startButton.disabled=s.running||s.fatal;if(stopButton)stopButton.disabled=!s.running;}});
  Object.defineProperty(navigator,'geolocation',{value:bridge.geolocation});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)bridge.stop('PAUSED_HIDDEN_RESTART_REQUIRED');});addEventListener('pagehide',()=>bridge.stop('PAGE_CLOSED'));addEventListener('hashchange',()=>{if(!secure())bridge.stop('ACTIVATION_REVOKED');});
  addEventListener('DOMContentLoaded',()=>{
   const bar=document.createElement('section');bar.setAttribute('aria-label','Passenger observation preview');bar.style.cssText='padding:12px;background:#fff0bd;color:#132633;font:14px/1.5 system-ui;border:2px solid #8b6100;';
   const title=document.createElement('strong');title.textContent='EXPERIMENTAL PASSENGER OBSERVATION ONLY - Provisional KM/QGIS evidence, not validated stationing. No uploads, trace recording, photos or inspection saves. ';
   startButton=document.createElement('button');startButton.textContent='Start phone GPS';startButton.type='button';startButton.style.cssText='margin:6px;padding:12px;';stopButton=document.createElement('button');stopButton.textContent='Stop phone GPS';stopButton.type='button';stopButton.disabled=true;stopButton.style.cssText='margin:6px;padding:12px;';statusElement=document.createElement('p');statusElement.setAttribute('role','status');statusElement.textContent=secure()?'STOPPED - Continue without signing in, enable provisional review in More, then explicitly Start.':'LIVE GPS LOCKED - only the exact approved HTTPS Preview origin and activation flag are accepted.';
   startButton.onclick=()=>{if(!document.getElementById('stationing-review-toggle')?.textContent.startsWith('Disable')){statusElement.textContent='Enable provisional review in More > Location & corridor first.';return;}if(confirm('Passenger observation test: request actual phone location for up to five minutes while this page stays visible? No trace is saved or uploaded.')){if(!bridge.start(true))statusElement.textContent='GPS remains locked; verify HTTPS Preview origin, visibility and explicit activation.';}};stopButton.onclick=()=>bridge.stop('USER_STOP');bar.append(title,startButton,stopButton,statusElement);document.body.prepend(bar);
   const css=document.createElement('style');css.textContent='#auth-signin-form,#auth-register-form,#auth-create-account,#auth-back-signin,#auth-guest-signin-btn {display:none!important} #inspection-view .defect-section {pointer-events:none;opacity:.45}';document.head.append(css);
   for(const e of document.querySelectorAll('#inspection-view .defect-section button,#inspection-view .defect-section input,input[type=file],#team-tab,#log-tab,#map-tab'))e.disabled=true;
   const toggle=document.getElementById('stationing-review-toggle');if(toggle)new MutationObserver(()=>{if(bridge.state().running&&!toggle.textContent.startsWith('Disable'))bridge.stop('REVIEW_DISABLED');}).observe(toggle,{childList:true,subtree:true});
  });
 }
 return Object.freeze({createBridge,install});
});
