let photoZoomScale=1,photoZoomX=0,photoZoomY=0,photoZoomMoved=false;
const photoZoomPointers=new Map();let photoZoomPinch=null;
function applyPhotoZoom(){
  const image=document.getElementById('photo-preview'),stage=document.getElementById('photo-stage');if(!image||!stage)return;
  const bounds=SPOTITPhotoZoom.clampOffset({x:photoZoomX,y:photoZoomY},photoZoomScale,stage.getBoundingClientRect(),{width:image.clientWidth,height:image.clientHeight});photoZoomX=bounds.x;photoZoomY=bounds.y;
  image.style.transform=`translate3d(${photoZoomX}px,${photoZoomY}px,0) scale(${photoZoomScale})`;document.getElementById('photo-zoom-level').textContent=`${Math.round(photoZoomScale*100)}%`;
}
function setPhotoZoom(scale,anchor){const old=photoZoomScale;photoZoomScale=Math.min(SPOTITPhotoZoom.MAX_SCALE,Math.max(SPOTITPhotoZoom.MIN_SCALE,scale));if(anchor&&old){photoZoomX=(photoZoomX-anchor.x)*(photoZoomScale/old)+anchor.x;photoZoomY=(photoZoomY-anchor.y)*(photoZoomScale/old)+anchor.y;}if(photoZoomScale===1){photoZoomX=0;photoZoomY=0;}applyPhotoZoom();}
function enterPhotoZoom(){const modal=document.getElementById('photo-modal');modal.classList.add('zoom-mode');modal.setAttribute('aria-label','Full-screen zoomable inspection photo');applyPhotoZoom();}
function resetPhotoZoom(){const modal=document.getElementById('photo-modal');if(modal){modal.classList.remove('zoom-mode');modal.removeAttribute('aria-label');}photoZoomScale=1;photoZoomX=0;photoZoomY=0;photoZoomPointers.clear();photoZoomPinch=null;const image=document.getElementById('photo-preview');if(image)image.style.transform='';}
document.addEventListener('DOMContentLoaded',()=>{
  const thumb=document.getElementById('edit-photo-thumb-wrap'),image=document.getElementById('photo-preview'),stage=document.getElementById('photo-stage');
  // The inspection sheet owns thumbnail opening; do not install a second
  // listener that uses the non-editing pilot viewer.
  const photoModal=document.getElementById('photo-modal'),editor=document.getElementById('edit-modal');
  let sheetWasInert=false,sheetCovered=false;
  const syncPhotoLayer=()=>{
    const shown=photoModal.classList.contains('show');
    if(shown && !sheetCovered && editor.classList.contains('open')){sheetWasInert=editor.inert;editor.inert=true;sheetCovered=true;}
    else if(!shown && sheetCovered){editor.inert=sheetWasInert;sheetCovered=false;if(editor.classList.contains('open'))thumb.focus();}
  };
  new MutationObserver(syncPhotoLayer).observe(photoModal,{attributes:true,attributeFilter:['class']});
  image.addEventListener('click',()=>{if(!document.getElementById('photo-modal').classList.contains('zoom-mode'))enterPhotoZoom();else if(!photoZoomMoved)setPhotoZoom(photoZoomScale===1?2:1);photoZoomMoved=false;});
  image.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();image.click();}});
  stage.addEventListener('wheel',event=>{if(!document.getElementById('photo-modal').classList.contains('zoom-mode'))return;event.preventDefault();const r=stage.getBoundingClientRect();setPhotoZoom(SPOTITPhotoZoom.nextScale(photoZoomScale,event.deltaY<0?1:-1),{x:event.clientX-r.left-r.width/2,y:event.clientY-r.top-r.height/2});},{passive:false});
  stage.addEventListener('pointerdown',event=>{if(!document.getElementById('photo-modal').classList.contains('zoom-mode'))return;stage.setPointerCapture(event.pointerId);photoZoomMoved=false;photoZoomPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(photoZoomPointers.size===2){const[a,b]=photoZoomPointers.values();photoZoomPinch={distance:SPOTITPhotoZoom.distance(a,b),scale:photoZoomScale};}});
  stage.addEventListener('pointermove',event=>{if(!photoZoomPointers.has(event.pointerId))return;const previous=photoZoomPointers.get(event.pointerId);photoZoomPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(photoZoomPointers.size===1&&photoZoomScale>1){photoZoomX+=event.clientX-previous.x;photoZoomY+=event.clientY-previous.y;photoZoomMoved=true;applyPhotoZoom();}else if(photoZoomPointers.size===2&&photoZoomPinch){const[a,b]=photoZoomPointers.values();setPhotoZoom(photoZoomPinch.scale*SPOTITPhotoZoom.distance(a,b)/Math.max(1,photoZoomPinch.distance));photoZoomMoved=true;}});
  const endPointer=event=>{photoZoomPointers.delete(event.pointerId);if(photoZoomPointers.size<2)photoZoomPinch=null;};stage.addEventListener('pointerup',endPointer);stage.addEventListener('pointercancel',endPointer);
  document.getElementById('photo-zoom-in').addEventListener('click',()=>setPhotoZoom(SPOTITPhotoZoom.nextScale(photoZoomScale,1)));document.getElementById('photo-zoom-out').addEventListener('click',()=>setPhotoZoom(SPOTITPhotoZoom.nextScale(photoZoomScale,-1)));document.getElementById('photo-zoom-reset').addEventListener('click',()=>setPhotoZoom(1));
  document.getElementById('photo-zoom-close').addEventListener('click',()=>document.getElementById('photo-close').click());document.getElementById('photo-close').addEventListener('click',resetPhotoZoom);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&photoModal.classList.contains('show')){event.preventDefault();event.stopImmediatePropagation();document.getElementById('photo-close').click();}},true);
});
