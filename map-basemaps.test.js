const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('map theme stays in the topbar and filter menu contains type and date reset',()=>{
  const html=fs.readFileSync(require.resolve('./index.html'),'utf8');
  assert.match(html, /class="map-topbar">[\s\S]*?id="map-theme-toggle"[\s\S]*?<div id="osm-map"/);
  const floating=html.match(/class="map-floating-actions"[\s\S]*?<\/div>/)[0];
  assert.match(floating,/id="map-locate-btn"/);
  assert.doesNotMatch(floating,/map-theme-toggle/);
  const menu=html.match(/<details class="map-filter-menu"[\s\S]*?<\/details>/)[0];
  assert.match(menu,/id="map-entry-type"/);
  assert.match(menu,/id="map-entry-clear"/);
});
test('map defect type combines with inclusive dates without mutating entries',()=>{
  const {mapEntries}=require('./entry-filters.js');
  const rows=[
    {id:'a',timestamp:'2026-09-01',type:'Potholes',lat:14,lon:121},
    {id:'b',timestamp:'2026-09-02',type:'Others',lat:14,lon:121},
    {id:'c',timestamp:'2026-09-03',type:'Potholes',lat:14,lon:121}
  ];
  const before=JSON.stringify(rows);
  assert.deepEqual(mapEntries(rows,'2026-09-01','2026-09-02','Potholes'),[rows[0]]);
  assert.deepEqual(mapEntries(rows,'','','Potholes'),[rows[0],rows[2]]);
  assert.deepEqual(mapEntries(rows,'','',''),rows);
  assert.equal(JSON.stringify(rows),before);
});
test('map title mirrors the existing KM display and zoom buttons are disabled',()=>{
  const html=fs.readFileSync(require.resolve('./index.html'),'utf8');
  const source=html.match(/function updateMapKmStation\(\)\{[\s\S]*?\n\}/)[0];
  const nodes={'km-value':{textContent:'12+003'},'map-km-station':{textContent:''}};
  const context=vm.createContext({document:{getElementById:id=>nodes[id]}});
  vm.runInContext(source,context);
  context.updateMapKmStation();
  assert.equal(nodes['map-km-station'].textContent,'KM 12+003');
  nodes['km-value'].textContent='--.---';
  context.updateMapKmStation();
  assert.equal(nodes['map-km-station'].textContent,'KM --.---');
  assert.match(html,/L\.map\('osm-map',\{zoomControl:false,attributionControl:true\}/);
});

test('both CARTO themes authenticate tile requests and preserve attribution and map overlays', () => {
  const html = fs.readFileSync(require.resolve('./index.html'),'utf8');
  const start = html.indexOf('const CARTO_BASEMAP_KEY =');
  const end = html.indexOf('function initOsmMap()',start);
  assert.ok(start >= 0 && end > start);
  const layers = [];
  const map = {};
  const context = vm.createContext({
    osmMap:map,osmBaseLayer:null,
    document:{documentElement:{dataset:{theme:'light'}}},
    L:{tileLayer(url,options){
      const layer = {url,options,removed:false,addTo(target){assert.equal(target,map);return this;},remove(){this.removed=true;},bringToBack(){this.behindOverlays=true;}};
      layers.push(layer);
      return layer;
    }}
  });
  vm.runInContext(html.slice(start,end),context);
  context.updateOsmBasemap();
  context.document.documentElement.dataset.theme = 'dark';
  context.updateOsmBasemap();
  assert.equal(layers.length,2);
  assert.match(layers[0].url,/\/rastertiles\/voyager\//);
  assert.match(layers[1].url,/\/dark_all\//);
  for(const layer of layers){
    const key = new URL(layer.url).searchParams.get('key');
    assert.ok(key && key.startsWith('cb1_'),'Configured browser key is required');
    assert.equal(new URL(layer.url).searchParams.getAll('key').length,1);
    assert.match(layer.options.attribution,/openstreetmap.org\/copyright/);
    assert.match(layer.options.attribution,/carto.com\/attributions/);
    assert.equal(layer.behindOverlays,true);
  }
  assert.equal(layers[0].removed,true);
  assert.equal(layers[1].removed,false);
  assert.equal(context.osmMap,map);
});
