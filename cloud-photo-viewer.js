/* Read-only second-device private viewer. No acknowledgements or durable cache. */
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(node?require('./cloud-records'):root.SPOTITCloudRecords,
    node?require('./photo-upload-state'):root.SPOTITPhotoUpload);
  if(node)module.exports=api;
  root.SPOTITCloudPhotoViewer=api;
})(globalThis,function(cloud,photo){
  'use strict';
  const unavailable=()=>new Error('Photo unavailable.');
  function identity(row){
    const match=/^photo-v1-([a-f0-9]{64})\.jpg$/.exec(row.photo_filename||'');
    if(!match||photo.path(row.team,row.id,match[1])!==row.photo_path)throw unavailable();
    return match[1];
  }
  function buildViewer(o,view){
    let epoch=0,url=null;
    function close(){epoch++;if(url){o.urls.revokeObjectURL(url);url=null;}}
    async function open(item){
      close();const generation=epoch,key=o.key();
      const start=o.context();
      const scope=cloud.scopeOf(start,key,o.online());
      const row=item.cloud,local=view==='my'?item.local:null;
      const guard=()=>{
        if(epoch!==generation||key!==o.key()||!o.current(item))throw unavailable();
        const c=o.context();
        if(scope){if(cloud.scopeOf(c,key,o.online())?.token!==scope.token)throw unavailable();}
        else if(c.userId!==start.userId||c.workspaceUserId!==start.workspaceUserId||c.canUseLocal!==true
          ||c.sessionGeneration!==start.sessionGeneration||c.scopeGeneration!==start.scopeGeneration)throw unavailable();
      };
      guard();
      const photoId=local?.photoId;
      const saved=photoId?await o.read(photoId):null;guard();
      if(local?.photoId!==photoId)throw unavailable();
      let blob=saved&&['image/jpeg','image/png'].includes(saved.type)&&saved.size>0&&saved.size<=5*1024*1024?saved:null,source='local';
      if(!blob){
        if(!scope||!cloud.rowInScope(row,scope,view))throw unavailable();
        const hash=identity(row),association=JSON.stringify([row.id,row.user_id,row.team,row.photo_filename,row.photo_path]);
        const matches=r=>r&&JSON.stringify([r.id,r.user_id,r.team,r.photo_filename,r.photo_path])===association;
        await o.verify();guard();
        const c=o.context(),now=(o.now||Date.now)();
        if(!Number.isFinite(c.verifiedAt)||now<c.verifiedAt||now-c.verifiedAt>photo.FRESH_MS)throw unavailable();
        const auth=await o.client.auth.getUser();guard();
        if(auth.error||auth.data?.user?.id?.toLowerCase()!==scope.userId)throw unavailable();
        const readRow=()=>{
          let query=o.client.from('inspections').select('id,user_id,team,photo_filename,photo_path')
            .eq('id',row.id).eq('team',scope.team);
          if(view==='my')query=query.eq('user_id',scope.userId);
          return query.maybeSingle();
        };
        const first=await readRow();guard();if(first.error||!matches(first.data))throw unavailable();
        const result=await o.client.storage.from('inspection-photos').download(row.photo_path,{}, {cache:'no-store'});guard();
        blob=result.data;
        if(result.error||!blob||blob.type!=='image/jpeg'||blob.size<=0||blob.size>5*1024*1024)throw unavailable();
        if(await photo.sha256(blob)!==hash)throw unavailable();guard();
        const final=await readRow();guard();if(final.error||!matches(final.data))throw unavailable();
        source='private-cloud';
      }
      if(!blob||!['image/jpeg','image/png'].includes(blob.type)||blob.size<=0||blob.size>5*1024*1024)throw unavailable();
      guard();url=o.urls.createObjectURL(blob);
      return {url,source};
    }
    return {open,close};
  }
  function createViewer(o){return buildViewer(o,'my');}
  function createTeamViewer(o){return buildViewer(o,'team');}
  return {identity,createViewer,createTeamViewer};
});
