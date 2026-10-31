// Optional isolated PostgreSQL runtime; never uses a live URL or credentials.
// PGLITE_MODULE_PATH points at a temporary @electric-sql/pglite installation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const runtime=process.env.PGLITE_MODULE_PATH;
test('R2 migration, RPC ACLs, retries, replacement conflicts and deletion cleanup', {skip:!runtime}, async t=>{
 const {PGlite}=await import(pathToFileURL(runtime).href),db=new PGlite();
 const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',peer='cccccccc-cccc-4ccc-8ccc-cccccccccccc',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222',third='33333333-3333-4333-8333-333333333333';
 const sql=f=>readFile(new URL('../docs/supabase/migrations/'+f,import.meta.url),'utf8');
 try{
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.profiles(id uuid primary key,full_name text,role text,approved boolean,team text);
 create table public.inspections(id uuid primary key,user_id uuid,team text,photo_path text,photo_filename text);
 grant usage on schema public,auth to authenticated; grant select on profiles,inspections to authenticated;
 insert into profiles values('${owner}','Owner','inspector',true,'roadway'),('${peer}','Peer','inspector',true,'roadway');
 insert into inspections values('${id}','${owner}','roadway',null,null);`);
 // Include the real permanent-deletion RPC and its receipts, not a duplicate test implementation.
 const deletion=await sql('20261030_team_log_and_deletion.sql');
 await db.exec(deletion.split('create or replace function public.team_inspection_summary()')[0]+'commit;');
 await db.exec(await sql('20261030_r2_photo_metadata.sql'));
 await db.exec(await sql('20261030_r2_photo_metadata_verify.sql'));
 await db.exec(await sql('20261030_r2_photo_operations.sql'));
 await db.exec(await sql('20261030_r2_photo_operations_verify.sql'));
 const args=(upload,patch={})=>({inspection_id:id,upload_id:upload,environment:'test',sha256:'a'.repeat(64),byte_size:100,width:10,height:10,
   thumb_sha256:'b'.repeat(64),thumb_byte_size:80,thumb_width:4,thumb_height:4,expected_current_id:null,...patch});
 const command=async(op,a,actor=owner)=>(await db.query('select public.r2_photo_command($1,$2,$3) as data',[actor,op,a])).rows[0].data;
 await t.test('only server role can invoke state-changing RPCs',async()=>{
   for(const role of ['anon','authenticated']){
     await db.exec('set role '+role);
     try{await assert.rejects(command('reserve',args(first)),/permission denied/);}finally{await db.exec('reset role');}
   }
   await db.exec('set role service_role');
   try{assert.equal((await command('reserve',args(first))).id,first);}finally{await db.exec('reset role');}
 });
 await t.test('idempotent reserve rejects identity/hash/role changes',async()=>{
   assert.equal((await command('reserve',args(first))).id,first);
   await assert.rejects(command('reserve',args(first,{sha256:'c'.repeat(64)})),/Immutable payload conflict/);
   await assert.rejects(command('reserve',args(second),peer),/Own inspection required/);
   await db.query('update profiles set approved=false where id=$1',[owner]);
   await assert.rejects(command('finalize',args(first)),/Approved account required/);
   await db.query('update profiles set approved=true where id=$1',[owner]);
 });
 await t.test('first finalize is idempotent and stale replacement cannot win',async()=>{
   await command('reserve',args(second)); // both expected an empty pointer
   assert.equal((await command('finalize',args(first))).state,'ready');
   assert.equal((await command('finalize',args(first))).id,first);
   await assert.rejects(command('finalize',args(second)),/Photo changed/);
   assert.equal((await command('current',args(first),peer)).id,first);
   await command('abandon',args(second));
   await command('reserve',args(third,{expected_current_id:first}));
   assert.equal((await command('finalize',args(third))).id,third);
   assert.equal((await command('status',args(first))).state,'superseded');
   assert.equal((await db.query('select count(*)::int as n from inspection_photo_cleanup')).rows[0].n,4);
   await db.query('delete from inspection_photo_uploads where id=$1',[second]);
   await assert.rejects(command('reserve',args(second)),/duplicate key/);
   await db.query('update inspections set photo_path=$1 where id=$2',['legacy/photo.jpg',id]);
   await assert.rejects(command('remove',args(third)),/Legacy photo still exists/);
   await db.query('update inspections set photo_path=null where id=$1',[id]);
   assert.equal((await command('remove',args(third))).state,'abandoned');
   assert.equal(await command('current',args(third)),null);
 });
 await t.test('current metadata hides test objects and no authenticated table writes exist',async()=>{
   await db.exec(`set request.jwt.claim.sub='${owner}';set role authenticated;`);
   try{assert.equal((await db.query('select * from inspection_photo_uploads')).rows.length,0);
     await assert.rejects(db.query('update inspection_photo_uploads set state=\'ready\''),/permission denied/);
   }finally{await db.exec('reset role');}
 });
 await t.test('real permanent deletion queues both images and cannot resurrect inspection',async()=>{
   await db.exec(`set request.jwt.claim.sub='${owner}';set role authenticated;`);
   try{await db.query('select delete_own_inspection($1)',[id]);}finally{await db.exec('reset role');}
   assert.equal((await db.query('select count(*)::int as n from inspection_photo_uploads')).rows[0].n,0);
   assert.equal((await db.query('select count(*)::int as n from inspection_photo_cleanup')).rows[0].n,6);
   await assert.rejects(db.query('insert into inspections(id,user_id,team) values($1,$2,$3)',[id,owner,'roadway']),/permanently deleted/);
   await assert.rejects(command('reserve',args(first)),/Inspection unavailable/);
 });
 await t.test('cleanup leases persist through missing-object retries and hide from clients',async()=>{
   await db.exec(`update inspection_photo_cleanup set not_before=now()-interval '1 minute'`);
   const run=async(operation,args)=>(await db.query('select r2_photo_cleanup($1,$2) as data',[operation,{bucket_name:'spotit-inspection-photos-test',...args}])).rows[0].data;
   const jobs=await run('claim',{});assert.equal(jobs.length,6);
   assert.equal((await run('claim',{})).length,0);
   await run('ack',{object_key:jobs[0].object_key,lease_id:jobs[0].lease_id,ok:true});
   assert.equal((await db.query('select count(*)::int as n from inspection_photo_cleanup')).rows[0].n,6);
   await db.exec('set role authenticated');
   try{await assert.rejects(run('claim',{}),/permission denied/);}finally{await db.exec('reset role');}
 });
 }finally{await db.close();}
});
