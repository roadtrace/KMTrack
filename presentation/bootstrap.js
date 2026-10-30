/* Loaded before the app, ONLY by the separate presentation build. */
(function () {
  'use strict';
  const prefix='spotit-presentation-v1:';
  function namespaced(store) {
    const keys=()=>Array.from({length:store.length},(_,i)=>store.key(i)).filter(k=>k?.startsWith(prefix));
    return {get length(){return keys().length;},key:i=>keys()[i]?.slice(prefix.length)??null,
      getItem:k=>store.getItem(prefix+k),setItem:(k,v)=>store.setItem(prefix+k,String(v)),removeItem:k=>store.removeItem(prefix+k),
      clear:()=>keys().forEach(k=>store.removeItem(k))};
  }
  Object.defineProperty(window,'localStorage',{value:namespaced(window.localStorage)});
  Object.defineProperty(window,'sessionStorage',{value:namespaced(window.sessionStorage)});
  const idb=window.indexedDB;
  Object.defineProperty(window,'indexedDB',{value:{open:(name,version)=>idb.open(prefix+name,version),deleteDatabase:name=>idb.deleteDatabase(prefix+name)}});
  localStorage.setItem('kmtrack_guest_mode_v1','true');
  Object.defineProperty(navigator,'serviceWorker',{value:{controller:null,register:()=>Promise.reject(new Error('Presentation build has no production service worker')),getRegistration:async()=>undefined,addEventListener(){},ready:new Promise(()=>{})}});
  const allowed=url=>url.origin===location.origin || url.protocol==='https:' && /^(?:[abc]\.basemaps\.cartocdn\.com|basemaps\.cartocdn\.com)$/.test(url.hostname);
  const fetchOriginal=window.fetch.bind(window);
  window.fetch=(input,options={})=>{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
    if((options.method||input?.method||'GET').toUpperCase()!=='GET'||!allowed(url))return Promise.reject(new Error('Presentation: external account and write requests are disabled'));
    return fetchOriginal(input,options);
  };
  const open=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(method,url,...args){if(String(method).toUpperCase()!=='GET'||!allowed(new URL(url,location.href)))throw Error('Presentation transport blocked');return open.call(this,method,url,...args);};
  window.WebSocket=class{constructor(){throw Error('Presentation transport blocked');}};
  Object.defineProperty(navigator,'sendBeacon',{value:()=>false});
  Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:()=>Promise.reject(new Error('Use the labelled sample-photo capture in Presentation Mode'))}});
  let position=null,nextWatch=0; const watchers=new Map();
  Object.defineProperty(navigator,'geolocation',{value:{watchPosition(success,error){const id=++nextWatch;watchers.set(id,{success,error});if(position)queueMicrotask(()=>success(structuredClone(position)));return id;},clearWatch:id=>watchers.delete(id),getCurrentPosition(success,error){queueMicrotask(()=>position?success(structuredClone(position)):error?.({code:2,message:'Presentation route is loading'}));}}});
  const originalClick=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){if(this.download&&!this.download.startsWith('DEMO_'))this.download='DEMO_'+this.download;return originalClick.call(this);};
  document.addEventListener('click',event=>{const a=event.target.closest?.('a[download]');if(a?.download&&!a.download.startsWith('DEMO_'))a.download='DEMO_'+a.download;},true);
  window.SPOTITPresentation={
    prefix,
    emit(point,speed=10){position={timestamp:Date.now(),coords:{latitude:point.lat,longitude:point.lon,accuracy:3,altitude:null,altitudeAccuracy:null,heading:null,speed}};for(const w of watchers.values())w.success(structuredClone(position));},
    unavailable(){position=null;for(const w of watchers.values())w.error?.({code:2,message:'Simulated GPS loss'});},
    productionHosts:['kmtrack.pages.dev','roadtrace.github.io']
  };
})();
