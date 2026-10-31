const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('All dates clears both endpoints, restores the range and isolates My/Team ranges',()=>{
 const html=fs.readFileSync('index.html','utf8'),start=html.indexOf('    const mapDateRanges={};'),end=html.indexOf("    for (const id of ['map-entry-from', 'map-entry-to'])",start);
 let click;const from={value:'2026-09-01'},to={value:'2026-09-30'},c={mapRecordScope:'my',Intl,Date,updateMapEntries(){},document:{getElementById:id=>id==='map-entry-from'?from:id==='map-entry-to'?to:{addEventListener:(name,fn)=>{click=fn;}}}};
 vm.createContext(c);vm.runInContext(html.slice(start,end),c);click();assert.equal(from.value,'');assert.equal(to.value,'');click();assert.equal(from.value,'2026-09-01');assert.equal(to.value,'2026-09-30');click();c.mapRecordScope='team';click();assert.match(from.value,/^\d{4}-\d{2}-\d{2}$/);assert.equal(from.value,to.value);assert.notEqual(from.value,'2026-09-01');
});
