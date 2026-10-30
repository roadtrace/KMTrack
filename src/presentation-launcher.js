(function(){
  'use strict';
  function mount(){
    const link=document.getElementById('presentation-launch'),status=document.getElementById('presentation-launch-status');
    if(!link||!status)return;
    if(globalThis.SPOTITPresentation){link.hidden=true;status.textContent='You are in the isolated Guest demonstration. Open Controls in the presentation banner.';return;}
    const configured=globalThis.SPOTITPresentationConfig?.url;
    const local=['localhost','127.0.0.1'].includes(location.hostname);
    if(!configured&&!local){link.hidden=true;status.textContent='The separate presentation build is prepared. Its public link will appear here after publishing and verification.';return;}
    try{
      const url=new URL(configured||'http://127.0.0.1:8790/');
      if(url.username||url.password||url.origin===location.origin||(!local&&url.protocol!=='https:')||['kmtrack.pages.dev','roadtrace.github.io'].includes(url.hostname))throw Error('Invalid presentation origin');
      link.href=url.href;link.hidden=false;status.textContent=configured?'Opens a separate Guest demo. Your real inspections stay here.':'Local preview: start node scripts/presentation-server.cjs, then launch. This link is not for the audience.';
    }catch(_){link.hidden=true;status.textContent='Presentation link is not configured for a separate hostname.';}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
