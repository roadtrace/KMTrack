/* Online Team Map history. Reuses the guarded Team RPC; memory only, no writes. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./team-log'):root.SPOTITTeamLog);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SPOTITTeamMap=api;
})(globalThis,function(team){
  'use strict';
  function createController(o){
    let active=false,timer=null;
    const schedule=o.schedule||((fn)=>setTimeout(fn,0)),cancel=o.cancel||clearTimeout;
    function pump(){
      if(active&&timer===null)timer=schedule(()=>{timer=null;const s=controller.snapshot();if(active&&s.scope&&s.hasMore&&!s.loading&&!s.error)void controller.more();});
    }
    function changed(){o.changed();pump();}
    const controller=team.createController({...o,includeUnfiltered:true,changed});
    function pause(){active=false;if(timer!==null){cancel(timer);timer=null;}}
    function activate(filters={},refresh=false){active=true;controller.activate(filters,refresh);pump();}
    function invalidate(){pause();controller.invalidate();o.changed();}
    function coverage(){
      const s=controller.snapshot();
      if(!s.scope)return 'Team map requires a connection and online verification.';
      if(s.error)return `Could not load all matches · ${s.rows.length} loaded. Refresh to try again.`;
      if(!s.pageLoaded)return s.loading?'Finding matching inspections…':'Choose Team records to load inspections.';
      const progress=`${s.rows.length} of ${s.total} matching inspections loaded`;
      return progress+(s.loading||s.hasMore?' · Loading…':' · All matches loaded');
    }
    return {activate,pause,invalidate,coverage,snapshot:controller.snapshot,items:controller.items};
  }
  return {createController};
});
