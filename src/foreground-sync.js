/* Foreground scheduling only. No service-worker/background/cloud transport. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SPOTITForegroundSync=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function createScheduler({wake,render,setTimer=setTimeout,onError=()=>{}}){
    let wakePending=false,renderPending=false;
    return {
      saved(){
        if(wakePending)return;
        wakePending=true;
        setTimer(()=>{wakePending=false;Promise.resolve().then(wake).catch(onError);},0);
      },
      changed(){
        if(renderPending)return;
        renderPending=true;
        setTimer(()=>{renderPending=false;render();},100);
      }
    };
  }
  return {createScheduler};
});
