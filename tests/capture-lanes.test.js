const test = require('node:test'), assert = require('node:assert/strict');
const lanes = require('../src/capture-lanes');
const fix = km => ({ready:true, expressway:'NLEX', km});
test('segments respect supplied boundaries and never classify other corridors or missing stations', () => {
  for (const [km,expected] of [[9.559,0],[9.56,1],[32.999,1],[33,2],[65.799,2],[65.8,3],[88.7,3],[88.701,0],[null,0],[NaN,0]]) {
    assert.equal(lanes.segment(km), expected);
  }
  const c = lanes.create();
  assert.equal(c.update({...fix(50),expressway:'SCTEX'}),'default');
  assert.equal(c.update(fix(50)),'2');
  assert.equal(c.update({...fix(70),ready:false}),'2');
});
test('boundary jitter holds the grid in either direction until 20 metres past the boundary', () => {
  const c = lanes.create();
  for (const [km,expected] of [[32.9,'1'],[33.005,'1'],[32.998,'1'],[33.021,'2'],[32.995,'2'],[32.979,'1'],[65.7,'2'],[65.805,'2'],[65.821,'3'],[65.795,'3'],[65.779,'2']]) {
    assert.equal(c.update(fix(km)), expected, String(km));
  }
});
test('manual mode wins over automatic interchange evidence and interaction freezes changes', () => {
  const c = lanes.create();
  assert.equal(c.update({...fix(20),interchange:true}),'interchange');
  assert.equal(c.update({...fix(20),interchange:true,mode:'mainline'}),'1');
  assert.equal(c.update({mode:'interchange',busy:true}),'1');
  assert.equal(c.update({mode:'interchange'}),'interchange');
  assert.equal(c.update({mode:'mainline'}),'default');
  assert.equal(c.update(fix(70)),'3');
  assert.equal(c.update({...fix(20),busy:true}),'3');
  assert.deepEqual(lanes.choices('interchange'),['Entry Ramp','Exit Ramp','Acce','Dece']);
  assert.deepEqual(lanes.choices('2'),['1','2','3']);
  assert.deepEqual(lanes.choices('3'),['1','2']);
});
