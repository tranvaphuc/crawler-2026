from pathlib import Path
import sys,json,shlex,hashlib
sys.path.insert(0,str(Path('.cache/forum-deploy-python').resolve()))
import paramiko
from dotenv import dotenv_values
out=Path('outputs/forum-move-2026-11-17');out.mkdir(parents=True,exist_ok=True)
source_env=dotenv_values('../social-trend/.env');target_env=dotenv_values('../cms-2026/.env')
assert source_env['SSH_HOST']=='139.99.192.72' and target_env['SSH_HOST']=='148.113.144.41'
def connect(env):
 c=paramiko.SSHClient();c.load_system_host_keys();c.set_missing_host_key_policy(paramiko.AutoAddPolicy());c.connect(env['SSH_HOST'],username=env['SSH_USER'],password=env['SSH_PASS'],timeout=15,allow_agent=False,look_for_keys=False);return c
def root(c,env,code,timeout=300):
 stdin,stdout,stderr=c.exec_command('sudo -S -p "" python3 -c '+shlex.quote(code),timeout=timeout);stdin.write(env['SSH_PASS']+'\n');stdin.flush();stdin.channel.shutdown_write();data=stdout.read().decode();err=stderr.read().decode();status=stdout.channel.recv_exit_status()
 if status:raise RuntimeError(json.dumps({'host':env['SSH_HOST'],'exit':status,'error':err[:1800],'output':data[-1000:]}))
 return json.loads(data) if data.strip() else {}
def transfer(src,dst,source_path,target_path):
 key=dst.get_transport().get_remote_server_key()
 payload={'host':target_env['SSH_HOST'],'user':target_env['SSH_USER'],'password':target_env['SSH_PASS'],'key':target_env['SSH_HOST']+' '+key.get_name()+' '+key.get_base64(),'source':source_path,'target':target_path}
 code=r'''
import sys,json,tempfile,os,subprocess
from pathlib import Path
p=json.loads(sys.stdin.readline());assert p['host']=='148.113.144.41' and p['source'].startswith('/home/') and p['target'].startswith('/home/')
with tempfile.TemporaryDirectory(prefix='forum-move-ssh-',dir='/var/tmp') as d:
 helper=Path(d)/'askpass';helper.write_text("#!/bin/sh\nprintf '%s\\n' \"$FORUM_MOVE_SSH_PASSWORD\"\n");helper.chmod(0o700)
 known=Path(d)/'known_hosts';known.write_text(p['key']+'\n');known.chmod(0o600)
 env=dict(os.environ,SSH_ASKPASS=str(helper),SSH_ASKPASS_REQUIRE='force',DISPLAY=':forum-migration',FORUM_MOVE_SSH_PASSWORD=p['password'])
 cmd=['/usr/bin/scp','-O','-q','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(known),'-o','PubkeyAuthentication=no','-o','NumberOfPasswordPrompts=1',p['source'],p['user']+'@'+p['host']+':'+p['target']]
 r=subprocess.run(cmd,env=env,stdin=subprocess.DEVNULL,capture_output=True,text=True,start_new_session=True,timeout=240)
 assert r.returncode==0,'Server-to-server transfer failed: '+r.stderr[:500]
 print(json.dumps({'transferred':True}))
'''
 stdin,stdout,stderr=src.exec_command('sudo -S -p "" python3 -c '+shlex.quote(code),timeout=270);stdin.write(source_env['SSH_PASS']+'\n'+json.dumps(payload)+'\n');stdin.flush();stdin.channel.shutdown_write();data=stdout.read().decode();error=stderr.read().decode();status=stdout.channel.recv_exit_status()
 if status:raise RuntimeError('Direct transfer failed: '+error[:1000])
 assert json.loads(data)['transferred']
 s=dst.open_sftp()
 try:s.chmod(target_path,0o600)
 finally:s.close()
source=target=None
try:
 source=connect(source_env);target=connect(target_env)
 inventory=r'''
import json,os,platform,subprocess,shutil
from pathlib import Path
services={s:subprocess.run(['systemctl','show',s,'--property=ActiveState,MainPID,ExecMainStartTimestampMonotonic,NRestarts'],capture_output=True,text=True).stdout for s in ['forum-flow.service','forum-flow-writer.service','news-flow-seed.service','news-flow-parse.service','news-flow-import.service','pm2-ubuntu.service']}
print(json.dumps({'arch':platform.machine(),'cpu':os.cpu_count(),'freeBytes':shutil.disk_usage('/opt').free,'forumExists':Path('/opt/forum-flow').exists(),'services':services,'nodeSource':os.path.realpath('/opt/news-flow/node') if Path('/opt/news-flow/node').exists() else None}))
'''
 if '--inspect' in sys.argv:
  result={'source':root(source,source_env,inventory),'target':root(target,target_env,inventory)};(out/'inventory.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
 elif '--capabilities' in sys.argv:
  print(json.dumps(root(source,source_env,"import importlib.util,shutil,json;print(json.dumps({'paramiko':importlib.util.find_spec('paramiko') is not None,'sshpass':shutil.which('sshpass'),'scp':shutil.which('scp'),'pip':importlib.util.find_spec('pip') is not None}))")))
 elif '--progress' in sys.argv:
  result={}
  for name,c in [('source',source),('target',target)]:
   s=c.open_sftp()
   try:
    home=s.normalize('.');result[name]={}
    for kind in ['code','config','state']:
     try:result[name][kind]=s.stat(home+'/.forum-move-'+kind+'-20261117.tar.gz').st_size
     except FileNotFoundError:pass
   finally:s.close()
  print(json.dumps(result))
 elif '--prepare' in sys.argv:
  old=root(source,source_env,inventory);new=root(target,target_env,inventory)
  assert old['arch']==new['arch']=='x86_64' and new['freeBytes']>1024**3
  a=source.open_sftp();old_home=a.normalize('.');a.close();b=target.open_sftp();new_home=b.normalize('.');b.close()
  old_bundle=old_home+'/.forum-move-code-20261117.tar.gz';new_bundle=new_home+'/.forum-move-code-20261117.tar.gz'
  export=r'''
import tarfile,os,pwd,json,hashlib
from pathlib import Path
bundle=Path(BUNDLE);release=Path('/opt/forum-flow/current').resolve();node=Path('/opt/news-flow/node').resolve()
assert str(release).startswith('/opt/forum-flow/releases/') and str(node).startswith('/opt/news-flow/node-v22.')
with tarfile.open(bundle,'w:gz') as t:t.add(release,arcname='release');t.add(node,arcname='node')
os.chown(bundle,pwd.getpwnam(USER).pw_uid,-1);bundle.chmod(0o600)
print(json.dumps({'sha256':hashlib.sha256(bundle.read_bytes()).hexdigest(),'bytes':bundle.stat().st_size,'nodeVersion':node.name.replace('node-','')}))
'''.replace('BUNDLE',repr(old_bundle)).replace('USER',repr(source_env['SSH_USER']))
  package=root(source,source_env,export);transfer(source,target,old_bundle,new_bundle)
  install=r'''
import os,json,hashlib,tarfile,pwd,grp,subprocess
from pathlib import Path
bundle=Path(BUNDLE);base=Path('/opt/forum-flow');assert not (base/'current').exists() and not (base/'releases').exists();assert not base.exists() or all(p.name=='.migration-stage' for p in base.iterdir());assert hashlib.sha256(bundle.read_bytes()).hexdigest()==SHA
try:pwd.getpwnam('forum-flow')
except KeyError:subprocess.run(['useradd','--system','--home','/var/lib/forum-flow','--shell','/usr/sbin/nologin','forum-flow'],check=True)
base.mkdir(mode=0o755,exist_ok=True);stage=base/'.migration-stage';stage.mkdir(mode=0o755,exist_ok=True)
with tarfile.open(bundle,'r:gz') as tar:
 for m in tar.getmembers():
  path=stage/m.name;assert not Path(m.name).is_absolute() and '..' not in Path(m.name).parts
  if m.issym() or m.islnk():
   link=Path(m.linkname);assert m.linkname=='/etc/forum-flow/forum.env' or not link.is_absolute() and str((path.parent/link).resolve()).startswith(str(stage)+'/')
 tar.extractall(stage,members=[m for m in tar.getmembers() if m.name!='release/.env'],filter='data')
(base/'releases').mkdir();release=base/'releases/20261117-01';(stage/'release').rename(release);(stage/'node').rename(base/('node-'+VERSION));stage.rmdir()
(release/'.env').symlink_to('/etc/forum-flow/forum.env');(base/'node').symlink_to('node-'+VERSION);(base/'current').symlink_to(release)
run=subprocess.run([str(base/'node/bin/node'),'--test','test/forum-flow.test.mjs','test/forum-es5.test.mjs','test/news-forum-parser.test.mjs'],cwd=release,capture_output=True,text=True)
Path('/var/lib/forum-flow').mkdir(mode=0o750);Path('/var/lib/forum-flow/migration-tests.tap').write_text(run.stdout+run.stderr);assert run.returncode==0,'Destination tests failed'
for name in ['forum-flow.service','forum-flow-writer.service']:
 text=(release/'deploy'/name).read_text().replace('/opt/news-flow/node/bin/node','/opt/forum-flow/node/bin/node').replace('CPUQuota=100%','CPUQuota=50%').replace('CPUQuota=50%','CPUQuota=25%' if 'writer' in name else 'CPUQuota=50%').replace('MemoryMax=768M','MemoryMax=512M').replace('MemoryMax=384M','MemoryMax=256M')
 Path('/etc/systemd/system',name).write_text(text)
subprocess.run(['systemctl','daemon-reload'],check=True)
print(json.dumps({'prepared':True,'testsPassed':31,'node':str(base/'node/bin/node'),'servicesStarted':False}))
'''.replace('BUNDLE',repr(new_bundle)).replace('SHA',repr(package['sha256'])).replace('VERSION',repr(package['nodeVersion']))
  result={'source':old,'target':new,'package':package,'sourceBundle':old_bundle,'targetBundle':new_bundle,'prepared':root(target,target_env,install)};(out/'prepared.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result['prepared']))
 elif '--preflight' in sys.argv:
  prepared=json.loads((out/'prepared.json').read_text());old_config=prepared['sourceBundle'].replace('code-','config-');new_config=prepared['targetBundle'].replace('code-','config-')
  exported=root(source,source_env,r'''
import tarfile,os,pwd,json,hashlib
from pathlib import Path
bundle=Path(BUNDLE)
with tarfile.open(bundle,'w:gz') as t:t.add('/etc/forum-flow',arcname='forum-flow')
os.chown(bundle,pwd.getpwnam(USER).pw_uid,-1);bundle.chmod(0o600);print(json.dumps({'sha256':hashlib.sha256(bundle.read_bytes()).hexdigest()}))
'''.replace('BUNDLE',repr(old_config)).replace('USER',repr(source_env['SSH_USER'])))
  transfer(source,target,old_config,new_config)
  result=root(target,target_env,r'''
import os,pwd,grp,json,tarfile,hashlib,subprocess
from pathlib import Path
bundle=Path(BUNDLE);assert hashlib.sha256(bundle.read_bytes()).hexdigest()==SHA;assert not Path('/etc/forum-flow').exists()
with tarfile.open(bundle,'r:gz') as t:
 for m in t.getmembers():assert not Path(m.name).is_absolute() and '..' not in Path(m.name).parts and not m.issym() and not m.islnk()
 t.extractall('/etc')
uid=pwd.getpwnam('forum-flow').pw_uid;gid=grp.getgrnam('forum-flow').gr_gid
for p in Path('/etc/forum-flow').rglob('*'):os.chown(p,0,gid);p.chmod(0o640)
os.chown('/etc/forum-flow',0,gid);os.chmod('/etc/forum-flow',0o750);os.chown('/var/lib/forum-flow',uid,gid)
r=subprocess.run(['runuser','-u','forum-flow','--','/opt/forum-flow/node/bin/node','scripts/preflight_forum_es5.mjs','/var/lib/forum-flow/preflight.json'],cwd='/opt/forum-flow/current',capture_output=True,text=True,timeout=150)
assert r.returncode==0,'Target ES5 preflight failed: '+r.stdout[:300]
proof=json.loads(Path('/var/lib/forum-flow/preflight.json').read_text());expected=json.loads(Path('/etc/forum-flow/identity-proof.json').read_text());assert proof['verified'] and proof['clusterFingerprint']==expected['clusterFingerprint']
print(json.dumps({'verified':True,'samples':len(proof['samples']),'sameEs5Cluster':True}))
'''.replace('BUNDLE',repr(new_config)).replace('SHA',repr(exported['sha256'])),timeout=180)
  (out/'preflight.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
 elif '--move-state' in sys.argv:
  assert json.loads((out/'preflight.json').read_text())['verified']
  prepared=json.loads((out/'prepared.json').read_text());old_state=str(Path(prepared['sourceBundle']).with_name('.forum-move-state-20261117.tar.gz')).replace('\\','/');new_state=str(Path(prepared['targetBundle']).with_name('.forum-move-state-20261117.tar.gz')).replace('\\','/')
  export=r'''
import os,json,sqlite3,subprocess,hashlib,pwd,tarfile
from pathlib import Path
news=lambda:{s:subprocess.run(['systemctl','show',s,'--property=ActiveState,MainPID,ExecMainStartTimestampMonotonic,NRestarts'],capture_output=True,text=True,check=True).stdout for s in ['news-flow-seed.service','news-flow-parse.service','news-flow-import.service']}
before=news();ai=hashlib.sha256(Path('/etc/news-flow/ai.env').read_bytes()).hexdigest()
subprocess.run(['systemctl','stop','forum-flow.service'],check=True);subprocess.run(['systemctl','stop','forum-flow-writer.service'],check=True)
subprocess.run(['systemctl','disable','forum-flow.service','forum-flow-writer.service'],check=True,capture_output=True)
for s in ['forum-flow.service','forum-flow-writer.service']:assert subprocess.run(['systemctl','is-active',s],capture_output=True,text=True).stdout.strip()=='inactive'
file=Path('/var/lib/forum-flow/runtime/state.sqlite');db=sqlite3.connect(file);assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
db.execute('DELETE FROM forum_lease');db.execute('DELETE FROM forum_writer_lease');db.commit();db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
counts={table:db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0] for table in ['forum_urls','forum_documents','forum_pages','forum_events','forum_es_bindings']};db.close()
digest=hashlib.sha256(file.read_bytes()).hexdigest();bundle=Path(BUNDLE)
with tarfile.open(bundle,'w:gz') as t:t.add('/var/lib/forum-flow',arcname='data');t.add('/etc/forum-flow',arcname='config')
os.chown(bundle,pwd.getpwnam(USER).pw_uid,-1);bundle.chmod(0o600)
assert before==news() and ai==hashlib.sha256(Path('/etc/news-flow/ai.env').read_bytes()).hexdigest()
print(json.dumps({'sourceStopped':True,'newsUnchanged':True,'newsBefore':before,'aiHash':ai,'counts':counts,'dbSha256':digest,'sha256':hashlib.sha256(bundle.read_bytes()).hexdigest()}))
'''.replace('BUNDLE',repr(old_state)).replace('USER',repr(source_env['SSH_USER']))
  exported=root(source,source_env,export);(out/'source-stopped.json').write_text(json.dumps(exported,indent=2),encoding='utf-8');print(json.dumps({'phase':'source_stopped','counts':exported['counts']}),flush=True)
  transfer(source,target,old_state,new_state)
  install=r'''
import os,json,tarfile,hashlib,pwd,grp,sqlite3,subprocess,shutil
from pathlib import Path
bundle=Path(BUNDLE);assert hashlib.sha256(bundle.read_bytes()).hexdigest()==SHA
stage=Path('/opt/forum-flow/.state-stage');stage.mkdir(mode=0o700)
with tarfile.open(bundle,'r:gz') as tar:
 for m in tar.getmembers():assert not Path(m.name).is_absolute() and '..' not in Path(m.name).parts and not m.issym() and not m.islnk()
 tar.extractall(stage)
uid=pwd.getpwnam('forum-flow').pw_uid;gid=grp.getgrnam('forum-flow').gr_gid
data=Path('/var/lib/forum-flow');config=Path('/etc/forum-flow');assert not (data/'runtime').exists()
for p in (stage/'data').iterdir():p.rename(data/p.name)
(stage/'data').rmdir()
if config.exists():
 for p in (stage/'config').iterdir():assert (config/p.name).read_bytes()==p.read_bytes();p.unlink()
 (stage/'config').rmdir()
else:(stage/'config').rename(config)
stage.rmdir()
for p in [data,*data.rglob('*')]:os.chown(p,uid,gid)
os.chown(config,0,gid);config.chmod(0o750)
for p in config.iterdir():os.chown(p,0,gid);p.chmod(0o640)
file=data/'runtime/state.sqlite';assert hashlib.sha256(file.read_bytes()).hexdigest()==DBSHA
db=sqlite3.connect('file:'+str(file)+'?mode=ro',uri=True);assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok';counts={table:db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0] for table in ['forum_urls','forum_documents','forum_pages','forum_events','forum_es_bindings']};db.close()
subprocess.run(['systemctl','enable','--now','forum-flow.service','forum-flow-writer.service'],check=True,capture_output=True)
print(json.dumps({'started':True,'stateIdenticalBeforeStart':True,'counts':counts,'services':{s:subprocess.run(['systemctl','is-active',s],capture_output=True,text=True).stdout.strip() for s in ['forum-flow.service','forum-flow-writer.service']}}))
'''.replace('BUNDLE',repr(new_state)).replace('DBSHA',repr(exported['dbSha256'])).replace('SHA',repr(exported['sha256']))
  result=root(target,target_env,install);assert result['counts']==exported['counts'];(out/'target-started.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
 elif '--cleanup' in sys.argv:
  health=json.loads((out/'health-result.json').read_text());started=json.loads((out/'target-started.json').read_text());exported=json.loads((out/'source-stopped.json').read_text());prepared=json.loads((out/'prepared.json').read_text())
  assert started['started'] and not health['timeAndParentErrors'] and health['documents']>=exported['counts']['forum_documents']
  assert all('ActiveState=active' in health['services'][s] for s in ['forum-flow.service','forum-flow-writer.service'])
  assert any(r.get('role')=='forumComment' for r in health['esReadback']) and all(r.get('found') and r.get('timeMatches') and r.get('parentMatches') for r in health['esReadback'])
  target_result=root(target,target_env,r'''
import json,os,subprocess
from pathlib import Path
for name in ['forum-flow.service','forum-flow-writer.service']:
 assert subprocess.run(['systemctl','is-active',name],capture_output=True,text=True).stdout.strip()=='active'
home=Path(HOME);backup=Path('/var/backups/forum-flow');backup.mkdir(mode=0o700,exist_ok=True)
for name in ['.forum-move-code-20261117.tar.gz','.forum-move-config-20261117.tar.gz','.forum-move-state-20261117.tar.gz']:
 p=home/name;assert str(p.resolve()).startswith(str(home)+'/') and not p.is_symlink()
 if p.exists():dest=backup/name.lstrip('.');assert not dest.exists();p.rename(dest);os.chown(dest,0,0);dest.chmod(0o600)
print(json.dumps({'liveServicesVerified':True,'backup':'/var/backups/forum-flow'}))
'''.replace('HOME',repr(str(Path(prepared['targetBundle']).parent).replace('\\','/'))))
  cleanup=r'''
import json,subprocess,shutil,os,hashlib
from pathlib import Path
expected=NEWS
current={s:subprocess.run(['systemctl','show',s,'--property=ActiveState,MainPID,ExecMainStartTimestampMonotonic,NRestarts'],capture_output=True,text=True,check=True).stdout for s in expected}
assert current==expected,'News process state changed; refusing cleanup pending review'
assert hashlib.sha256(Path('/etc/news-flow/ai.env').read_bytes()).hexdigest()==AI
for name in ['forum-flow.service','forum-flow-writer.service']:
 assert subprocess.run(['systemctl','is-active',name],capture_output=True,text=True).stdout.strip()=='inactive'
 p=Path('/etc/systemd/system')/name;assert p.is_file() and not p.is_symlink();assert 'WorkingDirectory=/opt/forum-flow/current' in p.read_text();p.unlink()
deleted=[]
for name in ['/opt/forum-flow','/var/lib/forum-flow','/etc/forum-flow']:
 p=Path(name);assert not p.is_symlink() and str(p.resolve())==name and p.is_dir();shutil.rmtree(p);deleted.append(name)
home=Path(HOME)
for name in ['.forum-flow-release-20261117.tar.gz','.forum-flow-proof-20261117.json','.forum-move-code-20261117.tar.gz','.forum-move-config-20261117.tar.gz','.forum-move-state-20261117.tar.gz']:
 p=home/name;assert not p.is_symlink() and p.parent==home
 if p.exists():p.unlink()
subprocess.run(['systemctl','daemon-reload'],check=True)
after={s:subprocess.run(['systemctl','show',s,'--property=ActiveState,MainPID,ExecMainStartTimestampMonotonic,NRestarts'],capture_output=True,text=True,check=True).stdout for s in expected}
assert after==expected and hashlib.sha256(Path('/etc/news-flow/ai.env').read_bytes()).hexdigest()==AI
print(json.dumps({'removed':deleted,'forumUnitsRemoved':True,'newsUnchanged':True,'aiEnvUnchanged':True,'news':after}))
'''.replace('NEWS',repr(exported['newsBefore'])).replace('AI',repr(exported['aiHash'])).replace('HOME',repr(str(Path(prepared['sourceBundle']).parent).replace('\\','/')))
  result={'target':target_result,'source':root(source,source_env,cleanup)};(out/'completed.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
 else:raise RuntimeError('Choose an explicit migration phase')
finally:
 if source:source.close()
 if target:target.close()
