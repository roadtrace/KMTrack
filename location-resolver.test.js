const test=require('node:test'),assert=require('node:assert/strict');
const {createResolver,isInterchangeMode}=require('./location-resolver.js');
const calibration=require('./calibration.json');
const row=(expressway,distance,km=10,bound='NB')=>({expressway,distance,km,bound});
const interchange={site_id:'nlex_harbor_link_smart_connect',name:'Harbor Link (Smart Connect) Interchange'};

test('Smart Connect keeps mainline traffic on NLEX despite an overlapping Segment 8.1 candidate',()=>{
  const resolver=createResolver();
  for(let i=0;i<5;i++) resolver.resolve({lat:14.69+i*.0001,lon:121,accuracy:8,timestamp:i*1000,candidates:[row('NLEX',.008,10+i*.01),row('C3-SEG 8.1',.012,15)],interchange});
  for(let i=5;i<12;i++){
    const result=resolver.resolve({lat:14.69+i*.0001,lon:121,accuracy:8,timestamp:i*1000,candidates:[row('C3-SEG 8.1',.004,15+i*.01),row('NLEX',.018,10+i*.01)],interchange});
    assert.equal(result.confirmedCorridor,'NLEX');assert.equal(result.result.expressway,'NLEX');
  }
});

test('actual Smart Connect calibration traces remain on their respective stacked corridors',()=>{
  const inside=point=>point.lat>=14.6899&&point.lat<=14.6964&&point.lon>=120.9955&&point.lon<=121.0059;
  const roads={
    NLEX:calibration.filter(point=>point.e==='NLEX'&&point.b==='NB'&&inside(point)),
    'C3-SEG 8.1':calibration.filter(point=>point.e==='C3-SEG 8.1'&&point.b==='EB'&&inside(point))
  };
  const nearest=(position,points)=>Math.min(...points.map(point=>require('./location-resolver.js').distanceKm(position,point)));
  for(const corridor of Object.keys(roads)){
    const resolver=createResolver();let result,overlapSeen=false;
    for(const point of roads[corridor]){
      const other=corridor==='NLEX'?'C3-SEG 8.1':'NLEX';
      const otherDistance=nearest(point,roads[other]);overlapSeen||=otherDistance<.05;
      result=resolver.resolve({lat:point.lat,lon:point.lon,accuracy:8,timestamp:point.k*100000,
        candidates:[row(corridor,0,point.k,point.b),row(other,otherDistance,point.k)],interchange});
    }
    assert.ok(overlapSeen,`${corridor} trace must pass the stacked-road ambiguity`);
    assert.equal(result.confirmedCorridor,corridor);
  }
});

test('a locked interchange exits only after sustained travel away on an outgoing corridor',()=>{
  const resolver=createResolver();
  for(let i=0;i<3;i++) resolver.resolve({lat:14.69+i*.0001,lon:121,accuracy:8,timestamp:i*1000,candidates:[row('NLEX',.005,10+i*.01),row('C3-SEG 8.1',.09,15)],interchange});
  let result;
  for(let i=3;i<8;i++){
    result=resolver.resolve({lat:14.6903+(i-3)*.0002,lon:121,accuracy:8,timestamp:i*1000,candidates:[row('C3-SEG 8.1',.008,15+i*.02,'EB'),row('NLEX',.09,10.03)],interchange});
    assert.equal(result.confirmedCorridor,'NLEX');
    assert.equal(isInterchangeMode(result,8),true);
  }
  for(let i=8;i<20;i++) result=resolver.resolve({lat:14.6913+(i-8)*.0002,lon:121,accuracy:8,timestamp:i*1000,candidates:[row('C3-SEG 8.1',.008,15+i*.02,'EB'),row('NLEX',.09,10.03)]});
  assert.equal(result.confirmedCorridor,'C3-SEG 8.1');assert.equal(result.result.expressway,'C3-SEG 8.1');
  assert.equal(result.interchangeLocked,false);
  assert.equal(result.interchange,null);
});

test('crossing corridor, short GPS gaps, and a return to another ramp keep any interchange locked',()=>{
  const site={site_id:'generic_exit',name:'Generic Exit'};
  const resolver=createResolver();let result;
  for(let i=0;i<3;i++) result=resolver.resolve({lat:15+i*.0001,lon:120.7,accuracy:8,timestamp:i*1000,candidates:[row('NLEX',.005,80),row('OTHER',.09,20)],interchange:site});
  result=resolver.resolve({lat:15.0003,lon:120.7,accuracy:8,timestamp:3000,candidates:[row('OTHER',.005,20),row('NLEX',.09,80)],interchange:site});
  assert.equal(result.interchangeLocked,true);
  for(let i=4;i<9;i++) result=resolver.resolve({lat:15.0003+(i-3)*.0001,lon:120.7,accuracy:80,timestamp:i*1000,candidates:[row('OTHER',.005,20),row('NLEX',.09,80)]});
  assert.equal(result.interchange.name,site.name);
  result=resolver.resolve({lat:15.001,lon:120.7,accuracy:8,timestamp:9000,candidates:[row('OTHER',.005,20),row('NLEX',.09,80)],interchange:site});
  assert.equal(result.interchangeLocked,true);
  assert.equal(result.confirmedCorridor,'NLEX');
  assert.equal(isInterchangeMode(result,8),true);
});

test('a closer crossing road cannot switch the confirmed corridor without a connection',()=>{
  const resolver=createResolver();
  for(let i=0;i<3;i++) resolver.resolve({lat:15+i*.0001,lon:120.7,accuracy:8,timestamp:i*1000,candidates:[row('NLEX',.005,80),row('C3-SEG 8.1',.09,19)]});
  let result;
  for(let i=3;i<12;i++) result=resolver.resolve({lat:15+i*.0001,lon:120.7,accuracy:8,timestamp:i*1000,candidates:[row('C3-SEG 8.1',.004,19),row('NLEX',.09,80)]});
  assert.equal(result.confirmedCorridor,'NLEX');
  assert.equal(result.result.expressway,'NLEX');
});

test('stationary GPS drift near an interchange cannot provide switch movement evidence',()=>{
  const resolver=createResolver();
  for(let i=0;i<3;i++) resolver.resolve({lat:15,lon:120.7,accuracy:8,timestamp:i*1000,candidates:[row('NLEX',.005,80),row('C3-SEG 8.1',.09,19)],interchange});
  let result;
  for(let i=3;i<12;i++) result=resolver.resolve({lat:15,lon:120.7,accuracy:8,timestamp:i*1000,candidates:[row('C3-SEG 8.1',.004,19),row('NLEX',.09,80)],interchange});
  assert.equal(result.confirmedCorridor,'NLEX');
});

test('startup ambiguity requires consistent readings before saving is allowed',()=>{
  const resolver=createResolver();let result;
  for(let i=0;i<4;i++){
    result=resolver.resolve({lat:14.69,lon:121,accuracy:10,timestamp:i*1000,candidates:[row('NLEX',.01),row('C3-SEG 8.1',.012)],interchange});
    assert.equal(result.confirmed,false);assert.equal(result.saveAllowed,false);
  }
  result=resolver.resolve({lat:14.69,lon:121,accuracy:10,timestamp:4000,candidates:[row('NLEX',.01),row('C3-SEG 8.1',.012)],interchange});
  assert.equal(result.confirmedCorridor,'NLEX');assert.equal(result.saveAllowed,true);
});

test('GPS loss retains the confirmed road but prevents stale saves and recovers cleanly',()=>{
  const resolver=createResolver();let result;
  for(let i=0;i<3;i++) result=resolver.resolve({lat:15+i*.0001,lon:120.7,accuracy:8,timestamp:i*1000,candidates:[row('NLEX',.006,80+i*.01)]});
  const stale=resolver.markStale('GPS signal lost');
  assert.equal(stale.result.expressway,'NLEX');assert.equal(stale.fresh,false);assert.equal(stale.saveAllowed,false);
  result=resolver.resolve({lat:15.0004,lon:120.7,accuracy:8,timestamp:4000,candidates:[row('NLEX',.007,80.04)]});
  assert.equal(result.confirmedCorridor,'NLEX');assert.equal(result.fresh,true);assert.equal(result.saveAllowed,true);
});

test('confirmed interchange name survives short geometry gaps and clears only after leaving',()=>{
  const resolver=createResolver({interchangeHoldMs:5000,interchangeExitKm:.1});let result;
  for(let i=0;i<3;i++) result=resolver.resolve({lat:15+i*.0001,lon:120.7,accuracy:8,timestamp:i*1000,candidates:[row('NLEX',.006,80)],interchange});
  assert.equal(result.interchange.name,interchange.name);
  result=resolver.resolve({lat:15.0004,lon:120.7,accuracy:8,timestamp:4000,candidates:[row('NLEX',.006,80)]});
  assert.equal(result.interchange.name,interchange.name);
  result=resolver.resolve({lat:15.003,lon:120.7,accuracy:8,timestamp:10000,candidates:[row('NLEX',.006,80.3)]});
  assert.equal(result.interchange,null);
});

test('through roads keep KM inside an interchange while departed ramps use interchange mode',()=>{
  const base={confirmed:true,interchange:{name:'Dau Interchange',segment:'NB Entry Ramp'},result:{expressway:'NLEX',km:80,distance:.01}};
  assert.equal(isInterchangeMode(base,8),false);
  assert.equal(isInterchangeMode({...base,result:{...base.result,distance:.09}},8),true);
  assert.equal(isInterchangeMode({...base,interchange:null,result:{...base.result,distance:.09}},8),false);
});

test('explicit ramp labels are retained with the confirmed interchange',()=>{
  const resolver=createResolver();let result;
  const labeled={site_id:'nlex_dau',name:'Dau Interchange',ramp:'NB Entry Ramp',seg_id:'nlex_dau_045'};
  for(let i=0;i<3;i++) result=resolver.resolve({lat:15+i*.0001,lon:120.7,accuracy:8,timestamp:i*1000,candidates:[row('NLEX',.09,80)],interchange:labeled});
  assert.deepEqual(result.interchange,{siteId:'nlex_dau',name:'Dau Interchange',segment:'NB Entry Ramp',segmentId:'nlex_dau_045'});
});
