const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
test('private thumbnails bound concurrent reads and ignore results after stop',async()=>{
 let observe,active=0,peak=0,closed=0,painted=0;const releases=[];
 const cards=Array.from({length:6},(_,id)=>({id,isConnected:true,dataset:{},querySelector:()=>({replaceChildren(){painted++;}})}));
 const context={module:{exports:{}},IntersectionObserver:class{constructor(cb){observe=cb;}observe(){}unobserve(){}disconnect(){}},MutationObserver:class{observe(){}disconnect(){}},document:{createElement:()=>({})}};
 vm.runInNewContext(fs.readFileSync('src/private-thumbnails.js','utf8'),context);
 const controller=context.module.exports.createController({root:{querySelectorAll:()=>cards},item:card=>({id:card.id}),scope:()=> 'account',viewer:()=>({open:()=>{active++;peak=Math.max(peak,active);return new Promise(resolve=>releases.push(()=>{active--;resolve({url:'blob:test'});}));},close(){closed++;}})});
 observe(cards.map(target=>({target,isIntersecting:true})));assert.equal(peak,3);controller.stop();releases.forEach(resolve=>resolve());await new Promise(resolve=>setImmediate(resolve));assert.equal(painted,0);assert.ok(closed>=3);assert.equal(releases.length,3);
});
