/* Reconstruction evidence review only. No KM derivation, joins, IO or operational authority. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SPOTITReconstructionReview=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const finite=Number.isFinite,R=6371000,rad=Math.PI/180;
 function distance(a,b){const lat=(a.lat+b.lat)/2*rad;return Math.hypot((a.lon-b.lon)*rad*R*Math.cos(lat),(a.lat-b.lat)*rad*R);}
 function project(fix,coordinates){
  let best=null,offset=0;
  for(let i=1;i<coordinates.length;i++){
   const a=coordinates[i-1],b=coordinates[i],scale=rad*R*Math.cos(fix.lat*rad),ax=(a[0]-fix.lon)*scale,ay=(a[1]-fix.lat)*rad*R,bx=(b[0]-fix.lon)*scale,by=(b[1]-fix.lat)*rad*R,dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);if(!len)continue;
   const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(len*len))),d=Math.hypot(ax+t*dx,ay+t*dy);
   if(!best||d<best.distanceM)best={distanceM:d,localProgressM:offset+t*len,bearingDeg:(Math.atan2(dx,dy)/rad+360)%360,segmentIndex:i-1};offset+=len;
  }if(best)best.remainingM=Math.max(0,offset-best.localProgressM);return best;
 }

 // User field knowledge is not geometry/asset approval. No screenshot coordinates used.
 function assessBalintawak(fix,reference,geometry){
  const relevant=geometry.interchanges?.filter(r=>r.site==='nlex_balintawak')||[];
  if(!relevant.length&&geometry.transitionContext?.site!=='nlex_balintawak')return null;
  const east=relevant.find(r=>r.id==='nlex_balintawak_004'),others=relevant.filter(r=>r.id!=='nlex_balintawak_004');
  const rows=(reference.candidates||[]).filter(r=>r.expressway==='NLEX'),d=rows.length?Math.min(...rows.map(r=>r.distanceM)):Infinity;
  const id=reference.referenceIdentification,margin=2*Math.max(3,fix.accuracy);
  const supported=!!east&&!others.length&&!geometry.gates?.length&&fix.accuracy<=20&&d<=10&&east.distanceM-d>margin&&id?.status==='INDEPENDENT_REFERENCE_CANDIDATE'&&id.corridor==='NLEX'&&id.observations>=5&&id.elapsedMs>=8000&&id.movementM>=Math.max(40,margin)&&reference.travelDirection?.value==='NB';
  return {status:supported?'REFERENCE_PREFERRED_APPROACH_ID_UNKNOWN':relevant.length?'AMBIGUOUS_APPROACH_OR_MAINLINE':'NO_CURRENT_APPROACH_CONTEXT',releaseReferenceHold:supported,shortRamp:{representation:'NO_SEPARATE_VERIFIED_LINE',maintenanceScope:'USER_REPORTED_NLEX_MAINTAINED',geometryApproved:false},longApproach:{geometryId:'nlex_balintawak_004',mapping:'POSSIBLE_LONG_SERVICE_ROAD_NOT_CONFIRMED',assetScope:'USER_REPORTED_LGU_OWNED_OUTSIDE_NLEX_MAINTENANCE'},assetAttribution:'SOURCE_FEATURE_TO_APPROACH_MAPPING_UNVERIFIED',connectivity:'UNKNOWN',greenMarker:{status:'PROPOSED_BOUNDARY_NOT_GEOREFERENCED_OR_APPROVED',coordinate:null,gateActive:false},referenceDistanceM:Number.isFinite(d)?d:null,eastShapeDistanceM:east?.distanceM??null,requiredSeparationM:margin,reason:supported?'REPEATED_REFERENCE_MOVEMENT_AND_DISTANCE_DOMINANCE_NOT_A_GATE_CROSSING':'PROXIMITY_CANNOT_ATTRIBUTE_SHORT_RAMP_SERVICE_ROAD_OR_MAINLINE'};
 }
 function create(input,stopEngine=null){
  if(input?.schema!=='KMTRACK_RECONSTRUCTION_EVIDENCE_V1'||input.provisional!==true||input.operationalUsePermitted!==false||input.stationingEstablished!==false||input.crs!=='EPSG:4326'||input.coordinateOrder!=='longitude,latitude'||!Array.isArray(input.alignments)||input.alignments.length>400||!Array.isArray(input.gates)||input.gates.length>100||!Array.isArray(input.interchanges)||input.interchanges.length>1000)throw Error('UNTRUSTED_RECONSTRUCTION_MODEL');
  const model=JSON.parse(JSON.stringify(input));let points=0;
  function coords(rows){if(!Array.isArray(rows)||rows.length<2)throw Error('INVALID_COORDINATES');for(const p of rows){points++;if(!Array.isArray(p)||p.length!==2||!p.every(finite)||Math.abs(p[0])>180||Math.abs(p[1])>90)throw Error('INVALID_COORDINATES');}}
  for(const a of model.alignments){coords(a.coordinates);if(a.approved!==false||!['NB','SB'].includes(a.bound)||!a.source||a.tags?.oneway!=='yes'||a.nodes?.length!==a.coordinates.length)throw Error('UNTRUSTED_SOURCE_WAY');}
  for(const a of model.interchanges)coords(a.coordinates);if(points>100000)throw Error('MODEL_SIZE_LIMIT');
  for(const g of model.gates)if(g.approved!==false||!g.source||!Array.isArray(g.coordinate)||g.coordinate.length!==2||!g.coordinate.every(finite)||Math.abs(g.coordinate[0])>180||Math.abs(g.coordinate[1])>90||!['BRANCH_MERGE_REVIEW_CONTEXT','UNRESOLVED_BOUNDARY'].includes(g.kind))throw Error('INVALID_GATE');
  // Bounded diagnostic history: one retained source way and one pending contender.
  // These are software review thresholds, never engineering connection approvals.
  const STABILITY_POLICY=Object.freeze({observations:3,elapsedMs:4000,movementM:20,holdMs:6000});
  const sourceWays=new Map(model.alignments.map(a=>[a.id,a]));
  let retained=null,pending=null,conflictSince=null,continuityLost=false,lastInterchange=null,networkDeparturePending=false,previousNetworkStatus=null;
  function resetStability(){retained=null;pending=null;conflictSince=null;continuityLost=false;}
  function label(row){return row?{id:row.id,wayId:row.wayId,bound:row.bound,fragment:row.fragment}:null;}
  function stabilityBase(status='MATCH_WITHHELD'){
   return {status,currentMatchAvailable:false,currentCandidate:null,retainedCandidate:label(retained),instantCandidate:null,pendingCandidate:null,consistentObservations:0,requiredObservations:STABILITY_POLICY.observations,elapsedMs:0,movementM:0,continuity:'UNKNOWN',reasons:[]};
  }
  function sourceContinuity(from,to){
   const a=sourceWays.get(from.id),b=sourceWays.get(to.id);
   if(a.bound!==b.bound)return 'DIRECTIONAL_CARRIAGEWAY_CHANGE_UNPROVEN';
   if(a.fragment!==b.fragment)return 'FRAGMENT_GAP_NOT_BRIDGED';
   if(a.nodes.at(-1)!==b.nodes[0]||a.coordinates.at(-1)[0]!==b.coordinates[0][0]||a.coordinates.at(-1)[1]!==b.coordinates[0][1])return 'NO_EXACT_DIRECTED_SHARED_ENDPOINT';
   if(['bridge','layer','tunnel','covered'].some(tag=>String(a.tags[tag]??'UNKNOWN')!==String(b.tags[tag]??'UNKNOWN')))return 'GRADE_TAG_TRANSITION_REQUIRES_REVIEW';
   if(from.remainingM>80+from.accuracy||to.localProgressM>80+Math.min(50,from.accuracy))return 'OBSERVATIONS_DO_NOT_SUPPORT_ENDPOINT_PASSAGE';
   return null;
  }
  function stabilize(out,fix,rows){
   const best=rows[0]||null,rawHint=out.boundHint,st=stabilityBase();
   st.instantCandidate=label(best);out.boundHint=null;out.stability=st;
   const publish=(status,reasons=[])=>{
    st.status=status;st.retainedCandidate=continuityLost?null:label(retained);st.pendingCandidate=pending?label(pending.row):null;
    st.consistentObservations=pending?.count||(st.currentMatchAvailable?retained?.confirmation?.count:0)||0;
    st.elapsedMs=pending?Math.max(0,fix.timestamp-pending.start.timestamp):(st.currentMatchAvailable?retained?.confirmation?.elapsedMs:0)||0;
    st.movementM=pending?distance(pending.start,fix):(st.currentMatchAvailable?retained?.confirmation?.movementM:0)||0;
    st.reasons=reasons;out.reasons.push(...reasons);return out;
   };
   if(out.reasons.includes('POSITION_JUMP_HISTORY_RESET')){
    pending=null;if(retained){continuityLost=true;conflictSince=fix.timestamp;}else resetStability();return publish('MATCH_WITHHELD',['POSITION_JUMP_INVALIDATES_CONTINUITY']);
   }
   const unsupported=out.status.startsWith('AMBIGUOUS')||!out.candidates.length||fix.accuracy>50||out.gates.length>0||out.interchanges.length>0||(out.networkStop?.status==='OCCUPANCY_EXPIRED_UNCERTAIN'&&out.nearbyInterchanges?.length>0)||best?.tags['access:conditional'];
   const directionRejected=out.movement==='AGAINST_SOURCE_ORDER'||out.reasons.includes('GPS_HEADING_CONTRADICTS_SOURCE_DIRECTION')||out.reasons.includes('REPORTED_STOPPED_SPEED');
   function hold(reason){
    pending=null;
    if(!retained)return publish('MATCH_WITHHELD',[reason]);
    if(conflictSince===null)conflictSince=fix.timestamp;
    if(fix.timestamp-conflictSince>=STABILITY_POLICY.holdMs)continuityLost=true;
    return publish(continuityLost?'MATCH_WITHHELD':'TRANSITION_UNCERTAIN',[reason,'LAST_CANDIDATE_IS_CONTEXT_ONLY_NOT_CURRENT_MATCH']);
   }
   if(unsupported)return hold(out.gates.length||out.interchanges.length?'TRANSITION_CONTEXT_IS_NOT_CONNECTION_PROOF':!out.candidates.length?'NO_ELIGIBLE_GEOMETRY_FOR_CURRENT_FIX':'CURRENT_GEOMETRY_OR_ACCURACY_INSUFFICIENT');
   if(directionRejected)return hold('CURRENT_MOVEMENT_OR_HEADING_REJECTED');
   const previousProjection=retained&&rows.find(r=>r.id===retained.id);
   if(retained&&best.id===retained.id&&previousProjection&&last){
    const progressDelta=previousProjection.localProgressM-retained.localProgressM;
    const spatial=distance(retained.fix,fix),uncertainty=retained.accuracy+fix.accuracy;
    if(Math.abs(progressDelta)>spatial+Math.max(30,uncertainty*2))return hold('SOURCE_PROGRESS_DISCONTINUITY');
    if(progressDelta<-Math.max(5,uncertainty))return hold('SOURCE_PROGRESS_REVERSED');
   }
   let independent=networkDeparturePending,continuity=retained?'SAME_SOURCE_WAY':'INITIAL_SOURCE_WAY';
   if(retained&&best.id!==retained.id){
    const reason=sourceContinuity(retained,best);
    if(reason){
     if(conflictSince===null)conflictSince=fix.timestamp;
     if(fix.timestamp-conflictSince<STABILITY_POLICY.holdMs)return hold(reason);
     continuityLost=true;independent=true;continuity='UNKNOWN_INDEPENDENT_IDENTIFICATION';out.reasons.push(reason,'PREVIOUS_CANDIDATE_EXPIRED_NO_CONNECTION_INFERRED');
    }else continuity='DIRECTED_SHARED_NODE_SOURCE_ONLY';
   }
   st.continuity=continuity;st.requiredObservations=independent?5:STABILITY_POLICY.observations;
   function accept(){
    const changed=retained&&retained.id!==best.id;
    const confirmation=pending?{count:pending.count,elapsedMs:fix.timestamp-pending.start.timestamp,movementM:distance(pending.start,fix)}:retained?.confirmation;
    retained={confirmation,...label(best),remainingM:best.remainingM,localProgressM:best.localProgressM,accuracy:fix.accuracy,fix:{...fix}};
    pending=null;conflictSince=null;continuityLost=false;networkDeparturePending=false;
    st.currentMatchAvailable=true;st.currentCandidate=label(retained);out.boundHint=best.bound;
    return publish(independent?'INDEPENDENT_CANDIDATE_REACQUIRED':'CANDIDATE_RETAINED',[independent?'INDEPENDENT_ROADWAY_CANDIDATE_NOT_TRANSITION_PROOF':changed?'REPEATED_MOVEMENT_SUPPORTS_SOURCE_ENDPOINT_SEQUENCE_ONLY':'REPEATED_OBSERVATIONS_SUPPORT_SAME_SOURCE_WAY','PROVISIONAL_MATCH_NOT_PHYSICAL_CONTINUITY_APPROVAL']);
   }
   if(retained&&retained.id===best.id&&conflictSince===null&&!continuityLost){
    if(rawHint===best.bound)return accept();
    pending=null;return publish('MATCH_WITHHELD',['RETAINED_CANDIDATE_NEEDS_CURRENT_DIRECTION_EVIDENCE']);
   }
   if(!pending||pending.row.id!==best.id)pending={row:label(best),start:{...fix},count:1};
   else pending.count=Math.min(5,pending.count+1);
   if(pending.count>=(independent?5:STABILITY_POLICY.observations)&&fix.timestamp-pending.start.timestamp>=(independent?8000:STABILITY_POLICY.elapsedMs)&&distance(pending.start,fix)>=Math.max(independent?40:STABILITY_POLICY.movementM,pending.start.accuracy+fix.accuracy)&&rawHint===best.bound)return accept();
   return publish(independent?'INDEPENDENT_CANDIDATE_ACQUIRING':retained?'TRANSITION_UNCERTAIN':'ACQUIRING',[...(independent?['TRANSITION_CONNECTIVITY_UNKNOWN']:[]),'WAITING_FOR_REPEATED_FRESH_DIRECTIONAL_MOVEMENT','PROVISIONAL_MATCH_WITHHELD_DURING_CONFIRMATION']);
  }
  let anchor=null,last=null,votes=0;
  function resetMovement(){anchor=null;last=null;votes=0;}
  function reset(){resetMovement();resetStability();lastInterchange=null;networkDeparturePending=false;previousNetworkStatus=null;stopEngine?.reset();}
  function evaluate(fix,evaluationTime){
   const out={stability:stabilityBase(),status:'UNAVAILABLE',provisional:true,operationalUsePermitted:false,km:null,physicalCarriageway:'UNKNOWN',connectivity:'UNKNOWN',grade:'UNKNOWN',boundHint:null,movement:'UNKNOWN',candidates:[],gates:[],interchanges:[],reasons:[],eligibleWays:model.alignments.length,excludedWays:model.excluded||[],sourceBasis:'Retained QGIS/OSM candidates, not official station anchors',measurement:'Local tangent-plane segment proximity only; not calibrated chainage'};
   if(!fix||![fix.lat,fix.lon,fix.accuracy,fix.timestamp,evaluationTime].every(finite)||Math.abs(fix.lat)>90||Math.abs(fix.lon)>180||fix.accuracy<0||evaluationTime-fix.timestamp<0||evaluationTime-fix.timestamp>12000||(fix.heading!=null&&(!finite(fix.heading)||fix.heading<0||fix.heading>=360))||(fix.speed!=null&&(!finite(fix.speed)||fix.speed<0))){reset();out.stability=stabilityBase();out.status='INVALID_OR_STALE_FIX';out.reasons.push('FRESH_VALID_OBSERVATION_REQUIRED');return out;}
   if(last&&fix.timestamp<=last.fix.timestamp){reset();out.stability=stabilityBase();out.status='INVALID_OR_STALE_FIX';out.reasons.push('NON_INCREASING_OBSERVATION_TIME');return out;}
   if(last&&fix.timestamp-last.fix.timestamp>12000){reset();out.stability=stabilityBase();out.reasons.push('OBSERVATION_GAP_HISTORY_RESET');}
   const margin=Math.max(3,Math.min(200,fix.accuracy));
   const rows=model.alignments.map(a=>{const p=project(fix,a.coordinates);return p?{...p,id:a.id,wayId:a.wayId,bound:a.bound,fragment:a.fragment,source:a.source,tags:a.tags,nodes:[a.nodes[p.segmentIndex],a.nodes[p.segmentIndex+1]]}:null;}).filter(Boolean).sort((a,b)=>a.distanceM-b.distanceM||(a.id<b.id?-1:a.id>b.id?1:0));
   out.candidates=rows.filter(x=>x.distanceM<=100+margin).slice(0,8).map(x=>({...x,reasons:[],movement:'UNKNOWN'}));
   for(const g of model.gates){const d=distance(fix,{lon:g.coordinate[0],lat:g.coordinate[1]});if(d<=100+margin){const previous=last?distance(last.fix,{lon:g.coordinate[0],lat:g.coordinate[1]}):null;out.gates.push({id:g.id,anchor:g.anchor,kind:g.kind,distanceM:d,phase:previous===null?'NEAR':previous-d>3?'APPROACHING':d-previous>3?'DEPARTING':'NEAR',source:g.source,connectivity:'UNKNOWN'});}}
   for(const ramp of model.interchanges){const p=project(fix,ramp.coordinates);if(p&&p.distanceM<=50+margin)out.interchanges.push({id:ramp.id,site:ramp.site,name:ramp.id==='nlex_balintawak_004'?'Eastern access shape 004 - approach mapping unverified':ramp.name,distanceM:p.distanceM,direction:'UNKNOWN',connectivity:'UNKNOWN',source:ramp.source});}
   out.interchanges.sort((a,b)=>a.distanceM-b.distanceM);out.interchanges=out.interchanges.slice(0,4);
   if(stopEngine){
    out.networkStop=stopEngine.evaluate(fix,evaluationTime,out.gates);out.nearbyInterchanges=out.interchanges;
    if(previousNetworkStatus==='INTERCHANGE_CONTEXT_HELD'&&out.networkStop.status!=='INTERCHANGE_CONTEXT_HELD'){resetMovement();resetStability();networkDeparturePending=true;out.reasons.push('NETWORK_CONTEXT_RELEASE_REQUIRES_INDEPENDENT_REACQUISITION');}
    previousNetworkStatus=out.networkStop.status;
    out.interchanges=out.networkStop.holdRequired?out.interchanges:[];
    out.reasons.push(...out.networkStop.reasons);
   }
   if(out.interchanges.length)lastInterchange={name:out.interchanges[0].name,site:out.interchanges[0].site,timestamp:fix.timestamp};
   const contextAge=lastInterchange?fix.timestamp-lastInterchange.timestamp:null;
   out.transitionContext={site:lastInterchange?.site??null,status:out.interchanges.length?'CURRENT_SPATIAL_CONTEXT':lastInterchange?(contextAge>=6000?'EXPIRED':'DEPARTED_CONTEXT_ONLY'):'NONE',previousName:lastInterchange&&!out.interchanges.length&&contextAge<6000?lastInterchange.name:null,ageMs:contextAge,continuity:'UNKNOWN',gateApproval:'NOT_ESTABLISHED'};
   if(out.gates.length)out.reasons.push('PROXIMITY_REVIEW_GATE_ONLY_NOT_APPROVED_CONNECTIVITY');
   if(out.interchanges.length)out.reasons.push('INTERCHANGE_GEOMETRY_NEARBY_NO_DIRECTED_TRANSITION_PROOF');
   if(!out.candidates.length){resetMovement();out.status='OUTSIDE_RETAINED_GEOMETRY';out.reasons.push('NO_GEOMETRY_INVENTED_OUTSIDE_COVERAGE');const reviewed=stabilize(out,fix,rows);last={fix:{...fix}};return reviewed;}
   const best=rows[0],near=rows.filter(x=>x.distanceM<=best.distanceM+margin);out.status=new Set(near.map(x=>x.bound)).size>1?'AMBIGUOUS_DIRECTIONAL_GEOMETRY':'PROVISIONAL_GEOMETRY_PROXIMITY';
   if(out.status!=='AMBIGUOUS_DIRECTIONAL_GEOMETRY'&&near.some(c=>c.id!==best.id&&!c.nodes.some(n=>best.nodes.includes(n)))){out.status='AMBIGUOUS_SAME_BOUND_GEOMETRY';out.reasons.push('NONCONTIGUOUS_SOURCE_WAYS_WITHIN_UNCERTAINTY');}
   if(out.status==='AMBIGUOUS_DIRECTIONAL_GEOMETRY')out.reasons.push('NB_SB_WITHIN_REPORTED_UNCERTAINTY');
   if(best.tags['access:conditional'])out.reasons.push('SOURCE_ACCESS_CONDITIONAL_REQUIRES_REVIEW');
   if(fix.accuracy>50)out.reasons.push('REPORTED_ACCURACY_TOO_LARGE_FOR_DIRECTION_HINT');
   if(!anchor||anchor.id!==best.id){anchor={id:best.id,fix:{...fix},progress:best.localProgressM};votes=0;out.reasons.push('WAY_CHANGED_HISTORY_RESET_NO_FRAGMENT_BRIDGING');}
   if(last&&distance(last.fix,fix)>Math.max(150,(fix.speed||0)*(fix.timestamp-last.fix.timestamp)/1000*3+50,fix.accuracy*3)){anchor={id:best.id,fix:{...fix},progress:best.localProgressM};votes=0;out.reasons.push('POSITION_JUMP_HISTORY_RESET');}
   const delta=best.localProgressM-anchor.progress,threshold=Math.max(20,anchor.fix.accuracy+fix.accuracy);
   if(Math.abs(delta)>=threshold&&distance(anchor.fix,fix)>=threshold){
    out.movement=delta>0?'ALONG_SOURCE_ORDER':'AGAINST_SOURCE_ORDER';
    if(delta<0)out.reasons.push('MOVEMENT_OPPOSES_RETAINED_ONEWAY_SOURCE_ORDER');
    const angle=fix.heading==null?0:Math.abs(((fix.heading-best.bearingDeg+540)%360)-180);
    if(angle>60)out.reasons.push('GPS_HEADING_CONTRADICTS_SOURCE_DIRECTION');
    if(fix.speed!=null&&fix.speed<1)out.reasons.push('REPORTED_STOPPED_SPEED');
    const moving=last&&distance(last.fix,fix)>=Math.max(3,fix.accuracy/2);
    if(delta>0&&angle<=60&&moving&&!(fix.speed!=null&&fix.speed<1)&&fix.accuracy<=50&&!out.status.startsWith('AMBIGUOUS')&&!best.tags['access:conditional']&&!out.gates.length&&!out.interchanges.length){votes++;if(votes>=2)out.boundHint=best.bound;}else votes=0;
   }else{votes=0;out.reasons.push('INSUFFICIENT_SAME_WAY_MOVEMENT');}
   for(const c of out.candidates){if(c.id===best.id)c.movement=out.movement;if(c.distanceM>best.distanceM+margin)c.reasons.push('FARTHER_THAN_BEST_PLUS_UNCERTAINTY');if(c.tags['access:conditional'])c.reasons.push('SOURCE_ACCESS_CONDITIONAL_REQUIRES_REVIEW');if(out.status.startsWith('AMBIGUOUS'))c.reasons.push('UNRESOLVED_GEOMETRIC_AMBIGUITY');if(out.gates.length||out.interchanges.length)c.reasons.push('TRANSITION_CONTEXT_WITHHOLDS_BOUND_HINT');}
   out.reasons.push('NO_GEOMETRY_KM_ANCHORS','NO_PHYSICAL_GRADE_OR_CONNECTIVITY_APPROVAL');const reviewed=stabilize(out,fix,rows);last={fix:{...fix}};return reviewed;
  }
  return Object.freeze({evaluate,reset});
 }
 return Object.freeze({create,project,assessBalintawak});
});
