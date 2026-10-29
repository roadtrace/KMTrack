const test=require('node:test'),assert=require('node:assert/strict'),Manual=require('./manual-location'),Legacy=require('./legacy-matcher');
const model=require('./stationing-reconstruction-evidence-user-edits-20261020.json'),calibration=require('./calibration.json');
test('all 21 sites select immediately by distance to current GIS lines',()=>{
 const m=Manual.create();m.load(model);m.setMode('interchange');
 for(const site of new Set(model.interchanges.map(s=>s.site))){const s=model.interchanges.find(s=>s.site===site),p=s.coordinates[0],fix={lon:p[0],lat:p[1],accuracy:5,timestamp:1000};const r=m.resolve(fix,[],1000);assert.equal(r.interchange.siteId,site);assert(r.saveAllowed);assert.equal(r.result.km,null);}
});
test('manual Mainline bypasses holds and returns calibration KM on the same fix',()=>{
 const m=Manual.create();m.load(model);const matcher=Legacy.createMatcher(()=>calibration,()=>null);matcher.buildSpatialIndex();
 const p=calibration.find(p=>p.e==='NLEX'&&p.b==='NB'&&p.k>20),fix={...p,accuracy:5,timestamp:1000};
 m.setMode('interchange');m.resolve(fix,[],1000);m.setMode('mainline');const r=m.resolve(fix,matcher.computeCorridorCandidates(p.lat,p.lon),1000);assert(r.saveAllowed);assert.equal(r.interchange,null);assert(Math.abs(r.result.km-p.k)<.001);
});
test('no distant interchange, stale fix or poor accuracy is silently captured',()=>{
 const m=Manual.create();m.load(model);m.setMode('interchange');for(const fix of [{lat:0,lon:0,accuracy:5,timestamp:1000},{lat:14.7,lon:120.98,accuracy:80,timestamp:1000}])assert(!m.resolve(fix,[],1000).saveAllowed);
 assert(!m.resolve({lat:14.7,lon:120.98,accuracy:5,timestamp:1000},[],14000).saveAllowed);assert.equal(m.mode(),'interchange');
});
