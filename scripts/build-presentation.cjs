'use strict';
// Produces a separate app, never uploads it or changes hosting.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output','presentation-pages');
cp.execFileSync(process.execPath,[path.join(__dirname,'verify-layout.cjs')],{cwd:root,stdio:'inherit'});
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8'),shell=sw.match(/const APP_SHELL = \[([\s\S]*?)\];/)[1];
const files=new Set(['index.html','manifest.json','public/calibration.json']);
for(const m of shell.matchAll(/'\.\/([^']+)'/g))files.add(m[1]);
for(const file of ['sw.js','src/auth-config.js','public/vendor/supabase/supabase-js-2.117.1.umd.js','src/presentation-launcher.js'])files.delete(file);
for(const file of ['presentation/bootstrap.js','presentation/runtime.js','presentation/demo.css','presentation/vendor/qrcodegen.js','presentation/vendor/NOTICE.md'])files.add(file);
for(const dir of ['public/fonts','public/vendor/maptiler'])for(const f of fs.readdirSync(path.join(root,dir)))if(/LICENSE|NOTICE/.test(f))files.add(dir+'/'+f);
const allowed=new Set([...files,'_headers']);
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.relative(out,path.join(dir,e.name)).replaceAll('\\','/')]);}
if(fs.existsSync(out))for(const file of walk(out))if(!allowed.has(file))throw Error('Unexpected file in demo output; preserve and inspect: '+file);
for(const file of files){const target=path.resolve(out,file),source=path.resolve(root,file);if(!target.startsWith(out+path.sep)||!source.startsWith(root+path.sep)||fs.lstatSync(source).isSymbolicLink())throw Error('Invalid app asset');fs.mkdirSync(path.dirname(target),{recursive:true});let bytes=fs.readFileSync(source);
 if(file==='index.html'){
  let s=bytes.toString();s=s.replace('<head>','<head>\n<script src="presentation/bootstrap.js"></script>\n<link rel="stylesheet" href="presentation/demo.css">');
  s=s.replace(/<script src="(?:\.\/)?(?:src\/auth-config\.js|src\/presentation-launcher\.js|public\/vendor\/supabase\/supabase-js-2\.117\.1\.umd\.js)"><\/script>/g,'');
  s=s.replace(/<title>[^<]+<\/title>/,'<title>SPOT IT Presentation - Simulated</title>');
  s=s.replace('</body>','<script src="presentation/vendor/qrcodegen.js"></script>\n<script src="presentation/runtime.js"></script>\n</body>');bytes=Buffer.from(s);
 }
 if(file==='manifest.json'){const m=JSON.parse(bytes);m.name='SPOT IT Presentation';m.short_name='SPOT IT Demo';bytes=Buffer.from(JSON.stringify(m,null,2));}
 if(file==='src/map-config.js')bytes=Buffer.from('(function(root){const c={apiKey:"",styleUrl:"",sdkCssPath:"public/vendor/maptiler/maptiler-sdk.css",sdkPath:"public/vendor/maptiler/maptiler-sdk.umd.min.js",leafletPluginPath:"public/vendor/maptiler/leaflet-maptilersdk.js"};root.SPOTITMapConfig=c;})(globalThis);');
 fs.writeFileSync(target,bytes);
}
const csp="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.basemaps.cartocdn.com; img-src 'self' data: blob: https://*.basemaps.cartocdn.com; font-src 'self'; worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
fs.writeFileSync(path.join(out,'_headers'),'/*\n  Cache-Control: no-store\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: geolocation=(), camera=(), microphone=()\n  Content-Security-Policy: '+csp+'\n');
const html=fs.readFileSync(path.join(out,'index.html'),'utf8');
if(/<script[^>]+(?:auth-config|supabase-js)/.test(html))throw Error('Production auth script included');
console.log('Separate presentation build: '+out+' ('+allowed.size+' files). No deployment performed.');
module.exports={out};
