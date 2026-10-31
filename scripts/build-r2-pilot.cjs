// Isolated phone QA package only. Does not publish or change production flags.
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),source=path.join(root,'output/cloudflare-pages'),out=path.join(root,'output/r2-phone-pilot');
cp.execFileSync(process.execPath,[path.join(root,'scripts/build-cloudflare.cjs')],{cwd:root,stdio:'inherit'});
const host='spotit-photo-pilot.pages.dev';
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.relative(source,path.join(dir,e.name))]);
const deviceFiles=['device-test.html','device-test.js'];
const files=[...walk(source),...deviceFiles];
if(fs.existsSync(out)){
 const inspect=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?inspect(path.join(dir,e.name)):[path.relative(out,path.join(dir,e.name))]);
 for(const f of inspect(out))if(!files.includes(f))throw Error('Unexpected pilot output; preserve and inspect: '+f);
}
for(const f of files){
 const target=path.join(out,f);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(deviceFiles.includes(f)?path.join(root,'pilot'):source,f),target);
}
const transport=path.join(out,'src/r2-photos.js');
const transportSource=fs.readFileSync(transport,'utf8');
const productionEndpoint='https://spotit-photo-api.mmatriano19.workers.dev';
if(transportSource.split(productionEndpoint).length!==2)throw Error('Unexpected production endpoint');
fs.writeFileSync(transport,transportSource.replace(productionEndpoint,'https://spotit-photo-api-test.mmatriano19.workers.dev'));
const index=path.join(out,'index.html');let html=fs.readFileSync(index,'utf8');
const flag='const R2_PHOTO_PILOT_ENABLED = true;';
if(html.split(flag).length!==2)throw Error('Expected exactly one R2 flag');
html=html.replace(flag,'const R2_PHOTO_PILOT_ENABLED = true;');
// Remove the document before any app scripts run on an unexpected deployment.
html=html.replace('<head>',`<head><script>if(location.hostname!==${JSON.stringify(host)}){document.open();document.write('<h1>R2 phone pilot: incorrect hostname</h1>');document.close();throw Error('Incorrect pilot host');}</script>`);
html=html.replace('<title>SPOT IT — Road Inspection Log</title>','<title>SPOT IT — R2 Phone Pilot</title>');
html=html.replace('<body>','<body><div role="status" style="padding:10px;background:#ffbf00;color:#111;font:600 14px system-ui">R2 PHONE PILOT · Test photo storage. Inspection sync still uses your actual account. Use valid inspections only.</div>');
fs.writeFileSync(index,html);
const sw=path.join(out,'sw.js');fs.writeFileSync(sw,fs.readFileSync(sw,'utf8').replace(/const CACHE_VERSION = '[^']+';/,"const CACHE_VERSION = 'device-test-v2';").replaceAll('spotit-shell-','spotit-r2-phone-pilot-shell-').replace('const APP_SHELL = [',"const APP_SHELL = [\n  './device-test.html', './device-test.js',"));
const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8'));manifest.name='SPOT IT R2 Phone Pilot';manifest.short_name='SPOT IT Pilot';fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
if(!fs.existsSync(path.join(out,'src/r2-photos.js')))throw Error('Missing pilot transport');
if(!html.includes('R2 PHONE PILOT'))throw Error('Pilot banner missing');
console.log('Prepared '+out+' for https://'+host+'. Not deployed. Test Worker exact-origin approval is still required.');
