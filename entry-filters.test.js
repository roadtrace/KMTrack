const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const filters = require('./entry-filters.js');
const swipe = require('./swipe-actions.js');
const html = fs.readFileSync(require.resolve('./index.html'),'utf8');
const sharingUi = fs.readFileSync(require.resolve('./sharing-ui.js'),'utf8');
const fixtures = [
  {id:'a',timestamp:'2026-09-03 00:01:00',type:'Potholes',lat:14.6,lon:121,km:12.5,photoId:'photo-a',photoFilename:'a.jpg'},
  {id:'b',timestamp:'2026-09-03 23:59:00',type:'Cracks',lat:14.7,lon:121.1,km:13,photoId:'photo-b',photoFilename:'b.jpg'},
  {id:'c',timestamp:'2026-09-04 00:00:00',type:'Potholes',lat:14.8,lon:121.2,km:14,photoId:'photo-c',photoFilename:'c.jpg'}
];
const ids = rows => rows.map(row => row.id);
test('inclusive ranges support either endpoint, type filters and reversed ranges',()=>{
  assert.deepEqual(ids(filters.filterEntries(fixtures,{from:'2026-09-03',to:'2026-09-04'})),['a','b','c']);
  assert.deepEqual(ids(filters.filterEntries(fixtures,{from:'2026-09-04'})),['c']);
  assert.deepEqual(ids(filters.filterEntries(fixtures,{to:'2026-09-03'})),['a','b']);
  assert.deepEqual(ids(filters.filterEntries(fixtures,{from:'2026-09-03',to:'2026-09-04',type:'Cracks'})),['b']);
  assert.deepEqual(filters.filterEntries(fixtures,{from:'2026-09-04',to:'2026-09-03'}),[]);
  assert.equal(filters.exportScope(fixtures,{from:'2026-09-03'}).restricted,true);
  assert.equal(filters.exportScope(fixtures,{to:'2026-09-04'}).restricted,true);
});
function source(name){
  const sourceText = html.includes(`function ${name}(`) ? html : sharingUi;
  const start = sourceText.indexOf(`function ${name}(`);
  assert.ok(start >= 0,`Missing ${name}`);
  return sourceText.slice(sourceText.slice(start-6,start) === 'async ' ? start-6 : start, sourceText.indexOf('\n}',start)+2);
}
function handler(id){
  const start = html.indexOf(`document.getElementById('${id}').addEventListener('click', async () => {`);
  assert.ok(start >= 0,`Missing ${id} handler`);
  return html.slice(start,html.indexOf('\n});',start)+4);
}
function harness(){
  const controls = new Map();
  const control = id => {
    if(!controls.has(id)) controls.set(id,{value:'',checked:false,textContent:'',addEventListener(event,fn){ this[event] = fn; }});
    return controls.get(id);
  };
  const state = {downloads:[],prompts:[],alerts:[],photos:[],accept:true};
  const context = vm.createContext({
    entries:structuredClone(fixtures),selectedEntryIds:new Set(),KMTrackEntryFilters:filters,KMTrackSwipe:swipe,
    document:{getElementById:control,createElement:()=>({click(){}}),body:{appendChild(){},removeChild(){}}},
    confirm:message=>{state.prompts.push(message);return state.accept;},alert:message=>state.alerts.push(message),
    URL:{createObjectURL:blob=>{state.downloads.push(blob);return 'blob:test';},revokeObjectURL(){}},
    getPhoto:async id=>{state.photos.push(id);return new Blob([id]);},
    setTimeout:fn=>fn(),Blob,TextEncoder,Uint8Array,Uint32Array,DataView,Date,
    pad:value=>String(value).padStart(2,'0')
  });
  for(const name of ['getLogFilters','entriesForExport','toDMM','kmToCsvNumber','xmlEscape','excelColumnName','inspectionWorkbookRows','buildInspectionWorkbook','addSharingWorksheet','exportTimestamp','safeBackupFilename']){
    vm.runInContext(source(name),context);
  }
  context.prepareSharingExport=async()=>context.entriesForExport();
  vm.runInContext(html.slice(html.indexOf('const ZIP_CRC_TABLE ='),html.indexOf('function safeBackupFilename(')),context);
  vm.runInContext(handler('export-btn')+'\n'+handler('backup-btn'),context);
  return {context,state,control};
}
async function unzip(blob){
  const data = Buffer.from(await blob.arrayBuffer());
  const files = {};
  let offset = 0;
  while(data.readUInt32LE(offset) === 0x04034b50){
    const size=data.readUInt32LE(offset+18), nameLength=data.readUInt16LE(offset+26), extra=data.readUInt16LE(offset+28);
    const name=data.subarray(offset+30,offset+30+nameLength).toString();
    const begin=offset+30+nameLength+extra;
    files[name]=data.subarray(begin,begin+size);
    offset=begin+size;
  }
  return files;
}

test('day-only and combined type filters preserve order and complete entry data',()=>{
  const before = JSON.stringify(fixtures);
  assert.deepEqual(ids(filters.filterEntries(fixtures,{day:'2026-09-03'})),['a','b']);
  assert.deepEqual(ids(filters.filterEntries(fixtures,{day:'2026-09-03',type:'Cracks'})),['b']);
  assert.deepEqual(ids(filters.filterEntries(fixtures,{type:'Potholes'})),['a','c']);
  assert.deepEqual(filters.filterEntries(fixtures,{day:'2026-09-05'}),[]);
  assert.equal(JSON.stringify(fixtures),before);
});
test('no selection exports all; selection takes precedence within the visible filter',()=>{
  assert.deepEqual(filters.exportScope(fixtures),{entries:fixtures,restricted:false});
  assert.deepEqual(ids(filters.exportScope(fixtures,{},new Set(['c'])).entries),['c']);
  assert.deepEqual(ids(filters.exportScope(fixtures,{day:'2026-09-03'},new Set(['b','c'])).entries),['b']);
  assert.deepEqual(ids(filters.exportScope(fixtures,{day:'2026-09-03'},new Set()).entries),['a','b']);
});
test('stable IDs remain selected across insertion and persistence reload',()=>{
  const reloaded = JSON.parse(JSON.stringify([{...fixtures[0],id:'new'},...fixtures]));
  assert.deepEqual(ids(filters.exportScope(reloaded,{},new Set(['b'])).entries),['b']);
});
test('map day filtering includes valid zero coordinates and excludes invalid locations',()=>{
  const entries=[...fixtures,{id:'zero',timestamp:'2026-09-03',lat:0,lon:0},{id:'bad',lat:NaN,lon:121},{id:'bad2',lat:91,lon:0}];
  assert.deepEqual(ids(filters.mapEntries(entries,'2026-09-03')),['a','b','zero']);
  assert.deepEqual(ids(filters.mapEntries(entries)),['a','b','c','zero']);
});
for(const button of ['export-btn','backup-btn']){
  test(`${button}: cancellation and empty filters do not download or read photos`,async()=>{
    const {control,state}=harness();
    control('entry-filter-from').value='2026-09-03';
    control('entry-filter-to').value='2026-09-03';
    state.accept=false;
    await control(button).click();
    assert.deepEqual(state.prompts,['Export filtered/selected entries?']);
    assert.equal(state.downloads.length,0);
    assert.equal(state.photos.length,0);
    control('entry-filter-from').value='2026-09-05';
    control('entry-filter-to').value='2026-09-05';
    await control(button).click();
    assert.equal(state.alerts.at(-1),'No entries match the current filters.');
    assert.equal(state.downloads.length,0);
  });
}
test('Excel handler exports all without confirmation and filtered/selected rows with unchanged schema',async()=>{
  const {control,state,context}=harness();
  await control('export-btn').click();
  assert.equal(state.prompts.length,0);
  const all=await unzip(state.downloads[0]);
  assert.match(all['xl/worksheets/sheet1.xml'].toString(),/A1:L4/);
  control('entry-filter-from').value='2026-09-03';
    control('entry-filter-to').value='2026-09-03';
  context.selectedEntryIds.add('b');
  await control('export-btn').click();
  const subset=await unzip(state.downloads[1]);
  const sheet=subset['xl/worksheets/sheet1.xml'].toString();
  assert.match(sheet,/A1:L2/);
  assert.match(sheet,/Cracks/);
  assert.doesNotMatch(sheet,/Potholes/);
  assert.equal(subset['xl/styles.xml'].toString(),all['xl/styles.xml'].toString());
  assert.deepEqual(state.prompts,['Export filtered/selected entries?']);
});
test('ZIP workbook, photos and manifest use one filtered snapshot across async work',async()=>{
  const {control,state,context}=harness();
  control('entry-filter-from').value='2026-09-03';
    control('entry-filter-to').value='2026-09-03';
  const original=context.getPhoto;
  context.getPhoto=async id=>{ context.entries.splice(0); return original(id); };
  await control('backup-btn').click();
  assert.deepEqual(state.photos,['photo-a','photo-b']);
  const zip=await unzip(state.downloads[0]);
  const find=suffix=>zip[Object.keys(zip).find(name=>name.endsWith(suffix))];
  const manifest=JSON.parse(find('/manifest.json'));
  assert.equal(manifest.entryCount,2);
  assert.equal(manifest.photoCount,2);
  assert.deepEqual(manifest.entries.map(entry=>entry.type),['Potholes','Cracks']);
  assert.deepEqual(manifest.entries.map(entry=>entry.id),['a','b']);
  assert.equal(manifest.version,2);
  const workbook=await unzip(new Blob([find('/inspection_log.xlsx')]));
  assert.match(workbook['xl/worksheets/sheet1.xml'].toString(),/A1:L3/);
});
test('map toggle creates plain non-interactive red dots, filters by day, refreshes and hides',()=>{
  const {control,context}=harness();
  context.osmMap={};context.osmEntryLayer=null;
  context.L={
    layerGroup:()=>({markers:[],clearLayers(){this.markers=[];},remove(){this.visible=false;},addTo(){this.visible=true;return this;}}),
    circleMarker:(point,options)=>({addTo(layer){layer.markers.push({point,options});}})
  };
  vm.runInContext(source('updateMapEntries'),context);
  context.updateMapEntries();
  assert.equal(context.osmEntryLayer.visible,false);
  control('map-show-entries').checked=true;
  control('map-entry-from').value='2026-09-03';
  control('map-entry-to').value='2026-09-03';
  context.updateMapEntries();
  assert.equal(context.osmEntryLayer.markers.length,2);
  control('map-entry-to').value='2026-09-04';
  context.updateMapEntries();
  assert.equal(context.osmEntryLayer.markers.length,3);
  control('map-entry-to').value='2026-09-03';
  context.updateMapEntries();
  assert.ok(context.osmEntryLayer.markers.every(marker=>marker.options.interactive===false && marker.options.fillColor==='#ef4444'));
  context.entries.splice(0,1);
  context.updateMapEntries();
  assert.equal(context.osmEntryLayer.markers.length,1);
  control('map-show-entries').checked=false;
  context.updateMapEntries();
  assert.equal(context.osmEntryLayer.visible,false);
  assert.equal(context.osmEntryLayer.markers.length,0);
});
