/* Scoped Team summary and filtered keyset pages. No record persistence or writes. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./cloud-records'):root.SPOTITCloudRecords);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SPOTITTeamLog=api;
})(globalThis,function(cloud){
  'use strict';
  const keys=['from','to','type','corridor','bound','lane','inspector','search'];
  function filtersOf(value={}){return Object.fromEntries(keys.map(k=>[k,String(value[k]||'').trim()]));}
  const filtered=f=>keys.some(k=>f[k]);
  function createController(o){
    let scope=null,epoch=0,summaryRun=0,pageRun=0;
    const blank=()=>({summary:[],summaryLoaded:false,summaryLoading:false,summaryError:false,summaryTime:0,
      rows:[],total:0,hasMore:false,loading:false,error:false,filters:filtersOf(),signature:'',cursor:null});
    let state=blank();
    function sync(){const next=cloud.scopeOf(o.context(),o.key(),o.online());if(next?.token!==scope?.token){epoch++;scope=next;state=blank();}return scope;}
    function invalidate(){epoch++;scope=null;state=blank();}
    function guard(token,generation){if(sync()?.token!==token||epoch!==generation)throw Error('Team scope changed');}
    async function verified(token,generation){await o.verify();guard(token,generation);const auth=await o.client.auth.getUser();guard(token,generation);if(auth.error||auth.data?.user?.id?.toLowerCase()!==scope.userId)throw Error('Authentication changed');}
    function snapshot(){sync();return {...state,scope,filtered:filtered(state.filters),summary:state.summary.slice(),rows:state.rows.slice()};}
    async function loadSummary(){
      const current=sync();if(!current||state.summaryLoading)return;
      const token=current.token,generation=epoch,run=++summaryRun;state.summaryLoading=true;state.summaryError=false;o.changed();
      try{await verified(token,generation);const result=await o.client.rpc('team_inspection_summary',{}, {get:true});guard(token,generation);
        if(result.error||!Array.isArray(result.data))throw Error('Summary unavailable');
        const rows=result.data.map(r=>{if(r.owner_id!==null&&!/^[0-9a-f-]{36}$/i.test(r.owner_id||''))throw Error('Invalid owner');const count=Number(r.inspection_count);if(!Number.isSafeInteger(count)||count<0||typeof r.display_name!=='string')throw Error('Invalid summary');return Object.freeze({...r,inspection_count:count});});
        state.summary=rows;state.summaryLoaded=true;state.summaryTime=Date.now();
      }catch(_){if(epoch===generation&&summaryRun===run)state.summaryError=true;}
      finally{if(epoch===generation&&summaryRun===run){state.summaryLoading=false;o.changed();}}
    }
    async function loadPage(refresh=false){
      const current=sync();if(!current||!filtered(state.filters)||state.loading||!refresh&&!state.hasMore)return;
      const token=current.token,generation=epoch,run=++pageRun,signature=state.signature,cursor=refresh?null:state.cursor;
      const valid=()=>{guard(token,generation);if(run!==pageRun||signature!==state.signature)throw Error('Team filters changed');};
      state.loading=true;state.error=false;o.changed();
      try{await verified(token,generation);valid();const result=await o.client.rpc('team_inspection_page',{filters:state.filters,after_time:cursor?.inspected_at||null,after_id:cursor?.id||null},{get:true});valid();
        const data=result.data;if(result.error||data?.authorized!==true||!Array.isArray(data.records)||data.records.length>50||!Number.isSafeInteger(Number(data.total))||Number(data.total)<0)throw Error('Page unavailable');
        let previous=cursor;const rows=data.records.map(raw=>{if(!cloud.rowInScope(raw,current,'team')||raw.inspector_display_name!=null&&typeof raw.inspector_display_name!=='string')throw Error('Invalid Team row');const position=cloud.position(raw);if(previous&&cloud.compare(previous,position)>=0)throw Error('Invalid page order');previous=position;return Object.freeze({...raw,id:position.id,user_id:raw.user_id?.toLowerCase()||null,cloud_source:true});});
        state.rows=refresh?rows:[...state.rows,...rows];state.total=Number(data.total);state.hasMore=data.has_more===true&&rows.length>0;state.cursor=rows.length?cloud.position(rows.at(-1)):cursor;
      }catch(_){if(epoch===generation&&run===pageRun)state.error=true;}
      finally{if(epoch===generation&&run===pageRun){state.loading=false;o.changed();}}
    }
    function activate(value={},refresh=false){
      if(!sync())return;
      if(refresh||!state.summaryLoaded&&!state.summaryLoading||Date.now()-state.summaryTime>60000&&!state.summaryLoading)void loadSummary();
      const f=filtersOf(value),signature=JSON.stringify(f);
      if(signature!==state.signature||refresh){pageRun++;state.filters=f;state.signature=signature;state.rows=[];state.total=0;state.cursor=null;state.loading=false;state.hasMore=filtered(f);state.error=false;if(filtered(f))void loadPage(true);o.changed();}
    }
    function items(){const s=snapshot();return !s.scope?[]:s.rows.map(row=>({id:row.id,cloud:row,local:null,source:'cloud',readOnly:true,primary:'cloud'}));}
    return {activate,snapshot,items,invalidate,more:()=>loadPage(false),retry:()=>loadPage(true)};
  }
  return {filtersOf,filtered,createController};
});
