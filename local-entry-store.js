/* Local inspection persistence. Durability is checked against storage, never
 * trusted from a flag on a record or an imported workbook. No network code. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SPOTITLocalStore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function save(storage,key,entries){
    const serialized=JSON.stringify(entries);
    storage.setItem(key,serialized);
    if(storage.getItem(key)!==serialized) throw new Error('Local inspection save could not be confirmed.');
    return true;
  }
  function contains(storage,key,entry){
    try{
      const saved=JSON.parse(storage.getItem(key)||'[]');
      return !!entry && Array.isArray(saved) && saved.some(row=>row && row.id===entry.id && JSON.stringify(row)===JSON.stringify(entry));
    }catch(_){return false;}
  }
  function saveReview(storage,key,before,after){
    const original=JSON.stringify(before);
    if(storage.getItem(key)!==original) throw new Error('Saved workspace changed. Reopen the review.');
    try { return save(storage,key,after); }
    catch(error){
      // Keep the original hold on disk as well as in memory if confirmation fails.
      storage.setItem(key,original);
      throw error;
    }
  }
  return {save,contains,saveReview};
});
