/* Saved inspection geometry only: no third-party tile downloads or inspection storage. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SPOTITOfflineMap=api;})(globalThis,function(){
 'use strict';
 const CACHE='kmtrack-offline-map-v1';
 const FILES=['public/calibration.json','public/stationing-reconstruction-evidence-user-edits-20261020.json'];
 const MODEL_HASH='3ea1ed73ba99667c08c8605be06f12506d0e9cd4f138682209d5541a4876799f';
 function geometry(calibration,model){
  if(!Array.isArray(calibration)||model?.schema!=='KMTRACK_RECONSTRUCTION_EVIDENCE_V1'||!Array.isArray(model.interchanges))throw Error('Invalid inspection map data');
  const features=[],groups=new Map();
  for(const p of calibration)if(p.e==='NLEX'&&[p.lat,p.lon,p.k].every(Number.isFinite)){if(!groups.has(p.b))groups.set(p.b,[]);groups.get(p.b).push(p);}
  for(const [bound,rows]of groups){rows.sort((a,b)=>a.k-b.k);let line=[];
   const flush=()=>{if(line.length>1)features.push({type:'Feature',properties:{kind:'reference',name:'NLEX '+bound+' calibration reference'},geometry:{type:'LineString',coordinates:line.map(p=>[p.lon,p.lat])}});line=[];};
   for(const p of rows){const prev=line.at(-1);if(prev&&(p.k-prev.k>.11||Math.hypot((p.lon-prev.lon)*107000,(p.lat-prev.lat)*111195)>250))flush();line.push(p);}flush();
  }
  for(const ramp of model.interchanges)if(ramp.coordinates?.length>1)features.push({type:'Feature',properties:{kind:'interchange',name:ramp.name},geometry:{type:'LineString',coordinates:ramp.coordinates}});
  return {type:'FeatureCollection',features};
 }
 function create({caches,fetch,crypto,baseURL,now=()=>Date.now()}){
  const url=file=>new URL(file,baseURL).href,marker=url('__offline_map_manifest__');
  const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  async function read(){
   if(!caches||!(await caches.has(CACHE)))return null;
   const cache=await caches.open(CACHE),entry=await cache.match(marker);if(!entry)return null;
   const manifest=await entry.json(),data=[];
   if(manifest.version!==1||manifest.files?.length!==FILES.length)return null;
   for(let i=0;i<FILES.length;i++){const response=await cache.match(url(FILES[i]));if(!response)return null;const bytes=await response.arrayBuffer();if(await digest(bytes)!==manifest.files[i].sha256)return null;data.push(JSON.parse(new TextDecoder().decode(bytes)));}
   if(manifest.files[1].sha256!==MODEL_HASH)return null;
   return {manifest,geojson:geometry(...data)};
  }
  async function save(progress=()=>{}){
   if(!caches||!crypto?.subtle)throw Error('Offline map storage is unavailable in this browser.');
   const responses=[],files=[],data=[];
   for(let i=0;i<FILES.length;i++){
    progress(i,FILES.length);const response=await fetch(url(FILES[i]),{cache:'no-store'});if(!response.ok)throw Error('Map download failed. Retry when connected.');
    const bytes=await response.arrayBuffer();if(bytes.byteLength>10*1024*1024)throw Error('Unexpected map size');
    const sha256=await digest(bytes);if(i===1&&sha256!==MODEL_HASH)throw Error('Map version changed. Reload the app before downloading.');
    data.push(JSON.parse(new TextDecoder().decode(bytes)));files.push({path:FILES[i],bytes:bytes.byteLength,sha256});responses.push(new Response(bytes,{headers:{'Content-Type':'application/json'}}));
   }
   geometry(...data);const cache=await caches.open(CACHE);
   // A complete manifest is written last; incomplete downloads never show Ready.
   await cache.delete(marker);
   for(let i=0;i<FILES.length;i++)await cache.put(url(FILES[i]),responses[i]);
   const manifest={version:1,savedAt:now(),bytes:files.reduce((n,f)=>n+f.bytes,0),files};
   await cache.put(marker,new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}}));progress(FILES.length,FILES.length);
   return read();
  }
  return {read,save,remove:()=>caches?caches.delete(CACHE):Promise.resolve(false)};
 }
 return {create,geometry,CACHE};
});
