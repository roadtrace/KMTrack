(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.SPOTITEntryFilters = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';
  // Keep the saved local calendar day, without converting it to UTC.
  function entryDay(entry){ return String(entry.timestamp || '').slice(0,10); }
  function boundKey(value){
    const key=String(value||'').trim().toUpperCase().replace(/[\s_-]/g,'');
    return ({NB:'NB',NORTHBOUND:'NB',SB:'SB',SOUTHBOUND:'SB',EB:'EB',EASTBOUND:'EB',WB:'WB',WESTBOUND:'WB'})[key]||'Other';
  }
  function filterEntries(entries, {day = '', from = '', to = '', type = '', source = '', inspector = '', bound = ''} = {}){
    return entries.filter(entry => {
      const date = entryDay(entry);
      const sourceMatch=!source || (source==='mine'?!entry.importBatchId:source==='imported'?!!entry.importBatchId:entry.importBatchId===source);
      return sourceMatch && (!inspector || (entry.inspector||'')===inspector) && (!bound || boundKey(entry.bound)===bound) && (!day || date === day) && (!from || date >= from) && (!to || date <= to) && (!type || entry.type === type);
    });
  }
  function exportScope(entries, filters = {}, selectedIds = new Set()){
    const visible = filterEntries(entries, filters);
    const selected = visible.filter(entry => selectedIds.has(entry.id));
    return {
      entries: selected.length ? selected : visible,
      restricted: Boolean(selected.length || filters.day || filters.from || filters.to || filters.type || filters.source || filters.inspector || filters.bound)
    };
  }
  function mapEntries(entries, from = '', to = from, type = '', source = '', inspector = '', bound = ''){
    return filterEntries(entries, {from,to,type,source,inspector,bound}).filter(entry =>
      Number.isFinite(entry.lat) && Math.abs(entry.lat) <= 90 &&
      Number.isFinite(entry.lon) && Math.abs(entry.lon) <= 180);
  }
  return {entryDay, boundKey, filterEntries, exportScope, mapEntries};
});
