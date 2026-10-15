'use strict';
// Enabled review worker only: one local hash-verified evidence read, no operational outputs.
importScripts('./legacy-matcher.js','./stationing-review.js','./stationing-reconstruction-review.js');
let engine=null,reconstruction=null,epoch=0,loadReason='RECONSTRUCTION_NOT_LOADED';
const EVIDENCE_SHA256='3a22fa98a41a1141c20f08d2a6973791282f1f3ba1da0f82a6415f4cfbdd9a40';
self.onmessage=async event=>{
 const m=event.data;
 try{
  if(m?.type==='INIT'){
   const own=m.epoch;epoch=own;engine=SPOTITStationingReview.create(m.reference);reconstruction=null;
   try{const response=await fetch('./stationing-reconstruction-evidence.json',{cache:'no-store'});if(!response.ok)throw Error('UNAVAILABLE');const bytes=await response.arrayBuffer();const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(digest!==EVIDENCE_SHA256)throw Error('HASH_MISMATCH');const data=JSON.parse(new TextDecoder().decode(bytes));if(epoch!==own)return;reconstruction=SPOTITReconstructionReview.create(data);loadReason=null;}catch(error){loadReason=error.message==='HASH_MISMATCH'?'EVIDENCE_HASH_MISMATCH':'RECONSTRUCTION_UNAVAILABLE';}
   if(epoch===own)self.postMessage({type:'READY',epoch});
  }else if(m?.type==='FIX'&&engine&&m.epoch===epoch){const result=engine.evaluate(m.fix,m.context);result.reconstruction=reconstruction?reconstruction.evaluate(m.fix,m.context.evaluationTime):{status:loadReason,provisional:true,operationalUsePermitted:false,km:null,boundHint:null,candidates:[],gates:[],interchanges:[],excludedWays:[],reasons:['CALIBRATION_REFERENCE_IS_SEPARATE_FROM_RECONSTRUCTION']};self.postMessage({type:'RESULT',epoch,sequence:m.sequence,result});}
 }catch{engine=null;reconstruction=null;self.postMessage({type:'ERROR',epoch,reason:'REVIEW_FAILED_CLOSED'});}
};
