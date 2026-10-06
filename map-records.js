/* Memory-only Map projection. Inputs are presentation items, never query responses. */
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(node?require('./my-records'):root.SPOTITMyRecords,
    node?require('./entry-filters'):root.SPOTITEntryFilters);
  if(node)module.exports=api;root.SPOTITMapRecords=api;
})(globalThis,function(my,filters){
  'use strict';
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function project(items,scope='my',filter={}){
    const rows=new Map();let skipped=0;
    for(const item of items||[]){
      if(!UUID.test(item.id||'')){skipped++;continue;}
      const e=item.primary==='cloud'||!item.local?my.cloudDisplay(item.cloud):item.local;
      if(!e||!Number.isFinite(e.lat)||Math.abs(e.lat)>90||!Number.isFinite(e.lon)||Math.abs(e.lon)>180){skipped++;continue;}
      const imported=!!item.local?.importBatchId;
      if(filter.source==='imported'&&!imported||filter.source==='mine'&&imported)continue;
      if(!filters.filterEntries([e],{...filter,source:'',inspector:item.local?filter.inspector:''}).length)continue;
      const id=item.id.toLowerCase(),key=imported?'import:'+item.local.importBatchId+':'+id:id;
      const localAction=scope==='my'&&!!item.local;
      const row=Object.freeze({id:key,uuid:id,scope,source:item.source,imported,
        lat:e.lat,lon:e.lon,timestamp:e.timestamp,type:e.type,expressway:e.expressway,bound:e.bound,
        lane:e.lane,km:e.km,inspectionStatus:my.status(item),
        photoStatus:item.local?.photoId?my.photoStatus(item.local):item.cloud?.photo_path?'Availability checked when opened':'No verified photo available',
        readOnly:!localAction,localAction,detailId:id,item});
      rows.set(key,row);
    }
    return {rows:[...rows.values()],skipped};
  }
  function deviceItems(entries){return (entries||[]).map(local=>({id:local.id,source:local.importBatchId?'imported':'local',primary:'local',local,cloud:null}));}
  function diff(previous,next){
    const added=[],removed=[],changed=[],unchanged=[];
    const current=new Map(next.map(row=>[row.id,row]));
    for(const [id,row] of current){const old=previous.get(id);if(!old)added.push(row);else if(signature(old)!==signature(row))changed.push(row);else unchanged.push(row);}
    for(const [id,row] of previous)if(!current.has(id))removed.push(row);
    return {current,added,removed,changed,unchanged};
  }
  function signature(row){return JSON.stringify([row.id,row.scope,row.source,row.imported,row.lat,row.lon,row.timestamp,row.type,row.expressway,row.bound,row.lane,row.km,row.inspectionStatus,row.photoStatus,row.localAction]);}
  function coalescer(run,schedule=fn=>setTimeout(fn,100)){
    let pending=false;
    return ()=>{if(pending)return;pending=true;schedule(()=>{pending=false;run();});};
  }
  function coverage(page,scope,available){
    if(!available)return scope==='team'?'Team history requires connection and online verification.':'Device records · Connect and verify for submitted history.';
    if(page.loading)return 'Loading submitted history…';
    if(page.error)return 'Could not refresh · Earlier loaded history retained.';
    if(!page.loaded)return 'Submitted history not loaded yet.';
    return `${page.rows.length} loaded submitted records · ${page.evicted?'Retained window; earlier pages omitted':page.hasMore?'More history available':'Loaded history reached end'} · Not a live snapshot`;
  }
  return {project,deviceItems,diff,signature,coalescer,coverage};
});
