const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('    function renderTeamWorkspace() {');
const render=html.slice(start,html.indexOf('\n    }',start)+6);
function fixture(){
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{},setAttribute(k,v){this[k]=v;}});return nodes.get(id);};
  const state={mode:'approved',canUseLocal:true,email:'inspector@example.invalid',profile:{full_name:'Test Inspector',approved:true,role:'inspector',team:'Test team'}};
  const c={document:{getElementById:node},inspectionContext:()=>state,cloudRecordStore:{syncScope:()=>c.scope},scope:{},
    entries:[],localStorage:{},activeEntriesStorageKey:()=> 'synthetic',SPOTITLocalStore:{snapshotContains:()=>()=>true},
    SPOTITTeamRecords:{deviceCounts:()=>({waiting:8,submitted:24,review:2,photosOnDevice:3,photosWaiting:1})},
    navigator:{onLine:true},syncRunner:{status:()=>c.runner,ready:()=>true},runner:{running:false},
    SPOTITSync:{accountEligible:context=>context.mode==='approved'},myRecords:{},
    teamRecords:{snapshot:()=>({loaded:true,rows:[{},{}],lastRefresh:1793250000000})}};
  vm.createContext(c);vm.runInContext(render,c);
  return {c,state,node,run:()=>c.renderTeamWorkspace()};
}
test('Team cards show current account, durable device counts, bounded history and real sync eligibility',()=>{
  const f=fixture();f.run();
  for(const [id,value] of [['team-account','Test Inspector'],['team-address','inspector@example.invalid'],['team-submitted','24'],['team-waiting','8'],['team-loaded-count','2'],['team-permission-access','Team history (read only)']])assert.equal(f.node(id).textContent,value);
  assert.equal(f.node('team-sync-progress').value,24);assert.equal(f.node('team-sync-progress').max,34);
  assert.equal(f.node('team-sync-now').disabled,false);assert.equal(f.node('team-open-team').disabled,false);
  assert.match(f.node('team-loaded-counts').textContent,/not a complete total/);
  f.c.runner.running=true;f.run();assert.equal(f.node('team-sync-now').disabled,true);assert.equal(f.node('team-sync-action').textContent,'Syncing...');
});
test('Guest, offline and signed-out renders cannot retain private identity or grant Team/sync actions',()=>{
  const f=fixture();f.run();f.state.mode='guest';f.state.profile=null;f.state.email='';f.c.scope=null;f.run();
  assert.equal(f.node('team-account').textContent,'Guest');assert.doesNotMatch(f.node('team-address').textContent,/@/);
  assert.equal(f.node('team-open-team').disabled,true);assert.equal(f.node('team-sync-now').disabled,true);
  f.state.mode='offline-recent';f.state.profile={full_name:'Cached Inspector',approved:true,role:'inspector',team:'Test team'};f.c.navigator.onLine=false;f.run();
  assert.match(f.node('team-connection').textContent,/Connection unavailable/);assert.equal(f.node('team-loaded-count').textContent,'Not loaded');
  f.state.canUseLocal=false;f.state.mode='signed-out';f.run();assert.equal(f.node('team-account').textContent,'Account');assert.equal(f.node('team-open-my').disabled,true);
});
