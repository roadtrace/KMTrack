const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
function store(){const data=new Map();return {get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(String(k))??null,setItem:(k,v)=>data.set(String(k),String(v)),removeItem:k=>data.delete(String(k)),clear:()=>data.clear()};}
function isolated(){const native=store(),session=store(),calls=[],geoCalls=[];native.setItem('real-record-sentinel','KEEP');function Anchor(){}Anchor.prototype.click=function(){};function XHR(){}XHR.prototype.open=(...args)=>calls.push(args);const c={URL,Map,Array,String,Promise,Error,structuredClone,queueMicrotask,localStorage:native,sessionStorage:session,indexedDB:{open:(...args)=>calls.push(args),deleteDatabase:(...args)=>calls.push(args)},navigator:{geolocation:{watchPosition:()=>geoCalls.push('native')},mediaDevices:{getUserMedia:()=>geoCalls.push('camera')}},location:{href:'https://demo.example.invalid/',origin:'https://demo.example.invalid'},fetch:async(...args)=>{calls.push(args);return {};},HTMLAnchorElement:Anchor,XMLHttpRequest:XHR,document:{addEventListener(){}}};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('presentation/bootstrap.js','utf8'),c);return {c,native,calls,geoCalls};}
test('presentation storage and reset cannot read or clear a field namespace',()=>{
 const {c,native,calls}=isolated();assert.equal(c.localStorage.getItem('real-record-sentinel'),null);c.localStorage.setItem('record','demo');assert.equal(native.getItem('record'),null);assert.equal(native.getItem('spotit-presentation-v1:record'),'demo');c.localStorage.clear();assert.equal(native.getItem('real-record-sentinel'),'KEEP');c.indexedDB.open('photos',1);assert.equal(calls.at(-1)[0],'spotit-presentation-v1:photos');
});
test('native GPS/camera and every backend or write transport remain blocked',async()=>{
 const {c,calls,geoCalls}=isolated();await assert.rejects(c.fetch('https://anything.supabase.co/rest/v1/inspections'));
 await assert.rejects(c.fetch('/records',{method:'POST'}));await assert.rejects(c.navigator.mediaDevices.getUserMedia({video:true}));
 assert.throws(()=>new c.WebSocket('wss://example.invalid'));assert.equal(c.navigator.sendBeacon('/records','data'),false);
 const xhr=new c.XMLHttpRequest();assert.throws(()=>xhr.open('POST','/records'));assert.throws(()=>xhr.open('GET','https://anything.supabase.co'));
 await c.fetch('/public/calibration.json');await c.fetch('https://a.basemaps.cartocdn.com/light_all/1/1/1.png');
 let position;c.navigator.geolocation.watchPosition(p=>position=p);c.SPOTITPresentation.emit({lat:15,lon:121});assert.equal(position.coords.latitude,15);assert.deepEqual(geoCalls,[]);assert.equal(calls.length,2);
});
test('separate build excludes production auth, server tools, account config and worker registration asset',()=>{
 cp.execFileSync(process.execPath,['scripts/build-presentation.cjs'],{stdio:'pipe'});const root='output/presentation-pages/';
 for(const file of ['src/auth-config.js','public/vendor/supabase/supabase-js-2.117.1.umd.js','sw.js','scripts/build-presentation.cjs','tests/presentation.test.js'])assert.equal(fs.existsSync(root+file),false,file);
 const html=fs.readFileSync(root+'index.html','utf8');assert(html.indexOf('presentation/bootstrap.js')<html.indexOf('src/auth.js'));assert(!/<script[^>]+(?:auth-config|supabase-js)/.test(html));
 assert.match(fs.readFileSync(root+'_headers','utf8'),/Permissions-Policy: geolocation=\(\), camera=\(\), microphone=\(\)/);
 assert.match(fs.readFileSync(root+'src/map-config.js','utf8'),/apiKey:""/);
 const original=cp.execFileSync('git',['show','HEAD:index.html'],{encoding:'utf8'}).replaceAll('\r\n','\n'),current=fs.readFileSync('index.html','utf8').replaceAll('\r\n','\n');
 for(const name of ['resolvedEntrySnapshot','resolveFreshLocation','logDefect','captureInspectionPhoto','syncNow']){const fn=s=>{const start=s.indexOf('    '+(name==='captureInspectionPhoto'||name==='syncNow'?'async ':'')+'function '+name+'(');assert(start>=0,name);return s.slice(start,s.indexOf('\n    }',start)+6);};assert.equal(fn(current),fn(original),name);}
});
test('vendored QR encoder is local and retains its MIT license',()=>{
 const source=fs.readFileSync('presentation/vendor/qrcodegen.js','utf8');assert.match(source,/MIT License/);const c={};vm.createContext(c);vm.runInContext(source,c);const qr=c.qrcodegen.QrCode.encodeText('https://demo.example.invalid/',c.qrcodegen.QrCode.Ecc.MEDIUM);assert(qr.size>=21);assert.equal(qr.getModule(0,0),true);assert.equal(qr.getModule(-1,-1),false);
});
