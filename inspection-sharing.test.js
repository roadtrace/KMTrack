const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sharing=require('./inspection-sharing.js'),filters=require('./entry-filters.js');
const ui=fs.readFileSync(require.resolve('./sharing-ui.js'),'utf8');
const html=fs.readFileSync(require.resolve('./index.html'),'utf8');
const row={id:'stable',type:'Potholes',timestamp:'2026-09-04 10:30:00',lat:14.7,lon:121.2,km:12.003,expressway:'NLEX',bound:'NB',lane:'1',photoFilename:'',inspector:'Juan'};
function fn(source,name){const n=source.indexOf(`function ${name}(`);return source.slice(source.slice(n-6,n)==='async '?n-6:n,source.indexOf('\n}',n)+2);}
function context(){
  const photos=new Map(),state={saved:'',failSave:false,failPhoto:false,count:0};
  const ctx=vm.createContext({entries:[{...row,id:'mine',timestamp:'2026-09-01 10:00:00',inspector:''}],storageAvailable:true,KMTrackSharing:sharing,Blob,Uint8Array,Map,Set,Date,
    newId:()=>`generated-${++state.count}`,selectedEntryIds:new Set(),renderLog(){},updateMapEntries(){},confirm:()=>true,document:{getElementById:()=>({textContent:''})},
    saveEntries(){if(state.failSave)return false;state.saved=JSON.stringify(ctx.entries);return true;},
    async putPhoto(id,blob){if(state.failPhoto)throw Error('photo quota');photos.set(id,blob);},async deletePhoto(id){photos.delete(id);}
  });
  for(const name of ['commitSharedImport','undoSharedImport'])vm.runInContext(fn(ui,name),ctx);
  return {ctx,state,photos};
}
test('validates imports, preserves zero coordinates and rejects bad dates/coordinates',()=>{
  assert.equal(sharing.normalize({...row,lat:0,lon:0}).lat,0);
  for(const patch of [{lat:91},{lon:Infinity},{timestamp:'2026-02-31'},{km:'12+003'},{type:''}])assert.throws(()=>sharing.normalize({...row,...patch}));
});
test('duplicate detection covers legacy records, stable IDs, and within-file duplicates; conflicts never overwrite',()=>{
  assert.equal(sharing.planImport([row],[{...row,id:''}]).duplicates,1);
  assert.equal(sharing.planImport([],[row,row]).added.length,1);
  const plan=sharing.planImport([row],[{...row,lane:'2'}]);
  assert.equal(plan.added.length,0);assert.equal(plan.conflicts.length,1);assert.equal(row.lane,'1');
  assert.equal(sharing.planImport([row],[{...row,km:12.0031}]).conflicts.length,1);
});
test('export attribution fills only own unnamed entries and never overwrites imported names',()=>{
  const rows=[{...row,inspector:''},row,{...row,inspector:'',importBatchId:'batch'}];
  const exported=sharing.forExport(rows,'Moise');
  assert.deepEqual(exported.map(e=>e.inspector),['Moise','Juan','']);assert.equal(rows[0].inspector,'');
});
test('export dialog cancellation does not save or attribute entries; confirmation remembers optional name',async()=>{
  for(const choice of ['cancel','export']){
    const stored=new Map(),original=[{...row,inspector:''},{...row,id:'colleague',importBatchId:'batch'}];
    let dialog;
    const ctx=vm.createContext({sharingBusy:false,entries:structuredClone(original),KMTrackSharing:sharing,
      entriesForExport:()=>structuredClone(original),localStorage:{getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)},
      document:{getElementById:id=>id==='export-name-dialog'?dialog:{value:'Moise'}},renderLog(){},alert(){},saveEntries:()=>true});
    const input={value:''};
    dialog={returnValue:'',showModal(){input.value='Moise';},addEventListener(event,resolve){this.returnValue=choice;resolve();}};
    ctx.document.getElementById=id=>id==='export-name-dialog'?dialog:input;
    vm.runInContext(fn(ui,'prepareSharingExport'),ctx);
    const result=await ctx.prepareSharingExport();
    if(choice==='cancel'){assert.equal(result,null);assert.equal(stored.size,0);assert.equal(ctx.entries[0].inspector,'');}
    else {assert.equal(result[0].inspector,'Moise');assert.equal(result[1].inspector,'Juan');assert.equal(stored.get('kmtrack_inspector_name_v1'),'Moise');assert.equal(ctx.entries[0].inspector,'Moise');}
  }
});
test('source and inspector filters combine with dates/types for log, map and export scope',()=>{
  const rows=[{...row,id:'own'},{...row,id:'import',importBatchId:'batch',inspector:'Ana'}];
  assert.deepEqual(filters.filterEntries(rows,{source:'mine'}).map(e=>e.id),['own']);
  assert.equal(filters.filterEntries(rows,{source:'batch',inspector:'Ana',from:'2026-09-04',to:'2026-09-04',type:'Potholes'}).length,1);
  assert.equal(filters.mapEntries(rows,'','','','imported','Ana').length,1);
  assert.equal(filters.exportScope(rows,{source:'mine'}).restricted,true);
});
test('import merges, persists provenance and photos, then Undo after reload preserves own entries',async()=>{
  const {ctx,state,photos}=context();
  const incoming={...row,photoFile:{blob:async()=>new Blob([new Uint8Array([255,216,255,0])])},photoFilename:'photo.jpg'};
  const result=await ctx.commitSharedImport([incoming],{label:'Juan Sept 4',inspectors:new Map([['Juan','Juan']])});
  assert.equal(result.count,1);assert.equal(ctx.entries.length,2);assert.equal(photos.size,1);
  ctx.entries=JSON.parse(state.saved);
  assert.equal(ctx.entries[1].id,'stable');assert.equal(ctx.entries[1].originId,'stable');assert.equal(ctx.entries[1].inspector,'Juan');
  await ctx.undoSharedImport();
  assert.equal(ctx.entries.length,1);assert.equal(ctx.entries[0].id,'mine');assert.equal(photos.size,0);
  assert.equal(JSON.parse(state.saved).length,1);
});
test('photo/persistence failures roll back imports without changing existing records',async()=>{
  for(const failure of ['failPhoto','failSave']){
    const {ctx,state,photos}=context();state[failure]=true;
    const before=JSON.stringify(ctx.entries);
    await assert.rejects(ctx.commitSharedImport([{...row,photoFile:{blob:async()=>new Blob([new Uint8Array([255,216,255,0])])}}],{label:'Test',inspectors:new Map()}));
    assert.equal(JSON.stringify(ctx.entries),before);assert.equal(photos.size,0);
  }
});
test('Undo persistence failure keeps all imported entries and photos',async()=>{
  const {ctx,state}=context();await ctx.commitSharedImport([row],{label:'Test',inspectors:new Map()});
  state.failSave=true;await assert.rejects(ctx.undoSharedImport());assert.equal(ctx.entries.length,2);
});
test('ZIP reads original KMTrack manifests and rejects corrupt or unsafe archives',async()=>{
  const ctx=vm.createContext({Blob,TextEncoder,Uint8Array,Uint32Array,DataView,Date});
  vm.runInContext(html.slice(html.indexOf('const ZIP_CRC_TABLE ='),html.indexOf('function safeBackupFilename(')),ctx);
  const manifest={format:'KMTrack inspection backup',version:1,entries:[row]};
  const blob=await ctx.createStoredZip([{name:'backup/manifest.json',blob:new Blob([JSON.stringify(manifest)])}]);
  blob.name='legacy.zip';
  const imported=await sharing.readImport(blob);assert.equal(imported.rows[0].id,'stable');
  const bytes=new Uint8Array(await blob.arrayBuffer());bytes[60]^=1;
  const corrupt=new Blob([bytes]);corrupt.name='corrupt.zip';await assert.rejects(sharing.readImport(corrupt));
  const unsafe=await ctx.createStoredZip([{name:'../manifest.json',blob:new Blob(['{}'])}]);
  await assert.rejects(sharing.readZip(unsafe),/Unsafe/);
});
