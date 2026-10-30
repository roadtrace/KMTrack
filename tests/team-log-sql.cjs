/* Optional isolated PostgreSQL verification. Test engine lives only in ignored output/. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.KMTRACK_SQL_TEST_ENGINE||path.resolve(__dirname,'../output/team-log-qa-pg/node_modules/@electric-sql/pglite'));
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',cross='cccccccc-cccc-4ccc-8ccc-cccccccccccc',pending='dddddddd-dddd-4ddd-8ddd-dddddddddddd',admin='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',supervisor='ffffffff-ffff-4fff-8fff-ffffffffffff',zero='11111111-1111-4111-8111-111111111111';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
(async()=>{
 const db=new PGlite();await db.waitReady;
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,anon;
    create table public.profiles(id uuid primary key,full_name text,role text,approved boolean,team text);
    create table public.inspections(id uuid primary key,created_at timestamptz default now(),user_id uuid,team text,inspected_at timestamptz,
      defect_type text,latitude double precision,longitude double precision,latitude_dmm text,longitude_dmm text,
      expressway text,direction text,lane_number integer,lane_other text,km_station integer,interchange_exit text,interchange_segment text,photo_filename text,photo_path text);
    alter table public.profiles enable row level security;alter table public.inspections enable row level security;
    grant select on public.profiles,public.inspections to authenticated;
    grant insert on public.inspections to authenticated;
    create policy own_profile on public.profiles for select to authenticated using(id=auth.uid());
    create policy team_inspections on public.inspections for select to authenticated using(team=(select team from public.profiles where id=auth.uid() and approved));
    create policy own_insert on public.inspections for insert to authenticated with check(user_id=auth.uid() and team=(select team from public.profiles where id=auth.uid() and approved));`);
  for(const [uid,name,role,approved,team] of [[user,'Viewer','inspector',true,'roadway'],[other,'Colleague','inspector',true,'roadway'],[cross,'Other team','inspector',true,'other'],[pending,'Pending','inspector',false,'roadway'],[admin,'Admin','administrator',true,'roadway'],[supervisor,'Supervisor','supervisor',true,'roadway'],[zero,'Zero records','inspector',true,'roadway']])await db.query('insert into public.profiles values($1,$2,$3,$4,$5)',[uid,name,role,approved,team]);
  async function add(n,owner=other,team='roadway',time='2026-10-30T04:00:00.123456Z'){await db.query('insert into public.inspections(id,user_id,team,inspected_at,defect_type,expressway,direction,lane_number,km_station) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id(n),owner,team,time,'Potholes','NLEX','NB',2,12004]);}
  for(let n=1;n<=61;n++)await add(n);await add(100,user);await add(200,cross,'other');await add(201,null);await add(202,other,'roadway','2026-10-29T15:59:59Z');await add(203,other,'roadway','2026-10-30T16:00:00Z');await add(204,other,'roadway',null);
  const migration=fs.readFileSync(path.resolve(__dirname,'../docs/supabase/migrations/20261030_team_log_and_deletion.sql'),'utf8');await db.exec(migration);await db.exec(migration);
  const login=async(uid,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);await db.exec('set role '+role);};
  const page=async(filters={},time=null,after=null)=>(await db.query('select public.team_inspection_page($1::jsonb,$2::timestamptz,$3::uuid) as result',[JSON.stringify(filters),time,after])).rows[0].result;
  await login(user);
  assert.equal((await db.query('select count(*)::integer as n from public.profiles')).rows[0].n,1,'profile policy remains own-only');
  const summary=(await db.query('select * from public.team_inspection_summary()')).rows;
  assert.equal(summary.find(r=>r.owner_id===other).inspection_count,64);
  assert.equal(summary.find(r=>r.owner_id===zero).inspection_count,0);
  assert(!summary.some(r=>r.owner_id===cross));assert(!summary.some(r=>r.owner_id===pending));assert(summary.some(r=>r.owner_id===null&&r.inspection_count===1));
  let first=await page({inspector:other});assert.equal(first.total,64);assert.equal(first.records.length,50);assert.equal(first.has_more,true);assert(first.records.every(r=>r.inspector_display_name==='Colleague'));
  const last=first.records.at(-1),next=await page({inspector:other},last.inspected_at,last.id);assert.equal(next.records.length,14);assert.equal(next.has_more,false);assert.equal(new Set([...first.records,...next.records].map(r=>r.id)).size,64);assert.equal(next.records.at(-1).inspected_at,null);
  assert.equal((await page({inspector:other,from:'2026-10-30',to:'2026-10-30'})).total,61);
  assert.equal((await page({inspector:other,search:'KM 12+004'})).total,64);
  assert.equal((await page({inspector:cross})).total,0);
  assert.equal((await page({inspector:'__unassigned'})).total,1);
  assert.equal((await page({lane:'3'})).total,0);
  assert.equal((await page({search:'") or true --'})).total,0);
  await assert.rejects(db.query('select public.delete_own_inspection($1)',[id(1)]),e=>e.code==='42501');
  await assert.rejects(db.query('delete from public.inspections where id=$1',[id(100)]),e=>e.code==='42501');
  const deleted=await db.query('select public.delete_own_inspection($1) as id',[id(100)]);assert.equal(deleted.rows[0].id,id(100));
  assert.equal((await db.query('select public.delete_own_inspection($1) as id',[id(100)])).rows[0].id,id(100),'lost acknowledgement retry is idempotent');
  assert.equal((await page({inspector:user})).total,0);
  await assert.rejects(add(100,user),e=>e.code==='23514');
  await assert.rejects(db.query('select * from public.inspection_deletion_receipts'),e=>e.code==='42501');
  await login(other);await assert.rejects(db.query('select public.delete_own_inspection($1)',[id(100)]),e=>e.code==='42501');
  for(const uid of [supervisor,admin,pending]){await login(uid);await assert.rejects(db.query('select public.delete_own_inspection($1)',[id(1)]),e=>e.code==='42501');}
  await login(pending);assert.equal((await db.query('select * from public.team_inspection_summary()')).rows.length,0);assert.equal((await page()).authorized,false);
  await login(cross);assert.equal((await page()).total,1);assert.equal((await page({inspector:other})).total,0);
  await login(null,'anon');for(const sql of ['select public.team_inspection_summary()','select public.team_inspection_page()','select public.delete_own_inspection(null)'])await assert.rejects(db.query(sql),e=>e.code==='42501');
  await db.exec('reset role');assert.equal((await db.query('select count(*)::integer as n from public.inspection_deletion_receipts')).rows[0].n,1);
  console.log('PASS: actual SQL migration twice; whole-team totals, zero-count inspectors, 50+14 cursor pages, microseconds/null dates, Philippine date range, search, names without profile access, own-only idempotent deletion, denied peer/admin/pending/anonymous deletion, cross-team isolation, private receipts and rejected re-insertion. Synthetic database only.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
