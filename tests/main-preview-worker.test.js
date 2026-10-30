'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const read=name=>fs.readFileSync(name.replace(/^\.\//,''));
const gates=JSON.parse(read('public/network-stop-gates.geojson')),context=JSON.parse(read('public/network-stop-context.json'));
async function replay(fixes,root='.'){
 const read=name=>fs.readFileSync(require('node:path').join(root,name.replace(/^\.\//,'')));
 const output=[],scope=vm.createContext({crypto:crypto.webcrypto,TextDecoder,Uint8Array,self:{postMessage:m=>output.push(m)},fetch:async name=>{const bytes=read(require('node:path').posix.join('src',name));return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),json:async()=>JSON.parse(bytes)};}});
 scope.importScripts=(...names)=>{for(const name of names)vm.runInContext(read(require('node:path').posix.join('src',name)).toString(),scope);};
 vm.runInContext(read('src/stationing-review-worker.js').toString(),scope);
 await scope.self.onmessage({data:{type:'INIT',epoch:1,reference:{calibration:JSON.parse(read('public/calibration.json')),revision:'main-source-replay',conventions:{NLEX:{increasing:'NB',decreasing:'SB'}}}}});
 for(const [i,fix] of fixes.entries())await scope.self.onmessage({data:{type:'FIX',epoch:1,sequence:i+1,fix,context:{evaluationTime:fix.timestamp,operationalUncertain:true}}});
 assert(!output.some(m=>m.type==='ERROR'));const results=output.filter(m=>m.type==='RESULT').map(m=>m.result);
 assert.equal(results.length,fixes.length);
 for(const result of results){assert(result.reconstruction.networkStop);assert.equal(result.operational.km,null);assert.equal(result.operational.bound,null);}
 return results;
}
for(const bound of ['NB','SB'])test('main worker releases Smart Connect '+bound+' using current hash-verified Preview data',async()=>{
 const gate=gates.features.find(g=>g.properties.site==='nlex_harbor_link_smart_connect'&&g.properties.bound===bound&&(bound!=='SB'||g.id==='NSG:nlex_harbor_link_smart_connect_078:B')&&g.properties.enabled&&context.sources.some(s=>s.id===g.properties.source_id));assert(gate);
 const fixes=require('./fixtures/network-stop-routes.cjs').route(gate,context),results=await replay(fixes);
 assert(results.some(r=>r.reconstruction.networkStop.holdRequired));
 assert(results.some(r=>r.reconstruction.networkStop.status==='PROVISIONAL_HOLD_RELEASED'));
 const released=results.findIndex(r=>r.reconstruction.networkStop.status==='PROVISIONAL_HOLD_RELEASED');
 const capture=require('../src/capture-location.js').create(),fix=fixes[released];capture.beginFix(fix);const resolved=capture.accept(results[released],fix.timestamp,fix.timestamp);assert.equal(resolved.interchangeLocked,false);

});
for(const approach of ['short','long','ambiguous','mainline'])test('main worker matches saved-QGIS Balintawak '+approach+' behavior',async()=>{
 const fixes=require('./fixtures/balintawak-entry.cjs').approaches()[approach];
 const results=await replay(fixes);
 const signatures=r=>({status:r.status,stationRange:r.stationRange,travelDirection:r.travelDirection,referenceIdentification:r.referenceIdentification,network:{status:r.reconstruction.networkStop.status,holdRequired:r.reconstruction.networkStop.holdRequired,activeInterchange:r.reconstruction.networkStop.activeInterchange,releaseSites:r.reconstruction.networkStop.releaseSites}});
 assert.deepEqual(JSON.parse(JSON.stringify(results.map(signatures))),require('./fixtures/preview-capture-expected-20261030.json').routes[approach]);
 if(approach==='mainline')assert.equal(results.at(-1).referenceIdentification.corridor,'NLEX');
});
test('all 21 Preview interchange sites flow through the real worker into Capture snapshots',async()=>{
 const model=JSON.parse(read('public/stationing-reconstruction-evidence-user-edits-20261020.json'));
 const sites=[...new Set(model.interchanges.map(r=>r.site))];assert.equal(sites.length,21);
 const fixes=sites.map((site,i)=>{const source=model.interchanges.filter(r=>r.site===site).sort((a,b)=>b.coordinates.length-a.coordinates.length)[0];const [lon,lat]=source.coordinates[Math.floor(source.coordinates.length/2)];return {lat,lon,accuracy:3,timestamp:100000+i*30000,speed:0,heading:null};});
 const results=await replay(fixes),Capture=require('../src/capture-location.js');
 for(const [i,result] of results.entries()){
  assert.equal(result.captureInterchange?.siteId,sites[i],sites[i]);
  const capture=Capture.create(),fix=fixes[i];capture.beginFix(fix);capture.accept(result,fix.timestamp,fix.timestamp);
  const snapshot=capture.snapshot({position:{...fix,fresh:true},now:fix.timestamp});assert(snapshot,sites[i]);
  assert.equal(snapshot.interchange,result.captureInterchange.name);assert.equal(snapshot.km,null);assert.equal(snapshot.lat,fix.lat);
 }
});

test('trimmed Smart Connect auxiliary-lane route keeps ambiguous attribution held',async()=>{
 const gate=gates.features.find(g=>g.id==='NSG:nlex_harbor_link_smart_connect_074:B');assert(gate?.properties.enabled);
 const results=await replay(require('./fixtures/network-stop-routes.cjs').route(gate,context));
 assert(results.every(r=>r.reconstruction.networkStop.holdRequired));
 assert(results.some(r=>r.reconstruction.networkStop.reasons.includes('APPROACH_ATTRIBUTION_AMBIGUOUS')));
 assert(!results.some(r=>r.reconstruction.networkStop.status==='PROVISIONAL_HOLD_RELEASED'));
});
