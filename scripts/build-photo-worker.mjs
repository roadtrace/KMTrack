// Single-file bundle for Cloudflare's dashboard editor; no dependencies/secrets.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import PILOT_PAGE from '../workers/photo-api/pilot-page.mjs';
const source=await readFile(new URL('../workers/photo-api/worker.mjs',import.meta.url),'utf8');
const marker="import PILOT_PAGE from './pilot-page.mjs';";
if(!source.includes(marker))throw Error('Worker import marker missing');
const output=new URL('../output/photo-api/',import.meta.url);await mkdir(output,{recursive:true});
await writeFile(new URL('worker.mjs',output),source.replace(marker,'const PILOT_PAGE = '+JSON.stringify(PILOT_PAGE)+';'));
await writeFile(new URL('production.mjs',output),source.replace(marker,"const PILOT_PAGE = ''; ").replace('export default createWorker();',"export default createWorker(fetch,'production');"));
console.log('Single-file test Worker built at output/photo-api/worker.mjs; no deployment performed.');
