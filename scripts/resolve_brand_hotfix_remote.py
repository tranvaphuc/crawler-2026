from pathlib import Path
import sys,shlex,json
sys.stdout.reconfigure(encoding='utf-8');sys.path.insert(0,str(Path('.cache/forum-deploy-python').resolve()))
import paramiko
from dotenv import dotenv_values
env=dotenv_values('../cms-2026/.env');assert env['SSH_HOST']=='148.113.144.41'
c=paramiko.SSHClient();c.load_system_host_keys();c.set_missing_host_key_policy(paramiko.AutoAddPolicy());c.connect(env['SSH_HOST'],username=env['SSH_USER'],password=env['SSH_PASS'],timeout=20,allow_agent=False,look_for_keys=False)
def root(code):
 i,o,e=c.exec_command('sudo -S -p "" python3 -c '+shlex.quote(code),timeout=60);i.write(env['SSH_PASS']+'\n');i.flush();i.channel.shutdown_write();out=o.read().decode();err=e.read().decode();rc=o.channel.recv_exit_status()
 if rc:raise RuntimeError(err[:1600])
 print(out)
try:
 if '--deploy' in sys.argv:
  s=c.open_sftp()
  for name in ['forum_brand_hotfix_resolve_20261117.mjs','forum_brand_hotfix_precision_20261117.mjs']:s.put('scripts/'+name,'/tmp/'+name)
  s.put('../eastdata/scripts/forum/sites/voz.vn.json','/tmp/hotfix-legacy-voz.json');s.close()
  root('''
import pathlib,shutil,sqlite3,subprocess,json,hashlib
p=pathlib.Path('/opt/forum-brand-hotfix-20261117');d=pathlib.Path('/var/lib/forum-brand-hotfix-20261117/run')
assert (p/'src').resolve()==p/'src-frozen'
for name in ['forum_brand_hotfix_resolve_20261117.mjs','forum_brand_hotfix_precision_20261117.mjs']:shutil.copy('/tmp/'+name,p/'scripts'/name)
shutil.copy('/tmp/hotfix-legacy-voz.json',p/'legacy-voz.json')
b=d/'before-resolution.sqlite'
assert not b.exists(),'Resolution backup already exists'
src=sqlite3.connect('file:'+str(d/'state.sqlite')+'?mode=ro',uri=True);dst=sqlite3.connect(b);src.backup(dst);dst.close();src.close()
units=['forum-flow','forum-flow-writer'];info=subprocess.check_output(['systemctl','show',*units,'-p','MainPID,NRestarts,ExecMainStartTimestamp,ActiveState']).decode();(d/'resolution-services-before.txt').write_text(info);print(info)
''')
 if '--plan' in sys.argv or '--write' in sys.argv:
  write='--write' in sys.argv;unit='forum-brand-hotfix-resolve-'+('write' if write else 'plan')+'-20261117'
  cmd=['systemd-run','--unit='+unit,'--uid=forum-flow','--property=WorkingDirectory=/opt/forum-brand-hotfix-20261117','--property=CPUQuota=20%','--property=MemoryMax=256M','--property=Nice=10','/opt/forum-flow/node/bin/node','scripts/forum_brand_hotfix_resolve_20261117.mjs']+(['--write'] if write else [])
  root('import subprocess;print(subprocess.check_output('+repr(cmd)+',stderr=subprocess.STDOUT).decode())')
 if '--status' in sys.argv:
  root('''
import subprocess,pathlib,json
for u in ['forum-brand-hotfix-resolve-plan-20261117','forum-brand-hotfix-resolve-write-20261117','forum-flow','forum-flow-writer']:print(u,subprocess.check_output(['systemctl','show',u,'-p','ActiveState,SubState,MainPID,NRestarts,ExecMainStatus']).decode())
print(subprocess.check_output(['journalctl','-u','forum-brand-hotfix-resolve-plan-20261117','-u','forum-brand-hotfix-resolve-write-20261117','-n','8','--no-pager','-o','cat']).decode())
''')
 if '--pull' in sys.argv:
  s=c.open_sftp();p=Path('outputs/forum-brand-hotfix-2026-11-17')
  for n in ['resolution-plan.json','resolution-result.json','resolution-services-before.txt']:
   try:s.get('/var/lib/forum-brand-hotfix-20261117/run/'+n,str(p/n))
   except FileNotFoundError:pass
  s.close()
finally:c.close()
