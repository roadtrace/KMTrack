(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.SPOTITLocation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  function distanceKm(a,b){
    if(!a||!b) return Infinity;
    const r=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lon-a.lon)*Math.PI/180;
    const value=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;
    return r*2*Math.atan2(Math.sqrt(value),Math.sqrt(1-value));
  }

  function corridorDepartureThresholdKm(accuracyMeters){
    const accuracyBuffer=Number.isFinite(accuracyMeters)?Math.min(Math.max(accuracyMeters,0),40)/1000:0.015;
    return 0.045+accuracyBuffer;
  }

  function isInterchangeMode(resolution,accuracyMeters){
    return !!(resolution?.confirmed&&resolution.interchange&&resolution.result
      &&resolution.result.distance>corridorDepartureThresholdKm(accuracyMeters));
  }

  function createResolver(options={}){
    const startupFixes=options.startupFixes||3;
    const ambiguousStartupFixes=options.ambiguousStartupFixes||5;
    const switchFixes=options.switchFixes||4;
    const switchMovementKm=options.switchMovementKm||0.03;
    const switchElapsedMs=options.switchElapsedMs||2500;
    const interchangeHoldMs=options.interchangeHoldMs||30000;
    const interchangeExitKm=options.interchangeExitKm||0.15;
    let confirmedCorridor='',startup=null,pendingSwitch=null,lastFix=null,lastOutput=null;
    let confirmedInterchange=null,interchangePending=null;

    function normalizedInterchange(match){
      if(!match) return null;
      const row=match.ramp&&typeof match.ramp==='object'?match.ramp:match;
      const name=String(row.interchange||row.name||'').trim();
      const siteId=String(row.site_id||row.siteId||name).trim();
      const segment=String(row.ramp||row.seg_type||'').trim().replace(/_/g,' ');
      const segmentId=String(row.seg_id||'').trim();
      return name?{siteId,name,segment,segmentId}:null;
    }

    function updateInterchange(match,fix,time){
      const found=normalizedInterchange(match);
      if(found){
        if(confirmedInterchange&&confirmedInterchange.siteId===found.siteId){
          confirmedInterchange={...found,lastSeenAt:time,lastSeenFix:fix};interchangePending=null;
        }else if(interchangePending&&interchangePending.siteId===found.siteId){
          interchangePending.count++;
          if(interchangePending.count>=2){
            confirmedInterchange={...found,lastSeenAt:time,lastSeenFix:fix};interchangePending=null;
          }
        }else interchangePending={...found,count:1};
      }else if(confirmedInterchange){
        const elapsed=time-confirmedInterchange.lastSeenAt;
        const moved=distanceKm(confirmedInterchange.lastSeenFix,fix);
        if(elapsed>interchangeHoldMs&&moved>interchangeExitKm) confirmedInterchange=null;
      }
      return confirmedInterchange?{
        siteId:confirmedInterchange.siteId,name:confirmedInterchange.name,
        segment:confirmedInterchange.segment||'',segmentId:confirmedInterchange.segmentId||''
      }:null;
    }

    function plausibleStep(fix,time,accuracy,speed){
      if(!lastFix) return true;
      const elapsed=Math.max(0,(time-lastFix.time)/1000);
      const expected=Number.isFinite(speed)&&speed>=0?speed*elapsed/1000:0;
      const allowance=Math.max(0.15,Math.min(Number(accuracy)||30,200)*0.003,expected*3+0.05);
      return distanceKm(lastFix,fix)<=allowance;
    }

    function resolve(input){
      const time=Number.isFinite(Number(input.timestamp))?Number(input.timestamp):Date.now();
      const fix={lat:Number(input.lat),lon:Number(input.lon)};
      const candidates=(Array.isArray(input.candidates)?input.candidates:[])
        .filter(row=>row&&row.expressway&&Number.isFinite(row.distance)&&Number.isFinite(row.km))
        .sort((a,b)=>a.distance-b.distance);
      const interchange=updateInterchange(input.interchange,fix,time);
      const stepIsPlausible=plausibleStep(fix,time,input.accuracy,input.speed);
      const best=candidates[0]||null;

      if(!confirmedCorridor){
        if(best){
          if(startup&&startup.corridor===best.expressway) startup.count++;
          else startup={corridor:best.expressway,count:1};
          const second=candidates.find(row=>row.expressway!==best.expressway);
          const ambiguous=!!second&&second.distance-best.distance<0.025;
          if(stepIsPlausible&&startup.count>=(ambiguous?ambiguousStartupFixes:startupFixes)) confirmedCorridor=best.expressway;
        }
      }else{
        const current=candidates.find(row=>row.expressway===confirmedCorridor)||null;
        const alternative=candidates.find(row=>row.expressway!==confirmedCorridor)||null;
        const advantage=current&&alternative?current.distance-alternative.distance:Infinity;
        const connectionEvidence=!!interchange;
        const switchEvidence=connectionEvidence&&alternative&&alternative.distance<=0.06
          &&(!current||current.distance>=0.07)&&advantage>=0.025&&stepIsPlausible;
        if(switchEvidence){
          if(pendingSwitch&&pendingSwitch.corridor===alternative.expressway){
            pendingSwitch.count++;
          }else{
            pendingSwitch={corridor:alternative.expressway,count:1,startedAt:time,startFix:fix};
          }
          const moved=distanceKm(pendingSwitch.startFix,fix);
          if(pendingSwitch.count>=switchFixes&&time-pendingSwitch.startedAt>=switchElapsedMs&&moved>=switchMovementKm){
            confirmedCorridor=alternative.expressway;pendingSwitch=null;startup=null;
          }
        }else pendingSwitch=null;
      }

      const result=confirmedCorridor
        ? (candidates.find(row=>row.expressway===confirmedCorridor)||null)
        : best;
      const alternative=result&&candidates.find(row=>row.expressway!==result.expressway);
      const competitive=!!(result&&alternative&&alternative.distance-result.distance<0.025);
      const confirmed=!!confirmedCorridor;
      const uncertain=!confirmed||!!pendingSwitch||competitive||!stepIsPlausible;
      lastFix={...fix,time};
      lastOutput={result,confirmed,confirmedCorridor,uncertain,
        reason:!confirmed?'Confirming road':pendingSwitch?'Confirming connection':!stepIsPlausible?'Ignoring implausible GPS movement':competitive?'Overlapping roads nearby':'',
        interchange,saveAllowed:confirmed&&!!result,fresh:true};
      return lastOutput;
    }

    function markStale(reason='GPS signal unavailable'){
      if(!lastOutput) return {result:null,confirmed:false,confirmedCorridor,uncertain:true,reason,interchange:null,saveAllowed:false,fresh:false};
      lastOutput={...lastOutput,uncertain:true,reason,saveAllowed:false,fresh:false};
      return lastOutput;
    }

    return {
      resolve,markStale,
      state:()=>({confirmedCorridor,pendingCorridor:pendingSwitch?.corridor||'',interchange:lastOutput?.interchange||null})
    };
  }

  return {createResolver,distanceKm,corridorDepartureThresholdKm,isInterchangeMode};
});
