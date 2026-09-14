const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const map=require('./map-overlays.js');
test('bounds normalize imported names without treating an unset bound as northbound',()=>{
  assert.equal(map.boundKey('north-bound'),'NB');assert.equal(map.boundKey(' sb '),'SB');
  assert.equal(map.boundKey('Eastbound'),'EB');assert.equal(map.boundKey('WB'),'WB');
  assert.equal(map.boundKey(''), 'Other');assert.equal(map.boundKey('inner'),'Other');
  assert.equal(new Set(Object.values(map.BOUNDS)).size,5);
});
test('landmarks retain actual interchanges, merge Pulilan directions as an interchange and exclude unrelated bridges',()=>{
  const rows=[{name:'Pulilan/Tibag Underpass (NB)',lat:14,lon:120},{name:'Pulilan/Tibag Underpass (SB)',lat:14,lon:120},{name:'Libtong Exit',kind:'exit',station:'19+550',lat:14.7,lon:120.9},
    {name:'Dau Interchange Bridge',classification:'Interchange Bridge',lat:15,lon:120},{name:'River Bridge',classification:'River Bridge',lat:15,lon:120}];
  const before=JSON.stringify(rows),result=map.landmarks(rows);
  assert.equal(result.length,3);assert.equal(result[0].name,'Pulilan Interchange');assert.equal(result[1].name,'Libtong Exit');assert.equal(result[2].name,'Dau Interchange');assert.equal(JSON.stringify(rows),before);
});

test('landmark catalog uses requested names, removals and authoritative Caloocan junction nodes',()=>{
  const assets=require('./map-landmarks.json').assets,names=assets.map(asset=>asset.name);
  for(const removed of ['General T. de Leon Exit','Parada Exit','Libis Baesa Exit']) assert.ok(!names.includes(removed));
  assert.ok(names.includes('Mindanao Exit'));assert.ok(!names.includes('Mindanao Avenue Interchange'));
  assert.ok(names.includes('R10 Ramp'));assert.ok(!names.includes('Navotas Exit'));
  assert.ok(names.includes('Harbor Link (Smart Connect) Interchange'));
  for(const interchange of [
    'Balintawak Interchange','Paso de Blas (Valenzuela) Interchange','Meycauayan Interchange',
    'Marilao Interchange','Philippine Arena Interchange','Bocaue Interchange',
    'Burol (Tabang Spur Overpass) Interchange','Balagtas Interchange (Plaridel By-pass)',
    'Guiguinto Interchange','Santa Rita Interchange','Pulilan Interchange','San Simon Interchange',
    'San Fernando Interchange','Sindalan/Mexico Interchange','Angeles Interchange',
    'Dau Interchange','SCTEX Spur (NLE) Interchange','Sta. Ines Interchange'
  ]) assert.ok(names.includes(interchange),interchange);
  const smartConnect=assets.find(asset=>asset.name==='Harbor Link (Smart Connect) Interchange');
  assert.deepEqual([smartConnect.network,smartConnect.kind,smartConnect.station],['NLEX Harbor Link','interchange','13+565']);
  const caloocan=assets.find(asset=>asset.name==='Caloocan Interchange'),c3=assets.find(asset=>asset.name==='C-3 Road Exit');
  assert.deepEqual([caloocan.lat,caloocan.lon],[14.6447911,120.9750438]);
  assert.deepEqual([c3.lat,c3.lon],[14.6327845,120.9766664]);
});

test('landmark titles append their authoritative station without redundant KM text',()=>{
  assert.equal(map.landmarkTitle({name:'Libtong Exit',station:'19+550'}),'Libtong Exit · 19+550');
  assert.equal(map.landmarkTitle({name:'Dau Interchange',from:'83+353'}),'Dau Interchange · 83+353');
  assert.equal(map.landmarkTitle({name:'Unknown Exit'}),'Unknown Exit');
});
test('map detail opening uses stable IDs after reorder or deletion',()=>{
  const html=fs.readFileSync(require.resolve('./index.html'),'utf8');
  const fn=html.match(/function openMapEntry\(id\)\{[\s\S]*?\n\}/)[0];
  const opened=[],context=vm.createContext({entries:[{id:'b'},{id:'a'}],openEditModal:i=>opened.push(i),KMTrackMap:{focusEditor(){}}});
  vm.runInContext(fn,context);context.openMapEntry('a');context.entries.shift();context.openMapEntry('a');context.openMapEntry('deleted');
  assert.deepEqual(opened,[1,0]);
});

test('supplemental map data covers all requested networks with finite sourced locations and offline caching',()=>{
  const data=require('./map-landmarks.json');
  assert.ok(data.assets.length>=25);
  for(const network of ['NLEX','SCTEX','NLEX Harbor Link','NLEX Connector'])assert.ok(data.assets.some(a=>a.network===network));
  for(const a of data.assets){assert.ok(Number.isFinite(a.lat)&&a.lat>14&&a.lat<16);assert.ok(Number.isFinite(a.lon)&&a.lon>120&&a.lon<122);assert.ok(a.sources.length);}
  const sw=fs.readFileSync(require.resolve('./sw.js'),'utf8');
  for(const file of ['map-overlays.js','map-overlays.css','map-landmarks.json'])assert.ok(sw.includes("'./"+file+"'"));
});

test('overlapping dot hit areas resolve to the closest geographic point rather than DOM order',()=>{
  const north={id:'north'},south={id:'south'};
  const points=[{entry:south,x:100,y:119},{entry:north,x:100,y:100}];
  assert.equal(map.nearestEntry(points,100,101),north);
  assert.equal(map.nearestEntry(points,100,118),south);
  assert.equal(map.nearestEntry([],100,100),null);
});

test('KM labels stay close to their dots, avoid occupied controls and declutter when boxed in',()=>{
  const size={x:390,y:844},screen={x:180,y:300};
  const right=map.labelPlacement(screen,size,[],false);
  assert.deepEqual(right,{x:190,y:286});
  const occupied=[{x:188,y:280,w:80,h:44}];
  assert.deepEqual(map.labelPlacement(screen,size,occupied,false),{x:100,y:286});
  const boxed=[{x:0,y:250,w:390,h:110}];
  assert.equal(map.labelPlacement(screen,size,boxed,false),null);
});

test('map entry labels no longer render leader lines or arrow paths',()=>{
  const js=fs.readFileSync(require.resolve('./map-overlays.js'),'utf8');
  const css=fs.readFileSync(require.resolve('./map-overlays.css'),'utf8');
  assert.doesNotMatch(js,/map-km-leader|createElementNS/);
  assert.doesNotMatch(css,/map-km-leader/);
});

test('landmark pins keep a full touch target around a compact visible icon',()=>{
  const js=fs.readFileSync(require.resolve('./map-overlays.js'),'utf8');
  const css=fs.readFileSync(require.resolve('./map-overlays.css'),'utf8');
  assert.match(js,/iconSize:\[44,44\],iconAnchor:\[22,36\]/);
  assert.match(css,/\.map-landmark-pin\{width:44px;height:44px;/);
  assert.match(css,/\.map-landmark-pin svg\{width:22px;height:28px;/);
});
test('legend uses the same location-pin artwork as map landmarks',()=>{
  const js=fs.readFileSync(require.resolve('./map-overlays.js'),'utf8');
  const pinPath='M16 39C13 33 2 23 2 16a14 14 0 1 1 28 0c0 7-11 17-14 23Z';
  assert.equal(js.split(pinPath).length-1,2);
  assert.doesNotMatch(js,/◆ Landmarks/);
});
test('map labels use native typography and bound-tinted text without boxes',()=>{
  const css=fs.readFileSync(require.resolve('./map-overlays.css'),'utf8');
  assert.match(css,/\.map-km-label\{[^}]*border:0;background:transparent[^}]*color:color-mix\(in srgb,var\(--bound-color\)[^}]*system-ui/);
  assert.match(css,/\.leaflet-tooltip\.map-landmark-label\{[^}]*system-ui/);
  assert.match(css,/html\[data-theme="light"\] \.map-km-label\{[^}]*background:transparent[^}]*var\(--bound-color\)/);
});
