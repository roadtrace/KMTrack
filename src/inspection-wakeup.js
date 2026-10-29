/* Notification-only Background Sync. No credentials, queue copy or transport. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.SPOTITInspectionWakeup=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TAG='kmtrack-inspection-wakeup-v1';
  const MESSAGE='kmtrack-inspection-wakeup-v1';
  function createController({serviceWorker,hasWork,verify,wake,scope,visible,now=Date.now,setTimer=setTimeout}){
    let registration=null,checking=false,scheduled=false,lastAttempt=-Infinity,notifying=null;
    async function register(){
      if(checking || !registration?.sync || !hasWork() || now()-lastAttempt<60000) return;
      checking=true;lastAttempt=now();
      try{
        const tags=await registration.sync.getTags();
        // Recheck current durable account eligibility after the asynchronous read.
        if(hasWork() && !tags.includes(TAG)) await registration.sync.register(TAG);
      }catch(_){/* Foreground recovery remains authoritative. */}
      finally{checking=false;}
    }
    function changed(){
      if(scheduled) return;
      scheduled=true;
      setTimer(()=>{scheduled=false;void register();},0);
    }
    function receive(event){
      if(event.data?.type!==MESSAGE || !serviceWorker?.controller || event.source!==serviceWorker.controller || !visible() || notifying) return;
      const original=scope();
      notifying=Promise.resolve().then(verify).then(()=>{
        if(visible() && scope()===original) return wake();
      }).catch(()=>{}).finally(()=>{notifying=null;});
      return notifying;
    }
    serviceWorker?.addEventListener('message',receive);
    return {changed,setRegistration(value){registration=value;changed();},receive};
  }
  // Worker side only: notify same-origin KMTrack windows, never access records.
  async function notifyClients(clients,workerURL){
    const base=new URL('./',workerURL);
    const windows=await clients.matchAll({type:'window',includeUncontrolled:false});
    for(const client of windows){
      const url=new URL(client.url);
      if(url.origin===base.origin && (url.pathname===base.pathname || url.pathname===base.pathname+'index.html')){
        try{client.postMessage({type:MESSAGE});}catch(_){/* A closing client is harmless. */}
      }
    }
  }
  return {TAG,MESSAGE,createController,notifyClients};
});
