from pathlib import Path
import sys,json,shlex
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0,str(Path('.cache/forum-deploy-python').resolve()))
import paramiko
from dotenv import dotenv_values
env=dotenv_values('../cms-2026/.env');assert env['SSH_HOST']=='148.113.144.41'
c=paramiko.SSHClient();c.load_system_host_keys();c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(env['SSH_HOST'],username=env['SSH_USER'],password=env['SSH_PASS'],timeout=20,allow_agent=False,look_for_keys=False)
def root(code):
 i,o,e=c.exec_command('sudo -S -p "" python3 -c '+shlex.quote(code),timeout=60);i.write(env['SSH_PASS']+'\n');i.flush();i.channel.shutdown_write();out=o.read().decode();err=e.read().decode();rc=o.channel.recv_exit_status()
 if rc:raise RuntimeError(err[:2000])
 print(out)
try:
 if '--update-batch' in sys.argv:
  s=c.open_sftp();s.put('scripts/forum_brand_hotfix_batch_20261117.mjs','/tmp/forum_brand_hotfix_batch_20261117.mjs');s.close()
  root('import shutil;shutil.copy("/tmp/forum_brand_hotfix_batch_20261117.mjs","/opt/forum-brand-hotfix-20261117/scripts/forum_brand_hotfix_batch_20261117.mjs")')
 if '--pause-import' in sys.argv:
  root('''
import subprocess
for u in ['forum-brand-hotfix-import-20261117','forum-brand-hotfix-resume-20261117']:
 if subprocess.check_output(['systemctl','show',u,'-p','ActiveState','--value']).decode().strip()=='active':print(u,subprocess.run(['systemctl','kill','--signal=SIGTERM',u],capture_output=True,text=True).returncode)
''')
 if '--es-health' in sys.argv:
  js="""import fs from 'node:fs';import dotenv from 'dotenv';import ES from 'elasticsearch';const env=dotenv.parse(fs.readFileSync('.env'));const es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',log:[],maxRetries:0,requestTimeout:5000});try{const r=await es.info();console.log(JSON.stringify({esReachable:true,version:r.version.number}));}catch(e){console.log(JSON.stringify({esReachable:false,errorType:e.name,status:e.statusCode||null}));}finally{es.close();}"""
  root('import subprocess;print(subprocess.check_output('+repr(['sudo','-u','forum-flow','/opt/forum-flow/node/bin/node','--input-type=module','-e',js])+',cwd="/opt/forum-brand-hotfix-20261117",stderr=subprocess.STDOUT).decode())')
 if '--search-probe' in sys.argv:
  js="""import fs from 'node:fs';import dotenv from 'dotenv';import ES from 'elasticsearch';import {ForumState} from './src/forumFlow/state.mjs';import {BrandHotfixSink} from './scripts/forum_brand_hotfix_batch_20261117.mjs';const env=dotenv.parse(fs.readFileSync('.env')),es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',log:[],maxRetries:0,requestTimeout:10000}),state=await ForumState.open('/var/lib/forum-brand-hotfix-20261117/run/state.sqlite');try{const rows=state.db.prepare("SELECT * FROM forum_documents WHERE export_state='pending' AND role='forumComment' ORDER BY site,native_id LIMIT 50").all();const sink=new BrandHotfixSink({es,state,sites:JSON.parse(fs.readFileSync('config/forum-flow/sites.json')),write:false});const start=Date.now(),result=await sink.lookupBatch(rows.map(row=>({row,doc:JSON.parse(row.doc),proof:JSON.parse(row.proof)})));console.log(JSON.stringify({identitySearchReady:true,checked:result.size,elapsedMs:Date.now()-start,found:[...result.values()].filter(r=>r.hit).length,held:[...result.values()].filter(r=>r.reason).length}));}catch(e){console.log(JSON.stringify({identitySearchReady:false,errorType:e.name,status:e.statusCode||null}));}finally{es.close();state.close();}"""
  root('import subprocess;print(subprocess.check_output('+repr(['sudo','-u','forum-flow','/opt/forum-flow/node/bin/node','--input-type=module','-e',js])+',cwd="/opt/forum-brand-hotfix-20261117",stderr=subprocess.STDOUT).decode())')
 if '--diagnose' in sys.argv:
  root('''
import subprocess
for cmd in [['uptime'],['free','-m'],['systemctl','list-jobs','--no-pager'],['journalctl','_PID=1','-u','forum-flow','-u','forum-flow-writer','--since','15 minutes ago','--no-pager','-o','short-iso','-n','35']]:
 r=subprocess.run(cmd,capture_output=True,text=True);print(r.stdout)
''')
 if '--prepare' in sys.argv:
  s=c.open_sftp()
  for name in ['forum_brand_hotfix_20261117.mjs','forum_brand_hotfix_batch_20261117.mjs','forum_brand_hotfix_verify_20261117.mjs']:
   s.put('scripts/'+name,'/tmp/'+name)
  s.put('outputs/forum-brand-hotfix-2026-11-17/web-searches.json','/tmp/forum-brand-searches.json');s.close()
  root('''
import pathlib,subprocess,shutil,json
p=pathlib.Path('/opt/forum-brand-hotfix-20261117');p.mkdir(exist_ok=True);(p/'scripts').mkdir(exist_ok=True)
for name,target in [('src','/opt/forum-flow/current/src'),('config','/opt/forum-flow/current/config'),('node_modules','/opt/forum-flow/current/node_modules'),('.env','/etc/forum-flow/forum.env')]:
 q=p/name
 if not q.exists():q.symlink_to(target)
(p/'package.json').write_text('{"type":"module"}')
for name in ['forum_brand_hotfix_20261117.mjs','forum_brand_hotfix_batch_20261117.mjs','forum_brand_hotfix_verify_20261117.mjs']:shutil.copy('/tmp/'+name,p/'scripts'/name)
shutil.copy('/tmp/forum-brand-searches.json',p/'searches.json')
d=pathlib.Path('/var/lib/forum-brand-hotfix-20261117');d.mkdir(exist_ok=True);shutil.chown(d,user='forum-flow',group='forum-flow')
before=subprocess.check_output(['systemctl','show','forum-flow','forum-flow-writer','-p','MainPID,NRestarts,ExecMainStartTimestamp']).decode();(d/'services-before.txt').write_text(before)
print(before)
''')
 if '--start' in sys.argv:
  flags=['--discover','--searches','/opt/forum-brand-hotfix-20261117/searches.json','--collect','--max-pages','100'] if '--import' not in sys.argv else ['--import','--write','--proof','/etc/forum-flow/identity-proof.json']
  unit='forum-brand-hotfix-'+('import' if '--import' in sys.argv else 'collect')+'-20261117'
  root('import subprocess;print(subprocess.check_output('+repr(['systemd-run','--unit='+unit,'--uid=forum-flow','--property=WorkingDirectory=/opt/forum-brand-hotfix-20261117','--property=CPUQuota=20%','--property=MemoryMax=512M','--property=Nice=10','/opt/forum-flow/node/bin/node','scripts/forum_brand_hotfix_20261117.mjs','--output','/var/lib/forum-brand-hotfix-20261117/run']+flags)+',stderr=subprocess.STDOUT).decode())')
 if '--retry' in sys.argv:
  s=c.open_sftp();s.put('scripts/forum_brand_hotfix_20261117.mjs','/tmp/forum_brand_hotfix_20261117.mjs');s.close()
  root('''
import subprocess,shutil
assert subprocess.check_output(['systemctl','show','forum-brand-hotfix-collect-20261117','-p','ActiveState','--value']).decode().strip()!='active'
shutil.copy('/tmp/forum_brand_hotfix_20261117.mjs','/opt/forum-brand-hotfix-20261117/scripts/forum_brand_hotfix_20261117.mjs')
print(subprocess.check_output(['systemd-run','--unit=forum-brand-hotfix-retry-20261117','--uid=forum-flow','--property=WorkingDirectory=/opt/forum-brand-hotfix-20261117','--property=CPUQuota=20%','--property=MemoryMax=512M','--property=Nice=10','/opt/forum-flow/node/bin/node','scripts/forum_brand_hotfix_20261117.mjs','--output','/var/lib/forum-brand-hotfix-20261117/run','--collect','--retry-failed','--candidates-only','--max-pages','100'],stderr=subprocess.STDOUT).decode())
''')
 if '--resume-import' in sys.argv:
  s=c.open_sftp()
  for name in ['forum_brand_hotfix_20261117.mjs','forum_brand_hotfix_batch_20261117.mjs']:s.put('scripts/'+name,'/tmp/'+name)
  s.close()
  root('''
import pathlib,subprocess,shutil
p=pathlib.Path('/opt/forum-brand-hotfix-20261117')
for unit in ['forum-brand-hotfix-collect-20261117','forum-brand-hotfix-retry-20261117','forum-brand-hotfix-import-20261117']:
 assert subprocess.check_output(['systemctl','show',unit,'-p','ActiveState','--value']).decode().strip()!='active'
for name in ['forum_brand_hotfix_20261117.mjs','forum_brand_hotfix_batch_20261117.mjs']:shutil.copy('/tmp/'+name,p/'scripts'/name)
if (p/'src').is_symlink():
 frozen=p/'src-frozen';assert not frozen.exists();shutil.copytree((p/'src').resolve(),frozen);(p/'src').unlink();(p/'src').symlink_to(frozen)
print(subprocess.check_output(['systemd-run','--unit=forum-brand-hotfix-resume-20261117','--uid=forum-flow','--property=WorkingDirectory=/opt/forum-brand-hotfix-20261117','--property=CPUQuota=20%','--property=MemoryMax=512M','--property=Nice=10','/opt/forum-flow/node/bin/node','scripts/forum_brand_hotfix_20261117.mjs','--output','/var/lib/forum-brand-hotfix-20261117/run','--import','--write','--retry-transient','--batch-size','5','--proof','/etc/forum-flow/identity-proof.json'],stderr=subprocess.STDOUT).decode())
''')
 if '--finish-import' in sys.argv:
  s=c.open_sftp();s.put('scripts/forum_brand_hotfix_20261117.mjs','/tmp/forum_brand_hotfix_20261117.mjs');s.close()
  root('''
import subprocess,shutil
assert subprocess.check_output(['systemctl','show','forum-brand-hotfix-resume-20261117','-p','ActiveState','--value']).decode().strip()!='active'
shutil.copy('/tmp/forum_brand_hotfix_20261117.mjs','/opt/forum-brand-hotfix-20261117/scripts/forum_brand_hotfix_20261117.mjs')
print(subprocess.check_output(['systemd-run','--unit=forum-brand-hotfix-finish-20261117','--uid=forum-flow','--property=WorkingDirectory=/opt/forum-brand-hotfix-20261117','--property=CPUQuota=20%','--property=MemoryMax=512M','--property=Nice=10','/opt/forum-flow/node/bin/node','scripts/forum_brand_hotfix_20261117.mjs','--output','/var/lib/forum-brand-hotfix-20261117/run','--import','--write','--retry-transient','--batch-size','50','--proof','/etc/forum-flow/identity-proof.json'],stderr=subprocess.STDOUT).decode())
''')
 if '--status' in sys.argv:
  root('''
import subprocess,pathlib
for u in ['forum-brand-hotfix-collect-20261117','forum-brand-hotfix-retry-20261117','forum-brand-hotfix-import-20261117','forum-brand-hotfix-resume-20261117','forum-brand-hotfix-finish-20261117','forum-flow','forum-flow-writer']:
 print(u,subprocess.run(['systemctl','show',u,'-p','ActiveState,SubState,MainPID,NRestarts,ExecMainStatus'],capture_output=True,text=True).stdout)
log=subprocess.run(['journalctl','-u','forum-brand-hotfix-collect-20261117','-u','forum-brand-hotfix-retry-20261117','-u','forum-brand-hotfix-import-20261117','-u','forum-brand-hotfix-resume-20261117','-u','forum-brand-hotfix-finish-20261117','-n','12','--no-pager','-o','cat'],capture_output=True,text=True).stdout
print(chr(10).join(line for line in log.splitlines() if '"phase":"summary"' not in line))
p=pathlib.Path('/var/lib/forum-brand-hotfix-20261117/run/summary.json')
if p.exists():
 import json
 import sqlite3
 db=sqlite3.connect('file:/var/lib/forum-brand-hotfix-20261117/run/state.sqlite?mode=ro',uri=True);print(json.dumps({'liveExports':list(db.execute('SELECT role,export_state,export_reason,COUNT(*) FROM forum_documents GROUP BY role,export_state,export_reason'))}));db.close()
''')
 if '--audit' in sys.argv:
  root('''
import sqlite3,json,datetime,subprocess,pathlib
d=pathlib.Path('/var/lib/forum-brand-hotfix-20261117');db=sqlite3.connect('file:'+str(d/'run/state.sqlite')+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
rows=lambda q:[dict(r) for r in db.execute(q)]
errors=[];n=0
for r in db.execute('SELECT * FROM forum_documents'):
 n+=1;doc=json.loads(r['doc']);p=json.loads(r['proof']);s=doc['_source']
 try:
  assert p['time']['publishedDate']==s['publishedDate'],'time_proof'
  t=datetime.datetime.fromisoformat(s['publishedDate'].replace('Z','+00:00'));y,w,_=t.astimezone(datetime.timezone(datetime.timedelta(hours=7))).isocalendar();assert doc['_index']==f'master{y}{w:02d}','week'
  if r['role']=='forumComment':
   parent=db.execute("SELECT doc FROM forum_documents WHERE site=? AND role='forumTopic' AND thread_id=?",(r['site'],r['thread_id'])).fetchone();parent=json.loads(parent[0]);assert s['parentId']==parent['_id'] and s['parentDate']==parent['_source']['publishedDate'],'parent';assert t.timestamp()>=datetime.datetime(2026,10,1,tzinfo=datetime.timezone(datetime.timedelta(hours=7))).timestamp(),'window'
 except Exception as e:errors.append({'site':r['site'],'id':r['native_id'],'reason':str(e)})
result={'checked':n,'errors':errors,'documents':rows('SELECT site,role,COUNT(*) n FROM forum_documents GROUP BY site,role'),'matches':rows('SELECT status,brands,COUNT(*) n FROM hotfix_matches GROUP BY status,brands'),'exports':rows('SELECT export_state,export_reason,COUNT(*) n FROM forum_documents GROUP BY export_state,export_reason'),'exportsByRole':rows('SELECT role,export_state,COUNT(*) n FROM forum_documents GROUP BY role,export_state'),'brands':rows("SELECT d.role,d.export_state,h.brands,COUNT(*) n FROM forum_documents d JOIN (SELECT site,native_thread_id,MAX(brands) brands FROM hotfix_matches WHERE status IN ('collected','partial') GROUP BY site,native_thread_id) h ON d.site=h.site AND d.thread_id=h.native_thread_id GROUP BY d.role,d.export_state,h.brands"),'uniqueTopics':db.execute('SELECT COUNT(*) FROM forum_urls').fetchone()[0],'failures':rows("SELECT reason,COUNT(*) n FROM hotfix_matches WHERE status='failed' GROUP BY reason"),'servicesBefore':(d/'services-before.txt').read_text(),'servicesAfter':subprocess.check_output(['systemctl','show','forum-flow','forum-flow-writer','-p','MainPID,NRestarts,ExecMainStartTimestamp']).decode()}
text=json.dumps(result);(d/'audit.json').write_text(text);print(text)
''')
  s=c.open_sftp();out=Path('outputs/forum-brand-hotfix-2026-11-17');out.mkdir(exist_ok=True)
  for remote,name in [('/var/lib/forum-brand-hotfix-20261117/audit.json','audit.json'),('/var/lib/forum-brand-hotfix-20261117/run/summary.json','summary.json'),('/var/lib/forum-brand-hotfix-20261117/run/manifest.json','manifest.json')]:
   try:s.get(remote,str(out/name))
   except FileNotFoundError:pass
  s.close()
 if '--verify' in sys.argv:
  s=c.open_sftp();s.put('scripts/forum_brand_hotfix_verify_20261117.mjs','/tmp/forum_brand_hotfix_verify_20261117.mjs');s.close()
  root('import shutil;shutil.copy("/tmp/forum_brand_hotfix_verify_20261117.mjs","/opt/forum-brand-hotfix-20261117/scripts/forum_brand_hotfix_verify_20261117.mjs")')
  root('import subprocess;print(subprocess.check_output(["sudo","-u","forum-flow","/opt/forum-flow/node/bin/node","scripts/forum_brand_hotfix_verify_20261117.mjs","/var/lib/forum-brand-hotfix-20261117/run"],cwd="/opt/forum-brand-hotfix-20261117",stderr=subprocess.STDOUT).decode())')
  s=c.open_sftp();s.get('/var/lib/forum-brand-hotfix-20261117/run/verification.json','outputs/forum-brand-hotfix-2026-11-17/verification.json');s.close()
 if '--conflicts' in sys.argv:
  s=c.open_sftp();s.put('scripts/forum_brand_hotfix_conflicts_20261117.mjs','/tmp/forum_brand_hotfix_conflicts_20261117.mjs');s.close()
  root('import shutil,subprocess;shutil.copy("/tmp/forum_brand_hotfix_conflicts_20261117.mjs","/opt/forum-brand-hotfix-20261117/scripts/forum_brand_hotfix_conflicts_20261117.mjs");print(subprocess.check_output(["sudo","-u","forum-flow","/opt/forum-flow/node/bin/node","scripts/forum_brand_hotfix_conflicts_20261117.mjs","/var/lib/forum-brand-hotfix-20261117/run"],cwd="/opt/forum-brand-hotfix-20261117",stderr=subprocess.STDOUT).decode())')
  s=c.open_sftp();s.get('/var/lib/forum-brand-hotfix-20261117/run/conflicts.json','outputs/forum-brand-hotfix-2026-11-17/conflicts.json');s.close()
finally:c.close()
