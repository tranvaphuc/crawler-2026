from pathlib import Path
import sys,shlex,json
sys.stdout.reconfigure(encoding='utf-8');sys.path.insert(0,str(Path('.cache/forum-deploy-python').resolve()))
import paramiko
from dotenv import dotenv_values
env=dotenv_values('../cms-2026/.env');assert env['SSH_HOST']=='148.113.144.41'
c=paramiko.SSHClient();c.load_system_host_keys();c.set_missing_host_key_policy(paramiko.AutoAddPolicy());c.connect(env['SSH_HOST'],username=env['SSH_USER'],password=env['SSH_PASS'],timeout=20,allow_agent=False,look_for_keys=False)
def root(code,quiet=False):
 i,o,e=c.exec_command('sudo -S -p "" python3 -c '+shlex.quote(code),timeout=90);i.write(env['SSH_PASS']+'\n');i.flush();i.channel.shutdown_write();out=o.read().decode();err=e.read().decode();rc=o.channel.recv_exit_status()
 if rc:raise RuntimeError(err[:1600])
 if not quiet:print(out)
 return out
try:
 if '--integrity' in sys.argv:
  output=root(r'''
import pathlib,json,hashlib,subprocess
p=pathlib.Path('/opt/forum-flow/current').resolve();files=['scripts/run_forum_writer.mjs','src/forumFlow/bulkEs5.mjs','src/forumFlow/boundedEsConnection.mjs','src/forumFlow/writerLease.mjs','src/forumFlow/writerRecovery.mjs']
print(json.dumps({'files':{n:hashlib.sha256((p/n).read_bytes()).hexdigest() for n in files},'writerEnabled':subprocess.check_output(['systemctl','is-enabled','forum-flow-writer']).decode().strip(),'limits':subprocess.check_output(['systemctl','show','forum-flow-writer','-p','MemoryMax,LimitCORE,CPUQuotaPerSecUSec']).decode()}))
''',True)
  out=Path('outputs/forum-writer-repair-2026-11-18');(out/'integrity.json').write_text(output,encoding='utf8');data=json.loads(output)
  import hashlib
  match=all(hashlib.sha256(Path(n).read_bytes()).hexdigest()==h for n,h in data['files'].items());assert match,'Deployed writer differs from tested files';print(json.dumps({'deployedMatchesTestedCode':match,'writerEnabled':data['writerEnabled'],'limits':data['limits']}))
 if '--pull-evidence' in sys.argv:
  output=root(r'''
import pathlib,json,subprocess
backup=pathlib.Path('/var/backups/forum-flow/writer-repair-20261118');directory=pathlib.Path('/var/lib/forum-flow/writer-repair-20261118')
data={'diagnostics':json.loads(pathlib.Path('/var/lib/forum-flow/writer-diagnostics-20261118.json').read_text()),'deployment':json.loads((backup/'deployed.json').read_text()),'parentApplications':[json.loads(p.read_text()) for p in sorted(directory.glob('parent-apply-result-*.json'))]}
for u in ['forum-parent-audit-20261118','forum-parent-audit-20261118-v2']:subprocess.run(['systemctl','reset-failed',u],capture_output=True)
print(json.dumps(data))
''',True)
  out=Path('outputs/forum-writer-repair-2026-11-18');out.mkdir(exist_ok=True);(out/'evidence.json').write_text(output,encoding='utf8');data=json.loads(output);print(json.dumps({'parentApplications':len(data['parentApplications']),'parentsReconciled':sum(len(r['parents']) for r in data['parentApplications']),'esParentsUnchanged':all(r['esParentsUnchanged'] for r in data['parentApplications'])}))
 if '--install-final-query' in sys.argv:
  s=c.open_sftp();s.put('src/forumFlow/bulkEs5.mjs','/tmp/repair-final-bulkEs5.mjs');s.put('src/forumFlow/writerRecovery.mjs','/tmp/repair-writerRecovery.mjs');s.close()
  root(r'''
import pathlib,subprocess,shutil,time
assert subprocess.check_output(['systemctl','show','forum-flow-writer','-p','ActiveState','--value']).decode().strip()=='inactive'
source=pathlib.Path('/opt/forum-flow/current').resolve();backup=pathlib.Path('/var/backups/forum-flow/writer-repair-20261118')
shutil.copy('/tmp/repair-writerRecovery.mjs',source/'src/forumFlow/writerRecovery.mjs');shutil.copy('/tmp/repair-writerRecovery.mjs','/opt/forum-flow-writer-repair-20261118/src/forumFlow/writerRecovery.mjs')
shutil.copy(source/'src/forumFlow/bulkEs5.mjs',backup/('bulkEs5-before-filter-'+str(int(time.time()))+'.mjs'))
temp=source/'src/forumFlow/bulkEs5.mjs.repair-tmp';shutil.copy('/tmp/repair-final-bulkEs5.mjs',temp);subprocess.run(['/opt/forum-flow/node/bin/node','--input-type=module','--check'],input=temp.read_bytes(),check=True,capture_output=True);temp.replace(source/'src/forumFlow/bulkEs5.mjs')
subprocess.run(['/opt/forum-flow/node/bin/node','--check',str(source/'src/forumFlow/bulkEs5.mjs')],check=True,capture_output=True);shutil.copy(source/'src/forumFlow/bulkEs5.mjs','/opt/forum-flow-writer-repair-20261118/src/forumFlow/bulkEs5.mjs');print('Only forum writer query updated; no ES cluster setting changes')
''')
 if '--es-load' in sys.argv:
  s=c.open_sftp();s.put('scripts/check_forum_es_load_20261118.mjs','/tmp/check_forum_es_load_20261118.mjs');s.close()
  root("import subprocess,shutil;shutil.copy('/tmp/check_forum_es_load_20261118.mjs','/opt/forum-flow-writer-repair-20261118/scripts/check_forum_es_load_20261118.mjs');r=subprocess.run(['sudo','-u','forum-flow','/opt/forum-flow/node/bin/node','--max-old-space-size=128','scripts/check_forum_es_load_20261118.mjs'],cwd='/opt/forum-flow-writer-repair-20261118',capture_output=True,text=True);print(r.stdout);print('esLoadCheckExit='+str(r.returncode))")
 if '--data-status' in sys.argv:
  output=root(r'''
import pathlib,json,subprocess
p=pathlib.Path('/var/lib/forum-flow/writer-repair-20261118/data-verification.json')
print(json.dumps({'service':subprocess.check_output(['systemctl','show','forum-data-verify-20261118-final','-p','ActiveState,SubState,ExecMainStatus']).decode(),'verification':json.loads(p.read_text()) if p.exists() else None,'log':subprocess.check_output(['journalctl','-u','forum-data-verify-20261118-final','-n','8','--no-pager','-o','cat']).decode()}))
''',True)
  data=json.loads(output);out=Path('outputs/forum-writer-repair-2026-11-18');(out/'data-verification-status.json').write_text(output,encoding='utf8')
  if data['verification']:(out/'data-verification.json').write_text(json.dumps(data['verification'],indent=2),encoding='utf8')
  print(output)
 if '--apply-parents' in sys.argv:
  s=c.open_sftp();s.put('scripts/apply_forum_parent_plan_20261118.mjs','/tmp/apply_forum_parent_plan_20261118.mjs');s.close()
  root("import shutil,subprocess;shutil.copy('/tmp/apply_forum_parent_plan_20261118.mjs','/opt/forum-flow-writer-repair-20261118/scripts/apply_forum_parent_plan_20261118.mjs');r=subprocess.run(['sudo','-u','forum-flow','/opt/forum-flow/node/bin/node','--max-old-space-size=128','scripts/apply_forum_parent_plan_20261118.mjs'],cwd='/opt/forum-flow-writer-repair-20261118',capture_output=True,text=True);print(r.stdout);print('parentApplyExit='+str(r.returncode))")
 if '--start' in sys.argv:
  root("import subprocess;subprocess.run(['systemctl','start','forum-flow-writer'],check=True);print(subprocess.check_output(['systemctl','show','forum-flow-writer','-p','ActiveState,MainPID,NRestarts']).decode())")
 if '--verify-data' in sys.argv:
  s=c.open_sftp();s.put('scripts/verify_forum_writer_data_20261118.mjs','/tmp/verify_forum_writer_data_20261118.mjs');s.close()
  root("import shutil,subprocess;shutil.copy('/tmp/verify_forum_writer_data_20261118.mjs','/opt/forum-flow-writer-repair-20261118/scripts/verify_forum_writer_data_20261118.mjs');print(subprocess.check_output(['systemd-run','--unit=forum-data-verify-20261118-final','--uid=forum-flow','--property=WorkingDirectory=/opt/forum-flow-writer-repair-20261118','--property=CPUQuota=20%','--property=MemoryMax=256M','/opt/forum-flow/node/bin/node','--max-old-space-size=128','scripts/verify_forum_writer_data_20261118.mjs'],stderr=subprocess.STDOUT).decode())")
 if '--audit-status' in sys.argv:
  output=root(r'''
import pathlib,json,subprocess
p=pathlib.Path('/var/lib/forum-flow/writer-repair-20261118/parent-plan.json')
print(json.dumps({'service':subprocess.check_output(['systemctl','show','forum-parent-audit-20261118-v4','-p','ActiveState,SubState,ExecMainStatus']).decode(),'plan':json.loads(p.read_text()) if p.exists() else None,'log':subprocess.check_output(['journalctl','-u','forum-parent-audit-20261118-v4','-n','25','--no-pager','-o','cat']).decode()}))
''',True)
  data=json.loads(output);out=Path('outputs/forum-writer-repair-2026-11-18');(out/'parent-audit-status.json').write_text(output,encoding='utf8')
  if data['plan']:(out/'parent-plan.json').write_text(json.dumps(data['plan'],indent=2),encoding='utf8')
  print(json.dumps({'service':data['service'],'selected':len(data['plan']['selected']) if data['plan'] else 0,'held':data['plan']['held'] if data['plan'] else [],'log':data['log']}))
 if '--parent-audit' in sys.argv:
  legacy={}
  import hashlib
  for domain in ['forum.gamevn.com','otofun.net','otosaigon.com','voz.vn','phunuvietkhoinghiep.vn']:
   p=Path('../eastdata/scripts/forum/sites')/(domain+'.json')
   if p.exists():
    b=p.read_bytes();legacy[domain]={'config':json.loads(b),'sha256':hashlib.sha256(b).hexdigest()}
  p=Path('outputs/forum-writer-repair-2026-11-18/legacy-formats.json');p.write_text(json.dumps(legacy),encoding='utf8')
  s=c.open_sftp();s.put(str(p),'/tmp/forum-repair-legacy-formats.json');s.put('scripts/audit_forum_parents_20261118.mjs','/tmp/audit_forum_parents_20261118.mjs');s.put('scripts/forum_parent_selection_20261118.mjs','/tmp/forum_parent_selection_20261118.mjs');s.close()
  root(r'''
import pathlib,shutil,subprocess
p=pathlib.Path('/var/lib/forum-flow/writer-repair-20261118');p.mkdir(exist_ok=True);shutil.copy('/tmp/forum_parent_selection_20261118.mjs','/opt/forum-flow-writer-repair-20261118/scripts/forum_parent_selection_20261118.mjs');shutil.chown(p,user='forum-flow',group='forum-flow');shutil.copy('/tmp/forum-repair-legacy-formats.json',p/'legacy-formats.json');shutil.copy('/tmp/audit_forum_parents_20261118.mjs','/opt/forum-flow-writer-repair-20261118/scripts/audit_forum_parents_20261118.mjs')
print(subprocess.check_output(['systemd-run','--unit=forum-parent-audit-20261118-v4','--uid=forum-flow','--property=WorkingDirectory=/opt/forum-flow-writer-repair-20261118','--property=CPUQuota=20%','--property=MemoryMax=256M','/opt/forum-flow/node/bin/node','--max-old-space-size=128','scripts/audit_forum_parents_20261118.mjs'],stderr=subprocess.STDOUT).decode())
''')
 if '--upgrade-query' in sys.argv:
  root(r'''
import subprocess,pathlib,shutil
assert subprocess.check_output(['systemctl','show','forum-flow-writer','-p','ActiveState','--value']).decode().strip()=='inactive'
source=pathlib.Path('/opt/forum-flow/current').resolve();stage=pathlib.Path('/opt/forum-flow-writer-repair-20261118');assert 'if(items.length>50)' in (source/'src/forumFlow/bulkEs5.mjs').read_text()
shutil.copy(source/'src/forumFlow/bulkEs5.mjs','/var/backups/forum-flow/writer-repair-20261118/bulkEs5-first-fix.mjs')
temp=source/'src/forumFlow/bulkEs5.mjs.repair-tmp';shutil.copy(stage/'src/forumFlow/bulkEs5.mjs',temp);temp.replace(source/'src/forumFlow/bulkEs5.mjs')
subprocess.run(['systemctl','start','forum-flow-writer'],check=True);print(subprocess.check_output(['systemctl','show','forum-flow-writer','-p','MainPID,NRestarts,ActiveState']).decode())
''')
 if '--direct' in sys.argv:
  s=c.open_sftp();s.put('scripts/canary_forum_writer_20261118.mjs','/tmp/repair-canary_forum_writer_20261118.mjs');s.put('src/forumFlow/bulkEs5.mjs','/tmp/repair-bulkEs5.mjs');s.close()
  root("import shutil;shutil.copy('/tmp/repair-bulkEs5.mjs','/opt/forum-flow-writer-repair-20261118/src/forumFlow/bulkEs5.mjs')")
  root("import subprocess,shutil;shutil.copy('/tmp/repair-canary_forum_writer_20261118.mjs','/opt/forum-flow-writer-repair-20261118/scripts/canary_forum_writer_20261118.mjs');r=subprocess.run(['sudo','-u','forum-flow','/opt/forum-flow/node/bin/node','--max-old-space-size=128','scripts/canary_forum_writer_20261118.mjs','--direct'],cwd='/opt/forum-flow-writer-repair-20261118',capture_output=True,text=True);print(r.stdout);print('canaryExit='+str(r.returncode))")
 if '--parents' in sys.argv:
  output=root(r'''
import sqlite3,json
db=sqlite3.connect('file:/var/lib/forum-flow/runtime/state.sqlite?mode=ro',uri=True);db.row_factory=sqlite3.Row
topics=[dict(r) for r in db.execute("SELECT * FROM forum_documents WHERE role='forumTopic' AND export_state='held'")]
missing=[dict(r) for r in db.execute("SELECT site,thread_id,COUNT(*) n FROM forum_documents d WHERE role='forumComment' AND export_state IN ('pending','held') AND NOT EXISTS (SELECT 1 FROM forum_es_bindings b WHERE b.site=d.site AND b.role='forumTopic' AND b.native_id=d.thread_id) GROUP BY site,thread_id")]
print(json.dumps({'topics':topics,'missing':missing}))
''',True)
  out=Path('outputs/forum-writer-repair-2026-11-18');out.mkdir(exist_ok=True);(out/'parents.json').write_text(output,encoding='utf8');data=json.loads(output);print(json.dumps({'heldTopics':len(data['topics']),'unreconciledThreads':len(data['missing']),'blockedReplies':sum(r['n'] for r in data['missing'])}))
 if '--progress' in sys.argv:
  output=root(r'''
import sqlite3,subprocess,json,time,pathlib,hashlib
db=sqlite3.connect('file:/var/lib/forum-flow/runtime/state.sqlite?mode=ro',uri=True);db.row_factory=sqlite3.Row
rows=lambda q:[dict(r) for r in db.execute(q)]
backup=pathlib.Path('/var/backups/forum-flow/writer-repair-20261118');before=json.loads((backup/'before.json').read_text());source=pathlib.Path('/opt/forum-flow/current').resolve()
data={'atMs':int(time.time()*1000),'counts':rows('SELECT export_state,COUNT(*) n FROM forum_documents GROUP BY export_state'),'held':rows("SELECT site,role,export_reason,COUNT(*) n FROM forum_documents WHERE export_state='held' GROUP BY site,role,export_reason"),'services':{u:subprocess.check_output(['systemctl','show',u,'-p','ActiveState,SubState,MainPID,NRestarts,MemoryCurrent,MemoryPeak,CPUUsageNSec,Result']).decode() for u in ['forum-flow','forum-flow-writer']},'collectorCodeUnchanged':hashlib.sha256((source/'scripts/run_forum_flow.mjs').read_bytes()).hexdigest()==before['collectorCodeHash'],'siteConfigUnchanged':hashlib.sha256((source/'config/forum-flow/sites.json').read_bytes()).hexdigest()==before['siteConfigHash']}
p=pathlib.Path('/var/lib/forum-flow/runtime/writer-report.json')
if p.exists():
 report=json.loads(p.read_text());data['lastBatch']={k:report.get(k) for k in ['checkedAt','elapsedMs','memory']};data['lastBatch']['counts']={s:sum(r['status']==s for r in report['results']) for s in set(r['status'] for r in report['results'])}
print(json.dumps(data))
''')
  out=Path('outputs/forum-writer-repair-2026-11-18');out.mkdir(exist_ok=True);data=json.loads(output);(out/('progress-'+str(data['atMs'])+'.json')).write_text(output,encoding='utf8');(out/'latest.json').write_text(output,encoding='utf8')
 if '--deploy' in sys.argv:
  root(r'''
import pathlib,subprocess,shutil,json,hashlib,time,sqlite3
stage=pathlib.Path('/opt/forum-flow-writer-repair-20261118');source=pathlib.Path('/opt/forum-flow/current').resolve();backup=pathlib.Path('/var/backups/forum-flow/writer-repair-20261118');before=json.loads((backup/'before.json').read_text())
assert str(source)==before['source']
assert subprocess.check_output(['systemctl','show','forum-flow-writer','-p','ActiveState','--value']).decode().strip()=='inactive'
for n in ['scripts/run_forum_writer.mjs','src/forumFlow/bulkEs5.mjs']:
 assert (source/n).read_bytes()==(backup/pathlib.Path(n).name).read_bytes(),'Live writer changed since backup'
for n in ['scripts/run_forum_writer.mjs','src/forumFlow/bulkEs5.mjs','src/forumFlow/boundedEsConnection.mjs','src/forumFlow/writerLease.mjs']:
 temp=source/(n+'.repair-tmp');shutil.copy(stage/n,temp);temp.replace(source/n)
 subprocess.run(['/opt/forum-flow/node/bin/node','--check',str(source/n)],check=True,capture_output=True)
unit=pathlib.Path('/etc/systemd/system/forum-flow-writer.service');body=unit.read_text();assert '--max-old-space-size' not in body;body=body.replace('/opt/forum-flow/node/bin/node scripts/run_forum_writer.mjs','/opt/forum-flow/node/bin/node --max-old-space-size=128 scripts/run_forum_writer.mjs').replace('MemoryMax=256M','MemoryMax=256M\nLimitCORE=0');unit.write_text(body)
assert hashlib.sha256((source/'scripts/run_forum_flow.mjs').read_bytes()).hexdigest()==before['collectorCodeHash']
assert hashlib.sha256((source/'config/forum-flow/sites.json').read_bytes()).hexdigest()==before['siteConfigHash']
db=sqlite3.connect('file:/var/lib/forum-flow/runtime/state.sqlite?mode=ro',uri=True);counts=list(db.execute('SELECT export_state,COUNT(*) FROM forum_documents GROUP BY export_state'));db.close()
subprocess.run(['systemctl','daemon-reload'],check=True);subprocess.run(['systemctl','start','forum-flow-writer.service'],check=True)
receipt={'atMs':int(time.time()*1000),'countsBeforeStart':counts,'collector':subprocess.check_output(['systemctl','show','forum-flow','-p','MainPID,NRestarts,ExecMainStartTimestamp']).decode(),'writer':subprocess.check_output(['systemctl','show','forum-flow-writer','-p','ActiveState,MainPID,NRestarts,MemoryMax,LimitCORE']).decode(),'collectorCodeUnchanged':True,'siteConfigUnchanged':True};(backup/'deployed.json').write_text(json.dumps(receipt));print(json.dumps(receipt))
''')
 if '--stage' in sys.argv:
  names=['scripts/run_forum_writer.mjs','scripts/canary_forum_writer_20261118.mjs','src/forumFlow/bulkEs5.mjs','src/forumFlow/boundedEsConnection.mjs','src/forumFlow/writerLease.mjs']
  s=c.open_sftp()
  for n in names:s.put(n,'/tmp/repair-'+Path(n).name)
  s.close()
  root(r'''
import pathlib,shutil,subprocess,json,sqlite3,time,hashlib
p=pathlib.Path('/opt/forum-flow-writer-repair-20261118');p.mkdir(exist_ok=True);source=pathlib.Path('/opt/forum-flow/current').resolve();backup=pathlib.Path('/var/backups/forum-flow/writer-repair-20261118');backup.mkdir(parents=True,exist_ok=True)
for n in ['scripts/run_forum_writer.mjs','src/forumFlow/bulkEs5.mjs']:
 dest=backup/pathlib.Path(n).name
 if not dest.exists():shutil.copy(source/n,dest)
unit=pathlib.Path('/etc/systemd/system/forum-flow-writer.service')
if not (backup/'forum-flow-writer.service').exists():shutil.copy(unit,backup/'forum-flow-writer.service')
if not (p/'src').exists():shutil.copytree(source/'src',p/'src')
(p/'scripts').mkdir(exist_ok=True)
for name in ['node_modules','config']:
 if not (p/name).exists():(p/name).symlink_to(source/name)
if not (p/'.env').exists():(p/'.env').symlink_to('/etc/forum-flow/forum.env')
(p/'package.json').write_text('{"type":"module"}')
for n in ['scripts/run_forum_writer.mjs','scripts/canary_forum_writer_20261118.mjs','src/forumFlow/bulkEs5.mjs','src/forumFlow/boundedEsConnection.mjs','src/forumFlow/writerLease.mjs']:shutil.copy('/tmp/repair-'+pathlib.Path(n).name,p/n)
before={'source':str(source),'atMs':int(time.time()*1000),'collector':subprocess.check_output(['systemctl','show','forum-flow','-p','MainPID,NRestarts,ExecMainStartTimestamp']).decode(),'collectorCodeHash':hashlib.sha256((source/'scripts/run_forum_flow.mjs').read_bytes()).hexdigest(),'siteConfigHash':hashlib.sha256((source/'config/forum-flow/sites.json').read_bytes()).hexdigest()}
db=sqlite3.connect('file:/var/lib/forum-flow/runtime/state.sqlite?mode=ro',uri=True);before['counts']=list(db.execute('SELECT export_state,COUNT(*) FROM forum_documents GROUP BY export_state'));db.close();(backup/'before.json').write_text(json.dumps(before));print(json.dumps(before))
''')
 if '--canary' in sys.argv:
  root("import subprocess;r=subprocess.run(['sudo','-u','forum-flow','/opt/forum-flow/node/bin/node','--max-old-space-size=128','scripts/canary_forum_writer_20261118.mjs'],cwd='/opt/forum-flow-writer-repair-20261118',capture_output=True,text=True);print(r.stdout);print('canaryExit='+str(r.returncode))")
 if '--stop' in sys.argv:
  root("import subprocess;subprocess.run(['systemctl','stop','--no-block','forum-flow-writer.service'],check=True);print('Only forum-flow-writer stop requested')")
 if '--memory-probe' in sys.argv:
  s=c.open_sftp();s.put('scripts/diagnose_forum_es_memory_20261118.mjs','/tmp/diagnose_forum_es_memory_20261118.mjs');s.close()
  root("import shutil,subprocess;shutil.copy('/tmp/diagnose_forum_es_memory_20261118.mjs','/opt/forum-flow/current/scripts/diagnose_forum_es_memory_20261118.mjs');print(subprocess.check_output(['sudo','-u','forum-flow','/opt/forum-flow/node/bin/node','scripts/diagnose_forum_es_memory_20261118.mjs'],cwd='/opt/forum-flow/current',stderr=subprocess.STDOUT).decode())")
 if '--inspect' in sys.argv:
  output=root(r'''
import json,subprocess,pathlib,sqlite3,re,hashlib
run=lambda cmd:subprocess.run(cmd,capture_output=True,text=True).stdout
unit='forum-flow-writer.service';cg=run(['systemctl','show',unit,'-p','ControlGroup','--value']).strip();base=pathlib.Path('/sys/fs/cgroup')/cg.lstrip('/')
log=run(['journalctl','-u',unit,'-n','200','--no-pager','-o','cat']);log=re.sub(r'https?://[^\s]+','[URL hidden]',log)
db=sqlite3.connect('file:/var/lib/forum-flow/runtime/state.sqlite?mode=ro',uri=True)
p=pathlib.Path('/opt/forum-flow/current').resolve()
data={'release':str(p),'unit':run(['systemctl','cat',unit]),'status':run(['systemctl','show',unit,'-p','ActiveState,SubState,MainPID,NRestarts,MemoryMax,MemoryPeak,MemoryCurrent,TasksMax,TasksCurrent,LimitCORE,Result,ExecMainCode,ExecMainStatus']),'host':run(['free','-m']),'cgroup':{n:(base/n).read_text() for n in ['memory.events','memory.peak','pids.events'] if (base/n).exists()},'log':log[-18000:],'exports':list(db.execute('SELECT export_state,export_reason,COUNT(*) FROM forum_documents GROUP BY export_state,export_reason')),'maxRows':list(db.execute('SELECT site,role,native_id,length(doc),length(proof) FROM forum_documents ORDER BY length(doc)+length(proof) DESC LIMIT 5')),'indexes':list(db.execute("SELECT name,sql FROM sqlite_master WHERE type='index'")),'hashes':{n:hashlib.sha256((p/n).read_bytes()).hexdigest() for n in ['scripts/run_forum_writer.mjs','src/forumFlow/bulkEs5.mjs','src/forumFlow/state.mjs']}}
out=pathlib.Path('/var/lib/forum-flow/writer-diagnostics-20261118.json');out.write_text(json.dumps(data));print(json.dumps(data))
''')
  out=Path('outputs/forum-writer-repair-2026-11-18');out.mkdir(exist_ok=True);(out/'diagnostics.json').write_text(output,encoding='utf8')
 if '--code' in sys.argv:
  output=root("import pathlib,json;p=pathlib.Path('/opt/forum-flow/current');print(json.dumps({n:(p/n).read_text() for n in ['scripts/run_forum_writer.mjs','src/forumFlow/bulkEs5.mjs','src/forumFlow/es5.mjs']}))")
  out=Path('outputs/forum-writer-repair-2026-11-18');out.mkdir(exist_ok=True)
  for n,body in json.loads(output).items():(out/Path(n).name).write_text(body,encoding='utf8')
finally:c.close()
