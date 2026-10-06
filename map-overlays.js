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
      marker.getElement?.()?.querySelector('.map-entry-symbol')?.classList.toggle('is-selected',entryId===id);
      marker.setZIndexOffset?.(entryId===id?1000:200);
      marker.spotitCircle?.setRadius(entryId===id?9:6);
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
  const entryLayers=new WeakMap();
  const entryCanvases=new WeakMap();
  // Fixed world-pixel cells give stable groups during pans, bounded O(n) work.
  // Geographic records are never moved; only overview cluster anchors use a mean.
  function clusterGroups(map,rows,selected=selectedEntryId){
    const cells=new Map(),individual=[];
    for(const row of rows){
      if(map.getZoom()>14||row.id===selected){individual.push(row);continue;}
      const p=map.project([row.lat,row.lon],map.getZoom());
      const key=Math.floor(p.x/64)+':'+Math.floor(p.y/64);
      if(!cells.has(key))cells.set(key,[]);cells.get(key).push(row);
    }
    const groups=[];
    for(const [cell,members] of cells){
      if(members.length===1){individual.push(members[0]);continue;}
      const center=[members.reduce((sum,e)=>sum+e.lat,0)/members.length,members.reduce((sum,e)=>sum+e.lon,0)/members.length];
      groups.push({id:'cluster:'+map.getZoom()+':'+cell,members,center});
    }
    return {groups,individual};
  }
  function clearEntries(layer){
    layer?.clearLayers();if(layer)entryLayers.delete(layer);entryDots=[];selectedEntryId=null;
  }
  function renderEntries(map,layer,rows,onOpen,formatKm){
    const L=globalThis.L,size=map.getSize(),occupied=[];
    const previous=entryLayers.get(layer)||new Map(),next=new Map();
    const center=map.getCenter(),view=JSON.stringify([center.lat,center.lng,map.getZoom(),size.x,size.y,selectedEntryId]);
    if(previous.rows===rows&&previous.view===view)return {added:0,removed:0,changed:0,unchanged:previous.size,cached:true};
    const stats={added:0,removed:0,changed:0,unchanged:0};
    if(!entryCanvases.has(map))entryCanvases.set(map,L.canvas({padding:.25,tolerance:12}));
    const mapRect=map.getContainer().getBoundingClientRect();
    for(const selector of ['#map-bound-legend','.map-visible-count','.map-filter-menu','.map-workspace-legend','.map-workspace-scope','.map-floating-actions','.leaflet-control-attribution']){
      const control=document.querySelector(selector);if(!control)continue;const rect=control.getBoundingClientRect();
      if(rect.width&&rect.height)occupied.push({x:rect.left-mapRect.left,y:rect.top-mapRect.top,w:rect.width,h:rect.height});
    }
    const visible=p=>p.x>=-44&&p.x<=size.x+44&&p.y>=-44&&p.y<=size.y+44;
    const {groups,individual}=clusterGroups(map,rows);
    const put=(id,signature,make)=>{
      const old=previous.get(id);
      if(old?.signature===signature){next.set(id,old);stats.unchanged++;return;}
      if(old){layer.removeLayer(old.marker);stats.changed++;}else stats.added++;
      next.set(id,{signature,marker:make()});
    };
    for(const group of groups){
      if(!visible(map.latLngToContainerPoint(group.center)))continue;
      const signature=JSON.stringify([group.center,group.members.map(e=>e.id).sort()]);
      put(group.id,signature,()=>{
        const host=element('button','map-entry-cluster',String(group.members.length));host.type='button';
        host.style.setProperty('--cluster-size',Math.min(56,32+Math.log2(group.members.length)*3)+'px');
        host.setAttribute('aria-label',group.members.length+' inspection records. Zoom in.');
        host.onclick=()=>{map.fitBounds(group.members.map(e=>[e.lat,e.lon]),{maxZoom:16,padding:[44,44],animate:false});if(map.getZoom()<=14)map.setView(group.center,15,{animate:false});};
        L.DomEvent.disableClickPropagation(host);L.DomEvent.disableScrollPropagation(host);
        return L.marker(group.center,{icon:L.divIcon({html:host,className:'map-cluster-anchor',iconSize:[56,56],iconAnchor:[28,28]}),keyboard:false,zIndexOffset:180}).addTo(layer);
      });
    }
    entryDots=[];
    for(const entry of individual){
      const screen=map.latLngToContainerPoint([entry.lat,entry.lon]);if(!visible(screen))continue;
      const selected=entry.id===selectedEntryId,key=boundKey(entry.bound),station=Number.isFinite(entry.km)?formatKm(entry.km):'KM n/a';
      const placement=map.getZoom()>=15||selected?labelPlacement(screen,size,occupied,key==='SB'||key==='WB'):null;
      if(placement)occupied.push({...placement,w:70,h:28});
      const signature=JSON.stringify([entry.lat,entry.lon,key,entry.type,entry.km,entry.lane,entry.imported,selected,placement&&[placement.x-screen.x,placement.y-screen.y]]);
      put(entry.id,signature,()=>{
        const circle=L.circleMarker([entry.lat,entry.lon],{renderer:entryCanvases.get(map),radius:selected?9:6,weight:2,color:'#fff',fillColor:BOUNDS[key],fillOpacity:entry.imported ? .65 : 1,dashArray:entry.imported?'3 2':null});
        const layers=[circle];
        const choose=event=>{
          const tap=map.latLngToContainerPoint(event.latlng);
          const candidates=(entryLayers.get(layer)?.rows||[]).map(row=>{const p=map.latLngToContainerPoint([row.lat,row.lon]);return {entry:row,x:p.x,y:p.y};});
          const closest=nearestEntry(candidates,tap.x,tap.y);if(closest)onOpen(closest.id);
        };
        circle.on('click',choose);
        if(!placement){const group=L.layerGroup(layers).addTo(layer);group.spotitCircle=circle;return group;}
        const host=element('div','map-entry-symbol');host.style.setProperty('--bound-color',BOUNDS[key]);host.dataset.entryId=entry.id;
        host.classList.toggle('is-selected',selected);host.classList.toggle('is-imported',!!entry.imported);
        const dot=element('button','map-entry-hit');dot.type='button';
        dot.setAttribute('aria-label',[entry.type||'Inspection',station,entry.bound||'bound not set','lane '+(entry.lane||'not set')].join(', '));
        dot.onclick=event=>{
          if(!event.detail){onOpen(entry.id);return;}
          const tap=map.mouseEventToContainerPoint(event);
          const candidates=(entryLayers.get(layer)?.rows||[]).map(row=>{const p=map.latLngToContainerPoint([row.lat,row.lon]);return {entry:row,x:p.x,y:p.y};});
          const closest=nearestEntry(candidates,tap.x,tap.y);if(closest)onOpen(closest.id);
        };host.append(dot);
        if(placement){const label=element('span','map-km-label',station);label.style.left=(placement.x-screen.x)+'px';label.style.top=(placement.y-screen.y)+'px';host.append(label);}
        L.DomEvent.disableClickPropagation(host);L.DomEvent.disableScrollPropagation(host);
        layers.push(L.marker([entry.lat,entry.lon],{icon:L.divIcon({html:host,className:'map-entry-anchor',iconSize:[0,0],iconAnchor:[0,0]}),keyboard:false,zIndexOffset:selected?1000:200}));
        const group=L.layerGroup(layers).addTo(layer);group.spotitCircle=circle;return group;
      });
      entryDots.push({entryId:entry.id,marker:next.get(entry.id).marker});
    }
    for(const [id,old] of previous)if(!next.has(id)){layer.removeLayer(old.marker);stats.removed++;}
    next.rows=rows;next.view=view;entryLayers.set(layer,next);return stats;
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
  return {BOUNDS,boundKey,landmarks,landmarkTitle,nearestEntry,labelPlacement,legend,renderEntries,clearEntries,clusterGroups,renderLandmarks,focusEditor,selectEntry};
});
