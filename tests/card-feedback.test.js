const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const ui=require('../src/log-register');
const html=fs.readFileSync('index.html','utf8');
test('cards convey sync with an accessible icon and contain no actions or status pills',()=>{
 for(const [entry,label] of [[{sync_status:'synced',id:'a',remote_id:'a'},'Inspection submitted'],[{sync_status:'pending'},'Waiting to submit'],[{sync_status:'needs_review'},'Needs review'],[{photo_auto_sync:true},'Waiting to sync']]){
 const card=ui.cardHTML({type:'Potholes',bound:'NORTHBOUND VERY LONG',...entry});assert.ok(card.includes('aria-label="'+label+'"'));assert.match(card,/register-sync-icon/);assert.doesNotMatch(card,/<button|register-statuses|register-chevron/);assert.match(card,/register-bound/);
 }
});
test('inspection loading appears before network refresh and is invalidated on close',()=>{
 const start=html.indexOf('async function openEditModal('),end=html.indexOf('async function populateInspectionSheet(',start),source=html.slice(start,end);
 assert.ok(source.indexOf("classList.add('entry-loading')")>=0 && source.indexOf("classList.add('entry-loading')")<source.indexOf('await refreshOwnSnapshot'));
 assert.match(source,/generation!==editOpenGeneration/);assert.match(source,/aria-busy/);
});
test('Team map details have a read-only expandable compact summary',()=>{
 const start=html.indexOf('function openSubmittedDetail('),end=html.indexOf('function localEntryDurable(',start),source=html.slice(start,end);
 assert.match(source,/dialog.classList.add\('from-map','map-compact'\)/);assert.match(source,/expand.onclick=/);assert.match(source,/loading-feedback.*remove/);
 assert.doesNotMatch(source,/actions.append\(edit\)|appendSubmittedDelete/);
});
