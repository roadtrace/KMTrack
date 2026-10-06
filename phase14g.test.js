const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), cp = require('node:child_process');
const ui = require('./log-register'), {createResolver,isInterchangeMode} = require('./location-resolver');
const html = fs.readFileSync('index.html','utf8').replaceAll('\r\n','\n');
const controls = fs.readFileSync('log-controls.js','utf8');
const baseline = file => cp.execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
function fn(source,name) {
  const start=source.indexOf('    function '+name+'('); assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n    }',start)+6);
}
for(const [options,entry,label] of [
  [{},{},'No photo'],[{}, {photoId:'local'},'Photo'],[{durable:false},{},'Evidence'],
  [{cloud:true},{},'Evidence'],[{cloud:true},{photo_path:'private'},'Evidence'],[{team:true},{},'Evidence']
]) test('accurate evidence '+JSON.stringify([options,entry]),()=>{
  assert.equal(ui.evidence(entry,options),label);
  const card=ui.cardHTML(entry,options); assert.ok(card.includes(`<span>${label}</span>`));
  assert.match(card,/<svg viewBox="0 0 24 24"/);
});
test('presentation introduces no photo reads or persistence; private viewer unchanged',()=>{
  const src=fs.readFileSync('log-register.js','utf8');
  assert.doesNotMatch(src,/fetch\(|download\(|indexedDB|localStorage|createObjectURL|<img/);
  for(const f of ['cloud-photo-viewer.js','photo-cloud-api.js','photo-sync.js','photo-pilot.js','team-records.js','my-records.js','entry-filters.js']) assert.equal(fs.readFileSync(f,'utf8').replaceAll('\r\n','\n'),baseline(f));
});
for(const [from,to,text] of [
  ['2026-10-06','2026-10-06','Oct 6, 2026'],['2026-10-04','2026-10-06','Oct 4 – 6, 2026'],
  ['2026-09-28','2026-10-06','Sep 28 – Oct 6, 2026'],['2026-12-30','2027-01-02','Dec 30, 2026 – Jan 2, 2027'],
  ['2026-08-01','2026-08-31','Aug 1 – 31, 2026'],['2026-10-06','','From Oct 6, 2026'],
  ['','2026-10-06','Through Oct 6, 2026'],['','','']
])test('calendar range '+from+' / '+to,()=>assert.equal(ui.dateRange(from,to),text));
test('date controls retain original inputs, visible labels, staged Apply and Cancel',()=>{
  assert.match(controls,/\[\['From',from\],\['To',to\]\]/);
  const inputs=new Map(['from','to','type'].map(k=>['entry-filter-'+k,{value:{from:'2026-10-04',to:'2026-10-06',type:'Potholes'}[k]}]));
  const c={window:{logFilterBaseline:{from:'2026-09-01',to:'2026-09-30',type:'Cracks'}},document:{getElementById:id=>inputs.get(id)||{value:''}}};
  vm.createContext(c);vm.runInContext(fn(html,'getLogFilters'),c);
  assert.equal(c.getLogFilters().from,'2026-09-01');assert.equal(c.getLogFilters().to,'2026-09-30');
  assert.equal(c.getLogFilters(true).from,'2026-10-04');assert.equal(c.getLogFilters(true).to,'2026-10-06');
  assert.match(controls,/if\(!filterApplied&&window.logFilterBaseline\)restoreFilters\(window.logFilterBaseline\)/);
  assert.match(controls,/filterApplied=true;window.logFilterBaseline=null;sheet.close\(\);applyEntryFilters\(\)/);
});
test('one date chip removes both bounds while retaining unrelated filters',()=>{
  assert.equal((controls.match(/button\('log-date-chip'/g)||[]).length,1);
  assert.doesNotMatch(controls,/names=\{from:/);
  const body=/chip.onclick=\(\)=>\{from.value='';to.value='';applyEntryFilters\(\);\}/.exec(controls)[0];
  const c={chip:{},from:{value:'2026-10-04'},to:{value:'2026-10-06'},type:'Potholes',calls:0};
  c.applyEntryFilters=()=>c.calls++;vm.createContext(c);vm.runInContext(body,c);c.chip.onclick();
  assert.equal(c.from.value,'');assert.equal(c.to.value,'');assert.equal(c.type,'Potholes');assert.equal(c.calls,1);
  assert.match(controls,/for\(const \[key,label\]of Object.entries\(names\)\)/);
});
test('Clear All restores blank date bounds and keeps the source scope',()=>{
  const inputs=new Map(['entry-filter-from','entry-filter-to','entry-filter-type','entry-filter-source'].map(id=>[id,{value:'old'}]));
  const c={$:id=>inputs.get(id),filterIDs:[...inputs.keys()],keyOf:id=>id.slice(13),clear:{},archive:true,f:{source:'batch'},calls:0};
  c.applyEntryFilters=()=>c.calls++;vm.createContext(c);
  vm.runInContext(controls.match(/const restoreFilters=f=>\{[^\n]+/)[0],c);
  vm.runInContext(controls.match(/clear.onclick=\(\)=>\{restoreFilters\([^\n]+?\};/)[0],c);c.clear.onclick();
  assert.equal(inputs.get('entry-filter-from').value,'');assert.equal(inputs.get('entry-filter-to').value,'');
  assert.equal(inputs.get('entry-filter-type').value,'');assert.equal(inputs.get('entry-filter-source').value,'imported');
});
for(const count of [0,1,3,10,17,25])test('Today total '+count+' stays independent of latest three',()=>{
  const records=Object.freeze(Array.from({length:count},(_,i)=>Object.freeze({id:String(i).padStart(3,'0'),timestamp:`2026-10-06 10:${String(i).padStart(2,'0')}:00`})).reverse());
  const before=JSON.stringify(records),today=ui.todayRecords(records,'2026-10-06');
  assert.equal(today.length,count);assert.equal(today.slice(0,3).length,Math.min(count,3));
  assert.equal(JSON.stringify(records),before);
  if(count>1)assert.ok(today[0].timestamp>=today[1].timestamp);
});
test('today excludes yesterday, tomorrow, cloud history and imported archives',()=>{
  const timestamp='2026-10-06 08:00:00';
  const entries=[{id:'yes',timestamp},{id:'yesterday',timestamp:'2026-10-05 23:59:59'},
    {id:'tomorrow',timestamp:'2026-10-07 00:00:00'},{id:'archive',timestamp,importBatchId:'batch'},
    {id:'cloud',timestamp,cloud_source:true}];
  assert.deepEqual(ui.todayRecords(entries,'2026-10-06').map(e=>e.id),['yes']);assert.equal(entries.length,5);
});
test('today ordering is deterministic for equal inspection timestamps',()=>{
  const timestamp='2026-10-06 10:00:00';assert.deepEqual(ui.todayRecords([{id:'b',timestamp},{id:'a',timestamp}],timestamp.slice(0,10)).map(e=>e.id),['a','b']);
});
test('Capture uses active workspace, owner and existing local calendar semantics',()=>{
  const timestamp='2026-10-06 10:00:00';
  const c={authWorkspaceUnlocked:true,authDisplayState:{userId:'OWNER'},accessibleEntries:()=>[{id:'own',user_id:'owner',timestamp},{id:'foreign',user_id:'other',timestamp},{id:'legacy',timestamp}],fullTimestamp:()=>timestamp,SPOTITLogRegister:ui};
  vm.createContext(c);vm.runInContext(fn(html,'captureTodayEntries'),c);
  assert.equal(JSON.stringify(c.captureTodayEntries().map(e=>e.id)),JSON.stringify(['legacy','own']));
  c.authWorkspaceUnlocked=false;assert.equal(c.captureTodayEntries().length,0);
  c.authWorkspaceUnlocked=true;c.authDisplayState={mode:'guest'};c.accessibleEntries=()=>[{id:'guest',timestamp}];assert.equal(c.captureTodayEntries()[0].id,'guest');
  assert.match(html,/visible.slice\(0, CAPTURE_RECENT_LIMIT\)/);
  assert.match(controls,/logRegisterView==='inspection'\?visible.length:shownCount/);
  assert.match(html,/capped \? shown : shown.slice\(\).reverse\(\)/);
  assert.match(html,/No inspections recorded today/);
});
const ramp={site_id:'synthetic',name:'Synthetic Exit'};
function path(bound='NB') {
  const resolver=createResolver();let tick=0,lat=15;const km=bound==='NB'?30:29;
  const fix=(distance,match,options={})=>resolver.resolve({lat:lat+=.0003,lon:120.7,accuracy:8,timestamp:++tick*1000,
    candidates:[{expressway:'NLEX',bound,distance,km:km+(bound==='NB'?1:-1)*tick*.03},{expressway:'OTHER',bound:'EB',distance:.15,km:20}],interchange:match,...options});
  for(let i=0;i<3;i++)fix(.005);
  for(let i=0;i<3;i++)fix(.09,ramp);
  assert.equal(resolver.state().interchange.name,ramp.name);
  // Move away from the last observed ramp geometry before re-entry.
  for(let i=0;i<5;i++)fix(.09);
  return {resolver,fix};
}
for(const bound of ['NB','SB'])test('two trustworthy '+bound+' mainline fixes clear stale hold and restore KM',()=>{
  const {fix}=path(bound);const first=fix(.005);assert.equal(first.interchangeLocked,true);assert.equal(isInterchangeMode(first,8),true);
  const second=fix(.005);assert.equal(second.interchangeLocked,false);assert.equal(second.interchange,null);assert.equal(second.result.expressway,'NLEX');assert.equal(isInterchangeMode(second,8),false);assert.ok(Number.isFinite(second.result.km));
});
for(const bound of ['NB','SB'])test('opposite carriageway cannot trigger '+bound+' recovery',()=>{
  const {fix}=path(bound),opposite=bound==='NB'?'SB':'NB';
  for(let i=0;i<2;i++){const r=fix(.005,null,{candidates:[{expressway:'NLEX',bound:opposite,distance:.005,km:30}]});assert.equal(r.interchangeLocked,true);}
});
for(const accuracy of [41,80,NaN])test('poor accuracy '+accuracy+' cannot independently recover',()=>{
  const {fix}=path();fix(.005);assert.equal(fix(.005,null,{accuracy}).interchangeLocked,true);
  assert.equal(fix(.005).interchangeLocked,true);assert.equal(fix(.005).interchangeLocked,false);
});
test('one mainline-like outlier and exit jitter do not clear a valid interchange',()=>{
  const {fix}=path();for(let i=0;i<4;i++){assert.equal(fix(.005).interchangeLocked,true);assert.equal(fix(.09,ramp).interchangeLocked,true);}
});
test('same-site geometry, competing road and stationary drift block early recovery',()=>{
  let p=path();for(let i=0;i<2;i++)assert.equal(p.fix(.005,ramp).interchangeLocked,true);
  p=path();for(let i=0;i<2;i++)assert.equal(p.fix(.005,null,{candidates:[{expressway:'NLEX',bound:'NB',distance:.005,km:30},{expressway:'OTHER',distance:.01,km:20}]}).interchangeLocked,true);
  p=path();for(let i=0;i<2;i++)assert.equal(p.fix(.005,null,{lat:15.0033}).interchangeLocked,true);
});
test('stale signal breaks consecutive mainline confirmations',()=>{
  const {resolver,fix}=path();fix(.005);resolver.markStale();assert.equal(fix(.005).interchangeLocked,true);assert.equal(fix(.005).interchangeLocked,false);
});
test('duplicate timestamps and sparse fixes do not count as consecutive fresh evidence',()=>{
  let p=path();p.fix(.005);assert.equal(p.fix(.005,null,{timestamp:12000}).interchangeLocked,true);
  p=path();p.fix(.005);assert.equal(p.fix(.005,null,{timestamp:30000}).interchangeLocked,true);
});
test('an implausible GPS jump cannot independently release the hold',()=>{
  const {fix}=path();fix(.005);assert.equal(fix(.005,null,{lat:16}).interchangeLocked,true);
});
test('wrong-way KM progress does not provide forward carriageway evidence',()=>{
  const {fix}=path();for(const km of [30,29.98])assert.equal(fix(.005,null,{candidates:[{expressway:'NLEX',bound:'NB',distance:.005,km}]}).interchangeLocked,true);
});
test('the installed dataset cannot supply directed transition gates',()=>{
  const data=require('./interchanges.json');const tambubong=data.ramps.filter(r=>r.site_id==='nlex_tambubong');
  assert.ok(tambubong.length>0);
  for(const r of tambubong)for(const field of ['bound','travel','from_node','to_node','level'])assert.equal(r[field],'');
  assert.equal(data.ramps.filter(r=>r.from_node||r.to_node).length,0);
});
test('mainline traffic and ramp entry retain original primary-station behavior',()=>{
  const resolver=createResolver();let r;for(let i=0;i<3;i++)r=resolver.resolve({lat:15+i*.0001,lon:120,accuracy:8,timestamp:i*1000,candidates:[{expressway:'NLEX',bound:'NB',distance:.005,km:30}],interchange:ramp});
  assert.equal(isInterchangeMode(r,8),false);
  r=resolver.resolve({lat:15.0003,lon:120,accuracy:8,timestamp:3000,candidates:[{expressway:'NLEX',bound:'NB',distance:.09,km:30}],interchange:ramp});
  assert.equal(isInterchangeMode(r,8),true);assert.equal(r.interchange.name,ramp.name);
  assert.match(html,/kmEl.textContent = interchangeMode \? resolution.interchange.name/);
});
test('redundant interchange UI is gone; bridge functionality and Team remain unchanged',()=>{
  assert.doesNotMatch(html,/Interchange identity|id="ramp-tag"|Near \$\{rampEl/);
  for(const name of ['updateBridgeReadout','computeKmStation','computeCorridorCandidates','renderTeamWorkspace','switchTeamSection','updateMapEntries']) {
    if(html.includes('    function '+name+'('))assert.equal(fn(html,name),fn(baseline('index.html'),name));
  }
  const team=s=>s.slice(s.indexOf('<section class="app-view team-view"'),s.indexOf('<section class="app-view settings-view"'));
  assert.equal(team(html),team(baseline('index.html')));
  assert.equal(fs.readFileSync('interchanges.json','utf8').replaceAll('\r\n','\n'),baseline('interchanges.json'));
  const css=fs.readFileSync('log-register.css','utf8');assert.match(css,/#inspection-view #log-register \{ padding:0; \}/);assert.match(css,/display:none !important/);
});
