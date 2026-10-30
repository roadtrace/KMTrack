/* Permanent own-record deletion requires a fresh approved account and explicit UI confirmation. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./cloud-records'):root.SPOTITCloudRecords);if(typeof module==='object'&&module.exports)module.exports=api;root.SPOTITSubmittedDelete=api;})(globalThis,function(cloud){
  'use strict';
  function allowed(row,context,key,online){const scope=cloud.scopeOf(context,key,online);return !!scope&&['inspector','supervisor'].includes(scope.role)&&row?.user_id?.toLowerCase()===scope.userId&&row.team===scope.team;}
  function createController(o){return {async remove(row,confirmed){
    const captured=cloud.scopeOf(o.context(),o.key(),o.online());
    if(confirmed!==true||!allowed(row,o.context(),o.key(),o.online()))throw Error('Only your own submitted inspections can be deleted after online verification.');
    const guard=()=>{if(cloud.scopeOf(o.context(),o.key(),o.online())?.token!==captured.token)throw Error('Account changed. Reopen the inspection before deleting.');};
    await o.verify();guard();
    const auth=await o.client.auth.getUser();guard();if(auth.error||auth.data?.user?.id?.toLowerCase()!==captured.userId)throw Error('Account verification failed.');
    const result=await o.client.rpc('delete_own_inspection',{inspection_id:row.id});guard();
    if(result.error||result.data!==row.id)throw Error('Deletion could not be confirmed. Check your connection and retry; the same deletion is safe to retry.');
    await o.removeLocal(row,captured);guard();o.changed();return row.id;
  }};}
  return {allowed,createController};
});
