// App-only static output. Never deploys, edits hosting settings, or copies local records.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output','cloudflare-pages');
cp.execFileSync(process.execPath,[path.join(root,'scripts','verify-layout.cjs')],{cwd:root,stdio:'inherit'});
const shell=fs.readFileSync(path.join(root,'sw.js'),'utf8').match(/const APP_SHELL = \[([\s\S]*?)\];/)[1];
const files=new Set(['index.html','manifest.json','sw.js','public/calibration.json']);
for(const match of shell.matchAll(/'\.\/([^']+)'/g))files.add(match[1]);
const sandbox={module:{exports:{}},globalThis:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'src/map-config.js'),'utf8'),sandbox);
for(const name of ['sdkCssPath','sdkPath','leafletPluginPath'])files.add(sandbox.module.exports[name]);
for(const name of ['public/fonts','public/vendor/maptiler'])for(const entry of fs.readdirSync(path.join(root,name)))if(/(?:LICENSE|NOTICE)/i.test(entry))files.add(name+'/'+entry);
const headers='/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n\n/sw.js\n  Cache-Control: no-cache\n\n/index.html\n  Cache-Control: no-cache\n\n/\n  Cache-Control: no-cache\n';
const allowed=new Set([...files,'_headers']);
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
 const file=path.join(dir,entry.name);if(fs.lstatSync(file).isSymbolicLink())throw Error('Symlink in build output');
 return entry.isDirectory()?walk(file):[path.relative(output,file).split(path.sep).join('/')];
});}
if(fs.existsSync(output))for(const file of walk(output))if(!allowed.has(file))throw Error('Unexpected build file; preserve and inspect: '+file);
for(const file of files){
 if(!/^(?:src\/[^/]+\.(?:js|css)|public\/|index\.html$|manifest\.json$|sw\.js$)/.test(file)||file.includes('..')||file.endsWith('.test.js'))throw Error('Non-app path '+file);
 const source=path.resolve(root,file),target=path.resolve(output,file);
 if(!source.startsWith(root+path.sep)||!target.startsWith(output+path.sep)||fs.lstatSync(source).isSymbolicLink())throw Error('Invalid build path');
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
 if(!fs.readFileSync(source).equals(fs.readFileSync(target)))throw Error('Copy mismatch '+file);
}
fs.writeFileSync(path.join(output,'_headers'),headers);
if(walk(output).length!==allowed.size)throw Error('Build allowlist mismatch');
console.log('Cloudflare app-only output: '+output+' ('+allowed.size+' files). No deployment performed.');
