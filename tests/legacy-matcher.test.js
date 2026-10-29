// Exact pre-extraction oracle versus current matcher; deterministic synthetic only.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fixture=require('./fixtures/legacy-matcher-before.json');
const location=require('../src/location-resolver.js');
const modulePath=path.join(__dirname, '..','src/legacy-matcher.js');
const migrated=fs.existsSync(modulePath);
const api=migrated?require('../src/legacy-matcher.js'):null;
const names=['gridKey','corridorKey','buildSpatialIndex','nearbyIndices','nearestFrom','haversineKm','computeKmStation','computeCorridorCandidates'];
function norm(x){if(Array.isArray(x))return Array.from(x,norm);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,norm(v)]));return x;}
function capture(fn){try{return {value:norm(fn())};}catch(e){return {error:{name:e.name,message:e.message}};}}
function reference(functions,data,confirmed='',trace=[]){
 let current=data,corridor=confirmed;
 const c=vm.createContext({GRID_SIZE:fixture.GRID_SIZE,OFF_NETWORK_KM:fixture.OFF_NETWORK_KM,spatialGrid:new Map(),corridorIndex:new Map(),SPOTITLocation:location,
  currentPos:null,currentResolvedLocation:null,userBound:null,locationResolver:{state:()=>{trace.push('confirmed');return {confirmedCorridor:corridor};}}});
 Object.defineProperty(c,'calibData',{get(){trace.push('data');return current;},set(v){current=v;},configurable:true});
 vm.runInContext(Object.values(functions).join('\n'),c,{timeout:1000});
 return {c,setData:v=>{current=v;},setConfirmed:v=>{corridor=v;},trace};
}
function candidate(data,confirmed='',trace=[]){
 if(!migrated)return reference(fixture.functions,data,confirmed,trace);
 let current=data,corridor=confirmed;
 const instance=api.createMatcher(()=>{trace.push('data');return current;},()=>{trace.push('confirmed');return corridor;});
 return {c:{...instance,gridKey:api.gridKey,haversineKm:api.haversineKm,corridorKey:api.corridorKey},setData:v=>{current=v;},setConfirmed:v=>{corridor=v;},trace};
}
const p=(e='NLEX',b='NB',k=10,lat=0,lon=0)=>({e,b,k,lat,lon});
const scenarios=[
 ['empty',[],0,0],['single',[p()],0,0],
 ['NB centre',[p(),p('NLEX','NB',11,0,.002)],0,.001],
 ['SB descending',[p('NLEX','SB',11),p('NLEX','SB',10,0,.002)],0,.001],
 ['parallel tie',[p(),p('NLEX','NB',11,.002,0),p('NLEX','SB',11,0,.00002),p('NLEX','SB',10,.002,.00002)],.001,.00001],
 ['stacked corridor',[p(),p('NLEX','NB',11,0,.002),p('OTHER','EB',99,0,.001)],0,.001],
 ['sparse',[p(),p('NLEX','NB',12,.02,0)],.005,0],
 ['first endpoint',[p(),p('NLEX','NB',11,.002,0)],0,0],
 ['last endpoint',[p(),p('NLEX','NB',11,.002,0)],.002,0],
 ['outside endpoint',[p(),p('NLEX','NB',11,.002,0)],-.0001,0],
 ['off-axis',[p(),p('NLEX','NB',11,.002,0)],.0005,-.0001],
 ['non-adjacent nearest',[p(),p('NLEX','NB',20,0,.1),p('NLEX','NB',50,0,.0001)],0,.00005],
 ['zero distance duplicates',[p(),p('NLEX','NB',20)],0,0],
 ['different bound singleton',[p(),p('NLEX','SB',20,0,.0001)],0,.0001],
 ['negative grid',[p('NLEX','NB',10,-.0025,-.0025),p('NLEX','NB',11,0,0)],-.001,-.001],
 ['grid boundary',[p('NLEX','NB',10,.0025,.0025),p('NLEX','NB',11,.005,.005)],.0025,.0025],
 ['fallback scan',[p(),p('NLEX','NB',11,0,.002)],.1,.1],
 ['NaN coordinate',[p(),p('NLEX','NB',11,0,.002)],NaN,0],
 ['infinite coordinate',[p(),p('NLEX','NB',11,0,.002)],Infinity,0],
 ['NaN label',[p('NLEX','NB',NaN),p('NLEX','NB',11,0,.002)],0,0],
 ['infinite label',[p('NLEX','NB',Infinity),p('NLEX','NB',11,0,.002)],0,.001]
];
for(const [label,points,lat,lon]of scenarios)test('exact parity '+label,()=>{
 const original=JSON.stringify(points),at=[],bt=[];
 const a=reference(fixture.functions,points,'',at),b=candidate(points,'',bt);
 assert.deepEqual(capture(()=>a.c.buildSpatialIndex()),capture(()=>b.c.buildSpatialIndex()));assert.deepEqual(at,bt);at.length=bt.length=0;
 for(const corridor of [undefined,'','NLEX','OTHER','UNKNOWN',null]){
  assert.deepEqual(capture(()=>a.c.computeKmStation(lat,lon,corridor)),capture(()=>b.c.computeKmStation(lat,lon,corridor)));assert.deepEqual(at,bt);at.length=bt.length=0;
 }
 assert.deepEqual(capture(()=>a.c.computeCorridorCandidates(lat,lon)),capture(()=>b.c.computeCorridorCandidates(lat,lon)));assert.deepEqual(at,bt);
 assert.deepEqual(capture(()=>a.c.nearbyIndices(lat,lon,4)),capture(()=>b.c.nearbyIndices(lat,lon,4)));
 assert.deepEqual(capture(()=>a.c.nearestFrom([0],lat,lon)),capture(()=>b.c.nearestFrom([0],lat,lon)));
 assert.equal(JSON.stringify(points),original);
});
test('baseline snapshot is the actual pre-extraction source',()=>{
 if(!migrated){const html=fs.readFileSync(path.join(__dirname, '..','index.html'),'utf8');for(const fn of Object.values(fixture.functions))assert.ok(html.includes(fn));}
 else assert.ok(api&&typeof api.createMatcher==='function');
});
test('extraction retains original bodies with only explicit dependency substitution',()=>{
 if(!migrated)return;
 const source=fs.readFileSync(modulePath,'utf8').replaceAll('\r\n','\n');
 for(const name of names){
  const original=fixture.functions[name].replace(/\bcalibData\b/g,'getCalibration()').replace('locationResolver.state().confirmedCorridor','getConfirmedCorridor()');
  assert.ok(source.includes(original),name);
 }
 const html=fs.readFileSync(path.join(__dirname, '..','index.html'),'utf8');
 const restored=require('./fixtures/legacy-matcher-restore.cjs').restore(html.replace(/<section class="more-group" id="gpskm-developer-tools"[\s\S]*?<\/section>/, '').replace(/\n  <script id="gpskm-developer-gate">[\s\S]*?<\/script>\n/, '\n'));
 assert.equal(require('node:crypto').createHash('sha256').update(restored).digest('hex'),fixture.index_sha256);
});
test('shared pure helpers exact defaults and edge numeric results',()=>{
 const a=reference(fixture.functions,[]),b=candidate([]);
 for(const [lat,lon]of [[0,-0],[-.0025,.0025],[NaN,Infinity],[undefined,null]])assert.deepEqual(capture(()=>a.c.gridKey(lat,lon)),capture(()=>b.c.gridKey(lat,lon)));
 for(const values of [[0,0,0,0],[0,0,0,.01],[NaN,0,0,0],[90,180,-90,-180],[undefined,undefined,undefined,undefined]])assert.deepEqual(capture(()=>a.c.haversineKm(...values)),capture(()=>b.c.haversineKm(...values)));
 for(const values of [['a','b'],['a|||b','c'],[undefined,null]])assert.equal(a.c.corridorKey(...values),b.c.corridorKey(...values));
});
test('late-bound data, in-place changes, stale indexes and rebuild order preserved',()=>{
 const a=reference(fixture.functions,[]),b=candidate([]);
 const points=[p(),p('NLEX','NB',11,0,.002)];a.setData(points);b.setData(points);
 // Deliberately query before rebuilding: preserve legacy global calibration access.
 assert.deepEqual(capture(()=>a.c.computeKmStation(0,.001)),capture(()=>b.c.computeKmStation(0,.001)));
 a.c.buildSpatialIndex();b.c.buildSpatialIndex();points[0].k=20;
 assert.deepEqual(capture(()=>a.c.computeKmStation(0,.001)),capture(()=>b.c.computeKmStation(0,.001)));
 const next=[p('OTHER','WB',5)];a.setData(next);b.setData(next);
 assert.deepEqual(capture(()=>a.c.computeKmStation(0,0)),capture(()=>b.c.computeKmStation(0,0)));
 a.c.buildSpatialIndex();b.c.buildSpatialIndex();a.setConfirmed('OTHER');b.setConfirmed('OTHER');
 assert.deepEqual(capture(()=>a.c.computeCorridorCandidates(0,0)),capture(()=>b.c.computeCorridorCandidates(0,0)));
});
test('malformed data errors and evaluation order preserved',()=>{
 for(const data of [null,undefined,[null],[{}]]){
  const a=reference(fixture.functions,data),b=candidate(data);
  assert.deepEqual(capture(()=>a.c.buildSpatialIndex()),capture(()=>b.c.buildSpatialIndex()));
  assert.deepEqual(capture(()=>a.c.computeKmStation(0,0)),capture(()=>b.c.computeKmStation(0,0)));
 }
});
test('reentrant row getter changing calibration remains late-bound',()=>{
 const a=reference(fixture.functions,[]),b=candidate([]);
 const make=target=>{const first=p();Object.defineProperty(first,'e',{get(){target.setData([p('OTHER','SB',99),p('OTHER','SB',100,0,.002)]);return 'NLEX';}});return [first,p('NLEX','NB',11,0,.002)];};
 a.setData(make(a));b.setData(make(b));assert.deepEqual(capture(()=>a.c.buildSpatialIndex()),capture(()=>b.c.buildSpatialIndex()));
 assert.deepEqual(capture(()=>a.c.computeKmStation(0,.001)),capture(()=>b.c.computeKmStation(0,.001)));
});
test('corridor collapse, hysteresis, capture discrepancies and nulls preserved',()=>{
 const cases=[{points:scenarios[4][1],lat:.001,lon:.00001,bound:'SB'}, {points:scenarios[6][1],lat:.005,lon:0,bound:'NB'}, {points:[p(),p('NLEX','NB',11,.002,0)],lat:-.00001,lon:0,bound:'SB'}];
 for(const row of cases){
  const a=reference(fixture.functions,row.points),b=candidate(row.points);a.c.buildSpatialIndex();b.c.buildSpatialIndex();
  const ar=location.createResolver(),br=location.createResolver();
  for(let i=0;i<5;i++){
   const fix={lat:row.lat,lon:row.lon,accuracy:2,timestamp:1000+i*1000,speed:0};
   const ao=ar.resolve({...fix,candidates:a.c.computeCorridorCandidates(row.lat,row.lon)}),bo=br.resolve({...fix,candidates:b.c.computeCorridorCandidates(row.lat,row.lon)});
   assert.deepEqual(norm(ao),norm(bo));
   // Actual pre-extraction pure snapshot unchanged, fed new real matcher output.
   const ac=reference(fixture.functions,[]).c,bc=reference(fixture.functions,[]).c;
   for(const [c,out]of [[ac,ao],[bc,bo]]){c.currentPos={...fix,acc:2,fresh:true};c.currentResolvedLocation=out;c.userBound=row.bound;}
   assert.deepEqual(norm(ac.resolvedEntrySnapshot()),norm(bc.resolvedEntrySnapshot()));
  }
 }
});
test('two matcher instances do not share spatial state',()=>{
 const a=candidate([p()]),b=candidate([p('OTHER','WB',99)]);a.c.buildSpatialIndex();b.c.buildSpatialIndex();assert.equal(a.c.computeKmStation(0,0).expressway,'NLEX');assert.equal(b.c.computeKmStation(0,0).expressway,'OTHER');
});
test('browser API and minimal app wiring load without IO',()=>{
 if(!migrated)return;
 const c=vm.createContext({});vm.runInContext(fs.readFileSync(modulePath,'utf8'),c,{timeout:1000});assert.ok(c.SPOTITLegacyMatcher);
 const html=fs.readFileSync(path.join(__dirname, '..','index.html'),'utf8'),sw=fs.readFileSync(path.join(__dirname, '..','sw.js'),'utf8');
 assert.equal((html.match(/src="\.\/legacy-matcher\.js"/g)||[]).length,1);
 assert.ok(html.indexOf('src="./src/legacy-matcher.js"')<html.indexOf('class GeoKalmanFilter'));
 assert.ok(html.indexOf('const legacyMatcher =')<html.indexOf('async function loadCalibrationDataset'));
 assert.ok(sw.includes("'./src/legacy-matcher.js'"));assert.ok(sw.includes("CACHE_VERSION = 'v246'"));
 assert.doesNotMatch(fs.readFileSync(modulePath,'utf8'),/\b(?:fetch|localStorage|indexedDB|navigator|document|Date|setTimeout|require)\s*[.(]/);
});
test('actual app delegates and capture functions preserve the frozen outputs',()=>{
 if(!migrated)return;
 const html=fs.readFileSync(path.join(__dirname, '..','index.html'),'utf8');
 const start=html.indexOf('    // Initialize before cache-hit dataset loading;');
 const end=html.indexOf('\n\n    async function loadCalibrationDataset',start);
 assert.ok(start>=0&&end>start);
 function span(name){const start=html.indexOf('    function '+name+'('),firstEnd=html.indexOf('\n',start);assert.ok(start>=0);if(html.slice(start,firstEnd).endsWith('}'))return html.slice(start,firstEnd);return html.slice(start,html.indexOf('\n    }',start)+6);}
 for(const name of ['offNetworkThresholdKm','isInterchangeLocationMode','interchangeSegmentLabel','resolvedLocationCanSave','resolvedEntrySnapshot'])assert.equal(span(name),fixture.functions[name]);
 for(const [label,points,lat,lon]of scenarios){
  const a=reference(fixture.functions,points);
  const c=vm.createContext({calibData:points,SPOTITLegacyMatcher:api,SPOTITLocation:location,OFF_NETWORK_KM:fixture.OFF_NETWORK_KM,locationResolver:location.createResolver(),currentPos:null,currentResolvedLocation:null,userBound:'SB'});
  vm.runInContext(html.slice(start,end)+'\n'+['haversineKm','computeKmStation','computeCorridorCandidates','offNetworkThresholdKm','isInterchangeLocationMode','interchangeSegmentLabel','resolvedLocationCanSave','resolvedEntrySnapshot'].map(span).join('\n'),c,{timeout:1000});
  a.c.buildSpatialIndex();c.buildSpatialIndex();
  assert.deepEqual(capture(()=>a.c.computeKmStation(lat,lon)),capture(()=>c.computeKmStation(lat,lon)),label);
  assert.deepEqual(capture(()=>a.c.computeCorridorCandidates(lat,lon)),capture(()=>c.computeCorridorCandidates(lat,lon)),label);
  const ar=location.createResolver();
  for(let i=0;i<3;i++){
   const fix={lat,lon,accuracy:2,timestamp:1000+i*1000,speed:0};
   const before=ar.resolve({...fix,candidates:a.c.computeCorridorCandidates(lat,lon)}),after=c.locationResolver.resolve({...fix,candidates:c.computeCorridorCandidates(lat,lon)});
   assert.deepEqual(norm(before),norm(after),label);
   a.c.currentPos={lat,lon,acc:2,fresh:true};a.c.currentResolvedLocation=before;a.c.userBound='SB';
   c.currentPos={lat,lon,acc:2,fresh:true};c.currentResolvedLocation=after;
   assert.deepEqual(norm(a.c.resolvedEntrySnapshot()),norm(c.resolvedEntrySnapshot()),label);
  }
 }
});
