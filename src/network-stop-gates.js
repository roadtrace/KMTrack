/* Experimental spatial hold release only. No IO, GPS, calibration or operational outputs. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SPOTITNetworkStopGates=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const RAD=Math.PI/180,R=6371000;
 const POLICY=Object.freeze({maxAgeMs:12000,maxAccuracyM:20,armObservations:2,armMs:2000,postObservations:3,postMs:4000,minMovementM:20,departureObservations:3,departureMs:4000,departureMovementM:30,departureDistanceM:40,releaseMs:30000,maxEditDistanceM:100,maxLateralM:15});
 const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
 const xy=(p,c)=>[(p[0]-c[0])*RAD*R*Math.cos(c[1]*RAD),(p[1]-c[1])*RAD*R];
 const distance=(a,b)=>Math.hypot(...xy(a,b));
 function project(p,cs){let best={distanceM:Infinity},offset=0;for(let i=1;i<cs.length;i++){const a=xy(cs[i-1],p),b=xy(cs[i],p),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(!length)continue;const t=Math.max(0,Math.min(1,-(a[0]*dx+a[1]*dy)/(length*length))),d=Math.hypot(a[0]+t*dx,a[1]+t*dy);if(d<best.distanceM)best={distanceM:d,progressM:offset+t*length,segmentIndex:i-1};offset+=length;}return {...best,lengthM:offset};}
 function validate(dataset,context){
  // OGR/QGIS may discard foreign FeatureCollection metadata on save; authority is
  // still checked on every feature. Explicit conflicting metadata is refused.
  if(!dataset||dataset.schema!==undefined&&dataset.schema!=='KMTRACK_NETWORK_STOP_GATES_V1'||dataset.type!=='FeatureCollection'||dataset.provisional!==undefined&&dataset.provisional!==true||dataset.operationalUsePermitted!==undefined&&dataset.operationalUsePermitted!==false||!Array.isArray(dataset.features)||dataset.features.length>2000||context?.schema!=='KMTRACK_NETWORK_STOP_CONTEXT_V1'||context.provisional!==true||context.operationalUsePermitted!==false||!Array.isArray(context.sources)||context.sources.length>1200)throw Error('INVALID_NETWORK_STOP_DATASET');
  const sources=new Map(),ids=new Set();let n=0;
  for(const s of context.sources){if(!s.id||sources.has(s.id)||!['RAMP','ALIGNMENT'].includes(s.kind)||!Array.isArray(s.coordinates)||s.coordinates.length<2||!s.coordinates.every(validPoint)||s.kind==='RAMP'&&!s.site)throw Error('INVALID_NETWORK_STOP_SOURCE');n+=s.coordinates.length;sources.set(s.id,s);}if(n>150000)throw Error('NETWORK_STOP_SOURCE_LIMIT');
  const invalid=[],gates=[];
  for(const f of dataset.features){const p=f.properties,c=f.geometry?.coordinates,s=p&&sources.get(p.source_id);if(!p?.gate_id||ids.has(p.gate_id))throw Error('DUPLICATE_OR_MISSING_GATE_ID');ids.add(p.gate_id);
   let reason=null;if(f.geometry?.type!=='Point'||!validPoint(c)||!s||typeof p.site!=='string'||!Number.isFinite(p.bearing_deg)||p.bearing_deg<0||p.bearing_deg>=360||!['RAMP_TERMINAL_DEPARTURE','ALIGNMENT_DEPARTURE'].includes(p.kind)||s.kind==='RAMP'&&s.site!==p.site||!context.sources.some(x=>x.kind==='RAMP'&&x.site===p.site))reason='INVALID_GATE_FIELDS';
   else if(!['NB','SB','UNKNOWN'].includes(p.bound)||!['ENTRY','EXIT','UNKNOWN','HOLD_RELEASE_ONLY'].includes(p.transition)||typeof p.approach!=='string'||typeof p.maintenance!=='string'||s.kind==='ALIGNMENT'&&p.bound!==s.bound)reason='SOURCE_BOUND_OR_ROLE_FIELDS_INVALID';
   else if(!validPoint([p.source_lon,p.source_lat])||distance(c,[p.source_lon,p.source_lat])>POLICY.maxEditDistanceM||project(c,s.coordinates).distanceM>20)reason='EDIT_OUTSIDE_SOURCE_SUPPORT';
   else if(p.engineering_approval!==0||p.connectivity!=='UNKNOWN'||p.physical_carriageway!=='UNKNOWN'||p.status!=='PROVISIONAL_GEOMETRY_ONLY')reason='UNSUPPORTED_AUTHORITY_FIELDS';
   else if(p.enabled!==1)reason='DISABLED_FOR_REVIEW';
   else if(s.kind==='RAMP'&&s.travel==='forward'&&p.approach.includes('TERMINAL_A'))reason='OPPOSES_EXPLICIT_SOURCE_TRAVEL';
   else if(s.kind==='RAMP'&&project(c,s.coordinates).lengthM<20)reason='INSUFFICIENT_SOURCE_APPROACH_LENGTH';
   if(!reason){const i=project(c,s.coordinates).segmentIndex,a=s.coordinates[i],b=s.coordinates[i+1],v=xy(b,a),expected=(Math.atan2(v[0],v[1])/RAD+360+(s.kind==='RAMP'&&p.approach.includes('TERMINAL_A')?180:0))%360;if(Math.abs(((p.bearing_deg-expected+540)%360)-180)>60)reason='BEARING_UNSUPPORTED_BY_SOURCE_TANGENT';}
   if(reason)invalid.push({id:p.gate_id,site:p.site,reason,detail:p.verification||null});else gates.push({...p,coordinate:c,source:s});
  }return {sources,gates,invalid};
 }
 function create(dataset,context){
  // Copy input: later external mutation cannot change an active worker's gates.
  const data=JSON.parse(JSON.stringify(dataset)),ctx=JSON.parse(JSON.stringify(context)),{sources,gates,invalid}=validate(data,ctx);
  const ramps=[...sources.values()].filter(s=>s.kind==='RAMP');let previous=null,states=new Map(),occupancy=null,releases=new Map();
  function reset(){previous=null;states.clear();occupancy=null;releases.clear();}
  function evaluate(fix,now,reviewZones=[]){
   const out={status:'NO_CURRENT_INTERCHANGE',provisional:true,operationalUsePermitted:false,activeInterchange:null,approach:null,gateId:null,distanceM:null,crossing:'NONE',holdRequired:false,releaseSites:[],geometryUsableGates:gates.length,invalidGates:invalid,reasons:[],connectivity:'UNKNOWN',physicalCarriageway:'UNKNOWN',maintenance:'UNKNOWN',gates:[],maintenanceNotes:ctx.maintenanceNotes||[],restrictions:ctx.restrictions};
   const p=fix&&[fix.lon,fix.lat];
   if(!fix||!validPoint(p)||![fix.accuracy,fix.timestamp,now].every(Number.isFinite)||fix.accuracy<0||now-fix.timestamp<0||now-fix.timestamp>POLICY.maxAgeMs||(fix.speed!=null&&(!Number.isFinite(fix.speed)||fix.speed<0))||(fix.heading!=null&&(!Number.isFinite(fix.heading)||fix.heading<0||fix.heading>=360))){reset();out.status='INVALID_OR_STALE_FIX';out.holdRequired=true;out.reasons.push('FRESH_VALID_OBSERVATION_REQUIRED');return out;}
   let continuity=true;
   if(previous&&(fix.timestamp<=previous.timestamp||fix.timestamp-previous.timestamp>POLICY.maxAgeMs||distance(p,[previous.lon,previous.lat])>Math.max(150,(fix.speed||0)*(fix.timestamp-previous.timestamp)/1000*3+50))){reset();continuity=false;out.reasons.push('DISCONTINUITY_HISTORY_RESET');}
   const margin=Math.max(3,fix.accuracy),proximity=ramps.map(s=>({source:s,...project(p,s.coordinates)})).sort((a,b)=>a.distanceM-b.distanceM),near=proximity.filter(s=>s.distanceM<=80+Math.min(100,margin)),rampBest=near[0];
   const candidates=near.filter(r=>r.distanceM<=(rampBest?.distanceM??0)+margin),sites=[...new Set(candidates.map(r=>r.source.site))];
   const step=previous?distance(p,[previous.lon,previous.lat]):0;
   const precise=fix.accuracy<=POLICY.maxAccuracyM,spatial=!!rampBest&&rampBest.distanceM<=Math.max(12,margin),unique=candidates.length===1;
   // Acquire a site from close evidence. Several segments of the SAME site do
   // not mean the vehicle departed that site. Stops and small per-fix movements
   // must not start a six-second countdown under a bridge or in traffic.
   if(rampBest&&spatial&&sites.length===1&&precise&&(!occupancy||occupancy.departed))occupancy={site:rampBest.source.site,name:rampBest.source.name,since:fix.timestamp,supportedAt:fix.timestamp,departure:null,departed:false};
   const restricted=reviewZones.some(g=>g.kind==='UNRESOLVED_BOUNDARY'&&g.distanceM<=100+margin);
   if(restricted)out.reasons.push('UNRESOLVED_ENGINEERING_BOUNDARY_RELEASE_WITHHELD');
   const gateRows=gates.map(g=>{const v=xy(p,g.coordinate),b=g.bearing_deg*RAD,along=v[0]*Math.sin(b)+v[1]*Math.cos(b),lateral=Math.abs(v[0]*Math.cos(b)-v[1]*Math.sin(b));return {g,distanceM:Math.hypot(...v),along,lateral,projection:project(p,g.source.coordinates)};}).filter(r=>r.distanceM<=200).sort((a,b)=>a.distanceM-b.distanceM);
   const recentSources=new Set();
   for(const row of gateRows){const {g,along,lateral,projection}=row;const st=states.get(g.gate_id)||{before:null,armed:false,after:null,last:null};states.set(g.gate_id,st);
    const errors=[],threshold=margin+5;
    if(!continuity)errors.push('HISTORY_RESET');if(!precise)errors.push('GPS_ACCURACY_TOO_LARGE');if(restricted)errors.push('ENGINEERING_REVIEW_ZONE');if(lateral>Math.max(POLICY.maxLateralM,margin))errors.push('OUTSIDE_GATE_CORRIDOR');
    if(g.source.kind==='ALIGNMENT'&&projection.distanceM>Math.max(12,margin))errors.push('OUTSIDE_DIRECTED_SOURCE');
    if(g.source.kind==='RAMP'&&along<0&&projection.distanceM>Math.max(12,margin))errors.push('OUTSIDE_RAMP_SOURCE');
    const rival=ramps.filter(r=>r.id!==g.source_id).map(r=>({site:r.site,d:project(p,r.coordinates).distanceM})).some(r=>r.d<=Math.max(10,margin)&&r.d<=projection.distanceM+margin);
    if(rival)errors.push('OVERLAPPING_APPROACHES');
    if(sites.length>1)errors.push('MULTIPLE_INTERCHANGE_SITES');
    if(fix.heading!=null&&Math.abs(((fix.heading-g.bearing_deg+540)%360)-180)>60)errors.push('HEADING_OPPOSES_GATE');
    if(fix.speed!=null&&fix.speed<1)errors.push('STOPPED_SPEED');
    if(st.last&&along<st.last.along-Math.max(3,margin))errors.push('REVERSED_GATE_MOVEMENT');
    if(st.last&&fix.timestamp-st.last.timestamp>POLICY.maxAgeMs)errors.push('GATE_OBSERVATION_GAP');
    let phase='WAITING_FOR_APPROACH';
    if(errors.length){st.before=null;st.armed=false;st.after=null;phase='WITHHELD';}
    else if(along<=-threshold){
     if(!st.before)st.before={timestamp:fix.timestamp,along,count:1,point:p};else if(!st.last||along-st.last.along>=Math.max(2,margin/2))st.before.count++;
     st.armed=st.before.count>=POLICY.armObservations&&fix.timestamp-st.before.timestamp>=POLICY.armMs&&along-st.before.along>=Math.max(5,margin);
     st.after=null;phase=st.armed?'ARMED':'ACQUIRING_APPROACH';
    }else if(st.armed&&along>=threshold){
     if(!st.after)st.after={timestamp:fix.timestamp,count:1,along};else if(st.last&&along-st.last.along>=Math.max(2,margin/2))st.after.count++;
     phase='CONFIRMING_CROSSING';
     const departed=near.every(r=>r.distanceM>Math.max(15,2*margin));
     if(st.after.count>=POLICY.postObservations&&fix.timestamp-st.after.timestamp>=POLICY.postMs&&along-st.before.along>=Math.max(POLICY.minMovementM,2*margin)&&departed){phase='CROSSED_RELEASED';releases.set(g.site,{gate:g,at:fix.timestamp,point:p});}
     else if(!departed)errors.push('OTHER_OR_REMAINING_RAMP_CONTEXT');
    }else if(st.armed){phase='ARMED_WAITING_FOR_CLEAR_CROSSING';st.after=null;}
    st.last={timestamp:fix.timestamp,along};recentSources.add(g.gate_id);
    out.gates.push({id:g.gate_id,site:g.site,name:g.name,approach:g.approach,bound:g.bound,distanceM:row.distanceM,signedDistanceM:along,lateralM:lateral,status:phase,observations:st.after?.count||st.before?.count||0,reasons:errors,maintenance:g.maintenance,kind:g.kind});
   }
   for(const key of states.keys())if(!recentSources.has(key))states.delete(key);
   for(const [site,release]of releases){const v=xy(p,release.gate.coordinate),b=release.gate.bearing_deg*RAD,along=v[0]*Math.sin(b)+v[1]*Math.cos(b);if(!precise||restricted||fix.timestamp-release.at>POLICY.releaseMs||along<=margin||near.some(r=>r.source.site===site&&r.distanceM<=Math.max(12,margin)))releases.delete(site);}
   out.releaseSites=[...releases.keys()];
   const active=out.gates.find(g=>g.status==='CROSSED_RELEASED')||out.gates.find(g=>g.status.includes('CROSSING'))||out.gates.find(g=>g.status.startsWith('ARMED'))||out.gates[0];
   if(active){out.activeSite=active.site;out.activeInterchange=active.name;out.approach=active.approach;out.gateId=active.id;out.distanceM=active.distanceM;out.crossing=active.status;out.maintenance=active.maintenance;out.reasons.push(...active.reasons);}
   if(occupancy){
    const siteDistance=proximity.find(r=>r.source.site===occupancy.site)?.distanceM??Infinity;
    const outsideDistance=Math.max(POLICY.departureDistanceM,3*margin);
    const released=releases.has(occupancy.site);
    if(released)occupancy.departed=true;
    if(!occupancy.departed){
     if(siteDistance<=outsideDistance){occupancy.departure=null;if(precise)occupancy.supportedAt=fix.timestamp;}
     else if(precise&&continuity&&previous&&!restricted&&fix.speed!==0){
      if(!occupancy.departure)occupancy.departure={timestamp:fix.timestamp,point:p,count:1};else occupancy.departure.count++;
      const d=occupancy.departure;
      if(d.count>=POLICY.departureObservations&&fix.timestamp-d.timestamp>=POLICY.departureMs&&distance(d.point,p)>=Math.max(POLICY.departureMovementM,2*margin))occupancy.departed=true;
     }else occupancy.departure=null;
    }
    out.activeInterchange=occupancy.departed?null:occupancy.name;
    out.status=released?'PROVISIONAL_HOLD_RELEASED':occupancy.departed?'DEPARTURE_CONFIRMED':'INTERCHANGE_CONTEXT_HELD';
    out.holdRequired=!occupancy.departed;
    out.occupancy={site:occupancy.site,status:out.status,ageMs:fix.timestamp-occupancy.supportedAt,distanceM:siteDistance,departureThresholdM:outsideDistance,departureObservations:occupancy.departure?.count||0};
    if(occupancy.departed&&!released)out.reasons.push('REPEATED_MOVEMENT_OUTSIDE_INTERCHANGE_GEOMETRY_NO_ROAD_MATCH_INFERRED');
    else if(!precise)out.reasons.push('LAST_INTERCHANGE_RETAINED_GPS_WEAK_NO_DEPARTURE_PROOF');
   }
   else if(releases.size)out.status='PROVISIONAL_HOLD_RELEASED';
   if(releases.size&&!out.holdRequired&&near.some(r=>r.distanceM<=50+margin&&!releases.has(r.source.site))){out.status='OCCUPANCY_EXPIRED_UNCERTAIN';out.holdRequired=false;out.reasons.push('OTHER_SITE_NOT_RELEASED_BY_THIS_GATE_UNCERTAINTY_REMAINS');}
   if(!precise)out.reasons.push('POOR_ACCURACY_NO_GATE_RELEASE');
   if(!out.gates.length&&near.length)out.reasons.push('MISSING_OR_UNSUPPORTED_GATE');
   if(!unique&&near.length)out.reasons.push('APPROACH_ATTRIBUTION_AMBIGUOUS');
   out.reasons.push('HOLD_RELEASE_IS_NOT_ENTRY_EXIT_CONNECTIVITY_OR_MAINLINE_APPROVAL');
   previous={...fix};return out;
  }
  return Object.freeze({evaluate,reset,coverage:()=>({generated:data.features.length,usable:gates.length,invalid})});
 }
 function assessReference(fix,reference,geometry){
  const stop=geometry.networkStop,near=geometry.nearbyInterchanges||geometry.interchanges||[];
  if(!stop||!near.length||near.every(r=>stop.releaseSites.includes(r.site))||stop.holdRequired)return {required:false,supported:false};
  const refRows=(reference.candidates||[]).filter(r=>r.expressway===reference.selectedReferenceCorridor),refDistance=refRows.length?Math.min(...refRows.map(r=>r.distanceM)):Infinity,rampDistance=Math.min(...near.map(r=>r.distanceM)),id=reference.referenceIdentification;
  const supported=fix.accuracy<=20&&refDistance<=10&&rampDistance-refDistance>2*Math.max(3,fix.accuracy)&&id?.status==='INDEPENDENT_REFERENCE_CANDIDATE'&&id.observations>=5&&id.elapsedMs>=8000&&id.movementM>=Math.max(40,2*fix.accuracy)&&!!reference.travelDirection?.value;
  return {required:true,supported,status:supported?'INDEPENDENT_REFERENCE_ONLY_APPROACH_UNKNOWN':'UNCERTAIN_APPROACH_REFERENCE_WITHHELD',referenceDistanceM:Number.isFinite(refDistance)?refDistance:null,rampDistanceM:rampDistance,connectivity:'UNKNOWN'};
 }
 return Object.freeze({create,validate,project,distance,assessReference,POLICY});
});
