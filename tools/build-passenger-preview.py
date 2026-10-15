from pathlib import Path
import argparse,json,re,hashlib,zipfile
R=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--out',required=True);O=Path(p.parse_args().out).resolve();O.mkdir(parents=True,exist_ok=False)
html=(R/'index.html').read_text(encoding='utf-8');shell=re.search(r'const APP_SHELL = \[([\s\S]*?)\];',(R/'sw.js').read_text()).group(1)
names=set(re.findall(r"'\./([^']+)'",shell));names|=set(m for m in re.findall(r'(?:src|href)="(?:\./)?([^"?#]+)"',html) if not re.match(r'^[a-z]+:|^/',m))
names|={'index.html','calibration.json','interchanges.json','stationing-reconstruction-evidence.json','preview/live-binding.js','preview/passenger-preview.js'}
blocked={'sw.js','manifest.json','auth-config.js','vendor/supabase/supabase-js-2.117.1.umd.js','vendor/supabase/LICENSE','b01-preview.js'};names-=blocked
for needle in ['  <script src="./auth-config.js"></script>','  <script src="./vendor/supabase/supabase-js-2.117.1.umd.js"></script>','  <link rel="manifest" href="manifest.json">']:
 assert html.count(needle)==1,needle;html=html.replace(needle,'')
assert html.count('<head>')==1;html=html.replace('<head>','<head>\n<script src="./preview/live-binding.js"></script>\n<script src="./preview/passenger-preview.js"></script>')
inputs={};outputs={}
for name in sorted(names):
 assert '..' not in Path(name).parts and not name.startswith('.') and not name.endswith(('.test.js','.cjs','.py','.md','.xlsx','.xlsm','.gpkg')),name
 src=R/name;assert src.is_file(),name;inputs[name]=hashlib.sha256(src.read_bytes()).hexdigest();data=html.encode() if name=='index.html' else src.read_bytes();dest=O/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
(O/'_headers').write_text("""/*
  Cache-Control: no-store
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self'; worker-src 'self'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; form-action 'none'; base-uri 'none'
  Permissions-Policy: geolocation=(self), camera=(), microphone=(), usb=()
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  X-Robots-Tag: noindex, nofollow, nosnippet
""",encoding='utf-8');(O/'robots.txt').write_text('User-agent: *\nDisallow: /\n')
for f in O.rglob('*'):
 if f.is_file():
  data=f.read_bytes();assert not re.search(rb'sb_secret_|service_role[^\r\n]{0,15}eyJ|-----BEGIN [A-Z ]*PRIVATE KEY',data),f
  outputs[f.relative_to(O).as_posix()]=hashlib.sha256(data).hexdigest()
manifest={'scope':'Exact static passenger Preview assets only; no history/tests/Git/credentials','inputs':inputs,'outputs':outputs,'excluded':sorted(blocked),'target_preview_branch':'stationing-app-review','target_origin':'https://stationing-app-review.kmtrack-gpskm-synthetic.pages.dev','base_commit':'c7e286ec891c0b48f4272bf688239e4bfb27ce2f','production_deployment':False}
(O.parent/(O.name+'-manifest.json')).write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8');zip_path=O.parent/(O.name+'.zip')
with zipfile.ZipFile(zip_path,'x',zipfile.ZIP_DEFLATED) as z:
 for n in sorted(outputs):z.write(O/n,n)
with zipfile.ZipFile(zip_path) as z:assert sorted(z.namelist())==sorted(outputs)
print(json.dumps({'assets':len(outputs),'zip':str(zip_path),'bytes':zip_path.stat().st_size,'sha256':hashlib.sha256(zip_path.read_bytes()).hexdigest()}))
