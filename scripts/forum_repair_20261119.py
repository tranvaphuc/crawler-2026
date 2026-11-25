"""Deploy reviewed forum-only repair files and run explicit maintenance steps."""
from pathlib import Path
import sys,shlex,json
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0,str(Path('.cache/forum-deploy-python').resolve()))
import paramiko
from dotenv import dotenv_values
env=dotenv_values('../cms-2026/.env');assert env['SSH_HOST']=='148.113.144.41'
client=paramiko.SSHClient();client.load_system_host_keys();client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
 client.connect(env['SSH_HOST'],username=env['SSH_USER'],password=env['SSH_PASS'],timeout=20,allow_agent=False,look_for_keys=False)
 def root(code):
  i,o,e=client.exec_command('sudo -S -p "" python3 -c '+shlex.quote(code),timeout=300)
  i.write(env['SSH_PASS']+'\n');i.flush();i.channel.shutdown_write();out=o.read().decode();err=e.read().decode();rc=o.channel.recv_exit_status()
  if rc:raise RuntimeError('Forum repair failed: '+err[:1200])
  return out
 action=sys.argv[1]
 if action=='deploy':
  paths=['scripts/run_forum_writer.mjs','src/forumFlow/writerLease.mjs','test/forum-writer-heartbeat.test.mjs','test/forum-writer-resilience.test.mjs','test/forum-writer-recovery.test.mjs','test/forum-bulk-es5.test.mjs','test/forum-parent-selection.test.mjs']
  root("from pathlib import Path;import shutil;p=Path('/tmp/forum-repair-20261119');p.mkdir(exist_ok=True);shutil.chown(p,user="+repr(env['SSH_USER'])+");p.chmod(0o700)")
  s=client.open_sftp()
  for p in paths:s.put(p,'/tmp/forum-repair-20261119/'+Path(p).name)
  s.close()
  output=root(r'''
import pathlib,subprocess,shutil,sqlite3,json,hashlib,time
source=pathlib.Path('/opt/forum-flow/current').resolve();backup=pathlib.Path('/var/backups/forum-flow/writer-repair-20261119');backup.mkdir(exist_ok=True)
assert subprocess.check_output(['systemctl','show','forum-flow-writer','-p','ActiveState','--value'],text=True).strip()=='inactive'
files=['scripts/run_forum_writer.mjs','src/forumFlow/writerLease.mjs']
expected={'scripts/run_forum_writer.mjs':'5096dcc3db9d97f37ac1df0540c2605e2cc1344808bb59683c720fa796221af3','src/forumFlow/writerLease.mjs':'0e7653077c1974ab5179963916e100767851aa7ad38fecb06e0bafb921acbd0d'}
for n in files:assert hashlib.sha256((source/n).read_bytes()).hexdigest()==expected[n],'Source changed since diagnosis'
before={'at':time.time(),'collector':subprocess.check_output(['systemctl','show','forum-flow','-p','MainPID,ExecMainStartTimestamp'],text=True),'collectorHash':hashlib.sha256((source/'scripts/run_forum_flow.mjs').read_bytes()).hexdigest(),'configHash':hashlib.sha256((source/'config/forum-flow/sites.json').read_bytes()).hexdigest()}
(backup/'before.json').write_text(json.dumps(before))
for n in files:shutil.copy(source/n,backup/pathlib.Path(n).name)
unit=pathlib.Path('/etc/systemd/system/forum-flow-writer.service');shutil.copy(unit,backup/'forum-flow-writer.service')
db=sqlite3.connect('file:/var/lib/forum-flow/runtime/state.sqlite?mode=ro',uri=True);dest=sqlite3.connect(backup/'state.sqlite');db.backup(dest);dest.close();db.close()
for n in files:
 temp=source/(n+'.repair19');shutil.copy('/tmp/forum-repair-20261119/'+pathlib.Path(n).name,temp);subprocess.run(['/opt/forum-flow/node/bin/node','--input-type=module','--check'],input=temp.read_bytes(),capture_output=True,check=True);temp.replace(source/n)
tests=['forum-writer-heartbeat','forum-writer-resilience','forum-writer-recovery','forum-bulk-es5','forum-parent-selection']
for n in tests:shutil.copy('/tmp/forum-repair-20261119/'+n+'.test.mjs',source/('test/'+n+'.test.mjs'))
r=subprocess.run(['/opt/forum-flow/node/bin/node','--test']+['test/'+n+'.test.mjs' for n in tests],cwd=source,capture_output=True,text=True);(backup/'tests.txt').write_text(r.stdout+r.stderr)
assert r.returncode==0,'Deployed tests failed; writer kept inactive'
body=unit.read_text();assert 'Restart=on-failure' in body;unit.write_text(body.replace('Restart=on-failure','Restart=always'))
subprocess.run(['systemctl','daemon-reload'],check=True);subprocess.run(['systemctl','start','forum-flow-writer'],check=True)
before['writer']=subprocess.check_output(['systemctl','show','forum-flow-writer','-p','ActiveState,MainPID,NRestarts,Restart'],text=True);before['testsPassed']=24;before['backup']=str(backup)
assert before['collector']==subprocess.check_output(['systemctl','show','forum-flow','-p','MainPID,ExecMainStartTimestamp'],text=True)
(backup/'deployment.json').write_text(json.dumps(before));print(json.dumps(before))
''')
  Path('outputs/forum-status-2026-11-19/deployment.json').write_text(output,encoding='utf-8');print(output)
 elif action=='run':
  print(root(Path(sys.argv[2]).read_text(encoding='utf-8-sig')))
 elif action=='upload':
  s=client.open_sftp()
  for p in sys.argv[2:]:s.put(p,'/tmp/forum-repair-20261119/'+Path(p).name)
  s.close();print(json.dumps({'uploaded':len(sys.argv)-2}))
 elif action=='pull':
  s=client.open_sftp();s.get(sys.argv[2],sys.argv[3]);s.close();print('Evidence downloaded')
 else:raise ValueError('Unknown action')
finally:client.close()
