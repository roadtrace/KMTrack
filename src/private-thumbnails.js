/* Lazy private thumbnails. No image bytes or object URLs persist across account scope changes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.SPOTITThumbnails=api;})(globalThis,function(){
function createController(o){
 const active=new Map(),pending=[];let stopped=false,running=0;
 function pump(){while(!stopped&&running<3&&pending.length){const card=pending.shift();if(!card.isConnected)continue;running++;void load(card).finally(()=>{running--;pump();});}}
 const observer=new IntersectionObserver(items=>{for(const item of items)if(item.isIntersecting){observer.unobserve(item.target);pending.push(item.target);pump();}},{rootMargin:'100px'});
 async function load(card){
  const item=o.item(card),target=card.querySelector('.register-evidence');if(!item||!target)return;
  const scope=o.scope(),viewer=o.viewer(item,()=>!stopped&&card.isConnected&&o.scope()===scope&&o.item(card)?.id===item.id);
  active.set(card,viewer);
  try{const result=await viewer.open(item);if(stopped||!card.isConnected||o.scope()!==scope){viewer.close();return;}
   const img=document.createElement('img');img.alt='Inspection photo';img.src=result.url;img.className='register-photo-thumbnail';target.replaceChildren(img);
  }catch(_){/* Missing/denied bytes never become a false photo-success marker. */}
 }
 function scan(){for(const [card,viewer]of active)if(!card.isConnected){viewer.close();active.delete(card);}
  for(const card of o.root.querySelectorAll('.log-entry'))if(!card.dataset.thumbnailObserved){card.dataset.thumbnailObserved='true';observer.observe(card);}}
 const changes=new MutationObserver(scan);changes.observe(o.root,{childList:true,subtree:true});scan();
 return {clear(){pending.length=0;for(const viewer of active.values())viewer.close();active.clear();observer.disconnect();for(const card of o.root.querySelectorAll('[data-thumbnail-observed]'))delete card.dataset.thumbnailObserved;},stop(){stopped=true;changes.disconnect();this.clear();},scan};
}
return {createController};
});
