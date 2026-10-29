// Compare historical source while allowing only the repository path migration.
const cp=require('node:child_process'),paths=require('../fixtures/layout-paths.json');
function relocate(text){
 const imports=[];text=text.replace(/require\(['"][^'"]+['"]\)/g,m=>{imports.push(m);return '__SIBLING_IMPORT_'+(imports.length-1)+'__';});
 for(const [from,to] of Object.entries(paths).sort((a,b)=>b[0].length-a[0].length)){
  const escaped=from.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  text=text.replace(new RegExp('([\'"`])(?:\\./)?'+escaped+'\\1','g'),(m,q)=>q+(m.startsWith(q+'./')?'./':'')+to+q);
 }
 return text.replace(/__SIBLING_IMPORT_(\d+)__/g,(m,i)=>imports[i]);
}
function source(file){
 const run=path=>cp.execFileSync('git',['show','HEAD:'+path],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 let text;try{text=run(file);}catch(error){const old=Object.keys(paths).find(key=>paths[key]===file);if(!old)throw error;text=run(old);}
 if(file.endsWith('.css'))return text.replaceAll('\r\n','\n').replaceAll("url('fonts/","url('../public/fonts/");
 return relocate(text.replaceAll('\r\n','\n'));
}
module.exports={source,relocate};
