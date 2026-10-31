const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('photo overlay protects the editing sheet and restores it unchanged when closed',()=>{
 const source=fs.readFileSync('src/photo-viewer.js','utf8'),start=source.indexOf('  let sheetWasInert='),end=source.indexOf('  image.addEventListener',start);let shown=true,sync,focused=0;
 const editor={inert:false,draft:'unsaved',classList:{contains:()=>true}},photoModal={classList:{contains:()=>shown}};
 vm.runInNewContext(source.slice(start,end),{editor,photoModal,thumb:{focus(){focused++;}},MutationObserver:class{constructor(fn){sync=fn;}observe(){}}});
 sync();assert.equal(editor.inert,true);shown=false;sync();assert.equal(editor.inert,false);assert.equal(editor.draft,'unsaved');assert.equal(focused,1);
});
