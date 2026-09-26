(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SPOTITMap=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const BOUNDS={NB:'#00b9f2',SB:'#ef4444',EB:'#f4b400',WB:'#b18cff',Other:'#a7b0b8'};
  const BRIDGE_ICON='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bridge" aria-hidden="true"><path d="M10 9.728V16"/><path d="M14 9.728V16"/><path d="M18 20V4"/><path d="m22 11-4-4A7.5 7.5 0 0 1 6 7l-4 4"/><path d="M22 16H2"/><path d="M6 20V4"/></svg>';
  const LANDMARK_ICON=`<span class="map-landmark-glyph">${BRIDGE_ICON}</span>`;
  let selectedEntryId=null;
  let entryDots=[];
  function selectEntry(id){
    selectedEntryId=id;
    entryDots.forEach(({entryId,marker})=>{
      marker.getElement()?.querySelector('.map-entry-symbol')?.classList.toggle('is-selected',entryId===id);
      marker.setZIndexOffset(entryId===id?1000:200);
    });
  }
  function boundKey(value){
    const key=String(value||'').trim().toUpperCase().replace(/[\s_-]/g,'');
    return ({NB:'NB',NORTHBOUND:'NB',SB:'SB',SOUTHBOUND:'SB',EB:'EB',EASTBOUND:'EB',WB:'WB',WESTBOUND:'WB'})[key]||'Other';
  }
  function landmarks(assets){
    const groups=new Map();
    assets.filter(a=>a && typeof a.name==='string' && Number.isFinite(a.lat) && Math.abs(a.lat)<=90 && Number.isFinite(a.lon) && Math.abs(a.lon)<=180 && (a.kind==='interchange'||a.kind==='exit'||a.classification==='Interchange Bridge'||/pulilan.*underpass/i.test(a.name))).forEach(a=>{
      let name=a.name.replace(/\s*\((NB|SB)\)\s*$/i,'');
      if(/pulilan.*underpass/i.test(name)) name='Pulilan Interchange';
      if(name==='Smart Connect (C5-NLEx Link) Interchange Bridge') name='Harbor Link (Smart Connect) Interchange';
      else name=name.replace(/ Interchange Bridge\b/i,' Interchange');
      if(!groups.has(name)) groups.set(name,{...a,name});
    });
    return [...groups.values()];
  }
  function landmarkTitle(asset){
    const station=String(asset.station||asset.from||'').trim();
    return station ? `${asset.name} · ${station}` : asset.name;
  }
  function nearestEntry(points,x,y){
    let closest=null,distance=Infinity;
    for(const point of points){const d=Math.hypot(point.x-x,point.y-y);if(d<distance){closest=point.entry;distance=d;}}
    return closest;
  }
  function labelPlacement(screen,size,occupied,preferLeft){
    const width=70,height=28,gap=4;
    const right={x:screen.x+10,y:screen.y-height/2};
    const left={x:screen.x-width-10,y:screen.y-height/2};
    const candidates=preferLeft
      ? [left,right,{x:screen.x-width/2,y:screen.y-height-10},{x:screen.x-width/2,y:screen.y+10}]
      : [right,left,{x:screen.x-width/2,y:screen.y-height-10},{x:screen.x-width/2,y:screen.y+10}];
    return candidates.find(rect=>
      rect.x>=6 && rect.y>=6 && rect.x+width<=size.x-6 && rect.y+height<=size.y-6 &&
      !occupied.some(other=>rect.x<other.x+other.w+gap && rect.x+width+gap>other.x && rect.y<other.y+other.h+gap && rect.y+height+gap>other.y)
    )||null;
  }
  function element(tag,className,text){
    const e=document.createElement(tag);e.className=className;
    if(text!==undefined) e.textContent=text;
    return e;
  }
  function legend(entries,show){
    const host=document.getElementById('map-bound-legend');
    host.replaceChildren();
    const keys=new Set(entries.map(e=>boundKey(e.bound)));
    Object.entries(BOUNDS).filter(([k])=>show && keys.has(k)).forEach(([k,color])=>{
      const item=element('span','map-legend-item');
      const dot=element('i','map-legend-dot');dot.style.background=color;dot.setAttribute('aria-hidden','true');
      item.append(dot,document.createTextNode(k==='Other'?'Other / unset':k));host.append(item);
    });
    const landmarkKey=element('span','map-legend-landmark');
    landmarkKey.innerHTML=`${LANDMARK_ICON}<span>Landmarks</span>`;
    landmarkKey.title='Interchanges and Pulilan/Tibag Underpass';host.append(landmarkKey);
  }
  function renderEntries(map,layer,rows,onOpen,formatKm){
    const L=globalThis.L,size=map.getSize(),occupied=[];
    entryDots=[];
    const mapRect=map.getContainer().getBoundingClientRect();
    for(const selector of ['.map-topbar','#map-bound-legend','.map-visible-count','.map-filter-menu','.map-workspace-legend','.map-workspace-scope','.map-floating-actions','.leaflet-control-attribution','#osm-map > a']){
      const control=document.querySelector(selector);if(!control)continue;
      const rect=control.getBoundingClientRect();
      if(rect.width&&rect.height)occupied.push({x:rect.left-mapRect.left,y:rect.top-mapRect.top,w:rect.width,h:rect.height});
    }
    const sorted=rows.map(entry=>{const p=map.latLngToContainerPoint([entry.lat,entry.lon]);return {entry,x:p.x,y:p.y};}).sort((a,b)=>a.y-b.y);
    const clusteredIds=new Set();
    if(map.getZoom()<=14){
      const points=sorted.filter(({entry,x,y})=>entry.id!==selectedEntryId&&x>=0&&x<=size.x&&y>=0&&y<=size.y);
      const cells=new Map(),groups=[];
      points.forEach(point=>{
        const cx=Math.floor(point.x/48),cy=Math.floor(point.y/48);
        const neighbors=[];
        for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)neighbors.push(...(cells.get(`${cx+dx}:${cy+dy}`)||[]));
        const near=neighbors.filter(other=>Math.hypot(point.x-other.x,point.y-other.y)<48);
        const group=near[0]?.group||[];
        if(!near.length)groups.push(group);
        group.push(point);point.group=group;
        near.forEach(other=>{
          if(other.group===group)return;
          const merged=other.group;
          merged.forEach(member=>{member.group=group;group.push(member);});
          groups.splice(groups.indexOf(merged),1);
        });
        const key=`${cx}:${cy}`;
        if(!cells.has(key))cells.set(key,[]);
        cells.get(key).push(point);
      });
      groups.forEach(points=>{
        const group=points.map(point=>point.entry);
        if(group.length<2)return;
        group.forEach(entry=>clusteredIds.add(entry.id));
        const center=[group.reduce((sum,e)=>sum+e.lat,0)/group.length,group.reduce((sum,e)=>sum+e.lon,0)/group.length];
        const host=element('button','map-entry-cluster',String(group.length));
        host.type='button';host.setAttribute('aria-label',`${group.length} inspection entries. Zoom in to see each marker.`);
        host.onclick=()=>{
          map.fitBounds(group.map(e=>[e.lat,e.lon]),{maxZoom:16,padding:[44,44],animate:false});
          if(map.getZoom()<=14)map.setView(center,15,{animate:false});
        };
        L.DomEvent.disableClickPropagation(host);L.DomEvent.disableScrollPropagation(host);
        L.marker(center,{icon:L.divIcon({html:host,className:'map-cluster-anchor',iconSize:[44,44],iconAnchor:[22,22]}),keyboard:false,zIndexOffset:180}).addTo(layer);
      });
    }
    sorted.forEach(({entry})=>{
      if(clusteredIds.has(entry.id))return;
      const point=[entry.lat,entry.lon],key=boundKey(entry.bound),color=BOUNDS[key];
      const screen=map.latLngToContainerPoint(point);
      if(screen.x < 0 || screen.x > size.x || screen.y < 0 || screen.y > size.y) return;
      const station=Number.isFinite(entry.km)?formatKm(entry.km):'KM n/a';
      const description=`${entry.type||'Inspection'}, ${station}, ${entry.bound||'bound not set'}, lane ${entry.lane||'not set'}`;
      const open=()=>onOpen(entry.id);
      const host=element('div','map-entry-symbol');host.style.setProperty('--bound-color',color);host.dataset.entryId=entry.id;
      if(entry.id===selectedEntryId)host.classList.add('is-selected');
      const dot=element('button','map-entry-hit');dot.type='button';dot.setAttribute('aria-label',description);dot.onclick=event=>{
        if(!event.detail){open();return;}
        const tap=map.mouseEventToContainerPoint(event);
        const closest=nearestEntry(sorted,tap.x,tap.y);
        if(closest)onOpen(closest.id);
      };
      const placement=labelPlacement(screen,size,occupied,key==='SB'||key==='WB')||{
        x:Math.max(6,Math.min(size.x-76,screen.x+(screen.x>size.x/2?-80:10))),
        y:Math.max(6,Math.min(size.y-34,screen.y-14))
      };
      host.append(dot);
      const label=element('span','map-km-label',station);
      label.style.left=(placement.x-screen.x)+'px';label.style.top=(placement.y-screen.y)+'px';host.append(label);
      L.DomEvent.disableClickPropagation(host);L.DomEvent.disableScrollPropagation(host);
      const marker=L.marker(point,{icon:L.divIcon({html:host,className:'map-entry-anchor',iconSize:[0,0],iconAnchor:[0,0]}),keyboard:false,zIndexOffset:entry.id===selectedEntryId?1000:200}).addTo(layer);
      entryDots.push({entryId:entry.id,marker});
    });
  }
  function renderLandmarks(map,layer,assets){
    const L=globalThis.L,zoom=map.getZoom(),size=map.getSize(),labels=[];layer.clearLayers();
    landmarks(assets).forEach(asset=>{
      const title=landmarkTitle(asset);
      const host=element('button',`map-landmark-pin${zoom<12?' is-wide':''}`);host.type='button';host.setAttribute('aria-label',title);
      host.innerHTML=LANDMARK_ICON;
      const popup=element('div','map-landmark-details');popup.append(element('strong','',title));
      if(asset.to) popup.append(element('div','',`Ends at ${asset.to}`));
      if(asset.network) popup.append(element('div','',asset.network));
      const marker=L.marker([asset.lat,asset.lon],{icon:L.divIcon({html:host,className:'map-landmark-anchor',iconSize:[44,44],iconAnchor:[22,36]}),keyboard:false});
      marker.bindPopup(popup,{maxWidth:240});
      const name=element('span','',zoom>=15?title:asset.name.replace(/ Bridge\b/g,''));
      const screen=map.latLngToContainerPoint([asset.lat,asset.lon]);
      const major=asset.kind==='interchange'||asset.classification==='Interchange Bridge';
      const width=Math.min(180,Math.max(65,name.textContent.length*5.5));
      const label={x:screen.x-width/2,y:screen.y-78,w:width,h:38};
      const showName=zoom>=12 && (zoom>=14||major) &&
        label.x<size.x && label.x+label.w>0 && label.y<size.y && label.y+label.h>0 &&
        !labels.some(other=>label.x<other.x+other.w+8&&label.x+label.w+8>other.x&&label.y<other.y+other.h+6&&label.y+label.h+6>other.y);
      if(showName)labels.push(label);
      marker.bindTooltip(name,{permanent:showName,direction:'top',offset:[0,-28],className:'map-landmark-label'}).addTo(layer);
      host.onclick=()=>marker.openPopup();L.DomEvent.disableClickPropagation(host);
    });
  }
  function focusEditor(){
    const modal=document.getElementById('edit-modal'),previous=document.activeElement;
    const controls=()=>[...modal.querySelectorAll('button,input,select,[tabindex]')].filter(e=>!e.disabled && e.tabIndex>=0 && e.getClientRects().length);
    const handle=event=>{
      if(event.key==='Escape'){event.preventDefault();document.getElementById('edit-close').click();}
      if(event.key==='Tab'){
        const items=controls(),first=items[0],last=items[items.length-1];
        if(event.shiftKey && (document.activeElement===first || !modal.contains(document.activeElement))){event.preventDefault();last?.focus();}
        else if(!event.shiftKey && (document.activeElement===last || !modal.contains(document.activeElement))){event.preventDefault();first?.focus();}
      }
    };
    modal.addEventListener('keydown',handle);
    const observer=new MutationObserver(()=>{
      if(modal.getAttribute('aria-hidden')!=='true')return;
      observer.disconnect();modal.removeEventListener('keydown',handle);
      if(previous?.isConnected)previous.focus();else document.getElementById('map-tab').focus();
    });
    observer.observe(modal,{attributes:true,attributeFilter:['aria-hidden']});controls()[0]?.focus();
  }
  return {BOUNDS,boundKey,landmarks,landmarkTitle,nearestEntry,labelPlacement,legend,renderEntries,renderLandmarks,focusEditor,selectEntry};
});
