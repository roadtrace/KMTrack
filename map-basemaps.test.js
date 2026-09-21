const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('map has no topbar of its own and the filter menu holds type and date reset',()=>{
  const html=fs.readFileSync(require.resolve('./index.html'),'utf8');
  // The map's station / status moved into the GLOBAL header, so the map view goes
  // straight to the canvas, and the map's own dark/light toggle is gone.
  assert.match(html, /id="map-view"[\s\S]{0,200}?<div id="osm-map"/);
  assert.doesNotMatch(html, /class="map-topbar"/);
  assert.doesNotMatch(html, /id="map-theme-toggle"/);
  // They live in the header now, alongside the brand.
  assert.match(html, /id="header-map-context"[\s\S]{0,200}?id="map-km-station"[\s\S]{0,200}?id="map-status"/);
  const floating=html.match(/class="map-floating-actions"[\s\S]*?<\/div>/)[0];
  assert.match(floating,/id="map-locate-btn"/);
  assert.doesNotMatch(floating,/map-theme-toggle/);
  const menu=html.match(/<details class="map-filter-menu"[\s\S]*?<\/details>/)[0];
  assert.match(menu,/id="map-entry-type"/);
  assert.match(menu,/id="map-entry-clear"/);
  assert.match(menu,/id="map-entry-bound"/);
  assert.match(html,/map-entry-clear'\)\.classList\.toggle\('active',Boolean\(days\.length\)\)/);
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

test('light keeps the CARTO raster, authenticates tile requests, and stays behind overlays', () => {
  const html = fs.readFileSync(require.resolve('./index.html'),'utf8');
  const start = html.indexOf('const CARTO_BASEMAP_KEY =');
  const end = html.indexOf('function initOsmMap()',start);
  assert.ok(start >= 0 && end > start);
  const layers = [];
  const map = {};
  const context = vm.createContext({
    osmMap:map,osmBaseLayer:null,osmVectorLayer:null,
    document:{documentElement:{dataset:{theme:'light'}}},
    L:{tileLayer(url,options){
      const layer = {url,options,removed:false,addTo(target){assert.equal(target,map);return this;},remove(){this.removed=true;},bringToBack(){this.behindOverlays=true;}};
      layers.push(layer);
      return layer;
    }}
  });
  vm.runInContext(html.slice(start,end),context);
  context.updateOsmBasemap();
  // Light mode must NOT reach for MapTiler; exactly one CARTO raster appears.
  assert.equal(layers.length,1);
  assert.match(layers[0].url,/\/rastertiles\/voyager\//);
  const key = new URL(layers[0].url).searchParams.get('key');
  assert.ok(key && key.startsWith('cb1_'),'Configured browser key is required');
  assert.equal(new URL(layers[0].url).searchParams.getAll('key').length,1);
  assert.match(layers[0].options.attribution,/openstreetmap.org\/copyright/);
  assert.match(layers[0].options.attribution,/carto.com\/attributions/);
  assert.equal(layers[0].behindOverlays,true);
  assert.equal(layers[0].removed,false);
  assert.equal(context.osmMap,map);
});

test('dark uses the MapTiler vector style — not a raster tile layer, not an iframe', () => {
  const html = fs.readFileSync(require.resolve('./index.html'),'utf8');
  const config = require('./map-config.js');
  const path = require('node:path');

  // The CARTO dark raster survives ONLY as the failure fallback; the primary
  // dark path is the vector layer.
  assert.match(html,/dark_all/);
  assert.match(html,/addRasterBasemap\('dark'\)/);
  assert.match(html,/L\.maptilerLayer\(\{/);
  assert.match(html,/style: SPOTITMapConfig\.styleUrl/);
  assert.match(html,/apiKey: SPOTITMapConfig\.apiKey/);
  // The GL container is pinned to the viewport from the plugin's `move` handler.
  // Its default 32ms throttle is outrun by a 60-120Hz drag, so the canvas drifted
  // with the map pane and snapped back — the basemap lurched while the markers
  // glided. It must stay a per-tick update.
  assert.match(html,/updateInterval: 0/);
  assert.doesNotMatch(html,/updateInterval: 32/);
  // `bringToBack` is a GridLayer/Path method, not an L.Layer one, and the
  // MapTiler layer is a plain L.Layer — calling it threw and the catch then read
  // it as a basemap failure.
  assert.doesNotMatch(html,/osmVectorLayer\.bringToBack|layer\.bringToBack/);
  assert.doesNotMatch(html,/createElement\('iframe'\)/);
  assert.doesNotMatch(html,/L\.tileLayer\([^)]*style\.json/);
  // The GL camera is driven from Leaflet. The vendored plugin's own
  // _transformGL() assigns `transform.center` directly, which MapLibre 5
  // recomputes and discards — the basemap then sat still while the markers
  // panned, which reads as a detached layer floating over the map.
  assert.match(html,/syncVectorCamera = \(\) => \{/);
  assert.match(html,/gl\.jumpTo\(\{ center: osmMap\.getCenter\(\), zoom: osmMap\.getZoom\(\) - 1 \}\)/);
  assert.match(html,/osmMap\.on\('move', syncVectorCamera\)/);
  assert.match(html,/osmMap\.on\('zoom', syncVectorCamera\)/);
  // Continuous tracking, NOT deferred to the end of the gesture — deferring was
  // the frozen-background bug.
  assert.doesNotMatch(html,/osmMap\.on\('moveend', syncVectorCamera\)/);
  assert.doesNotMatch(html,/osmMap\.on\('moveend', \(\) => \{[\s\S]{0,120}?jumpTo/);
  // ...and it is detached when the layer goes away.
  assert.match(html,/osmMap\.off\('move', syncVectorCamera\)/);
  // Dark is chosen by theme.
  assert.match(html,/const theme = document\.documentElement\.dataset\.theme === 'light' \? 'light' : 'dark';/);

  // The key lives in the project config, matching the published style. `style`
  // must be the full URL: a bare map id is rejected by the SDK.
  assert.equal(config.mapId,'01a0b86c-b154-7221-96a7-fc8197fe0662');
  assert.equal(config.apiKey,'lkkR5aAqoFyDhXsqqFQE');
  assert.equal(config.styleUrl,'https://api.maptiler.com/maps/01a0b86c-b154-7221-96a7-fc8197fe0662/style.json');
  assert.doesNotMatch(config.styleUrl,/\?key=/, 'the key is passed as apiKey, not embedded in the style URL');

  // Everything the SDK needs is vendored, so there is no CDN dependency at runtime.
  for(const rel of [config.sdkPath,config.sdkCssPath,config.leafletPluginPath]){
    assert.match(rel,/^vendor\/maptiler\//);
    assert.ok(fs.existsSync(path.join(__dirname,rel)),`${rel} must be vendored`);
  }
  // ...and the shell caches the config itself.
  const sw = fs.readFileSync(require.resolve('./sw.js'),'utf8');
  assert.match(sw,/\.\/map-config\.js/);
});
