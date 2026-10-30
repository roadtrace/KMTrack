const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function check(url,base='index.html'){
 if(/^(?:[a-z]+:|#|\/\/)/i.test(url)||!url)return;
 const target=decodeURIComponent(new URL(url,'https://example.invalid/KMTrack/'+base).pathname).replace(/^\/KMTrack\//,'');
 if(!fs.existsSync(path.join(root,target)))throw Error('Missing '+url+' referenced by '+base);
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const m of html.matchAll(/(?:src|href)="([^"?#]+)"/g))check(m[1]);
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8'),shell=sw.match(/const APP_SHELL = \[([\s\S]*?)\];/)[1];
for(const m of shell.matchAll(/'([^']+)'/g))check(m[1],'sw.js');
for(const folder of ['src','public/vendor']){
 const walk=d=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name]);
 for(const f of walk(folder)){
  const text=fs.readFileSync(path.join(root,f),'utf8');
  if(f.startsWith('src/')&&f.endsWith('.css'))for(const m of text.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g))check(m[1],f);
  if(f==='src/stationing-review-worker.js'){
   for(const m of text.matchAll(/fetch\('([^']+)'/g))check(m[1],f);
   const imports=text.match(/importScripts\(([^)]+)\)/)[1];for(const m of imports.matchAll(/'([^']+)'/g))check(m[1],f);
  }
 }
}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
if(manifest.start_url!=='./index.html'||manifest.scope!=='./')throw Error('PWA identity changed');
for(const icon of manifest.icons)check(icon.src,'manifest.json');
for(const [file,expected]of [['network-stop-context.json','c72fe1cd763ed1b20337a7f22921f851827d32d0b2f8ae87956ab8ddf58b2789'],['stationing-reconstruction-evidence-user-edits-20261020.json','ba47b87ae058cca413bb7db2f6ddedeefbb4779893e990158e6f290fe99bb9fd']])if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'public',file))).digest('hex')!==expected)throw Error('GIS bytes changed');
console.log('Layout, offline shell, CSS/worker URLs, PWA scope and GIS hashes verified.');
