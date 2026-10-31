const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const ui=require('../src/log-register');
test('register uses accessible Lucide cloud status icons',()=>{
 for(const [entry,path,label] of [[{id:'a',remote_id:'a',sync_status:'synced'},'m17 15-5.5','Inspection submitted'],[{sync_status:'needs_review'},'M12 12v4','Needs review'],[{sync_status:'pending'},'M17 22v-4','Waiting to submit']]){
  const html=ui.cardHTML(entry);assert.ok(html.includes(path));assert.ok(html.includes('aria-label="'+label+'"'));
 }
});
const source=fs.readFileSync('index.html','utf8');const code=source.slice(source.indexOf('    async function uploadR2Photo('),source.indexOf('    async function retryPhotoNow('));
function context(confirmed,status){const entry={id:'entry',r2_photo:{manifest:{upload_id:'upload'}}},calls=[];const c={editingMode:false,R2_PHOTO_PILOT_ENABLED:true,photoCloudController:{dispatch:async()=>{calls.push('dispatch');return {status,reason:'Unavailable'};}},entries:[entry],confirm:()=>confirmed,alert:message=>calls.push(message),localEntryDurable:()=>true,persistEntryChanges:(e,changes)=>{Object.assign(e,changes);calls.push('save');},renderLog:()=>calls.push('render')};vm.createContext(c);vm.runInContext(code,c);return {c,entry,calls};}
test('manual upload cancellation leaves the local photo and sync state untouched',async()=>{const {c,calls,entry}=context(false,'synced');await c.uploadR2Photo('entry',{});assert.deepEqual(calls,[]);assert.equal(entry.record_photo,undefined);});
test('manual upload marks photo complete only after guarded transport confirmation',async()=>{const {c,calls,entry}=context(true,'synced'),button={};await c.uploadR2Photo('entry',button);assert.equal(entry.record_photo.current_id,'upload');assert.equal(entry.photo_auto_sync,false);assert.equal(button.disabled,false);assert.deepEqual(calls,['dispatch','save','render']);});
test('held manual upload never marks a cloud photo as present',async()=>{const {c,entry,calls}=context(true,'held');await c.uploadR2Photo('entry',{});assert.equal(entry.record_photo,undefined);assert.ok(calls.includes('Unavailable'));});
test('editing blocks upload without starting transport',async()=>{const {c,calls}=context(true,'synced');c.editingMode=true;await c.uploadR2Photo('entry',{});assert.equal(calls.length,1);assert.match(calls[0],/Save or cancel/);});
