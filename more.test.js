const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const more = require('./more');
const sync = require('./sync-queue');
test('legacy navigation and More preserve the existing settings destination', () => {
  for (const route of ['settings','settings-tab','settings-view','tools','tools-tab','tools-view','more']) assert.equal(more.route(route),'settings');
  for (const route of ['inspection','log','map','team']) assert.equal(more.route(route),route);
});
test('diagnostics keep review holds separate from failures and exclude unsaved counts', () => {
  const entries = [{id:'1',sync_status:'pending',photoId:'photo'}, {id:'2',sync_status:'failed',photoId:'photo'},
    {id:'3',sync_status:'pending',guest_claim_required:true}, {id:'4',sync_status:'pending',preapproval_review_required:true},
    {id:'5',sync_status:'pending'}, {id:'6',sync_status:'local_only',cloud_source:true}];
  const durable = e => e.id !== '5';
  const counts = sync.summary(entries,{durable});
  const values = Object.fromEntries(more.snapshot({entries:entries.filter(durable),counts,online:false,photoTransport:false}));
  assert.equal(values['Pending inspection sync'],1);
  assert.equal(values['Failed inspection sync'],1);
  assert.equal(values['Review-needed inspections'],2);
  assert.equal(values['Unsaved inspections'],1);
  assert.equal(values['Local photo references'],1);
  assert.equal(values['Verified local photo bytes'],'Not checked');
  assert.equal(values.Connection,'Offline');
  assert.equal(values['Photo transport'],'Disabled');
  assert.equal(Object.fromEntries(more.snapshot({}))['Photo transport'],'Unknown');
});
test('only acknowledged local submissions supply sync time; missing timestamps stay accurate', () => {
  const read = entries => Object.fromEntries(more.snapshot({entries}));
  const key = 'Last successful inspection sync (device records)';
  assert.equal(read([{id:'1',remote_id:'wrong',sync_status:'synced',synced_at:'2026-10-06T00:00:00Z'}])[key],'Never synced');
  assert.equal(read([{id:'1',remote_id:'1',sync_status:'synced'}])[key],'Not available');
  assert.notEqual(read([{id:'1',remote_id:'1',sync_status:'synced',synced_at:'2026-10-06T00:00:00Z'}])[key],'Never synced');
});
test('profile presentation exposes supported fields without identity keys or secrets', () => {
  const rows = more.profile({auth:{mode:'approved',email:'synthetic@example.invalid',userId:'private-id',token:'secret',cloudVerified:true,
    profile:{full_name:'Inspector',team:'Roadway',role:'inspector',approved:true}}});
  assert.equal(Object.fromEntries(rows)['Display name'],'Inspector');
  assert.equal(Object.fromEntries(rows)['Assigned team'],'Roadway');
  assert.doesNotMatch(JSON.stringify(rows),/private-id|secret/);
  assert.equal(Object.fromEntries(more.profile({auth:{mode:'guest'}}))['Account state'],'Guest / Local Mode');
});
test('existing settings controls remain single instances and new assets are cached', () => {
  const html = fs.readFileSync('index.html','utf8'), sw = fs.readFileSync('sw.js','utf8');
  for (const id of ['calib-reload','ramp-reload','dataset-drawer','theme-toggle','inspector-input','auth-verify-btn','auth-signout-btn','auth-guest-signin-btn','settings-accuracy','storage-status']) {
    assert.equal(html.split(`id="${id}"`).length-1,1,id);
  }
  assert.match(sw,new RegExp(`CACHE_VERSION = '${more.BUILD}'`));
  for (const asset of ['more.css','more.js']) assert.ok(sw.includes(`'./${asset}'`));
});
