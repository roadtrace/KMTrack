'use strict';
// Local development launcher for the real app. Nothing is deployed or written by requests.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
function simulationBootstrap(){
  'use strict';
  const memory=()=>{const data=new Map();return {get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(String(k))??null,setItem:(k,v)=>data.set(String(k),String(v)),removeItem:k=>data.delete(String(k)),clear:()=>data.clear()};};
  Object.defineProperty(window,'localStorage',{value:memory()});
  Object.defineProperty(window,'sessionStorage',{value:memory()});
  Object.defineProperty(window,'indexedDB',{value:{open(){const request={};queueMicrotask(()=>request.onerror?.({target:{error:new Error('Photo storage disabled in local simulation')}}));return request;}}});
  Object.defineProperty(navigator,'serviceWorker',{value:{controller:null,register:()=>Promise.reject(new Error('Service workers disabled in local simulation')),addEventListener(){},ready:new Promise(()=>{})}});
  const fetchLocal=window.fetch.bind(window);
  window.fetch=(input,options={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.origin!==location.origin||(options.method||input?.method||'GET').toUpperCase()!=='GET')return Promise.reject(new Error('External/write transport blocked in local simulation'));return fetchLocal(input,options);};
  window.WebSocket=class{constructor(){throw Error('Transport blocked in local simulation');}};
  window.XMLHttpRequest=class{open(){throw Error('Transport blocked in local simulation');}};
  Object.defineProperty(navigator,'sendBeacon',{value:()=>false});
  let nextWatch=0,timer=null,route=[],position=null;
  const watchers=new Map();
  Object.defineProperty(navigator,'geolocation',{value:Object.freeze({watchPosition(success,error){const id=++nextWatch;watchers.set(id,{success,error});return id;},clearWatch:id=>watchers.delete(id),getCurrentPosition(success,error){if(position)queueMicrotask(()=>success(structuredClone(position)));else queueMicrotask(()=>error?.({code:2,message:'Choose a simulated scenario; native GPS blocked'}));}})});
  function stop(){if(timer!==null)clearInterval(timer);timer=null;}
  addEventListener('pagehide',stop);
  addEventListener('DOMContentLoaded',()=>{
    const bar=document.createElement('section');bar.setAttribute('aria-label','Local simulated GPS controls');bar.style.cssText='position:relative;z-index:2147483647;padding:10px;background:#fff1c2;color:#172d35;font:14px system-ui;border:2px solid #906300;';
    const title=document.createElement('strong');title.textContent='LOCAL TEST - SIMULATED GPS ONLY. Native location, external connections, persistent storage and service workers blocked. ';
    const status=document.createElement('span');status.id='local-simulation-status';status.setAttribute('role','status');status.textContent='Choose simulated movement. ';
    bar.append(title,status);
    function emit(point){position={timestamp:Date.now(),coords:{latitude:point.lat,longitude:point.lon,accuracy:point.accuracy??3,altitude:null,altitudeAccuracy:null,heading:null,speed:8}};for(const {success}of watchers.values())success(structuredClone(position));}
    async function start(reverse){stop();try{if(!route.length){const rows=await (await fetch('./public/calibration.json')).json();route=rows.filter(p=>p.e==='NLEX'&&p.b==='NB').sort((a,b)=>a.k-b.k);if(route.length<20)throw Error('Reference unavailable');}let step=0;const base=Math.floor(route.length/2);function tick(){const i=reverse?base+12-step:base+step;emit(route[i]);step++;status.textContent=(reverse?'SB':'NB')+' simulated reference movement: '+step+' fixes. ';if(step>=12)stop();}tick();timer=setInterval(tick,2000);}catch{status.textContent='Simulation unavailable - native GPS remains blocked.';}}
    async function geometryScenario(bound,kind){
      stop();try{
        const model=await (await fetch('./public/stationing-reconstruction-evidence-user-edits-20261020.json')).json();let fixes=[];
        const distance=(a,b)=>Math.hypot((a[0]-b[0])*111195*Math.cos(a[1]*Math.PI/180),(a[1]-b[1])*111195);
        if(kind==='interchange'){const r=model.interchanges[0],p=r.coordinates[Math.floor(r.coordinates.length/2)];fixes=Array.from({length:12},()=>({lon:p[0],lat:p[1],accuracy:3}));}
        else if(kind==='gate'){const g=model.gates.find(x=>x.kind==='BRANCH_MERGE_REVIEW_CONTEXT');fixes=Array.from({length:12},()=>({lon:g.coordinate[0],lat:g.coordinate[1],accuracy:3}));}
        else{
          for(const a of model.alignments.filter(a=>a.bound===bound)){
            const sizes=a.coordinates.slice(1).map((p,i)=>distance(a.coordinates[i],p)),total=sizes.reduce((a,b)=>a+b,0);if(total<300)continue;
            const sample=[];for(let i=0;i<12;i++){let offset=30+i*20,index=0;while(index<sizes.length-1&&offset>sizes[index]){offset-=sizes[index];index++;}const t=offset/sizes[index],p=a.coordinates[index],q=a.coordinates[index+1];sample.push({lon:p[0]+(q[0]-p[0])*t,lat:p[1]+(q[1]-p[1])*t,accuracy:kind==='ambiguous'?80:3});}
            if(sample.some(p=>model.gates.some(g=>distance([p.lon,p.lat],g.coordinate)<250)))continue;
            if(kind==='noise'){
              const target=sample[6];let nearest=null;
              for(const b of model.alignments.filter(b=>b.bound!==bound))for(let i=1;i<b.coordinates.length;i++){
                const a=b.coordinates[i-1],z=b.coordinates[i],scale=111195*Math.cos(target.lat*Math.PI/180),ax=(a[0]-target.lon)*scale,ay=(a[1]-target.lat)*111195,dx=(z[0]-a[0])*scale,dy=(z[1]-a[1])*111195,total=dx*dx+dy*dy;if(!total)continue;
                const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/total)),d=Math.hypot(ax+t*dx,ay+t*dy);
                if(!nearest||d<nearest.distance)nearest={distance:d,lon:a[0]+(z[0]-a[0])*t,lat:a[1]+(z[1]-a[1])*t,accuracy:3};
              }
              if(!nearest||nearest.distance<8||nearest.distance>75)continue;
              sample[6]=nearest; // Exactly one synthetic offset, never a real location.
            }
            fixes=sample;break;
          }
        }
        if(!fixes.length)throw Error('No eligible scenario');let i=0;
        function tick(){const fix=fixes[i++];emit(fix);status.textContent=(kind==='noise'?'Noise recovery':kind==='interchange'?'Interchange context':kind==='gate'?'Review gate':kind==='ambiguous'?'Ambiguous geometry':'QGIS '+bound)+' simulation: '+i+' fixes. ';if(i>=fixes.length)stop();}tick();timer=setInterval(tick,2000);
      }catch{status.textContent='Geometry simulation unavailable; native GPS remains blocked.';}
    }
    for(const [label,action]of [['Simulate NB',()=>start(false)],['Simulate SB',()=>start(true)],['QGIS NB',()=>geometryScenario('NB')],['QGIS SB',()=>geometryScenario('SB')],['Noise recovery',()=>geometryScenario('NB','noise')],['Ambiguous geometry',()=>geometryScenario('NB','ambiguous')],['Review gate',()=>geometryScenario('NB','gate')],['Interchange context',()=>geometryScenario('NB','interchange')],['Pause simulation',()=>{stop();status.textContent='Simulation paused. ';}]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.style.cssText='padding:8px;margin:4px;';button.addEventListener('click',action);bar.append(button);}
    document.body.prepend(bar);
  });
}
function createServer(){
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const sw=fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
  const shell=sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);if(!shell)throw Error('Missing app allowlist');
  const allowed=new Set(['index.html']);
  for(const m of shell[1].matchAll(/'\.\/([^']+)'/g))allowed.add(m[1]);
  for(const m of html.matchAll(/(?:src|href)="(?:\.\/)?([^"?#]+)"/g))if(!/^[a-z]+:/i.test(m[1])&&!m[1].startsWith('/'))allowed.add(m[1]);
  allowed.add('public/calibration.json');allowed.delete('sw.js');allowed.delete('b01-preview.js');
  const body=Buffer.from(html.replace('<head>','<head>\n<script>('+simulationBootstrap.toString()+')();</script>'));
  const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.geojson':'application/geo+json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
  const server=http.createServer((req,res)=>{
    const origin='http://127.0.0.1:'+server.address().port;
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Permissions-Policy','geolocation=(), camera=(), microphone=()');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self'; worker-src 'self'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'");
    function fail(code){res.writeHead(code);res.end('Local simulated app resource unavailable');}
    if(req.headers.host!==new URL(origin).host||(req.headers.origin&&req.headers.origin!==origin))return fail(403);
    if(!['GET','HEAD'].includes(req.method))return fail(405);
    try{const url=new URL(req.url,origin),name=decodeURIComponent(url.pathname).slice(1)||'index.html';if(!allowed.has(name))return fail(404);const filename=fs.realpathSync(path.resolve(ROOT,name));if(!filename.startsWith(fs.realpathSync(ROOT)+path.sep))return fail(403);const data=name==='index.html'?body:fs.readFileSync(filename);res.writeHead(200,{'Content-Type':MIME[path.extname(name)]||'application/octet-stream','Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);}catch{return fail(404);}
  });return server;
}
if(require.main===module){const port=Number(process.argv[2]||8787);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local port');const server=createServer();server.listen(port,'127.0.0.1',()=>console.log('KMTrack simulated app: http://127.0.0.1:'+port+'/#kmtrack-stationing-review-v1'));server.on('error',e=>{console.error(e.message);process.exitCode=1;});for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());}
module.exports={createServer,simulationBootstrap};
