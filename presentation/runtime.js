/* Presentation-only UI. Runs against the real Guest app and its isolated stores. */
(function () {
  'use strict';
  const demo=window.SPOTITPresentation;
  if(!demo)throw Error('Presentation isolation did not initialize');
  if(demo.productionHosts.includes(location.hostname)) {
    document.body.replaceChildren(Object.assign(document.createElement('p'),{textContent:'Publish the presentation build on its own hostname. The live SPOT IT address cannot run this build.'}));return;
  }
  document.documentElement.classList.add('demo-build');
  ensureMapTilerSdk=()=>Promise.reject(new Error('Presentation uses the existing raster fallback; no production MapTiler key'));
  const originalLogDefect=logDefect;
  inspectorName='DEMO - Guest inspector';
  logDefect=function(type,lane){
    const before=entries.length,result=originalLogDefect(type,lane);
    if(entries.length>before){const e=entries.at(-1);e.demo=true;e.inspector='DEMO - Guest inspector';e.notes='DEMONSTRATION ONLY - simulated position and sample evidence';return saveEntries()&&result;}
    return result;
  };
  const originalPrepareExport=prepareSharingExport;
  prepareSharingExport=async function(){const rows=await originalPrepareExport();return rows?.map(row=>({...row,demo:true,inspector:String(row.inspector||'Guest inspector').startsWith('DEMO - ')?row.inspector:'DEMO - '+(row.inspector||'Guest inspector'),notes:'DEMONSTRATION ONLY - simulated position and sample evidence'}));};
  const state={routes:[],route:null,index:0,playing:false,speed:1,step:0,timer:null,gps:true,overlay:null};
  const banner=document.createElement('div');banner.className='demo-banner';banner.innerHTML='<span>Presentation &middot; Simulated location</span><button type="button">Controls</button>';
  document.querySelector('.top-shell').append(banner);
  const measureDemoHeader=()=>document.documentElement.style.setProperty('--app-header-h',document.querySelector('.top-shell').offsetHeight+'px');
  syncHeaderHeight=measureDemoHeader;
  window.addEventListener('resize',measureDemoHeader);
  new ResizeObserver(measureDemoHeader).observe(document.querySelector('.top-shell'));
  measureDemoHeader();
  const panel=document.createElement('dialog');panel.className='demo-dialog';panel.id='presentation-controls';
  panel.innerHTML='<button type="button" class="demo-close" aria-label="Close presentation controls">Close</button><h2>Presentation</h2><p>Guest demo. No real GPS, camera, sign-in or cloud submissions.</p><div class="demo-guide"><strong id="demo-step-title"></strong><p id="demo-step-copy"></p></div><div class="demo-actions"><button id="demo-prev">Previous</button><button id="demo-next" class="demo-primary">Next step</button></div><label>Explore a scenario<select id="demo-route" disabled></select></label><div class="demo-actions"><button id="demo-play" disabled>Pause journey</button><select id="demo-speed" aria-label="Journey speed"><option value="1">1x speed</option><option value="2">2x speed</option><option value="4">4x speed</option></select></div><p id="demo-position-status" role="status">Loading saved network geometry...</p><div class="demo-actions"><button id="demo-photo" disabled>Capture sample photo</button><button id="demo-map">Open map</button><button id="demo-log">Open Log</button></div><button id="demo-gps-loss">Simulate GPS loss</button><p>Automatic matching is on by default. Enable Manual Mainline/Interchange in Location details when you want to choose the mode yourself.</p><details><summary>Share this Guest demo</summary><p id="demo-share-note"></p><canvas id="demo-qr" class="demo-qr" aria-label="QR code for this presentation link"></canvas><p id="demo-share-url" class="demo-share-url"></p><button id="demo-copy">Copy demo link</button></details><hr><button id="demo-reset">Reset demo records and restart</button><p id="demo-error" role="status"></p>';
  document.body.append(panel);
  const launch=document.getElementById('presentation-launch'),launchStatus=document.getElementById('presentation-launch-status');
  if(launch){launch.hidden=false;launch.href='#presentation-controls';launch.removeAttribute('target');launch.textContent='Open presentation controls';launch.onclick=event=>{event.preventDefault();panel.showModal();};}
  if(launchStatus)launchStatus.textContent='You are in the isolated Guest demonstration. Controls change only simulated positions and demo records.';
  const el=id=>panel.querySelector('#'+id);
  const say=message=>el('demo-error').textContent=message;
  banner.querySelector('button').onclick=()=>panel.showModal();panel.querySelector('.demo-close').onclick=()=>panel.close();
  const steps=[
    ['Capture on the mainline','Watch KM and bound update on a prepared NLEX route. Tap a lane to save a Guest inspection.','seg1','inspection'],
    ['Cross into Seg 2','The same capture grid changes to three lanes after the boundary buffer.','seg2','inspection'],
    ['Cross into Seg 3','Lane choices update to two lanes while the focused grid keeps its footprint.','seg3','inspection'],
    ['Inspect an interchange','The saved QGIS line supplies interchange context. Entry, Exit, Acce and Dece remain selectable.','interchange','inspection'],
    ['Add sample evidence','Use Capture sample photo or a category camera button. Every image is visibly marked as a simulated sample.',null,'inspection'],
    ['Review and edit','Open a local record, then tap Edit. Its photo and location are stored only in this demo workspace.',null,'log'],
    ['Explore the map','Use filters, locate and record markers. Street tiles need internet; the prepared route is drawn locally.',null,'map'],
    ['Explain Team and sync','The Sample team section illustrates read-only history and a simulated submission. Real Guest permissions stay unchanged.',null,'team'],
    ['Export demonstration records','Use the normal Log export controls. Filenames start DEMO_ and records identify the Demo inspector.',null,'log']
  ];
  function guide(index){state.step=Math.max(0,Math.min(steps.length-1,index));const [title,copy,route,view]=steps[state.step];el('demo-step-title').textContent=(state.step+1)+' / '+steps.length+' - '+title;el('demo-step-copy').textContent=copy;el('demo-prev').disabled=!state.step;el('demo-next').disabled=state.step===steps.length-1;if(route&&state.routes.length)selectRoute(route);showAppView(view);}
  el('demo-prev').onclick=()=>guide(state.step-1);el('demo-next').onclick=()=>guide(state.step+1);
  function resetJourneyLocation(){
    locationResolver.reset();
    Object.assign(gpsFilter,new GeoKalmanFilter());
    clearTimeout(gpsFreshnessTimer);
    currentPos=null;
    currentResolvedLocation=captureLocation.invalidate('Locating simulated road');
    userBound=null;boundManuallySelected=false;resetBoundTrend();
    manualLocation.setMode(manualLocation.mode());
    stationingReview?.invalidate();
    setGpsCaptureReady(false);
  }
  function selectRoute(id){const route=state.routes.find(r=>r.id===id);if(!route)return;state.route=route;state.index=0;state.gps=true;state.playing=true;el('demo-route').value=id;resetJourneyLocation();el('demo-play').textContent='Pause journey';el('demo-gps-loss').textContent='Simulate GPS loss';tick(false);drawRoute();}
  function drawRoute(){if(!osmMap||!state.route)return;state.overlay?.remove();state.overlay=L.polyline(state.route.points.map(p=>[p.lat,p.lon]),{color:'#48aeb1',weight:4,dashArray:'6 5',interactive:false}).addTo(osmMap);}
  function tick(advance=true){if(!state.route||!state.gps)return;if(advance&&state.playing)state.index=Math.min(state.route.points.length-1,state.index+state.speed);if(state.index===state.route.points.length-1){state.playing=false;el('demo-play').textContent='Restart journey';}demo.emit(state.route.points[state.index],state.playing?10*state.speed:0);el('demo-position-status').textContent=state.route.label+' - '+(state.playing?'moving':'paused')+' - '+(state.index+1)+' / '+state.route.points.length+' simulated fixes';if(osmMap&&!state.overlay)drawRoute();}
  el('demo-route').onchange=event=>selectRoute(event.target.value);
  el('demo-play').onclick=()=>{if(state.index===state.route.points.length-1){state.index=0;resetJourneyLocation();}state.playing=!state.playing;el('demo-play').textContent=state.playing?'Pause journey':'Resume journey';tick(false);};
  el('demo-speed').onchange=event=>state.speed=Number(event.target.value);
  el('demo-gps-loss').onclick=()=>{state.gps=!state.gps;if(state.gps)tick(false);else{demo.unavailable();el('demo-position-status').textContent='Simulated GPS unavailable. Capture stays subject to the normal freshness checks.';}el('demo-gps-loss').textContent=state.gps?'Simulate GPS loss':'Restore simulated GPS';};
  el('demo-map').onclick=()=>{panel.close();showAppView('map');drawRoute();};el('demo-log').onclick=()=>{panel.close();showAppView('log');};
  function sampleScene(){const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=680;const c=canvas.getContext('2d');c.fillStyle='#769471';c.fillRect(0,0,1000,680);c.fillStyle='#4b5158';c.beginPath();c.moveTo(120,680);c.lineTo(450,90);c.lineTo(550,90);c.lineTo(880,680);c.fill();c.strokeStyle='#eee9d0';c.lineWidth=9;c.setLineDash([38,24]);c.beginPath();c.moveTo(500,150);c.lineTo(500,680);c.stroke();c.setLineDash([]);c.fillStyle='#24292f';c.beginPath();c.ellipse(390,470,70,28,-.2,0,Math.PI*2);c.fill();c.fillStyle='#101b27';c.fillRect(0,0,1000,85);c.fillStyle='#ffbf00';c.font='bold 28px sans-serif';c.fillText('SPOT IT - SIMULATED SAMPLE PHOTO',25,37);c.fillStyle='white';c.font='22px sans-serif';c.fillText('DEMONSTRATION ONLY - NOT FIELD EVIDENCE',25,66);return canvas;}
  const toBlob=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not create sample image')),'image/jpeg',.88));
  async function photoDialog(type='Potholes',target=null){
    if(!target&&!resolvedLocationCanSave()){say('Wait for the prepared route to produce a fresh location, or select a scenario.');if(!panel.open)panel.showModal();return;}
    if(panel.open)panel.close();const canvas=sampleScene(),raw=await toBlob(canvas),url=URL.createObjectURL(raw),dialog=document.createElement('dialog');dialog.className='demo-dialog';
    dialog.innerHTML='<h2>Sample photo capture</h2><p>Simulated illustration. No device camera is opened.</p><img alt="Clearly labelled simulated road-defect illustration"><label>Lane / position<select></select></label><div class="demo-actions"><button type="button">Cancel</button><button type="button" class="demo-primary">Save sample photo</button></div><p role="status"></p>';
    dialog.querySelector('img').src=url;const select=dialog.querySelector('select');const choices=target?[target.lane||'Others']:SPOTITCaptureLanes.choices(document.getElementById('defect-section').dataset.laneLayout);for(const choice of choices)select.add(new Option(choice,choice));let entry=target;
    dialog.querySelector('button').onclick=()=>dialog.close();const save=dialog.querySelector('.demo-primary');save.onclick=async()=>{save.disabled=true;try{
      if(!entry){const before=entries.length;if(!logDefect(type,select.value)||entries.length===before)throw Error('The normal location/save checks did not accept this inspection.');entry=entries.at(-1);}
      if(!entries.includes(entry))throw Error('This demo record is no longer available.');
      const id='demo-photo-'+crypto.randomUUID();await putPhoto(id+':raw',raw);const stamped=sampleScene();await drawStampBand(stamped.getContext('2d'),stamped.width,stamped.height,entry,formatPhotoDate(new Date()));await putPhoto(id,await toBlob(stamped));
      entry.photoId=id;entry.photoFilename='DEMO_sample_'+entry.id+'.jpg';entry.photoTimestamp=formatPhotoDate(new Date());entry.demo=true;entry.inspector='DEMO - Guest inspector';if(!saveEntries())throw Error('Device storage could not persist this demo record.');renderLog();dialog.close();
    }catch(error){dialog.querySelector('[role="status"]').textContent=error.message;}finally{save.disabled=false;}};
    dialog.addEventListener('close',()=>{URL.revokeObjectURL(url);dialog.remove();});document.body.append(dialog);dialog.showModal();
  }
  openCameraForNewEntry=type=>photoDialog(type);
  openCameraForEntryPhoto=index=>{const entry=entries[index];if(entry)return photoDialog(entry.type,entry);};
  el('demo-photo').onclick=()=>photoDialog(document.getElementById('defect-focus-select').value||'Potholes');
  const share=new URL('./',location.href).href;el('demo-share-url').textContent=share;
  el('demo-share-note').textContent=['localhost','127.0.0.1'].includes(location.hostname)?'Local preview only. Publish this separate build before sharing it with the audience.':'Audience members open their own isolated Guest demonstration.';
  try{const qr=qrcodegen.QrCode.encodeText(share,qrcodegen.QrCode.Ecc.MEDIUM),canvas=el('demo-qr'),scale=6,border=4;canvas.width=canvas.height=(qr.size+border*2)*scale;const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='black';for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)if(qr.getModule(x,y))c.fillRect((x+border)*scale,(y+border)*scale,scale,scale);}catch(error){el('demo-qr').hidden=true;say('QR unavailable; copy the displayed link instead.');}
  el('demo-copy').onclick=async()=>{try{await navigator.clipboard.writeText(share);say('Demo link copied.');}catch(_){say('Copy the displayed link manually.');}};
  el('demo-reset').onclick=async()=>{if(!confirm('Reset only this presentation workspace, including its sample records and photos?'))return;try{state.playing=false;clearInterval(state.timer);const db=await openPhotoDB();await new Promise((resolve,reject)=>{const tx=db.transaction(PHOTO_STORE_NAME,'readwrite');tx.objectStore(PHOTO_STORE_NAME).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});localStorage.clear();sessionStorage.clear();location.reload();}catch(error){say('Reset did not complete: '+error.message);}};
  function sampleTeam(){const section=document.createElement('section');section.className='demo-sample-team';section.innerHTML='<h3>Sample team - demonstration only</h3><p>These invented records illustrate an approved-account workflow. Your actual session remains Guest; no team access is granted.</p><div class="demo-team-rows"></div><button type="button" class="demo-sync-preview">Simulate submission</button><p role="status">Simulation idle. Guest records remain local.</p>';
    const samples=[['Potholes','Demo Inspector A','Seg 1 / NB / Lane 2'],['Shoving','Demo Inspector B','Seg 2 / SB / Lane 1'],['Cracks','Demo Inspector C','Smart Connect / Exit Ramp']];
    for(const row of samples){const button=document.createElement('button');button.textContent=row.join(' - ');button.onclick=()=>{const d=document.createElement('dialog');d.className='demo-dialog';const title=document.createElement('h2');title.textContent=row[0];const text=document.createElement('p');text.textContent='Read only - fictional sample record. '+row.slice(1).join(' / ');const close=document.createElement('button');close.textContent='Close';close.onclick=()=>d.close();d.append(title,text,close);d.onclose=()=>d.remove();document.body.append(d);d.showModal();};section.querySelector('.demo-team-rows').append(button);}
    section.querySelector('.demo-sync-preview').onclick=async event=>{const button=event.currentTarget,status=section.querySelector('[role="status"]');button.disabled=true;status.textContent='Simulated verification...';await new Promise(r=>setTimeout(r,650));status.textContent='Simulated upload...';await new Promise(r=>setTimeout(r,650));status.textContent='Simulation complete. No records or photos were sent; Guest records are still local.';button.disabled=false;};
    document.getElementById('team-view').append(section);
  }
  async function initialize(){try{
    const [calibration,model]=await Promise.all([fetch('./public/calibration.json').then(r=>r.json()),fetch('./public/stationing-reconstruction-evidence-user-edits-20261020.json').then(r=>r.json())]);
    for(const [id,label,from,to,bound]of [['seg1','Seg 1 - NLEX NB',20,20.6,'NB'],['seg2','Cross Seg 1 / 2 - NLEX NB',32.9,33.3,'NB'],['seg3','Cross Seg 2 / 3 - NLEX NB',65.7,66.1,'NB'],['southbound','NLEX SB - decreasing KM',20.6,20,'SB']]){
      const rows=calibration.filter(r=>r.e==='NLEX'&&r.b===bound&&r.k>=Math.min(from,to)&&r.k<=Math.max(from,to)).sort((a,b)=>from<to?a.k-b.k:b.k-a.k);if(rows.length<3)throw Error('Prepared calibration route unavailable: '+id);state.routes.push({id,label,mode:'mainline',points:rows.map(r=>({lat:r.lat,lon:r.lon}))});
    }
    const ramp=model.interchanges.find(r=>r.id==='nlex_harbor_link_smart_connect_078')||model.interchanges[0];const coordinates=ramp.coordinates;state.routes.push({id:'interchange',label:ramp.name+' - saved ramp geometry',mode:'interchange',points:coordinates.map(c=>({lat:c[1],lon:c[0]}))});
    for(const site of [...new Set(model.interchanges.map(r=>r.site))]){
      const source=model.interchanges.filter(r=>r.site===site).sort((a,b)=>Number(['entry_ramp','exit_ramp'].includes(b.seg_type))-Number(['entry_ramp','exit_ramp'].includes(a.seg_type))||b.coordinates.length-a.coordinates.length)[0];
      state.routes.push({id:'site:'+site,label:source.name+' - explore saved line',mode:'interchange',points:source.coordinates.map(c=>({lat:c[1],lon:c[0]}))});
    }
    for(const route of state.routes)el('demo-route').add(new Option(route.label,route.id));
    for(let tries=0;tries<100&&(!calibData.length||authDisplayState?.mode!=='guest');tries++)await new Promise(r=>setTimeout(r,100));
    if(!calibData.length||authDisplayState?.mode!=='guest')throw Error('Guest workspace or calibration did not finish loading. Reload this demo.');
    for(const id of ['demo-route','demo-play','demo-photo'])el(id).disabled=false;
    sampleTeam();guide(0);state.timer=setInterval(()=>tick(),1500);window.dispatchEvent(new Event('resize'));panel.showModal();
  }catch(error){say(error.message);panel.showModal();}}
  addEventListener('pagehide',()=>clearInterval(state.timer));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
})();
