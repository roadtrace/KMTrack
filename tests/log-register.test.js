const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ui=require('../src/log-register.js'),filters=require('../src/entry-filters.js');
const html=fs.readFileSync('index.html','utf8').replaceAll('\r\n','\n'),css=fs.readFileSync('src/log-register.css','utf8');
const git=require('./helpers/historical-source.cjs').source;
const baseline=git('index.html');
function sharedStyle(source){const start=source.indexOf('<style>');assert.ok(start>=0,'shared style opening');const end=source.indexOf('</style>',start);assert.ok(end>start,'shared style closing');return source.slice(start,end);}
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
test('local inspection view preserves editor markup and requires explicit Edit activation',()=>{
  for(const name of ['closeEditModal','populateEditExpresswaySelect','populateEditBoundSelect','sizeEntryEditableControls'])assert.equal(fn(html,name),fn(baseline,name));
  const popup=s=>s.slice(s.indexOf('  <div id="edit-modal"'),s.indexOf('</body>'));
  assert.equal(popup(html),popup(baseline));
  const edit=fn(html,'openEditModal');
  assert.match(edit,/activateEdit = false/);assert.match(edit,/control.disabled = !editing/);
  assert.match(edit,/edit.onclick = .*setEditing\(true\)/);assert.match(edit,/setEditing\(activateEdit\)/);
  const style=fs.readFileSync('src/design-system.css','utf8');
  assert.match(style,/inspection-detail-sheet/);assert.match(style,/var\(--panel-raised\)/);
});
test('B01 preview style isolation preserves scope and the shared-style guard detects changes',()=>{
  const preview=html.match(/<style id="b01-preview-styles">([\s\S]*?)<\/style>/);assert.ok(preview);
  const body=preview[1].replace(/\/\*[\s\S]*?\*\//g,'');const rules=[...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)];assert.equal(rules.length,9);
  for(const rule of rules)assert.match(rule[1].trim(),/^\.b01-preview-[a-z-]+(?: (?:h3|p|button))?$/);
  assert.equal(body.replace(/([^{}]+)\{([^{}]*)\}/g,'').trim(),'');
  assert.ok(html.indexOf(preview[0])<html.indexOf('<style>'));
  assert.notEqual(sharedStyle(html.replace('font-display: swap;','font-display: block;')),sharedStyle(baseline));
});
test('submitted details retain private viewer guards and independent readonly Team scope',()=>{
  for(const name of ['currentPhotoItem','currentMyItem','freshMapItems','updateMapEntries','switchMapScope','openMapEntry'])assert.equal(fn(html,name),fn(baseline,name));
  const detail=fn(html,'openSubmittedDetail');
  assert.match(detail,/teamView \? 'Read only' : 'Your inspection'/);
  assert.match(detail,/if \(!teamView\)/);assert.match(detail,/if \(teamView \|\|/);
  assert.match(detail,/submittedDialog !== dialog \|\| !dialog.open/);
  assert.match(detail,/row.user_id\?\.toLowerCase\(\) !== context.userId.toLowerCase\(\)/);
  assert.match(detail,/localEntryDurable\(entry\)/);assert.match(detail,/openEditModal\(index, true\)/);
  for(const file of ['src/my-records.js','src/team-records.js','src/cloud-records.js','src/cloud-photo-viewer.js','src/map-records.js','src/map-overlays.js','src/map-overlays.css','src/entry-filters.js','src/inspection-sharing.js','src/sharing-ui.js'])assert.equal(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'),git(file));
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
test('cache v262 contains both new deployed assets and photo gate remains off',()=>{const sw=fs.readFileSync('sw.js','utf8');assert.match(sw,/CACHE_VERSION = 'v262'/);for(const file of ['src/log-register.js','src/log-register.css'])assert.ok(sw.includes("'./"+file+"'"));assert.match(html,/PHOTO_CLOUD_TRANSPORT_ENABLED = false/);});
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
