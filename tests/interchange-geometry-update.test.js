const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const read=name=>JSON.parse(fs.readFileSync('public/'+name));
const model=read('stationing-reconstruction-evidence-user-edits-20261020.json'),context=read('network-stop-context.json'),gates=read('network-stop-gates.geojson'),coverage=read('network-stop-coverage.json');
test('saved QGIS geometry is consistent across model, context and unavailable-source inventory',()=>{
 assert.equal(model.geometryRevision.date,'2026-10-30');assert.equal(model.interchanges.length,404);assert.equal(model.unavailableInterchanges.length,44);
 const sources=new Map(context.sources.filter(x=>x.kind==='RAMP').map(x=>[x.id,x]));assert.equal(sources.size,404);
 for(const source of model.interchanges)assert.deepEqual(source.coordinates,sources.get(source.id).coordinates,source.id);
 assert.deepEqual(model.unavailableInterchanges,context.unavailableSources);
 assert(model.unavailableInterchanges.some(x=>x.id==='nlex_san_simon_058'));
 for(const source of model.unavailableInterchanges){assert.equal(source.geometry,null);assert(!sources.has(source.id));assert(!model.interchanges.some(x=>x.id===source.id));}
 assert.equal(coverage.availableSourceSegments,404);assert.equal(coverage.unavailableSourceSegments.length,44);
});
test('removed source gates remain disabled, stable gate inventory validates, and worker hashes match exact data bytes',()=>{
 const missing=new Set(context.unavailableSources.map(x=>x.id));
 for(const gate of gates.features.filter(x=>missing.has(x.properties.source_id))){assert.equal(gate.properties.enabled,0);assert.equal(gate.properties.verification,'SOURCE_GEOMETRY_REMOVED_BY_USER');}
 const checked=require('../src/network-stop-gates').create(gates,context).coverage();
 assert.equal(checked.generated,252);assert.equal(checked.usable,213);assert.equal(checked.invalid.length,39);
 assert.equal(coverage.usableGeometryGates,checked.usable);
 const worker=fs.readFileSync('src/stationing-review-worker.js','utf8');
 for(const file of ['network-stop-context.json','stationing-reconstruction-evidence-user-edits-20261020.json'])assert(worker.includes(crypto.createHash('sha256').update(fs.readFileSync('public/'+file)).digest('hex')));
});
