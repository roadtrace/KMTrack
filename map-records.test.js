const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const map=require('./map-records'),overlays=require('./map-overlays'),presentation=require('./record-presentation'),team=require('./team-records'),cloud=require('./cloud-records');
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id=n=>'bbbbbbbb-bbbb-4bbb-8bbb-'+String(n).padStart(12,'0');
const context={mode:'approved',canUseLocal:true,cloudVerified:true,userId:user,workspaceUserId:user,profile:{id:user,team:'roadway',approved:true,role:'inspector'},sessionGeneration:1,scopeGeneration:1};
const local=n=>({id:id(n),type:'Potholes',timestamp:'2026-10-05 10:00:00',lat:14.600000000001,lon:120.99999999999,km:12.5,bound:'NB',lane:2,expressway:'NLEX',sync_status:'pending'});
const row=n=>({id:id(n),user_id:user,team:'roadway',defect_type:'Potholes',inspected_at:'2026-10-05T02:00:00Z',latitude:14.61,longitude:121.01,km_station:12550,direction:'SB',lane_number:2,expressway:'NLEX'});
const scope=cloud.scopeOf(context,'account',true),page=view=>({view,scope,rows:[row(1),row(2)]});
test('My Map projects the UUID presentation merge with local pending retained and cloud duplicate once',()=>{
 const locals=[local(1)],before=JSON.stringify(locals),items=presentation.projectMy({localEntries:locals,page:page('my'),context,workspaceKey:'account',online:true}).records;
 const result=map.project(items);assert.equal(result.rows.length,2);assert.equal(result.rows[0].lat,locals[0].lat);assert.equal(result.rows[0].localAction,true);assert.equal(result.rows[1].localAction,false);assert.equal(JSON.stringify(locals),before);
});
test('Team Map consumes guarded Team presentation, UUID dedup and no local actions even own row',()=>{
 const p=page('team');p.rows.push(row(1));const result=map.project(team.project({localEntries:[local(1)],page:p,context,workspaceKey:'account',online:true}).records,'team');
 assert.equal(result.rows.length,2);assert.ok(result.rows.every(r=>r.readOnly&&!r.localAction));assert.equal(result.rows[0].lat,14.61);
});
test('imported UUID remains separate from own inspection UUID with archive provenance',()=>{
 const own=local(1),archive={...own,importBatchId:'archive'};const result=map.project(map.deviceItems([own,archive]));assert.equal(result.rows.length,2);assert.notEqual(result.rows[0].id,result.rows[1].id);assert.equal(result.rows[1].imported,true);
 assert.equal(map.project(map.deviceItems([own,archive]),'my',{source:'mine'}).rows.length,1);assert.equal(map.project(map.deviceItems([own,archive]),'my',{source:'imported'}).rows.length,1);
});
for(const values of [[null,121],['14.6',121],[NaN,121],[91,121],[14.6,-181],[14.6,Infinity]])test('invalid coordinates skipped '+String(values),()=>{
 const e={...local(1),lat:values[0],lon:values[1]};const result=map.project(map.deviceItems([e]));assert.equal(result.rows.length,0);assert.equal(result.skipped,1);
});
test('numeric coordinates remain exact; submitted metres become display kilometres',()=>{
 const projected=map.project([{id:id(1),cloud:row(1),local:null,primary:'cloud',source:'cloud'}]).rows[0];assert.equal(projected.km,12.55);assert.equal(projected.lat,row(1).latitude);
 const e=local(2);assert.equal(map.project(map.deviceItems([e])).rows[0].lon,e.lon);
});
test('bound color convention preserved exactly',()=>assert.deepEqual(overlays.BOUNDS,{NB:'#00b9f2',SB:'#ef4444',EB:'#f4b400',WB:'#b18cff',Other:'#a7b0b8'}));
for(const change of [{mode:'guest'},{mode:'pending'},{cloudVerified:false},{canUseLocal:false},{userId:id(9)},{sessionGeneration:2},{scopeGeneration:2},{profile:{...context.profile,team:'other'}},{profile:{...context.profile,approved:false}}])test('Team Map rejects stale/unauthorized projection '+JSON.stringify(change),()=>{
 const records=team.project({localEntries:[local(1)],page:page('team'),context:{...context,...change},workspaceKey:'account',online:true}).records;assert.equal(map.project(records,'team').rows.length,0);
});
test('offline Team empty while My local rows remain',()=>{
 const o={localEntries:[local(1)],context,workspaceKey:'account',online:false};assert.equal(map.project(team.project({...o,page:page('team')}).records,'team').rows.length,0);
 assert.equal(map.project(presentation.projectMy({...o,page:page('my')}).records).rows.length,1);
});
test('clusters contain exact members and neutral anchors; high zoom individual and selected marker exposed',()=>{
 const rows=map.project(map.deviceItems([local(1),local(2)])).rows;rows[1]={...rows[1],bound:'SB'};
 const m={getZoom:()=>10,project:()=>({x:20,y:20})};let result=overlays.clusterGroups(m,rows,null);assert.equal(result.groups.length,1);assert.equal(result.groups[0].members.length,2);assert.equal(result.groups[0].bound,undefined);assert.equal(result.groups[0].members[0].lat,rows[0].lat);
 m.getZoom=()=>15;assert.equal(overlays.clusterGroups(m,rows,null).individual.length,2);
 m.getZoom=()=>10;result=overlays.clusterGroups(m,rows,rows[0].id);assert.equal(result.individual.length,2);
});
test('diff tracks unchanged reorder, one add, one removal and one changed identity',()=>{
 const rows=map.project(map.deviceItems([local(1),local(2)])).rows,previous=new Map(rows.map(r=>[r.id,r]));let d=map.diff(previous,rows.slice().reverse());assert.equal(d.unchanged.length,2);assert.equal(d.changed.length,0);
 d=map.diff(previous,[rows[0],...map.project(map.deviceItems([local(3)])).rows]);assert.equal(d.added.length,1);assert.equal(d.removed.length,1);assert.equal(d.unchanged.length,1);
 d=map.diff(previous,[{...rows[0],lat:14.7},rows[1]]);assert.equal(d.changed.length,1);
});
test('100 notifications coalesce to one render with a fresh next burst',()=>{
 let calls=0;const scheduled=[],notify=map.coalescer(()=>calls++,fn=>scheduled.push(fn));for(let i=0;i<100;i++)notify();assert.equal(scheduled.length,1);scheduled.shift()();assert.equal(calls,1);notify();scheduled.shift()();assert.equal(calls,2);
});
test('bounded coverage distinguishes loaded partial history, eviction, errors and offline requirement',()=>{
 assert.match(map.coverage({loaded:true,rows:Array(50),hasMore:true},'team',true),/50 loaded.*More history/);
 assert.match(map.coverage({loaded:true,rows:Array(250),evicted:true},'team',true),/Retained window/);
 assert.match(map.coverage({error:'failure'},'team',true),/Earlier loaded/);assert.match(map.coverage({},'team',false),/requires connection/);
});
const html=fs.readFileSync('index.html','utf8');
const fn=name=>{const start=html.indexOf('    function '+name+'(');assert.ok(start>=0);return html.slice(start,html.indexOf('\n    }',start)+6);};
test('UUID selection survives reorder and distinguishes local from read-only Team detail',()=>{
 const locals=[local(1),local(2)],opened=[],details=[];const c={entries:locals,mapProjection:map.project(map.deviceItems(locals)).rows,mapRecordScope:'my',SPOTITMap:{selectEntry(){}},updateMapEntries(){},osmMap:{latLngToContainerPoint:()=>({y:10}),getSize:()=>({y:800})},openEditModal:i=>opened.push(i),openSubmittedDetail:(...a)=>details.push(a)};
 vm.createContext(c);vm.runInContext(fn('openMapEntry'),c);c.entries.reverse();c.openMapEntry(id(1),true);assert.deepEqual(opened,[1]);c.mapProjection=[{...c.mapProjection[0],localAction:false}];c.mapRecordScope='team';c.openMapEntry(id(1),true);assert.deepEqual(details,[[id(1),'team']]);c.openMapEntry(id(8));assert.equal(details.length,1);
});
test('Map scope stays independent of Log, clears selection, and activates bounded Team controller',()=>{
 let closed=0,activated=0,selected;const c={mapRecordScope:'my',logRecordScope:'my',cloudRecordStore:{syncScope:()=>scope},cloudPhotoViewer:{close:()=>closed++},teamPhotoViewer:{close:()=>closed++},submittedDialog:{close:()=>closed++},SPOTITMap:{selectEntry:id=>selected=id},teamRecords:{activate:()=>activated++},document:{getElementById:()=>({value:'filter'})},updateMapEntries(){}};
 vm.createContext(c);vm.runInContext(fn('switchMapScope'),c);c.switchMapScope('team');assert.equal(c.mapRecordScope,'team');assert.equal(c.logRecordScope,'my');assert.equal(selected,null);assert.equal(closed,3);assert.equal(activated,1);
});
test('Map has no transport/persistence/export or eager photo download and landmarks stay separate',()=>{
 assert.doesNotMatch(fs.readFileSync('map-records.js','utf8'),/localStorage|\.from\(|\.insert\(|\.upload\(/);
 assert.doesNotMatch(fn('updateMapEntries'),/download|\.storage|export|renderLandmarks/);assert.match(fn('updateMapLandmarks'),/osmLandmarkLayer/);
 assert.match(html,/PHOTO_CLOUD_TRANSPORT_ENABLED = false/);assert.match(fs.readFileSync('sw.js','utf8'),/'v243'/);
});
function rendererFixture(zoom=15){
 const elements=[],node=(tag)=>{const n={tag,children:[],style:{setProperty(){}},dataset:{},classList:{toggle(){},add(){}},setAttribute(){},append(...items){this.children.push(...items);}};elements.push(n);return n;};
 global.document={createElement:node,querySelector:()=>null};let builds=0;
 const group=(layers=[])=>({layers,addTo(parent){parent.layers.push(this);return this;},removeLayer(layer){this.layers=this.layers.filter(v=>v!==layer);},clearLayers(){this.layers=[];}});
 global.L={canvas:()=>({}),layerGroup:group,DomEvent:{disableClickPropagation(){},disableScrollPropagation(){}},divIcon:o=>o,
   marker:(point,o)=>{builds++;return {point,options:o,addTo(parent){parent.layers.push(this);return this;}};},
   circleMarker:(point,o)=>{builds++;return {point,options:o,on(name,cb){this[name]=cb;return this;},setRadius(r){this.options.radius=r;}};}};
 const m={getZoom:()=>zoom,getCenter:()=>({lat:14.6,lng:121}),getSize:()=>({x:800,y:800}),getContainer:()=>({getBoundingClientRect:()=>({left:0,top:0})}),
   project:p=>({x:p[1]*10,y:p[0]*10}),latLngToContainerPoint:p=>({x:400+(p[1]-121)*1000,y:400+(p[0]-14.6)*1000}),fitBounds(points){this.expanded=points;},setView(center,z){zoom=z;},mouseEventToContainerPoint:()=>({x:400,y:400})};
 return {m,layer:group(),elements,builds:()=>builds,setZoom:z=>zoom=z};
}
test('actual renderer reuses unchanged canvas dots and changes only incremental added/removed markers',()=>{
 const f=rendererFixture(),rows=map.project(map.deviceItems([local(1),local(2)])).rows;overlays.selectEntry(null);
 let stats=overlays.renderEntries(f.m,f.layer,rows,()=>{},String);assert.equal(stats.added,2);const first=f.layer.layers[0],builds=f.builds();
 stats=overlays.renderEntries(f.m,f.layer,rows,()=>{},String);assert.equal(stats.cached,true);assert.equal(f.builds(),builds);assert.equal(f.layer.layers[0],first);
 const extra={...rows[0],id:id(3),lat:14.61};stats=overlays.renderEntries(f.m,f.layer,rows.concat(extra),()=>{},String);assert.equal(stats.added,1);assert.equal(stats.changed,0);assert.equal(stats.unchanged,2);
 stats=overlays.renderEntries(f.m,f.layer,rows,()=>{},String);assert.equal(stats.removed,1);assert.equal(stats.changed,0);assert.equal(stats.unchanged,2);
 assert.equal(first.spotitCircle.point[0],rows[0].lat);assert.equal(first.spotitCircle.options.fillColor,overlays.BOUNDS.NB);
});
test('low zoom actual clusters count only inspections, suppress KM labels and expand exact members',()=>{
 const f=rendererFixture(10),rows=map.project(map.deviceItems([local(1),local(2)])).rows;overlays.selectEntry(null);overlays.renderEntries(f.m,f.layer,rows,()=>{},String);
 const cluster=f.elements.find(e=>e.className==='map-entry-cluster');assert.equal(cluster.textContent,'2');assert.equal(f.elements.filter(e=>e.className==='map-km-label').length,0);cluster.onclick();assert.deepEqual(f.m.expanded,rows.map(r=>[r.lat,r.lon]));assert.equal(f.m.getZoom(),15);
 overlays.renderEntries(f.m,f.layer,rows,()=>{},String);assert.equal(f.layer.layers.filter(m=>m.spotitCircle).length,2);
});
test('high zoom declutters labels and renders imported circle with separate style',()=>{
 const f=rendererFixture(),e={...local(1),importBatchId:'archive'},rows=map.project(map.deviceItems([e,local(2),local(3),local(4),local(5)])).rows;overlays.selectEntry(null);overlays.renderEntries(f.m,f.layer,rows,()=>{},String);
 const circle=f.layer.layers[0].spotitCircle;assert.equal(circle.options.dashArray,'3 2');assert.equal(circle.options.fillOpacity,.65);
 const labels=f.elements.filter(e=>e.className==='map-km-label');assert.ok(labels.length>0&&labels.length<rows.length);
});
test('exact co-location opens UUID chooser instead of hiding individual identities',()=>{
 const rows=map.project(map.deviceItems([local(1),local(2)])).rows;let choices;
 const c={mapProjection:rows,openMapChoices:r=>choices=r};vm.createContext(c);vm.runInContext(fn('openMapEntry'),c);c.openMapEntry(id(1));assert.equal(choices.length,2);assert.deepEqual(Array.from(choices,r=>r.uuid),[id(1),id(2)]);
});
test('private viewer current-item guard uses independent Map detail scope rather than Log scope',()=>{
 const mapItem={id:id(1),cloud:row(1),local:null},logItem={id:id(1),cloud:row(2),local:null};
 const c={submittedMapScope:'team',freshMapItems:scope=>{assert.equal(scope,'team');return [mapItem];},currentMyItem:()=>logItem};
 vm.createContext(c);vm.runInContext(fn('currentPhotoItem'),c);assert.equal(c.currentPhotoItem(id(1)),mapItem);c.submittedMapScope=null;assert.equal(c.currentPhotoItem(id(1)),logItem);
});
