const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ui=require('./log-register'),filters=require('./entry-filters');
const html=fs.readFileSync('index.html','utf8').replaceAll('\r\n','\n'),css=fs.readFileSync('log-register.css','utf8');
const git=file=>require('node:child_process').execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'show','HEAD:'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
const baseline=git('index.html');
function fn(source,name){const start=source.indexOf('    function '+name+'(');assert.ok(start>=0,name);const line=source.slice(start,source.indexOf('\n',start));return line.trim().endsWith('}')?line:source.slice(start,source.indexOf('\n    }',start)+6);}
const entry={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',type:'Potholes',timestamp:'2026-10-06 10:42:00',km:29.38,bound:'NB',lane:'2',expressway:'NLEX',inspector:'Moises',interchange:'Bocaue',notes:'Shoulder near exit',sync_status:'local_only'};
for(const term of ['pothole','29+380','KM 29+380','29.38','moises','nlex','Bocaue','shoulder'])test('human field search: '+term,()=>assert.equal(ui.matches(entry,{search:term}),true));
test('search excludes technical IDs, emails and private paths',()=>{const e={...entry,user_id:'owner-secret',email:'private@example.invalid',photo_path:'roadway/private-secret.jpg'};for(const search of [entry.id,'owner-secret','private-secret','private@example.invalid'])assert.equal(ui.matches(e,{search}),false);});
test('filters compose without changing their source entry',()=>{const before=JSON.stringify(entry);assert.equal(ui.matches(entry,{corridor:'NLEX',bound:'NB',lane:'2',status:'device',photo:'without'}),true);for(const f of [{corridor:'SCTEX'},{bound:'SB'},{lane:'3'},{status:'waiting'},{photo:'with'}])assert.equal(ui.matches(entry,f),false);assert.equal(JSON.stringify(entry),before);});
test('cloud association does not pretend to prove device photo availability',()=>{for(const photo of ['with','without'])assert.equal(ui.matches({...entry,photoId:'unrelated'},{photo},true),false);assert.equal(ui.matches(entry,{status:'submitted'},true),true);});
for(const [patch,key]of [[{sync_status:'pending'},'waiting'],[{sync_status:'syncing'},'submitting'],[{sync_status:'needs_review'},'review'],[{sync_status:'failed',sync_outcome_unknown:true},'review'],[{sync_status:'pending',guest_claim_required:true},'device'],[{importBatchId:'archive'},'imported'],[{sync_status:'synced',remote_id:entry.id},'submitted']])test('separate inspection state '+key+' '+JSON.stringify(patch),()=>assert.equal(ui.inspectionState({...entry,...patch}).key,key));
test('inspection submission does not depend on photo acknowledgement or enabled transport',()=>{assert.equal(ui.inspectionState({...entry,sync_status:'synced',remote_id:entry.id,photo_sync_status:'photo_pending'}).label,'Inspection submitted');assert.notEqual(ui.inspectionState({...entry,sync_status:'synced',remote_id:'different'}).key,'submitted');});
test('cards escape all human text and omit raw identities',()=>{const s=ui.cardHTML({...entry,type:'<img onerror="oops">',notes:'secret',photo_path:'private-path',importLabel:'<archive>'},{photoLabel:'Photo on device'});assert.match(s,/&lt;img/);assert.doesNotMatch(s,/<img|onerror="|aaaaaaaa|private-path|secret/);assert.match(s,/KM 29\+380/);assert.match(s,/Lane 2/);});
test('cloud cards convey readonly submitted status without device mutation affordances',()=>{const s=ui.cardHTML(entry,{cloud:true,team:true});assert.match(s,/Team record · Read only/);assert.match(s,/Inspection submitted/);assert.doesNotMatch(s,/data-idx|checkbox|Save|Delete|Synced/);});
test('existing local popup markup, handlers and shared theme styles remain byte-identical',()=>{
  for(const name of ['openEditModal','closeEditModal','populateEditExpresswaySelect','populateEditBoundSelect','sizeEntryEditableControls'])assert.equal(fn(html,name),fn(baseline,name));
  const popup=s=>s.slice(s.indexOf('  <div id="edit-modal"'),s.indexOf('</body>'));
  assert.equal(popup(html),popup(baseline));
  const editHandlers=s=>s.slice(s.indexOf('    let editPhotoObjectUrl'),s.indexOf('    // ---------- Excel'));
  assert.equal(editHandlers(html),editHandlers(baseline));
  assert.equal(fs.readFileSync('design-system.css','utf8').replaceAll('\r\n','\n'),git('design-system.css'));
  assert.equal(html.slice(html.indexOf('<style>'),html.indexOf('</style>')),baseline.slice(baseline.indexOf('<style>'),baseline.indexOf('</style>')));
});
test('submitted details, private viewer guards and Map implementation remain identical',()=>{
  for(const name of ['openSubmittedDetail','currentPhotoItem','currentMyItem','freshMapItems','updateMapEntries','switchMapScope','openMapEntry'])assert.equal(fn(html,name),fn(baseline,name));
  for(const file of ['my-records.js','team-records.js','cloud-records.js','cloud-photo-viewer.js','map-records.js','map-overlays.js','map-overlays.css','entry-filters.js','inspection-sharing.js','sharing-ui.js'])assert.equal(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'),git(file));
});
function exportContext(mode='filtered',selected=[]){
  const local=[entry,{...entry,id:'bbbb',type:'Cracks',importBatchId:'batch'}],f={search:'pothole'};
  const c={logExportMode:mode,myLogEnabled:()=>true,logRecordScope:'my',getLogFilters:()=>f,accessibleEntries:()=>local,logRegisterItems:()=>[{local:entry},{cloud:{id:'cloud'} }],SPOTITEntryFilters:filters,selectedEntryIds:new Set(selected),alert(){},confirm:()=>true};
  vm.createContext(c);vm.runInContext(fn(html,'entriesForExport'),c);return c;
}
test('filtered device export excludes cloud items and respects register projection',()=>{const c=exportContext();const result=c.entriesForExport();assert.equal(result.length,1);assert.equal(result[0].id,entry.id);assert.equal(c.logExportMode,null);});
test('selected export with no eligible selection cannot fall back to all visible records',()=>{const c=exportContext('selected',['cloud']);assert.equal(c.entriesForExport(),null);});
test('all device export uses existing accessible device set without cloud history',()=>{const c=exportContext('all');assert.equal(c.entriesForExport().length,2);});
test('Team export fails at the handler boundary and consumes pending export intent',()=>{const c=exportContext('all');c.logRecordScope='team';assert.equal(c.entriesForExport(),null);assert.equal(c.logExportMode,null);});
test('applied filters remain fixed during an uncommitted filter draft',()=>{
  const inputs=new Map(),c={window:{logFilterBaseline:{type:'Cracks',source:'imported'}},document:{getElementById:id=>inputs.get(id)||{value:''}}};inputs.set('entry-filter-type',{value:'Potholes'});vm.createContext(c);vm.runInContext(fn(html,'getLogFilters'),c);assert.equal(c.getLogFilters().type,'Cracks');assert.equal(c.getLogFilters(true).type,'Potholes');
});
test('new styles are scoped to Log and dedicated sheets, never the existing popup or Map',()=>{assert.doesNotMatch(css,/#edit-modal|#map-view|\.entry-sheet|\.modal-backdrop/);assert.match(css,/register-sheet-footer[\s\S]*position:sticky/);assert.match(css,/data-theme="light"/);assert.match(css,/min-height:44px/);});
test('cache v243 contains both new deployed assets and photo gate remains off',()=>{const sw=fs.readFileSync('sw.js','utf8');assert.match(sw,/CACHE_VERSION = 'v243'/);for(const file of ['log-register.js','log-register.css'])assert.ok(sw.includes("'./"+file+"'"));assert.match(html,/PHOTO_CLOUD_TRANSPORT_ENABLED = false/);});
test('history unavailable states distinguish connection, Guest, auth, approval, team, verification and permission',()=>{
  const c={canUseLocal:true,mode:'approved',cloudVerified:true,profile:{approved:true,team:'roadway'}};
  for(const [context,online,text]of [[c,false,'Offline'],[{mode:'guest'},true,'Guest local mode'],[{},true,'Sign in'],[{...c,profile:{approved:false}},true,'approval'],[{...c,profile:{approved:true}},true,'No team'],[{...c,cloudVerified:false},true,'Verify'],[c,true,'permission']])assert.ok(ui.historyUnavailable(context,online).includes(text));
});
test('empty messages distinguish filters, archive, Team loading/unavailable and loaded history',()=>{
  for(const [options,text]of [[{filtered:true},'filters'],[{scope:'imported'},'imported'],[{scope:'team',loading:true},'Loading'],[{scope:'team',available:false},'unavailable'],[{scope:'team',loaded:true},'loaded history']])assert.ok(ui.emptyMessage(options).includes(text));
});
test('KM display preserves the existing station formatter, including rounding and signed values',()=>{
  const c={};vm.createContext(c);vm.runInContext(fn(html,'formatKmStation'),c);
  for(const value of [0,12,29.38,12.001,.9995,-1.234])assert.equal(ui.km(value),c.formatKmStation(value));
});
test('existing batch delete handler removes selected device records and never acts on a cloud-only UUID',async()=>{
  const marker="document.getElementById('bulk-delete-btn').addEventListener('click', async () => {",start=html.indexOf(marker);
  assert.ok(start>=0);const body=html.slice(start+marker.length,html.indexOf('\n    });',start));
  const photos=[],cloud={id:'cloud-only'},c={entries:[{...entry,photoId:'local-photo'},{...entry,id:'retained'}],selectedEntryIds:new Set([entry.id,cloud.id]),confirm:()=>true,saveEntries(){},exitSelectMode(){c.selectedEntryIds.clear();},renderLog(){},deletePhoto:async id=>photos.push(id)};
  vm.createContext(c);vm.runInContext('async function removeSelected(){'+body+'}',c);await c.removeSelected();
  assert.equal(c.entries.length,1);assert.equal(c.entries[0].id,'retained');assert.deepEqual(photos,['local-photo','local-photo:raw']);assert.deepEqual(cloud,{id:'cloud-only'});
});
