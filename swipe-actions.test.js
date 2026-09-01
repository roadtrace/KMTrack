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
  const entry = {id:'internal-only',type:'Potholes',timestamp:'2026-09-01 09:00:00',lat:14.1,lon:120.2,expressway:'NLEX',bound:'NB',lane:'2',km:8.2,photoId:'p',photoFilename:'p.jpg'};
  const rows = swipe.inspectionWorkbookRows([entry], (v,p)=>`${p}${v}`, v=>v.toFixed(3));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, 12);
  assert.deepEqual(rows[0], ['Type of Defect','Timestamp','Latitude','Longitude','Latitude (DMM)','Longitude (DMM)','Expressway','Direction','Lane','Km Station','Photo','Photo Filename']);
  assert.deepEqual(rows[1], ['Potholes','2026-09-01 09:00:00',14.1,120.2,'N14.1','E120.2','NLEX','NB','2',8.2,'Yes','p.jpg']);
  assert.equal(swipe.inspectionWorkbookRows([], ()=>'', v=>v).length, 1);
});
