const test = require('node:test');
const assert = require('node:assert/strict');
const swipe = require('./swipe-actions.js');

test('uses separate reveal and responsive commit thresholds', () => {
  assert.equal(swipe.releaseDecision(71, 360), 'cancel');
  assert.equal(swipe.releaseDecision(72, 360), 'reveal-edit');
  assert.equal(swipe.releaseDecision(-72, 360), 'reveal-delete');
  assert.equal(swipe.commitThreshold(360), 198);
  assert.equal(swipe.releaseDecision(198, 360), 'edit');
  assert.equal(swipe.releaseDecision(-198, 360), 'delete');
});

test('reversing below reveal before release cancels and resistance is applied after reveal', () => {
  assert.equal(swipe.releaseDecision(40, 360), 'cancel');
  assert.equal(swipe.resistedOffset(188), 120);
  assert.equal(swipe.resistedOffset(-188), -120);
});

test('swipe delete persists immediately and Undo restores exact object, ID, data, and position', () => {
  const first = {id:'stable-a',type:'Potholes',nested:{complete:true},photoId:'photo-a'};
  const deleted = {id:'stable-b',type:'Cracks',nested:{complete:true},photoId:'photo-b'};
  const last = {id:'stable-c',type:'Others',nested:{complete:true},photoId:''};
  const entries = [first, deleted, last];
  const saved = [];
  const timers = [];
  const photosDeleted = [];
  const controller = swipe.createDeletionController({
    getEntries:()=>entries,
    persist:()=>saved.push(JSON.stringify(entries)),
    render:()=>{},
    deletePhoto:id=>photosDeleted.push(id),
    setTimer:fn=>{ timers.push(fn); return timers.length; },
    clearTimer:()=>{}
  });
  controller.remove(1, true);
  assert.deepEqual(entries, [first, last]);
  assert.equal(JSON.parse(saved.at(-1)).some(e=>e.id==='stable-b'), false);
  assert.deepEqual(photosDeleted, []);
  assert.equal(controller.undo(), true);
  assert.equal(entries[1], deleted);
  assert.equal(entries[1].id, 'stable-b');
  assert.deepEqual(entries[1].nested, {complete:true});
  assert.deepEqual(JSON.parse(saved.at(-1)), entries);
  assert.deepEqual(photosDeleted, []);
});

test('expired Undo permanently removes associated persisted photos', () => {
  const entries = [{id:'stable-a',photoId:'photo-a'}];
  let expire;
  const removed = [];
  const controller = swipe.createDeletionController({
    getEntries:()=>entries,persist:()=>{},render:()=>{},deletePhoto:id=>removed.push(id),
    setTimer:fn=>{ expire=fn; return 1; },clearTimer:()=>{}
  });
  controller.remove(0, true);
  expire();
  assert.deepEqual(removed, ['photo-a','photo-a:raw']);
  assert.equal(controller.undo(), false);
});

test('Undo uses stable neighbor IDs to restore order after intervening changes', () => {
  const a={id:'a'}, b={id:'b'}, c={id:'c'}, inserted={id:'new'};
  const entries=[a,b,c];
  const controller=swipe.createDeletionController({getEntries:()=>entries,persist:()=>{},render:()=>{},deletePhoto:()=>{},setTimer:()=>1,clearTimer:()=>{}});
  controller.remove(1,true);
  entries.unshift(inserted);
  controller.undo();
  assert.deepEqual(entries.map(e=>e.id), ['new','a','b','c']);
});

test('exports exclude deleted entries and restored entries return with unchanged schema and formatting', () => {
  const entry = {id:'internal-only',type:'Potholes',timestamp:'2026-09-01 09:00:00',lat:14.1,lon:120.2,expressway:'NLEX',interchange:'Dau Interchange',interchangeSegment:'NB Entry Ramp',bound:'NB',lane:'2',km:8.2,photoId:'p',photoFilename:'p.jpg'};
  const rows = swipe.inspectionWorkbookRows([entry], (v,p)=>`${p}${v}`, v=>Math.round(v*1000));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, 16);
  // The original 14 columns keep their exact order and content; the two lane
  // columns are appended so older workbooks remain importable.
  assert.deepEqual(rows[0].slice(0,14), ['Type of Defect','Timestamp','Latitude','Longitude','Latitude (DMM)','Longitude (DMM)','Expressway','Direction','Lane','Km Station','Photo','Photo Filename','Interchange / Exit','Interchange Segment']);
  assert.deepEqual(rows[0].slice(14), ['Lane Number','Lane (Other)']);
  assert.deepEqual(rows[1].slice(0,14), ['Potholes','2026-09-01 09:00:00',14.1,120.2,'N14.1','E120.2','NLEX','NB','2',8200,'Yes','p.jpg','Dau Interchange','NB Entry Ramp']);
  assert.equal(swipe.inspectionWorkbookRows([{...entry,km:null}], (v,p)=>`${p}${v}`, v=>Math.round(v*1000))[1][9], '');
  assert.equal(swipe.inspectionWorkbookRows([], ()=>'', v=>v).length, 1);
});

test('lane columns carry a number for lanes 1-4 and free text for Others', () => {
  const base = {type:'Potholes',timestamp:'2026-09-01 09:00:00',lat:14.1,lon:120.2,km:null,photoId:''};
  const row = (extra) => swipe.inspectionWorkbookRows([{...base,...extra}], ()=>'x', v=>v)[1];
  const numbered = row({lane:'3',lane_number:3,lane_other:''});
  assert.equal(numbered[14], 3);
  assert.equal(numbered[15], '');
  const other = row({lane:'Shoulder',lane_number:null,lane_other:'Shoulder'});
  assert.equal(other[14], '');
  assert.equal(other[15], 'Shoulder');
  // A record written before the structured lane existed still exports cleanly.
  const legacy = row({lane:'Shoulder'});
  assert.equal(legacy[14], '');
  assert.equal(legacy[15], '');
  // Out-of-range or non-numeric lane numbers are never emitted as a lane.
  assert.equal(row({lane_number:9})[14], '');
  assert.equal(row({lane_number:1.5})[14], '');
});
