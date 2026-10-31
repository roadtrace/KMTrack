const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('browser script order supplies photo uploader dependencies before initialization',async()=>{
 const html=fs.readFileSync('index.html','utf8'),paths=[...html.matchAll(/<script src="\.\/(src\/(?:photo-upload-state|inspection-api|r2-photos)\.js)"><\/script>/g)].map(m=>m[1]);
 assert.equal(paths.length,3);let verified=0;const context=vm.createContext({});for(const path of paths)vm.runInContext(fs.readFileSync(path,'utf8'),context,{filename:path});
 const controller=context.SPOTITR2Photos.createController({enabled:true,lock:async(key,run)=>run(),context:()=>({}),key:()=> 'account',verify:async()=>{verified++;},isCurrent:()=>true,durable:()=>true});
 const result=await controller.dispatch({id:'bad-id',photoId:'photo'});assert.equal(verified,1);assert.equal(result.status,'held');assert.equal(result.reason,'invalid-uuid');
});
