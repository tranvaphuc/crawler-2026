from pathlib import Path
import sys,json,shlex,hashlib
sys.path.insert(0,str(Path('.cache/forum-deploy-python').resolve()))
import paramiko
from dotenv import dotenv_values
env=dotenv_values('../social-trend/.env');out=Path('outputs/forum-deploy-2026-11-17')
raise SystemExit('Legacy139.99.192.72 installer disabled: forum moved to148.113.144.41. See docs/forum-eastdata-flow.md and scripts/migrate_forum_vps.py.')
client=paramiko.SSHClient();client.load_system_host_keys();client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
 client.connect(env['SSH_HOST'],username=env['SSH_USER'],password=env['SSH_PASS'],timeout=15,allow_agent=False,look_for_keys=False)
 sftp=client.open_sftp();home=sftp.normalize('.');archive=home+'/.forum-flow-release-20261117.tar.gz';proof=home+'/.forum-flow-proof-20261117.json'
 sftp.put(str(out/'release.tar.gz'),archive);sftp.put('outputs/forum-flow-es5-preflight-2026-11-17.json',proof);sftp.chmod(archive,0o600);sftp.chmod(proof,0o600);sftp.close()
 expected=json.loads((out/'manifest.json').read_text())['sha256']
 code=r'''
import os,json,subprocess,hashlib,shutil,tarfile,pwd,grp
from pathlib import Path
archive=Path(ARCHIVE);proof=Path(PROOF);release=Path('/opt/forum-flow/releases/20261117-01')
assert not release.exists(),'Forum release already exists'
assert hashlib.sha256(archive.read_bytes()).hexdigest()==EXPECTED
assert str(release.resolve()).startswith('/opt/forum-flow/releases/')
ai=Path('/etc/news-flow/ai.env');ai_before=hashlib.sha256(ai.read_bytes()).hexdigest() if ai.exists() else None
def news_snapshot():
 units=subprocess.run(['systemctl','list-units','--type=service','--all','--plain','--no-legend','news*'],capture_output=True,text=True,check=True).stdout
 names=[line.split()[0] for line in units.splitlines() if line.strip()]
 status={name:subprocess.run(['systemctl','show',name,'--property=ActiveState,SubState,MainPID,ExecMainStartTimestampMonotonic,NRestarts'],capture_output=True,text=True,check=True).stdout for name in names}
 return {'units':status,'release':os.path.realpath('/opt/news-flow/current')}
news_before=news_snapshot()
print(json.dumps({'phase':'before','cpuCount':os.cpu_count(),'loadAverage':os.getloadavg(),'news':news_before}),flush=True)
subprocess.run(['useradd','--system','--home','/var/lib/forum-flow','--shell','/usr/sbin/nologin','forum-flow'],check=False,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
uid=pwd.getpwnam('forum-flow').pw_uid;gid=grp.getgrnam('forum-flow').gr_gid
for name,mode in [('/opt/forum-flow',0o755),('/opt/forum-flow/releases',0o755),('/etc/forum-flow',0o750),('/var/lib/forum-flow',0o750),('/var/lib/forum-flow/runtime',0o750)]:
 p=Path(name);p.mkdir(parents=True,exist_ok=True);p.chmod(mode)
 if name.startswith('/var/lib/forum-flow'):os.chown(p,uid,gid)
 if name=='/etc/forum-flow':os.chown(p,0,gid)
release.mkdir(mode=0o755)
with tarfile.open(archive,'r:gz') as tar:
 for member in tar.getmembers():assert not member.name.startswith('/') and '..' not in Path(member.name).parts and member.isfile()
 tar.extractall(release)
for p in release.rglob('*'):p.chmod(0o755 if p.is_dir() else 0o644)
node='/opt/news-flow/node/bin/node';npm='/opt/news-flow/node/bin/npm'
node_code="const fs=require('fs');const dotenv=require('/opt/news-flow/current/node_modules/dotenv');const e=dotenv.parse(fs.readFileSync('/etc/news-flow/news.env'));if(!e.ES5_HOST)throw Error('ES5_HOST_MISSING');fs.writeFileSync('/etc/forum-flow/forum.env','ES5_HOST='+JSON.stringify(e.ES5_HOST)+String.fromCharCode(10),{mode:0o640});"
subprocess.run([node,'-e',node_code],check=True)
os.chown('/etc/forum-flow/forum.env',0,gid)
shutil.copyfile(proof,'/etc/forum-flow/identity-proof.json');os.chmod('/etc/forum-flow/identity-proof.json',0o640);os.chown('/etc/forum-flow/identity-proof.json',0,gid)
(release/'.env').symlink_to('/etc/forum-flow/forum.env')
runenv=dict(os.environ,PATH='/opt/news-flow/node/bin:'+os.environ['PATH'])
with open('/var/lib/forum-flow/npm-install.log','w') as log:subprocess.run([npm,'install','--ignore-scripts','--no-audit','--no-fund'],cwd=release,env=runenv,stdout=log,stderr=subprocess.STDOUT,check=True)
tests=subprocess.run([node,'--test','test/forum-flow.test.mjs','test/forum-es5.test.mjs','test/news-forum-parser.test.mjs'],cwd=release,capture_output=True,text=True)
Path('/var/lib/forum-flow/tests.tap').write_text(tests.stdout+tests.stderr);assert tests.returncode==0,'Forum tests failed'
current=Path('/opt/forum-flow/current');new=Path('/opt/forum-flow/.next');new.symlink_to(release);new.replace(current)
for unit in ['forum-flow.service','forum-flow-writer.service']:shutil.copyfile(release/'deploy'/unit,Path('/etc/systemd/system')/unit)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','forum-flow.service','forum-flow-writer.service'],check=True,capture_output=True)
assert ai_before==(hashlib.sha256(ai.read_bytes()).hexdigest() if ai.exists() else None),'News AI env changed'
news_after=news_snapshot()
result={'release':str(release),'testsPassed':True,'aiEnvUnchanged':True,'newsUnitsUnchanged':news_before==news_after,'newsBefore':news_before,'newsAfter':news_after,'services':{s:subprocess.run(['systemctl','is-active',s],capture_output=True,text=True).stdout.strip() for s in ['forum-flow.service','forum-flow-writer.service']}}
print(json.dumps(result),flush=True)
'''.replace('ARCHIVE',repr(archive)).replace('PROOF',repr(proof)).replace('EXPECTED',repr(expected))
 stdin,stdout,stderr=client.exec_command('sudo -S -p "" python3 -c '+shlex.quote(code),timeout=300);stdin.write(env['SSH_PASS']+'\n');stdin.flush();stdin.channel.shutdown_write();output=stdout.read().decode();error=stderr.read().decode();status=stdout.channel.recv_exit_status()
 (out/'deploy-result.txt').write_text(output+'\n'+error,encoding='utf-8');print(output);print(json.dumps({'exit':status,'error':error[:1200]}));assert status==0,'Forum deployment failed; see local deploy-result.txt'
finally:client.close()
