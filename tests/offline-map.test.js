const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const api=require('../src/offline-map');
const calibration=JSON.parse(fs.readFileSync('public/calibration.json')),model=JSON.parse(fs.readFileSync('public/stationing-reconstruction-evidence-user-edits-20261020.json'));
function fixture({failFetch=false,quota=false}={}){
 const stores=new Map(),requests=[];
 const caches={has:async n=>stores.has(n),open:async n=>{if(!stores.has(n))stores.set(n,new Map());const store=stores.get(n);return {match:async k=>store.get(k)?.clone(),put:async(k,r)=>{if(quota)throw Object.assign(Error('quota'),{name:'QuotaExceededError'});store.set(k,r.clone());},delete:async k=>store.delete(k)};},delete:async n=>stores.delete(n)};
 const pack=api.create({caches,crypto:crypto.webcrypto,baseURL:'https://example.invalid/KMTrack/',now:()=>1000,fetch:async url=>{requests.push(url);if(failFetch)throw Error('offline');return new Response(fs.readFileSync(path.join('public',url.split('/').at(-1))));}});
 return {pack,caches,stores,requests};
}
test('saves and verifies only same-origin GIS files; saved pack loads without network',async()=>{
 const f=fixture(),progress=[];assert.equal(await f.pack.read(),null);const saved=await f.pack.save((n,total)=>progress.push([n,total]));assert(saved.manifest.bytes>0);assert.equal(saved.manifest.savedAt,1000);assert.equal(progress.at(-1)[0],2);
 assert.equal(f.requests.length,2);assert(f.requests.every(url=>url.startsWith('https://example.invalid/KMTrack/public/')));
 const count=f.requests.length;assert((await f.pack.read()).geojson.features.length>438);assert.equal(f.requests.length,count);
});
test('removing map cache preserves other caches and never reads inspection or photo storage',async()=>{
 const f=fixture();await f.caches.open('inspection-photos');await f.pack.save();await f.pack.remove();assert(f.stores.has('inspection-photos'));assert.equal(await f.pack.read(),null);
});
test('failed download or storage quota cannot report a complete offline map',async()=>{
 for(const options of [{failFetch:true},{quota:true}]){const f=fixture(options);await assert.rejects(f.pack.save());assert.equal(await f.pack.read(),null);}
});
test('corrupt or partially evicted saved maps are unavailable',async()=>{
 const f=fixture();await f.pack.save();const store=f.stores.get(api.CACHE);const key=[...store.keys()].find(k=>k.endsWith('calibration.json'));store.set(key,new Response('[]'));assert.equal(await f.pack.read(),null);
});
test('display geometry contains all available interchange lines and never joins calibration gaps',()=>{
 const g=api.geometry(calibration,model);assert.equal(g.features.filter(f=>f.properties.kind==='interchange').length,438);
 const gap=api.geometry([{e:'NLEX',b:'NB',lat:0,lon:0,k:0},{e:'NLEX',b:'NB',lat:.0001,lon:0,k:.01},{e:'NLEX',b:'NB',lat:1,lon:0,k:1}],{schema:model.schema,interchanges:[]});assert.equal(gap.features.length,1);assert.equal(gap.features[0].geometry.coordinates.length,2);
});
test('app cache activation preserves independently downloaded maps',async()=>{
 const vm=require('node:vm'),handlers={},removed=[];
 vm.runInNewContext(fs.readFileSync('sw.js','utf8'),{importScripts(){},self:{location:{href:'https://example.invalid/sw.js'},clients:{claim(){}},addEventListener:(n,fn)=>handlers[n]=fn},SPOTITInspectionWakeup:{},caches:{keys:async()=>['spotit-shell-v251','spotit-shell-v253',api.CACHE,'other-app'],delete:async n=>removed.push(n)}});
 let pending;handlers.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(removed,['spotit-shell-v251']);
});
