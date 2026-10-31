/* Isolated device QA: mirrors an existing reference locally; never submits inspections. */
(async function(){
 'use strict';
 if(location.hostname!=='spotit-photo-pilot.pages.dev'){document.body.textContent='Incorrect test hostname';return;}
 const el=id=>document.getElementById(id),say=s=>el('status').textContent=s;
 const config=SPOTITAuthConfig,nativeFetch=fetch.bind(window);
 // The account client can authenticate and read, never mutate database/storage.
 const readOnlyFetch=(url,options={})=>{
  const u=new URL(typeof url==='string'?url:url.url),method=(options.method||url?.method||'GET').toUpperCase();
  if(u.origin!==config.url||(!u.pathname.startsWith('/auth/v1/')&&!(method==='GET'&&u.pathname.startsWith('/rest/v1/'))))return Promise.reject(Error('Inspection writes disabled in device test'));
  return nativeFetch(url,options);
 };
 const client=supabase.createClient(config.url,config.publishableKey,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:SPOTITAuth.SESSION_KEY},
  global:{fetch:readOnlyFetch}});
 let account=null,context=null,entry=null,busy=false,generation=0,previewURL=null;
 const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('spotit-r2-device-test-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('objects');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
 const storage=(key,value,write=false)=>new Promise((resolve,reject)=>{const tx=db.transaction('objects',write?'readwrite':'readonly'),req=write?tx.objectStore('objects').put(value,key):tx.objectStore('objects').get(key);let result;req.onsuccess=()=>{result=req.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Storage aborted'));});
 const stateKey=()=>account?'draft:'+account:null;
 const persist=()=>{if(!account||!entry)throw Error('No local reference');localStorage.setItem('spotit-r2-device-draft:'+account,JSON.stringify(entry));return true;};
 const durable=e=>!!account&&localStorage.getItem('spotit-r2-device-draft:'+account)===JSON.stringify(e);
 async function showLocal(){if(previewURL)URL.revokeObjectURL(previewURL);const raw=entry?.photoId&&await storage(entry.photoId+':raw');el('local').hidden=!raw;if(raw){previewURL=URL.createObjectURL(raw);el('local').src=previewURL;}el('saved').textContent=raw?'Photo saved locally. '+(entry.r2_photo?.status||'Not uploaded'):'No local photo';el('upload').disabled=!raw||!context;el('view').disabled=!context;}
 async function verify(){
  const expected=account,g=generation;const user=await client.auth.getUser();if(user.error||user.data.user?.id!==expected)throw Error('Sign in to the same pilot account again');
  const p=await client.from('profiles').select('id,approved,role,team').eq('id',expected).single();if(g!==generation||account!==expected)throw Error('Account changed');
  if(p.error||!p.data.approved||!['inspector','supervisor'].includes(p.data.role)||!p.data.team)throw Error('Approved inspector or supervisor required');
  context={mode:'approved',cloudVerified:true,canUseLocal:true,userId:expected,workspaceUserId:expected,profile:p.data,verifiedAt:Date.now(),scopeGeneration:g};
 }
 const controller=SPOTITR2Photos.createController({enabled:true,client,context:()=>context,key:stateKey,verify,
  lock:(_,fn)=>navigator.locks?navigator.locks.request('spotit-r2-device-test',fn):fn(),
  isCurrent:e=>e===entry,durable,read:k=>storage(k),add:(k,v)=>storage(k,v,true),
  save:(e,patch)=>{if(e!==entry)return false;Object.assign(e,patch);return persist();}});
 async function run(fn,refresh=true){if(busy)return;busy=true;el('connect').disabled=true;el('camera').disabled=true;el('reference').disabled=true;el('upload').disabled=true;el('view').disabled=true;try{await fn();}catch(e){say(e.message);}finally{busy=false;el('connect').disabled=false;el('camera').disabled=!entry;el('reference').disabled=!account;if(refresh)await showLocal();}}
 async function restore(){const session=await client.auth.getSession();if(session.error||!session.data.session){say('Sign in on the pilot home page first.');return false;}account=session.data.session.user.id;const saved=localStorage.getItem('spotit-r2-device-draft:'+account);entry=saved?JSON.parse(saved):null;await showLocal();return true;}
 el('connect').onclick=()=>run(async()=>{
  say('Connecting to your signed-in account…');
  if(!await restore())return;await verify();const g=generation;
  const r=await client.from('inspections').select('id,user_id,team,defect_type,inspected_at').eq('user_id',account).eq('team',context.profile.team).order('inspected_at',{ascending:false}).limit(50);
  if(r.error)throw Error('Could not read your inspection references');if(g!==generation)throw Error('Account changed');
  el('reference').replaceChildren(new Option('Choose an existing inspection',''));
  for(const row of r.data){const option=new Option((row.defect_type||'Inspection')+' · '+new Date(row.inspected_at).toLocaleString()+' · '+row.id.slice(0,8),row.id);option.dataset.team=row.team;el('reference').add(option);}
  if(entry&&r.data.some(r=>r.id===entry.id))el('reference').value=entry.id;
  say('Choose an existing inspection, then take a test photo. No inspection will be created or edited.');
 });
 el('reference').onchange=()=>run(async()=>{const id=el('reference').value;if(!id){entry=null;return;}const option=el('reference').selectedOptions[0];if(entry?.id!==id){entry={id,remote_id:id,user_id:account,team:option.dataset.team,sync_status:'synced'};persist();}say('Existing inspection selected as test-photo reference.');});
 el('camera').onchange=()=>run(async()=>{const file=el('camera').files[0];if(!file||!entry)return;const g=generation,selected=entry;if(file.size>30*1024*1024)throw Error('Choose a photo smaller than 30 MB');const encoded=await SPOTITPhotoUpload.encode(file,globalThis,1600);if(g!==generation||selected!==entry)throw Error('Account or reference changed');const id='device-test:'+crypto.randomUUID();await storage(id+':raw',file,true);await storage(id,encoded.blob,true);if(g!==generation||selected!==entry)throw Error('Account changed');entry.photoId=id;delete entry.r2_photo;persist();el('camera').value='';say('Saved on this phone. Enable airplane mode and reopen this exact page.');});
 el('upload').onclick=()=>run(async()=>{if(!entry?.photoId)throw Error('Take a test photo first');if(!confirm('Upload this test photo against the selected existing inspection in TEST R2 storage? Inspection details and production photos stay unchanged.'))return;const result=await controller.dispatch(entry);say(result.status==='synced'?'PASS: test photo uploaded and verified. Original remains local.':result.reason||result.status);});
 el('view').onclick=()=>run(async()=>{await verify();const selected=entry,g=generation;const api=SPOTITR2Photos.createApi({enabled:true,client,context:()=>context,guard:()=>{if(g!==generation||selected!==entry)throw Error('Account changed');}});const blob=await api.view(entry.id);if(!blob)throw Error('No submitted test photo');if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(blob);el('local').src=previewURL;el('local').hidden=false;say('PASS: private test photo downloaded.');},false);
 client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||account&&session?.user.id!==account){generation++;account=null;context=null;entry=null;if(previewURL)URL.revokeObjectURL(previewURL);el('local').hidden=true;el('camera').disabled=true;el('upload').disabled=true;el('view').disabled=true;say('Account changed. Connect again.');}});
 await restore();if(entry)el('camera').disabled=false;
 if('serviceWorker'in navigator){await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;}
})().catch(e=>{document.getElementById('status').textContent=e.message;});
