(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.KMTrackSwipe = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const REVEAL_THRESHOLD_PX = 72;
  const REVEAL_WIDTH_PX = 88;
  const COMMIT_MIN_PX = 160;
  const COMMIT_MAX_PX = 240;
  const COMMIT_RATIO = 0.55;

  function commitThreshold(width){
    return Math.round(Math.min(COMMIT_MAX_PX, Math.max(COMMIT_MIN_PX, width * COMMIT_RATIO)));
  }

  function resistedOffset(rawOffset, revealWidth){
    const limit = revealWidth || REVEAL_WIDTH_PX;
    const sign = rawOffset < 0 ? -1 : 1;
    const distance = Math.abs(rawOffset);
    if(distance <= limit) return rawOffset;
    return sign * (limit + (distance - limit) * 0.32);
  }

  function releaseDecision(offset, width){
    const distance = Math.abs(offset);
    if(distance >= commitThreshold(width)) return offset > 0 ? 'edit' : 'delete';
    if(distance >= REVEAL_THRESHOLD_PX) return offset > 0 ? 'reveal-edit' : 'reveal-delete';
    return 'cancel';
  }

  function inspectionWorkbookRows(entries, toDMM, kmToCsvNumber){
    return [
      ['Type of Defect','Timestamp','Latitude','Longitude','Latitude (DMM)','Longitude (DMM)','Expressway','Direction','Lane','Km Station','Photo','Photo Filename'],
      ...entries.map(e=>[
        e.type,e.timestamp,e.lat,e.lon,toDMM(e.lat,'N','S'),toDMM(e.lon,'E','W'),
        e.expressway||'',e.bound||'',e.lane||'',e.km===null||e.km===undefined?'':Number(kmToCsvNumber(e.km)),
        e.photoId?'Yes':'No',e.photoFilename||''
      ])
    ];
  }

  function createDeletionController(options){
    let pending = null;
    const setTimer = options.setTimer || setTimeout;
    const clearTimer = options.clearTimer || clearTimeout;

    function finalize(record){
      if(!record || record.finalized) return;
      record.finalized = true;
      if(record.entry.photoId) options.deletePhoto(record.entry.photoId);
      if(record.entry.photoId) options.deletePhoto(record.entry.photoId + ':raw');
      if(pending === record) pending = null;
      if(options.onFinalize) options.onFinalize(record);
    }

    function remove(index, allowUndo){
      const entries = options.getEntries();
      const entry = entries[index];
      if(!entry) return null;
      if(pending){
        clearTimer(pending.timer);
        finalize(pending);
      }
      const record = {
        entry, index, finalized:false, timer:null,
        previousId:index > 0 ? entries[index-1].id : null,
        nextId:index < entries.length-1 ? entries[index+1].id : null
      };
      entries.splice(index, 1);
      options.persist();
      options.render();
      if(!allowUndo){
        finalize(record);
        return record;
      }
      pending = record;
      record.timer = setTimer(() => {
        finalize(record);
        if(options.onExpire) options.onExpire(record);
      }, 5000);
      if(options.onPending) options.onPending(record);
      return record;
    }

    function undo(){
      if(!pending || pending.finalized) return false;
      const record = pending;
      clearTimer(record.timer);
      pending = null;
      const entries = options.getEntries();
      const nextIndex = record.nextId ? entries.findIndex(entry => entry.id === record.nextId) : -1;
      const previousIndex = record.previousId ? entries.findIndex(entry => entry.id === record.previousId) : -1;
      const restoreIndex = nextIndex >= 0 ? nextIndex : previousIndex >= 0 ? previousIndex + 1 : Math.min(record.index, entries.length);
      entries.splice(restoreIndex, 0, record.entry);
      options.persist();
      options.render();
      if(options.onUndo) options.onUndo(record);
      return true;
    }

    return { remove, undo, finalizePending:() => pending && finalize(pending), getPending:() => pending };
  }

  return {
    REVEAL_THRESHOLD_PX, REVEAL_WIDTH_PX, COMMIT_MIN_PX, COMMIT_MAX_PX, COMMIT_RATIO,
    commitThreshold, resistedOffset, releaseDecision, inspectionWorkbookRows, createDeletionController
  };
});
