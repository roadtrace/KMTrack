const cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const tests=fs.readdirSync(path.join(root,'tests')).filter(f=>/\.test\.(?:js|mjs)$/.test(f)).map(f=>'tests/'+f);
const result=cp.spawnSync(process.execPath,['--test',...tests,...process.argv.slice(2)],{cwd:root,stdio:'inherit'});
process.exitCode=result.status??1;
