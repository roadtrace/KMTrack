(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.KMTrackPhotoZoom=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MIN_SCALE=1,MAX_SCALE=5,STEP=.5;
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  function nextScale(scale,direction){return clamp(scale+direction*STEP,MIN_SCALE,MAX_SCALE);}
  function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
  function clampOffset(offset,scale,viewport,image){const halfX=Math.max(0,(image.width*scale-viewport.width)/2),halfY=Math.max(0,(image.height*scale-viewport.height)/2);return{x:clamp(offset.x,-halfX,halfX),y:clamp(offset.y,-halfY,halfY)};}
  return{MIN_SCALE,MAX_SCALE,STEP,clamp,nextScale,distance,clampOffset};
});
