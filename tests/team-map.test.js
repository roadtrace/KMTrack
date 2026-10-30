const test=require('node:test'),assert=require('node:assert/strict');
const map=require('../src/team-map'),projection=require('../src/map-records');
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const row=n=>({id:id(n),user_id:other,team:'roadway',inspected_at:'2026-09-18T03:00:00.123456Z',defect_type:'Potholes',latitude:14.6,longitude:121,inspector_display_name:'Colleague'});
function fixture(t){
 let online=true,context={mode:'approved',cloudVerified:true,canUseLocal:true,userId:user,workspaceUserId:user,scopeGeneration:1,sessionGeneration:1,profile:{id:user,approved:true,role:'inspector',team:'roadway'}};
 let reply=args=>{const start=args.after_id?Number(args.after_id.slice(-12))-1:275;return {data:{authorized:true,total:275,has_more:start>50,records:Array.from({length:Math.min(start,50)},(_,i)=>row(start-i))}};};
 const calls=[],queue=new Map();let seq=0,changes=0;
 const controller=map.createController({context:()=>context,key:()=> 'workspace',online:()=>online,verify:async()=>{},changed:()=>changes++,
  schedule:fn=>{queue.set(++seq,fn);return seq;},cancel:key=>queue.delete(key),
  client:{auth:{getUser:async()=>({data:{user:{id:user}}})},rpc:async(name,args)=>{calls.push([name,args]);return name==='team_inspection_summary'?{data:[{owner_id:other,display_name:'Colleague',inspection_count:275}]}:reply(args);}}});
 t.after(()=>controller.invalidate());
 const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
 const pump=async()=>{for(let i=0;queue.size&&i<30;i++){const tasks=[...queue.values()];queue.clear();tasks.forEach(fn=>fn());await settle();}assert.equal(queue.size,0);};
 return {controller,calls,queue,settle,pump,changes:()=>changes,setReply:fn=>reply=fn,setOnline:v=>online=v,setContext:v=>context={...context,...v}};
}
test('Team Map automatically loads all 275 matches beyond the old five-page retention window',async t=>{
 const f=fixture(t);f.controller.activate();await f.settle();assert.equal(f.controller.items().length,50);assert.match(f.controller.coverage(),/50 of 275.*Loading/);
 await f.pump();assert.equal(f.controller.items().length,275);assert.equal(new Set(f.controller.items().map(r=>r.id)).size,275);assert.match(f.controller.coverage(),/275 of 275.*All matches/);
 assert.equal(f.calls.filter(([name])=>name==='team_inspection_page').length,6);
 assert.equal(projection.project(f.controller.items(),'team').rows.length,275);
 const before=f.changes();f.controller.activate();await f.pump();assert.equal(f.changes(),before,'unchanged renders do not notify recursively');
});
test('inspector UUID and older Philippine date range are sent to the server independently of Log',async t=>{
 const f=fixture(t);f.setReply(args=>({data:{authorized:true,total:1,has_more:false,records:args.filters.inspector===other&&args.filters.from==='2026-09-18'?[row(1)]:[]}}));
 f.controller.activate({inspector:other,from:'2026-09-18',to:'2026-09-18',type:'Potholes',bound:'NB'});await f.settle();await f.pump();
 const args=f.calls.find(([name])=>name==='team_inspection_page')[1];assert.equal(args.filters.inspector,other);assert.equal(args.filters.to,'2026-09-18');assert.equal(args.filters.bound,'NB');assert.equal(f.controller.items().length,1);
});
test('filter replacement clears old markers and discards a late previous inspector response',async t=>{
 const f=fixture(t);let resolve;f.setReply(args=>args.filters.inspector===other?new Promise(r=>resolve=r):{data:{authorized:true,total:0,has_more:false,records:[]}});
 f.controller.activate({inspector:other});await f.settle();f.controller.activate({inspector:user});await f.settle();resolve({data:{authorized:true,total:1,has_more:false,records:[row(1)]}});await f.settle();await f.pump();
 assert.equal(f.controller.items().length,0);assert.equal(f.controller.snapshot().filters.inspector,user);assert.match(f.controller.coverage(),/0 of 0.*All matches/);
});
test('pause stops automatic pages; reactivation resumes without resetting earlier pages',async t=>{
 const f=fixture(t);f.controller.activate();await f.settle();f.controller.pause();await f.pump();assert.equal(f.controller.items().length,50);
 f.controller.activate();await f.pump();assert.equal(f.controller.items().length,275);
});
test('errors retain partial markers, stop retries, and explicit refresh restarts with the selected filters',async t=>{
 const f=fixture(t);f.controller.activate({inspector:other});await f.settle();f.setReply(()=>({error:{code:'FAIL'}}));await f.pump();assert.equal(f.controller.items().length,50);assert.match(f.controller.coverage(),/Could not load all matches.*50 loaded/);
 const calls=f.calls.length;f.controller.activate({inspector:other});await f.pump();assert.equal(f.calls.length,calls);
 f.setReply(()=>({data:{authorized:true,total:0,has_more:false,records:[]}}));f.controller.activate({inspector:other},true);await f.settle();await f.pump();assert.equal(f.controller.items().length,0);assert.equal(f.controller.snapshot().error,false);
});
test('Guest, offline and changed scope cannot expose retained Team map rows or start more requests',async t=>{
 const f=fixture(t);f.controller.activate();await f.settle();f.setOnline(false);assert.equal(f.controller.items().length,0);await f.pump();assert.match(f.controller.coverage(),/requires a connection/);
 f.setOnline(true);f.setContext({mode:'guest'});f.controller.activate();await f.pump();assert.equal(f.controller.items().length,0);
 f.setContext({mode:'approved',scopeGeneration:2});f.setReply(()=>({data:{authorized:true,total:0,has_more:false,records:[]}}));f.controller.activate();await f.settle();await f.pump();assert.equal(f.controller.items().length,0);
});
test('device import filters cannot overwrite the database-backed Team Map inspector roster',()=>{
 const fs=require('node:fs'),vm=require('node:vm');let replaced=0;
 const c={mapRecordScope:'team',accessibleEntries:()=>[],canViewTeamRecords:()=>true,document:{addEventListener(){},getElementById:id=>id==='map-entry-inspector'?{replaceChildren:()=>replaced++}:null}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('src/sharing-ui.js','utf8'),c);c.syncSharingFilters();assert.equal(replaced,0);
});
