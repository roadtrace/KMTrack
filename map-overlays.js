(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SPOTITMap=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const BOUNDS={NB:'#00b9f2',SB:'#ef4444',EB:'#f4b400',WB:'#b18cff',Other:'#a7b0b8'};
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
    landmarkKey.innerHTML='<svg viewBox="0 0 32 40" aria-hidden="true"><path d="M16 39C13 33 2 23 2 16a14 14 0 1 1 28 0c0 7-11 17-14 23Z" fill="#f4b400" stroke="white" stroke-width="2"/><path d="M8 12h16M8 16h16M11 10v13m10-13v13M15 16v7m4-7v7" fill="none" stroke="white" stroke-width="2"/></svg><span>Landmarks</span>';
    landmarkKey.title='Interchanges and Pulilan/Tibag Underpass';host.append(landmarkKey);
  }
  function renderEntries(map,layer,rows,onOpen,formatKm){
    const L=globalThis.L,size=map.getSize(),occupied=[];
    const mapRect=map.getContainer().getBoundingClientRect();
    for(const selector of ['.map-topbar','#map-bound-legend','.map-entry-controls']){
      const control=document.querySelector(selector);if(!control)continue;
      const rect=control.getBoundingClientRect();
      if(rect.width&&rect.height)occupied.push({x:rect.left-mapRect.left,y:rect.top-mapRect.top,w:rect.width,h:rect.height});
    }
    const sorted=rows.map(entry=>{const p=map.latLngToContainerPoint([entry.lat,entry.lon]);return {entry,x:p.x,y:p.y};}).sort((a,b)=>a.y-b.y);
    sorted.forEach(({entry})=>{
      const point=[entry.lat,entry.lon],key=boundKey(entry.bound),color=BOUNDS[key];
      const screen=map.latLngToContainerPoint(point);
      if(screen.x < 0 || screen.x > size.x || screen.y < 0 || screen.y > size.y) return;
      const station=Number.isFinite(entry.km)?formatKm(entry.km):'KM n/a';
      const description=`${entry.type||'Inspection'}, ${station}, ${entry.bound||'bound not set'}, lane ${entry.lane||'not set'}`;
      const open=()=>onOpen(entry.id);
      L.circleMarker(point,{radius:5,color,weight:1.5,fillColor:color,fillOpacity:1,interactive:true}).addTo(layer).on('click',open);
      const host=element('div','map-entry-symbol');host.style.setProperty('--bound-color',color);
      const dot=element('button','map-entry-hit');dot.type='button';dot.setAttribute('aria-label',description);dot.onclick=event=>{
        if(!event.detail){open();return;}
        const point=map.mouseEventToContainerPoint(event);
        const closest=nearestEntry(sorted,point.x,point.y);if(closest)onOpen(closest.id);
      };
      const placement=labelPlacement(screen,size,occupied,key==='SB'||key==='WB');
      host.append(dot);
      if(placement){
        occupied.push({...placement,w:70,h:28});
        const label=element('button','map-km-label',station);label.type='button';label.title=description;label.setAttribute('aria-label',description);label.onclick=open;
        label.style.left=(placement.x-screen.x)+'px';label.style.top=(placement.y-screen.y)+'px';host.append(label);
      }
      L.DomEvent.disableClickPropagation(host);L.DomEvent.disableScrollPropagation(host);
      L.marker(point,{icon:L.divIcon({html:host,className:'map-entry-anchor',iconSize:[0,0],iconAnchor:[0,0]}),keyboard:false,zIndexOffset:200}).addTo(layer);
    });
  }
  function renderLandmarks(map,layer,assets){
    const L=globalThis.L;layer.clearLayers();
    landmarks(assets).forEach(asset=>{
      const title=landmarkTitle(asset);
      const host=element('button','map-landmark-pin');host.type='button';host.setAttribute('aria-label',title);
      host.innerHTML='<svg viewBox="0 0 32 40" aria-hidden="true"><path d="M16 39C13 33 2 23 2 16a14 14 0 1 1 28 0c0 7-11 17-14 23Z" fill="#f4b400" stroke="white" stroke-width="2"/><path d="M8 12h16M8 16h16M11 10v13m10-13v13M15 16v7m4-7v7" fill="none" stroke="white" stroke-width="2"/></svg>';
      const popup=element('div','map-landmark-details');popup.append(element('strong','',title));
      if(asset.to) popup.append(element('div','',`Ends at ${asset.to}`));
      if(asset.network) popup.append(element('div','',asset.network));
      const marker=L.marker([asset.lat,asset.lon],{icon:L.divIcon({html:host,className:'map-landmark-anchor',iconSize:[44,44],iconAnchor:[22,36]}),keyboard:false});
      marker.bindPopup(popup,{maxWidth:240});
      const name=element('span','',title.replace(/ Bridge\b/g,''));
      marker.bindTooltip(name,{permanent:map.getZoom()>=12,direction:'top',offset:[0,-28],className:'map-landmark-label'}).addTo(layer);
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
  return {BOUNDS,boundKey,landmarks,landmarkTitle,nearestEntry,labelPlacement,legend,renderEntries,renderLandmarks,focusEditor};
});
