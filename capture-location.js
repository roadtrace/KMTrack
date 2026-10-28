/* Adapts the tested network engine to one location shared by Capture and records.
 * Evidence flags remain intact: this adapter does not approve geometry or travel.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SPOTITCaptureLocation=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const finite=Number.isFinite,MAX_AGE=12000;
 function create(){
  let fix=null,completed=null,output=null;
  const unavailable=reason=>({result:null,confirmed:false,confirmedCorridor:'',uncertain:true,reason,interchange:null,interchangeLocked:false,saveAllowed:false,fresh:false});
  function invalidate(reason='Waiting for location'){
   completed=null;output=output?{...output,uncertain:true,reason,saveAllowed:false,fresh:false}:unavailable(reason);return output;
  }
  function beginFix(next){
   if(!next||![next.lat,next.lon,next.accuracy,next.timestamp].every(finite)||Math.abs(next.lat)>90||Math.abs(next.lon)>180||next.accuracy<0){fix=null;return invalidate('Location unavailable');}
   fix={...next};completed=null;
   output=output?{...output,saveAllowed:false,uncertain:true,reason:'Updating location',fresh:true}:unavailable('Locating road');
   return output;
  }
  function accept(review,timestamp,now){
   if(!fix||timestamp!==fix.timestamp||!finite(now)||now<timestamp||now-timestamp>MAX_AGE)return null;
   const stop=review?.reconstruction?.networkStop;
   if(review?.provisional!==true||review.operationalUsePermitted!==false||!stop||stop.status==='INVALID_OR_STALE_FIX'||!finite(fix.accuracy)||fix.accuracy>50)return invalidate('Location unavailable');
   const held=stop.holdRequired===true,info=review.captureInterchange;
   const range=review.stationRange;
   const km=!held&&range&&finite(range.minKm)&&finite(range.maxKm)&&Math.round(range.minKm*1000)===Math.round(range.maxKm*1000)?range.minKm:null;
   const corridor=held?info?.expressway:review.selectedReferenceCorridor;
   const candidates=(review.candidates||[]).filter(c=>c.expressway===corridor&&finite(c.distanceM));
   const distance=candidates.length?Math.min(...candidates.map(c=>c.distanceM))/1000:held?0:Infinity;
   const interchange=held&&info?.siteId&&info.name?{siteId:info.siteId,name:info.name,segment:info.segment||'Ramp / interchange roadway',segmentId:info.segmentId||''}:null;
   const usable=!!corridor&&(held?!!interchange:finite(km)&&!review.roadAmbiguous&&distance<=Math.max(.05,Math.min(fix.accuracy,40)/1000+.045));
   const result=corridor?{expressway:corridor,km:held?null:km,distance,bound:review.travelDirection?.value||''}:null;
   output={result,confirmed:usable,confirmedCorridor:corridor||'',uncertain:!usable,reason:usable?'':held?'Locating interchange':'Locating station',interchange,interchangeLocked:!!interchange,saveAllowed:usable,fresh:true,fixTimestamp:timestamp};
   completed=timestamp;return output;
  }
  function snapshot({position,now,bound=''}){
   if(!position?.fresh||!fix||completed!==fix.timestamp||position.timestamp!==fix.timestamp||!output?.saveAllowed||!finite(now)||now<fix.timestamp||now-fix.timestamp>MAX_AGE)return null;
   return {lat:fix.lat,lon:fix.lon,km:output.interchange?null:output.result.km,expressway:output.result.expressway,bound:bound||output.result.bound||'',interchange:output.interchange?.name||'',interchangeSegment:output.interchange?.segment||''};
  }
  return Object.freeze({beginFix,accept,invalidate,snapshot,state:()=>output||unavailable('Waiting for location')});
 }
 return Object.freeze({create});
});
