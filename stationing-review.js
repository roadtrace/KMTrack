/* Active-calibration diagnostics for KMTrack. No geometry approval, IO, clock or app state. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./legacy-matcher.js'):root.SPOTITLegacyMatcher);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SPOTITStationingReview=api;})(typeof globalThis==='object'?globalThis:this,function(Legacy){
 'use strict';
 const POLICY=Object.freeze({id:'ACTIVE_CALIBRATION_REVIEW_V1_PROVISIONAL',maxAgeMs:12000,maxHistory:12,minMovementM:20,minVotes:2,headingToleranceDeg:60});
 const finite=v=>typeof v==='number'&&Number.isFinite(v),dist=(a,b)=>Legacy.haversineKm(a.lat,a.lon,b.lat,b.lon)*1000;
 function bearing(a,b){const p=a.lat*Math.PI/180,q=b.lat*Math.PI/180,d=(b.lon-a.lon)*Math.PI/180;return (Math.atan2(Math.sin(d)*Math.cos(q),Math.cos(p)*Math.sin(q)-Math.sin(p)*Math.cos(q)*Math.cos(d))*180/Math.PI+360)%360;}
 const angle=(a,b)=>Math.abs(((a-b+540)%360)-180);
 function create(options){
  if(!options||options.geometry||options.approvals||!Array.isArray(options.calibration)||!options.calibration.length||options.calibration.length>30000||typeof options.revision!=='string'||!options.revision||options.revision.length>128)throw Error('ACTIVE_REFERENCE_REQUIRED');
  const revision=options.revision;
  const rows=Object.freeze(options.calibration.map(p=>{if(!p||typeof p.e!=='string'||!p.e||p.e.length>80||typeof p.b!=='string'||!p.b||p.b.length>12||!finite(p.k)||!finite(p.lat)||!finite(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180)throw Error('INVALID_REFERENCE_ROW');return Object.freeze({e:p.e,b:p.b,k:p.k,lat:p.lat,lon:p.lon});}));
  const groups=new Map();for(const p of rows){const key=p.e+'|||'+p.b;if(!groups.has(key))groups.set(key,{expressway:p.e,bound:p.b,rows:[]});groups.get(key).rows.push(p);}if(groups.size>64)throw Error('REFERENCE_GROUP_LIMIT');
  for(const g of groups.values()){Object.freeze(g.rows);g.matcher=Legacy.createMatcher(()=>g.rows,()=>null);g.matcher.buildSpatialIndex();g.ordered=[...g.rows].sort((a,b)=>a.k-b.k);}
  const conventions={};for(const [key,value]of Object.entries(options.conventions||{}))if(value&&typeof value.increasing==='string'&&typeof value.decreasing==='string')conventions[key]={increasing:value.increasing,decreasing:value.decreasing};
  let history=[],votes=0,sign=0;
  function reset(){history=[];votes=0;sign=0;}
  function base(status,reasons=[]){return {status,provisional:true,source:'ACTIVE_CALIBRATION_REFERENCE_NOT_SURVEY',revision,policyId:POLICY.id,operationalUsePermitted:false,operational:{km:null,bound:null},physicalCarriageway:'UNKNOWN',roadMembership:'UNKNOWN',stationRange:null,travelDirection:{value:null,status:'UNKNOWN',source:null},referenceBoundStatus:'UNKNOWN',roadAmbiguous:false,candidates:[],reasons};}
  function tangent(g,fix){
   let nearest=g.ordered[0];for(const p of g.ordered)if(dist(fix,p)<dist(fix,nearest))nearest=p;const i=g.ordered.indexOf(nearest),a=i<g.ordered.length-1?nearest:g.ordered[i-1],b=i<g.ordered.length-1?g.ordered[i+1]:nearest;
   return a&&b&&b.k>a.k&&b.k-a.k<=0.101&&dist(a,b)<=250?bearing(a,b):null;
  }
  function evaluate(fix,context={}){
   if(!fix||!finite(fix.lat)||!finite(fix.lon)||Math.abs(fix.lat)>90||Math.abs(fix.lon)>180||!finite(fix.accuracy)||fix.accuracy<0||!finite(fix.timestamp)||!finite(context.evaluationTime)||fix.timestamp<0||(fix.speed!=null&&(!finite(fix.speed)||fix.speed<0))||(fix.heading!=null&&(!finite(fix.heading)||fix.heading<0||fix.heading>=360))){reset();return base('INVALID_FIX',['FINITE_RAW_FIX_AND_EXPLICIT_TIME_REQUIRED']);}
   const age=context.evaluationTime-fix.timestamp;if(age<0||age>POLICY.maxAgeMs){reset();return base('STALE_OR_FUTURE_FIX',['FRESH_FIX_REQUIRED']);}
   if(history.length&&(fix.timestamp<=history.at(-1).timestamp||fix.timestamp-history.at(-1).timestamp>POLICY.maxAgeMs))reset();
   const out=base('PROVISIONAL_REFERENCE_MATCH'),candidates=[];
   for(const [key,g]of groups){const m=g.matcher.computeKmStation(fix.lat,fix.lon,g.expressway);if(m&&finite(m.km)&&finite(m.distance))candidates.push({referenceKey:key,expressway:g.expressway,bound:g.bound,km:m.km,distanceM:m.distance*1000});}
   candidates.sort((a,b)=>a.distanceM-b.distanceM||(a.referenceKey<b.referenceKey?-1:a.referenceKey>b.referenceKey?1:0));out.candidates=candidates;
   if(!candidates.length){reset();out.status='NO_REFERENCE_MATCH';return out;}
   const limit=Math.min(350,150+Math.min(fix.accuracy,200)),margin=Math.max(3,Math.min(fix.accuracy,200));
   if(candidates[0].distanceM>limit){reset();out.status='OUTSIDE_REFERENCE_PROXIMITY';out.reasons.push('DISTANCE_TO_SAMPLES_IS_NOT_ROAD_MEMBERSHIP');return out;}
   const selected=context.confirmedCorridor||candidates[0].expressway,pool=candidates.filter(p=>p.expressway===selected),near=candidates.filter(p=>p.distanceM<=candidates[0].distanceM+margin);
   if(!pool.length||Math.min(...pool.map(p=>p.distanceM))>limit){reset();out.status='NO_SELECTED_REFERENCE';return out;}
   out.selectedReferenceCorridor=selected;out.roadAmbiguous=new Set(near.map(p=>p.expressway)).size>1;
   const best=Math.min(...pool.map(p=>p.distanceM)),eligible=pool.filter(p=>p.distanceM<=best+margin),min=Math.min(...eligible.map(p=>p.km)),max=Math.max(...eligible.map(p=>p.km));
   out.referenceBoundStatus=eligible.length>1?'AMBIGUOUS_REFERENCE_BOUNDS':'SINGLE_REFERENCE_BOUND';
   out.manualDirection=typeof context.manualBound==='string'?context.manualBound:null;
   out.reasons.push('REFERENCE_ONLY_NOT_SURVEY','NO_PHYSICAL_CONNECTIVITY_OR_GRADE_INFERRED');
   if(context.operationalUncertain===true){reset();out.status='OPERATIONAL_ROAD_HELD';out.reasons.push('HELD_MATCH_IS_NOT_NEW_STATIONING_EVIDENCE');return out;}
   if(context.interchange===true){reset();out.status='INTERCHANGE_REVIEW_REQUIRED';out.reasons.push('NO_MAINLINE_STATION_OR_DIRECTION_ON_INTERCHANGE');return out;}
   if(out.roadAmbiguous){reset();out.status='AMBIGUOUS_ROAD_REFERENCE';out.reasons.push('NEARBY_CORRIDORS_WITHIN_REPORTED_UNCERTAINTY');return out;}
   out.stationRange={minKm:min,maxKm:max,provenance:'CURRENT_REFERENCE_PROVISIONAL'};
   if(eligible.length>1){out.status='AMBIGUOUS_REFERENCE_BOUND';out.reasons.push('DISTANCE_DOES_NOT_SELECT_CARRIAGEWAY');}
   if(history.length&&history[0].expressway!==selected)reset();
   const km=(min+max)/2,item={lat:fix.lat,lon:fix.lon,accuracy:fix.accuracy,timestamp:fix.timestamp,km,expressway:selected},previous=history.at(-1),anchor=history[0];
   if(previous){const seconds=(fix.timestamp-previous.timestamp)/1000,expected=finite(fix.speed)&&fix.speed>=0?fix.speed*seconds:0;if(dist(previous,item)>Math.max(150,expected*3+50,Math.min(fix.accuracy,200)*3)){reset();history.push(item);out.reasons.push('POSITION_JUMP_HISTORY_RESET');return out;}}
   const convention=conventions[selected];
   if(anchor&&previous&&convention&&(max-min)*1000<=POLICY.minMovementM){
    const delta=(km-anchor.km)*1000,threshold=Math.max(POLICY.minMovementM,anchor.accuracy+fix.accuracy),step=dist(previous,item),net=dist(anchor,item),moving=step>=Math.max(3,fix.accuracy/2)&&(!finite(fix.speed)||fix.speed>=1);
    if(Math.abs(delta)>=threshold&&net>=threshold&&moving){
     const nextSign=delta>0?1:-1,referenceHeading=tangent(groups.get(eligible[0].referenceKey),fix);
     if(finite(fix.heading)&&fix.heading>=0&&fix.heading<360&&(referenceHeading===null||angle(fix.heading,(referenceHeading+(nextSign<0?180:0))%360)>POLICY.headingToleranceDeg)){votes=0;sign=0;out.reasons.push('HEADING_CONTRADICTS_STATION_MOVEMENT');}
     else {votes=nextSign===sign?votes+1:1;sign=nextSign;if(votes>=POLICY.minVotes)out.travelDirection={value:nextSign>0?convention.increasing:convention.decreasing,status:'PROVISIONAL_MOVEMENT_HINT',source:'OBSERVED_MOVEMENT_AND_EXISTING_APP_CONVENTION'};}
    }else {votes=0;sign=0;out.reasons.push('INSUFFICIENT_MOVEMENT_NOT_A_DIRECTION');}
   }else out.reasons.push(convention?'ESTABLISHING_MOVEMENT_HISTORY':'NO_EXISTING_DIRECTION_CONVENTION');
   history.push(item);if(history.length>POLICY.maxHistory)history.shift();
   if(out.manualDirection&&out.travelDirection.value&&out.manualDirection!==out.travelDirection.value)out.reasons.push('MANUAL_DIRECTION_DISAGREES_WITH_MOVEMENT_HINT');
   out.reasons.push('DIRECTION_HINT_DOES_NOT_RESOLVE_PHYSICAL_BOUND');return out;
  }
  return Object.freeze({evaluate,reset,state:()=>({historyCount:history.length,revision})});
 }
 return Object.freeze({create,POLICY});
});
