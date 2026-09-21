/* SPOT IT entry model — the single source of truth for the inspection record.
 *
 * Loaded before the app script and before the sharing module, so the schema
 * cannot drift between creation, migration, import and export.
 *
 * Offline-first by design: a permanent UUID and a `pending` sync status are
 * assigned the moment a record is created, before anything touches a network.
 * Everything Supabase-specific stays out of this file; it only defines the
 * shape those systems will read and write.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SPOTITEntry=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const SYNC_STATUS=Object.freeze({PENDING:'pending',SYNCED:'synced',FAILED:'failed'});
  const SYNC_STATUSES=[SYNC_STATUS.PENDING,SYNC_STATUS.SYNCED,SYNC_STATUS.FAILED];

  /* RFC 4122 v4. crypto.randomUUID covers every current browser; the manual
   * path keeps older WebViews working without ever producing a non-UUID. */
  function uuid(){
    if(typeof crypto!=='undefined' && typeof crypto.randomUUID==='function') return crypto.randomUUID();
    const bytes=new Uint8Array(16);
    if(typeof crypto!=='undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for(let i=0;i<16;i++) bytes[i]=Math.floor(Math.random()*256);
    bytes[6]=(bytes[6]&0x0f)|0x40;
    bytes[8]=(bytes[8]&0x3f)|0x80;
    let hex='';
    for(let i=0;i<16;i++) hex+=bytes[i].toString(16).padStart(2,'0');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }

  /* Lane model.
   *
   * `lane_number` (1-4) and `lane_other` (free text) are the structured fields
   * Supabase will store. `lane` is deliberately kept verbatim as the legacy and
   * display value, so existing records, filters, photo stamps and exports keep
   * behaving exactly as they did before. */
  function laneFields(value){
    const lane=value==null?'':String(value).trim();
    if(/^[1-4]$/.test(lane)) return {lane,lane_number:Number(lane),lane_other:''};
    return {lane,lane_number:null,lane_other:(lane && lane!=='Others')?lane:''};
  }

  const text=(v,fallback)=>typeof v==='string'?v:(fallback||'');
  const isoNow=now=>new Date(now==null?Date.now():now).toISOString();

  /* Backfills every field added since v1. Returns null for records that were
   * never valid, so callers can drop them the way they always have.
   *
   * Unknown fields are preserved (`...raw`), which matters: import attaches a
   * transient `photoFile` Blob that must survive until it is written to
   * IndexedDB. */
  function normalizeEntry(raw, now){
    if(!raw || typeof raw!=='object' || Array.isArray(raw)) return null;
    if(typeof raw.lat!=='number' || typeof raw.lon!=='number') return null;
    const lane=laneFields(raw.lane);
    const stamp=isoNow(now);
    const created=text(raw.created_at);
    return {
      ...raw,
      id: text(raw.id) || uuid(),
      type: text(raw.type) || 'Others',
      timestamp: text(raw.timestamp),
      lat: raw.lat,
      lon: raw.lon,
      km: (raw.km===null || typeof raw.km==='number') ? raw.km : null,
      expressway: text(raw.expressway),
      interchange: text(raw.interchange),
      interchangeSegment: text(raw.interchangeSegment),
      bound: text(raw.bound),
      lane: lane.lane,
      lane_number: lane.lane_number,
      lane_other: lane.lane_other,
      notes: text(raw.notes),
      inspector: text(raw.inspector),
      photoId: text(raw.photoId),
      photoFilename: text(raw.photoFilename),
      photoTimestamp: text(raw.photoTimestamp),
      photo_path: text(raw.photo_path),   /* future private-bucket object path */
      originId: text(raw.originId),
      archivePhotoPath: text(raw.archivePhotoPath),
      photoAvailable: raw.photoAvailable===true,
      user_id: text(raw.user_id),         /* future Supabase auth uid */
      team: text(raw.team),               /* future team id */
      created_at: created || stamp,
      updated_at: text(raw.updated_at) || created || stamp,
      sync_status: SYNC_STATUSES.includes(raw.sync_status) ? raw.sync_status : SYNC_STATUS.PENDING,
      sync_attempts: Number.isFinite(raw.sync_attempts) ? raw.sync_attempts : 0,
      sync_error: text(raw.sync_error),
      remote_id: text(raw.remote_id)
    };
  }

  /* Creation path. A UUID and `pending` status are set here, offline. */
  function createEntry(fields, now){
    return normalizeEntry({...(fields||{}), id:(fields && fields.id) || uuid()}, now);
  }

  function touch(entry, now){
    if(entry) entry.updated_at=isoNow(now);
    return entry;
  }

  function setLane(entry, value){
    if(!entry) return entry;
    const lane=laneFields(value);
    entry.lane=lane.lane;
    entry.lane_number=lane.lane_number;
    entry.lane_other=lane.lane_other;
    return entry;
  }

  /* Backfills an array, preserving order and dropping only invalid rows. */
  function normalizeAll(list, now){
    return (Array.isArray(list)?list:[]).map(row=>normalizeEntry(row,now)).filter(Boolean);
  }

  return {SYNC_STATUS,SYNC_STATUSES,uuid,laneFields,normalizeEntry,normalizeAll,createEntry,touch,setLane,isoNow};
});
