(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./network-stop-gates'):root.SPOTITNetworkStopGates);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SPOTITManualLocation=api;})(globalThis,function(G){
 'use strict';
 function create(){
  let mode='',sources=[],selectedSite='';
  function setMode(value){if(!['mainline','interchange',''].includes(value))throw Error('Invalid location mode');mode=value;selectedSite='';}
  function load(model){sources=model.interchanges.filter(s=>s.coordinates?.length>1);}
  function nearby(fix){const sites=new Map();for(const source of sources){const distance=G.project([fix.lon,fix.lat],source.coordinates).distanceM;if(distance>200)continue;const previous=sites.get(source.site);if(!previous||distance<previous.distanceM)sites.set(source.site,{source,distanceM:distance});}return [...sites.values()].sort((a,b)=>a.distanceM-b.distanceM);}
  function resolve(fix,candidates,now){
   if(!mode)return null;
   const base={result:null,confirmed:false,confirmedCorridor:'',uncertain:true,reason:'Waiting for fresh GPS',interchange:null,interchangeLocked:false,saveAllowed:false,fresh:false,fixTimestamp:fix?.timestamp,manualMode:mode};
   if(!fix||![fix.lat,fix.lon,fix.accuracy,fix.timestamp,now].every(Number.isFinite)||fix.accuracy<0||fix.accuracy>50||now<fix.timestamp||now-fix.timestamp>12000)return base;
   base.fresh=true;
   if(mode==='mainline'){
    const result=[...candidates].filter(c=>Number.isFinite(c.km)&&Number.isFinite(c.distance)).sort((a,b)=>a.distance-b.distance)[0];
    if(!result||result.distance>Math.max(.05,.045+Math.min(fix.accuracy,40)/1000))return {...base,reason:'No nearby mainline'};
    return {...base,result,confirmed:true,confirmedCorridor:result.expressway,uncertain:false,reason:'Mainline selected',saveAllowed:true};
   }
   const choices=nearby(fix),nearest=selectedSite?choices.find(c=>c.source.site===selectedSite):choices[0];
   if(!nearest)return {...base,reason:sources.length?'No nearby interchange':'Loading interchange data'};
   const s=nearest.source;
   return {...base,result:{expressway:'NLEX',km:null,distance:nearest.distanceM/1000,bound:''},confirmed:true,confirmedCorridor:'NLEX',uncertain:false,reason:'Interchange selected',interchange:{siteId:s.site,name:s.name,segment:String(s.ramp||s.seg_type||'Ramp / interchange roadway').replace(/_/g,' '),segmentId:s.id},interchangeLocked:true,saveAllowed:true};
  }
  return {setMode,load,nearby,resolve,mode:()=>mode,selectSite:site=>{selectedSite=site;}};
 }
 return {create};
});
