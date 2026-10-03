/* First attachment only. Every public operation requires a guarded controller. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SPOTITPhotoCloud=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const BUCKET='inspection-photos';
  function failure(message,kind='review'){const e=Error(message);e.photoKind=kind;throw e;}
  function errorKind(e){
    if(e?.photoKind) return e.photoKind;
    const code=String(e?.code||''),status=Number(e?.statusCode||e?.status);
    if([401,403].includes(status)||['42501','PGRST301','PGRST302','AccessDenied'].includes(code)) return 'review';
    if([408,429].includes(status)||status>=500||!code&&!status||['ECONNRESET','ETIMEDOUT','ERR_NETWORK'].includes(code)) return 'retry';
    return 'review';
  }
  function createApi({client,enabled=false,authorize,validate}){
    async function guard(m,mutation=false){
      if(enabled!==true) failure('Photo transport disabled.','disabled');
      if(typeof authorize!=='function'||typeof validate!=='function') failure('Photo guards unavailable.');
      await authorize(m,mutation);
      await validate(m);
    }
    return {
      async readRow(m){
        await guard(m);
        const r=await client.from('inspections').select('id,user_id,team,created_at,inspected_at,photo_filename,photo_path').eq('id',m.inspection_id).maybeSingle();
        if(r.error) throw r.error;
        if(!r.data) failure('Synced cloud inspection is not accessible.');
        return r.data;
      },
      async reserve(m){
        await guard(m,true);
        const r=await client.from('inspections').update({photo_filename:m.photo_filename_intent,photo_path:m.object_path})
          .eq('id',m.inspection_id).eq('user_id',m.user_id).eq('team',m.team)
          .is('photo_filename',null).is('photo_path',null).select('id');
        if(r.error) throw r.error;
        // A zero-row result is not permission to overwrite. Controller rereads.
        return r.data;
      },
      async upload(m,payload){
        await guard(m,true);
        const r=await client.storage.from(BUCKET).upload(m.object_path,payload,{contentType:'image/jpeg',upsert:false});
        if(r.error) throw r.error;
        if(r.data?.path!==m.object_path) failure('Unexpected Storage upload path.');
        return r.data;
      },
      async download(m){
        await guard(m);
        const r=await client.storage.from(BUCKET).download(m.object_path);
        if(r.error){
          // Only an explicit Storage object-not-found code proves this outcome.
          // Generic 400/404, denied reads and network failures are not absence.
          if(['NoSuchKey','ObjectNotFound'].includes(String(r.error.code))) return {missing:true};
          throw r.error;
        }
        if(!r.data || typeof r.data.arrayBuffer!=='function') failure('Object download unavailable.','retry');
        return {path:m.object_path,blob:r.data};
      }
    };
  }
  return {BUCKET,errorKind,failure,createApi};
});
