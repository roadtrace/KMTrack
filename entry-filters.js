(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.KMTrackEntryFilters = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';
  // Keep the saved local calendar day, without converting it to UTC.
  function entryDay(entry){ return String(entry.timestamp || '').slice(0,10); }
  function filterEntries(entries, {day = '', from = '', to = '', type = '', source = '', inspector = ''} = {}){
    return entries.filter(entry => {
      const date = entryDay(entry);
      const sourceMatch=!source || (source==='mine'?!entry.importBatchId:source==='imported'?!!entry.importBatchId:entry.importBatchId===source);
      return sourceMatch && (!inspector || (entry.inspector||'')===inspector) && (!day || date === day) && (!from || date >= from) && (!to || date <= to) && (!type || entry.type === type);
    });
  }
  function exportScope(entries, filters = {}, selectedIds = new Set()){
    const visible = filterEntries(entries, filters);
    const selected = visible.filter(entry => selectedIds.has(entry.id));
    return {
      entries: selected.length ? selected : visible,
      restricted: Boolean(selected.length || filters.day || filters.from || filters.to || filters.type || filters.source || filters.inspector)
    };
  }
  function mapEntries(entries, from = '', to = from, type = '', source = '', inspector = ''){
    return filterEntries(entries, {from,to,type,source,inspector}).filter(entry =>
      Number.isFinite(entry.lat) && Math.abs(entry.lat) <= 90 &&
      Number.isFinite(entry.lon) && Math.abs(entry.lon) <= 180);
  }
  return {entryDay, filterEntries, exportScope, mapEntries};
});
