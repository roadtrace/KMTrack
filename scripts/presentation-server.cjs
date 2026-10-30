'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {out}=require('./build-presentation.cjs');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.geojson':'application/geo+json','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'};
function createServer(){return http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Permissions-Policy','geolocation=(), camera=(), microphone=()');
  const headers=fs.readFileSync(path.join(out,'_headers'),'utf8');res.setHeader('Content-Security-Policy',headers.match(/Content-Security-Policy: (.*)/)[1]);
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html',file=path.resolve(out,name);if(!file.startsWith(out+path.sep)||name==='_headers'||fs.lstatSync(file).isSymbolicLink())throw Error();const data=fs.readFileSync(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain','Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);}catch(_){res.writeHead(404);res.end('Presentation asset not found');}
});}
if(require.main===module){const port=Number(process.argv[2]||8790);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');const server=createServer();server.listen(port,'127.0.0.1',()=>console.log('Presentation preview: http://127.0.0.1:'+port));for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());}
module.exports={createServer};
