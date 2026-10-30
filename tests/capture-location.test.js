'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Capture=require('../src/capture-location.js');
const html=fs.readFileSync('index.html','utf8');
const fix={lat:14.7,lon:120.98,accuracy:8,timestamp:10000};
const result=(held=false)=>({provisional:true,operationalUsePermitted:false,selectedReferenceCorridor:'NLEX',roadAmbiguous:false,stationRange:held?null:{minKm:13.049,maxKm:13.049},travelDirection:{value:'SB'},candidates:[{expressway:'NLEX',distanceM:2}],reconstruction:{networkStop:{holdRequired:held,status:held?'INTERCHANGE_CONTEXT_HELD':'PROVISIONAL_HOLD_RELEASED'}},captureInterchange:held?{siteId:'nlex_test',name:'Test Interchange',expressway:'NLEX',segment:'exit ramp',segmentId:'test_001'}:undefined});
const snapshot=(model,position=fix,now=10000,bound='')=>model.snapshot({position:{...position,fresh:true},now,bound});
test('interchange Capture saves the same name and segment with no mainline KM',()=>{
 const m=Capture.create();m.beginFix(fix);m.accept(result(true),10000,10000);
 assert.deepEqual(snapshot(m),{lat:fix.lat,lon:fix.lon,km:null,expressway:'NLEX',bound:'SB',interchange:'Test Interchange',interchangeSegment:'exit ramp'});
});
test('release clears the interchange and uses the current calibration station for Capture',()=>{
 const m=Capture.create();m.beginFix(fix);m.accept(result(true),10000,10000);m.beginFix({...fix,timestamp:11000});
 assert.equal(snapshot(m,{...fix,timestamp:11000},11000),null);
 m.accept(result(),11000,11000);const saved=snapshot(m,{...fix,timestamp:11000},11000);
 assert.equal(saved.km,13.049);assert.equal(saved.interchange,'');assert.equal(saved.interchangeSegment,'');
});
test('pending, late, stale, failed and mismatched fixes cannot leak a previous location into records',()=>{
 const m=Capture.create();m.beginFix(fix);m.accept(result(),10000,10000);
 assert.equal(snapshot(m,fix,23000),null);m.beginFix({...fix,timestamp:11000});
 assert.equal(m.accept(result(true),10000,11000),null);assert.equal(snapshot(m,{...fix,timestamp:11000},11000),null);
 m.accept(result(),11000,11000);m.invalidate('Worker unavailable');assert.equal(snapshot(m,{...fix,timestamp:11000},11000),null);
});
test('ordinary worker updates retain the completed readout without authorizing a pending capture',()=>{
 const m=Capture.create();m.beginFix(fix);const accepted=m.accept(result(true),10000,10000);
 const pending=m.beginFix({...fix,timestamp:11000});
 assert.equal(pending.pending,true);assert.equal(pending.confirmed,accepted.confirmed);assert.equal(pending.uncertain,accepted.uncertain);assert.equal(pending.reason,accepted.reason);assert.deepEqual(pending.interchange,accepted.interchange);
 assert.equal(pending.saveAllowed,false);assert.equal(snapshot(m,{...fix,timestamp:11000},11000),null);
 m.invalidate('GPS lost');const unavailable=m.beginFix({...fix,timestamp:12000});assert.equal(unavailable.uncertain,true);assert.equal(unavailable.fresh,false);
});
test('ambiguous stations are withheld rather than averaged, and manual direction is preserved',()=>{
 const m=Capture.create();m.beginFix(fix);const ambiguous=result();ambiguous.stationRange.maxKm=13.2;m.accept(ambiguous,10000,10000);assert.equal(snapshot(m),null);
 m.accept(result(),10000,10000);assert.equal(snapshot(m,fix,10000,'NB').bound,'NB');
 const missing=result(true);delete missing.captureInterchange;m.accept(missing,10000,10000);assert.equal(snapshot(m),null);
});
function block(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert(a>=0&&b>a,start);return html.slice(a,b);}
function app(){
 const nodes=new Map();const el=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{},setAttribute(){},addEventListener(){},classList:{values:new Set(),add(v){this.values.add(v);},remove(v){this.values.delete(v);},toggle(v,on){if(on)this.values.add(v);else this.values.delete(v);},contains(v){return this.values.has(v);}},closest(){return this;}});return nodes.get(id);};
 let clock=10000,observed=[],workerRequests=0,alerts=[];
 const ctx=vm.createContext({Date:{now:()=>clock},document:{getElementById:el,querySelectorAll:()=>[]},Worker:function(){},SPOTITCaptureLocation:Capture,SPOTITLocation:require('../src/location-resolver.js'),SPOTITEntry:require('../src/entry-model.js'),SPOTITStationingReviewController:{create:options=>({enable(){workerRequests++;},enabled:()=>true,observe:(...args)=>observed.push(args)})},calibData:[fix],manualLocation:require('../src/manual-location.js').create(),fetch:()=>Promise.reject(Error('test offline')),captureLocation:Capture.create(),captureLocationReady:false,currentPos:{...fix,rawLat:fix.lat,rawLon:fix.lon,acc:fix.accuracy,fresh:true},currentResolvedLocation:null,stationingReview:null,EXPRESSWAY_BOUND_BY_TREND:{},GPS_FRESH_MS:12000,userBound:'',boundManuallySelected:false,trendEstablished:false,gpsStatus:el('gps-status'),setTimeout(){},clearTimeout(){},applyLegacyBoundTrend(){},resetBoundTrend(){},updateReadout(){},updateCaptureLaneLayout(){},saveBound(){},alert:m=>alerts.push(m),entries:[],fullTimestamp:()=> '2026-10-28 12:00:00',captureNeedsPreapproval:()=>false,authDisplayState:{mode:'guest'},inspectorName:'Test',saveEntries:()=>true,foregroundSync:{changed(){}},cameraEditTargetIndex:null,cameraStream:null,cameraVideo:{videoWidth:0},cameraErrorEl:el('camera-error'),updateCameraOverlay(){}});
 vm.runInContext(block('    function resolvedLocationCanSave()', '    function markGpsUncertain('),ctx);
 vm.runInContext(block('    // One network calculation', '    let trendLastKm = null;'),ctx);
 vm.runInContext(block('    function logDefect(', '    // ---------- Sound feedback'),ctx);
 vm.runInContext(block('    function getCameraSnapshot(', '    async function requestCameraStream('),ctx);
 vm.runInContext(block('    async function buildStampedPhotoBlob(', '    function blobToImage('),ctx);
 function accept(r){ctx.r={...r,reviewFixTimestamp:clock};ctx.resolveFreshLocation(null);vm.runInContext('renderStationingReview(r)',ctx);}
 return {ctx,el,accept,alerts,observed,workers:()=>workerRequests,advance:()=>{clock+=1000;ctx.currentPos={...ctx.currentPos,timestamp:clock};}};
}
test('actual app runs shared network engine without Preview controls, fragments or diagnostic labels',()=>{
 const a=app();assert.equal(a.workers(),1);
 for(const text of ['stationing-review-panel','experimental-match-detail','preview/experimental-readout','passenger-preview.js','Experimental - provisional'])assert(!html.includes(text),text);
 a.ctx.queueStationingReview({coords:{latitude:fix.lat,longitude:fix.lon,accuracy:8,speed:0,heading:null},timestamp:10000});
 assert.equal(a.observed.length,1);assert.equal(a.observed[0][0].lat,fix.lat);
});
test('actual Capture controls do not dim or insert the GPS gate during routine worker updates',()=>{
 const a=app();a.accept(result(true));const classes=a.el('defect-section').classList;
 assert(!classes.contains('gps-pending'));assert(!classes.contains('gps-updating'));
 a.advance();a.ctx.resolveFreshLocation(null);
 assert(!classes.contains('gps-pending'));assert(classes.contains('gps-updating'));
 assert.equal(a.ctx.resolvedEntrySnapshot(),null);
 a.ctx.currentResolvedLocation=a.ctx.captureLocation.invalidate('GPS lost');a.ctx.setGpsCaptureReady(false);
 assert(classes.contains('gps-pending'));assert(!classes.contains('gps-updating'));
});
test('manual interchange supplies real capture records and ignores late automatic results',()=>{
 const a=app(),model=require('../public/stationing-reconstruction-evidence-user-edits-20261020.json');a.ctx.manualLocation.load(model);
 const source=model.interchanges.find(r=>r.site==='nlex_meycauayan'),[lon,lat]=source.coordinates[0];a.ctx.currentPos={lat,lon,rawLat:lat,rawLon:lon,acc:5,timestamp:10000,fresh:true};a.ctx.computeCorridorCandidates=()=>[];
 a.ctx.manualLocation.setMode('interchange');a.ctx.resolveFreshLocation(null);a.ctx.logDefect('Crack','1');
 assert.equal(a.ctx.entries[0].interchange,'Meycauayan Interchange');assert.equal(a.ctx.entries[0].km,null);
 a.ctx.renderStationingReview({...result(),reviewFixTimestamp:10000});assert.equal(a.ctx.resolvedEntrySnapshot().interchange,'Meycauayan Interchange');
 a.ctx.queueStationingReview({get coords(){throw Error('manual selection must skip worker');}});assert.equal(a.observed.length,0);
 a.ctx.computeCorridorCandidates=()=>[{expressway:'NLEX',km:20.2,distance:.002,bound:'NB'}];a.ctx.manualLocation.setMode('mainline');a.ctx.resolveFreshLocation(null);a.ctx.logDefect('Crack','2');assert.equal(a.ctx.entries[1].km,20.2);assert.equal(a.ctx.entries[1].interchange,'');
});
test('actual defect record and camera draft use the same accepted interchange and station',()=>{
 const a=app();a.accept(result(true));a.ctx.logDefect('Crack','1');let saved=a.ctx.entries.at(-1),camera=a.ctx.getCameraSnapshot('Crack');
 assert.equal(saved.interchange,'Test Interchange');assert.equal(saved.km,null);assert.equal(saved.interchangeSegment,'exit ramp');assert.equal(camera.interchange,saved.interchange);
 a.advance();a.accept(result());a.ctx.logDefect('Crack','2');saved=a.ctx.entries.at(-1);camera=a.ctx.getCameraSnapshot('Crack');assert.equal(saved.km,13.049);assert.equal(saved.interchange,'');assert.equal(camera.km,saved.km);
});
test('actual shutter refreshes fresh drafts, blocks pending location, and preserves existing-entry metadata',async()=>{
 const a=app();a.accept(result(true));const draft={type:'Crack',km:99,interchange:'Wrong'};
 await a.ctx.buildStampedPhotoBlob(draft);assert.equal(draft.interchange,'Test Interchange');assert.equal(draft.km,null);
 a.advance();a.ctx.resolveFreshLocation(null);const pending={type:'Crack',km:88};await a.ctx.buildStampedPhotoBlob(pending);assert.equal(pending.km,88);assert.match(a.el('camera-error').textContent,/fresh location/);
 a.ctx.cameraEditTargetIndex=0;const existing={km:55,interchange:'Original'};await a.ctx.buildStampedPhotoBlob(existing);assert.deepEqual(existing,{km:55,interchange:'Original'});
});
test('actual readout uses shared captured location and formats station without test displays',()=>{
 const a=app();a.ctx.updateOsmLocation=()=>{};a.ctx.updateBridgeReadout=()=>{};a.ctx.updateRampReadout=()=>{};a.ctx.renderBoundToggle=()=>{};a.ctx.updateBoundAutoStatus=()=>{};a.ctx.refreshCameraDraftFromLiveGPS=()=>{};a.ctx.updateGpsConfidence=()=>{};a.ctx.offNetworkThresholdKm=()=>.08;a.ctx.formatKmStation=km=>km===null?'--.---':'13+049';a.ctx.isInterchangeLocationMode=resolution=>resolution?.interchangeLocked;
 vm.runInContext(block('    function updateReadout()', '    // Keeps the in-camera overlay'),a.ctx);
 a.accept(result(true));assert.equal(a.el('km-value').textContent,'Test Interchange');assert.equal(a.ctx.resolvedEntrySnapshot().interchange,a.el('km-value').textContent);
 a.advance();a.accept(result());assert.equal(a.el('km-value').textContent,'13+049');assert.equal(a.ctx.resolvedEntrySnapshot().km,13.049);
});
test('photo stamping freezes location with the frame while newer fixes update the live draft',async()=>{
 const a=app();a.accept(result(true));
 a.ctx.Date=class extends Date{static now(){return 10000;}};
 a.ctx.cameraStream={};a.ctx.cameraVideo={videoWidth:100,videoHeight:100};
 a.ctx.pad=n=>String(n).padStart(2,'0');a.ctx.formatPhotoDate=()=> 'test time';
 let stamped;
 a.ctx.drawStampBand=async(ctx,w,h,entry)=>{stamped={...entry};};
 a.ctx.document.createElement=()=>({getContext:()=>({drawImage(){}}),toBlob:callback=>queueMicrotask(()=>callback({testBlob:true}))});
 const draft={type:'Crack',km:99};const pending=a.ctx.buildStampedPhotoBlob(draft);
 // A newer worker response may refresh the live draft during asynchronous encoding.
 draft.km=77;draft.interchange='New location';
 const photo=await pending;assert.equal(stamped.km,null);assert.equal(stamped.interchange,'Test Interchange');assert.equal(photo.captureEntry.interchange,'Test Interchange');assert.equal(photo.captureEntry.km,null);
});
