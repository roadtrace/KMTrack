const test=require('node:test');const assert=require('node:assert/strict');const ui=require('../src/log-register');
test('every warning condition provides an explanation and recovery guidance',()=>{
 for(const [entry,durable,phrase]of [[{},false,'Export a backup'],[{record_actions:[{error:'conflict'}]},true,'Reload saved inspection'],[{r2_photo:{status:'review'}},true,'Upload photo'],[{guest_claim_required:true},true,'Guest inspections require claim'],[{preapproval_review_required:true},true,'Review inspection'],[{submission_review_required:true},true,'Check sync'],[{sync_status:'needs_review'},true,'Check sync'],[{sync_outcome_unknown:true},true,'Check sync']])assert.ok(ui.reviewMessage(entry,durable).includes(phrase));
 assert.equal(ui.reviewMessage({sync_status:'synced'}),'');
});
test('warning guidance does not leak transport errors or alter inspection state',()=>{const entry={r2_photo:{status:'review',error:'secret path'}},before=JSON.stringify(entry);assert.ok(!ui.reviewMessage(entry).includes('secret path'));assert.equal(JSON.stringify(entry),before);});
