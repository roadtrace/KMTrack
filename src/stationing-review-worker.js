'use strict';
// Enabled review worker only: one local hash-verified evidence read, no operational outputs.
importScripts('./legacy-matcher.js','./stationing-review.js','./stationing-reconstruction-review.js','./network-stop-gates.js');
let engine=null,reconstruction=null,evidenceModel=null,epoch=0,loadReason='RECONSTRUCTION_NOT_LOADED';
const EVIDENCE_SHA256='ba47b87ae058cca413bb7db2f6ddedeefbb4779893e990158e6f290fe99bb9fd';
self.onmessage=async event=>{
 const m=event.data;
 try{
  if(m?.type==='INIT'){
   const own=m.epoch;epoch=own;engine=SPOTITStationingReview.create(m.reference);reconstruction=null;
   try{const response=await fetch('../public/stationing-reconstruction-evidence-user-edits-20261020.json',{cache:'no-store'});if(!response.ok)throw Error('UNAVAILABLE');const bytes=await response.arrayBuffer();const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(digest!==EVIDENCE_SHA256)throw Error('HASH_MISMATCH');const data=JSON.parse(new TextDecoder().decode(bytes));if(epoch!==own)return;let stopEngine,gateLoadReason=null;
    try{
     const contextResponse=await fetch('../public/network-stop-context.json',{cache:'no-store'});if(!contextResponse.ok)throw Error('CONTEXT_UNAVAILABLE');const contextBytes=await contextResponse.arrayBuffer();const contextDigest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',contextBytes)),v=>v.toString(16).padStart(2,'0')).join('');if(contextDigest!=='c72fe1cd763ed1b20337a7f22921f851827d32d0b2f8ae87956ab8ddf58b2789')throw Error('STOP_CONTEXT_HASH_MISMATCH');
     const gateResponse=await fetch('../public/network-stop-gates.geojson',{cache:'no-store'});if(!gateResponse.ok)throw Error('GATES_UNAVAILABLE');
     stopEngine=SPOTITNetworkStopGates.create(await gateResponse.json(),JSON.parse(new TextDecoder().decode(contextBytes)));
    }catch(error){gateLoadReason='NETWORK_GATES_UNAVAILABLE_'+error.message;stopEngine=SPOTITNetworkStopGates.create({schema:'KMTRACK_NETWORK_STOP_GATES_V1',type:'FeatureCollection',provisional:true,operationalUsePermitted:false,features:[]},{schema:'KMTRACK_NETWORK_STOP_CONTEXT_V1',provisional:true,operationalUsePermitted:false,sources:[...data.interchanges.map(r=>({...r,kind:'RAMP'})),...data.alignments.map(a=>({...a,kind:'ALIGNMENT'}))],restrictions:['B02.3 STOP','B01 UNRESOLVED']});}
    if(epoch!==own)return;reconstruction=SPOTITReconstructionReview.create(data,stopEngine);evidenceModel=data;loadReason=gateLoadReason;}catch(error){loadReason=error.message==='HASH_MISMATCH'?'EVIDENCE_HASH_MISMATCH':'RECONSTRUCTION_UNAVAILABLE';}
   if(epoch===own)self.postMessage({type:'READY',epoch});
  }else if(m?.type==='FIX'&&engine&&m.epoch===epoch){const geometry=reconstruction?reconstruction.evaluate(m.fix,m.context.evaluationTime):{status:loadReason,provisional:true,operationalUsePermitted:false,km:null,boundHint:null,candidates:[],gates:[],interchanges:[],excludedWays:[],reasons:['CALIBRATION_REFERENCE_IS_SEPARATE_FROM_RECONSTRUCTION']};const result=engine.evaluate(m.fix,{...m.context,independentReview:true,interchange:geometry.networkStop?geometry.networkStop.holdRequired||geometry.gates.length>0:geometry.interchanges.length>0||geometry.gates.length>0});if(geometry.networkStop&&loadReason)geometry.networkStop.reasons.push(loadReason);if(geometry.networkStop){const assessment=SPOTITNetworkStopGates.assessReference(m.fix,result,geometry);geometry.networkStop.referenceAssessment=assessment;if(assessment.required&&!assessment.supported){result.stationRange=null;result.travelDirection={value:null,status:'WITHHELD_APPROACH_AMBIGUITY',source:null};result.referenceIdentification={...result.referenceIdentification,status:'WITHHELD_APPROACH_AMBIGUITY',corridor:null};result.status=assessment.status;result.reasons.push('NETWORK_APPROACH_AMBIGUITY_REFERENCE_IS_NOT_ROAD_MEMBERSHIP');}}result.reconstruction=geometry;
    if(geometry.networkStop?.holdRequired&&evidenceModel){
     const site=geometry.networkStop.occupancy?.site;
     const rows=(geometry.nearbyInterchanges||[]).filter(r=>r.site===site).sort((a,b)=>a.distanceM-b.distanceM);
     const nearest=rows[0],distinct=nearest&&(!rows[1]||rows[1].distanceM-nearest.distanceM>Math.max(3,m.fix.accuracy));
     const source=distinct?evidenceModel.interchanges.find(r=>r.id===nearest.id):null;
     const named=evidenceModel.interchanges.find(r=>r.site===site);
     if(named)result.captureInterchange={siteId:site,name:named.name,expressway:site.startsWith('nlex_')?'NLEX':'',segment:source?String(source.ramp||source.seg_type||'').replace(/_/g,' '):'',segmentId:source?.id||''};
    }
    if(!reconstruction)result.reasons.push('CURRENT_TRANSITION_EVIDENCE_UNAVAILABLE_REFERENCE_ESTIMATE_ONLY');self.postMessage({type:'RESULT',epoch,sequence:m.sequence,result});}
 }catch{engine=null;reconstruction=null;self.postMessage({type:'ERROR',epoch,reason:'REVIEW_FAILED_CLOSED'});}
};
