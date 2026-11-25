"""Reuse three project HTTP proxies on the project Forum VPS over encrypted SSH.
No API keys or proxy credentials are printed or written to this workspace.
"""
import json,shlex,subprocess,sys
from pathlib import Path
sys.path.insert(0,str(Path('.cache/project-refresh-python').resolve()));sys.path.insert(0,str(Path('.cache/forum-deploy-python').resolve()))
import paramiko
from dotenv import dotenv_values
from urllib.parse import urlparse
def connect(env):
 target=urlparse(env['SSH_HOST'] if '://' in env['SSH_HOST'] else 'ssh://'+env['SSH_HOST']);c=paramiko.SSHClient();c.load_system_host_keys();pin=Path('outputs/news-deploy-2026-11-13/known_hosts')
 if pin.exists():c.load_host_keys(str(pin))
 c.set_missing_host_key_policy(paramiko.AutoAddPolicy());c.connect(target.hostname,port=target.port or 22,username=env['SSH_USER'],password=env['SSH_PASS'],look_for_keys=False,allow_agent=False,timeout=20);return c
connections=[]
try:
 news=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import fs from 'node:fs';import dotenv from 'dotenv';const e=dotenv.parse(fs.readFileSync('../social-trend/.env'));process.stdout.write(JSON.stringify({SSH_HOST:e.SSH_HOST,SSH_USER:e.SSH_USER,SSH_PASS:e.SSH_PASS}));"],text=True));forum=dotenv_values('../cms-2026/.env');a=connect(news);connections.append(a)
 code="import json;from pathlib import Path;p=json.loads(Path('/etc/news-flow/proxies.json').read_text())[:3];assert len(p)==3;print(json.dumps(p))"
 stdin,stdout,stderr=a.exec_command('sudo -S -p "" -- python3 -c '+shlex.quote(code));stdin.write(news['SSH_PASS']+'\n');stdin.flush();stdin.channel.shutdown_write();data=stdout.read();assert stdout.channel.recv_exit_status()==0,'PRIVATE_SOURCE_READ_FAILED';values=json.loads(data);assert len(values)==3
 b=connect(forum);connections.append(b)
 install="""import grp,json,os,sys
from pathlib import Path
p=Path('/etc/forum-flow/http-proxies.json');tmp=p.with_name('.http-proxies-20261125.tmp');assert not p.exists() and not tmp.exists()
print('READY',flush=True);data=sys.stdin.buffer.read();values=json.loads(data);assert len(values)==3 and all(x.get('host') and x.get('port') and x.get('username') and x.get('password') for x in values)
fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
os.chown(tmp,0,grp.getgrnam('forum-flow').gr_gid);tmp.chmod(0o640);os.replace(tmp,p);print(json.dumps({'stored':len(values),'mode':'0640','owner':'root:forum-flow'}))
"""
 stdin,stdout,stderr=b.exec_command('sudo -S -p "" -- python3 -c '+shlex.quote(install));stdin.write(forum['SSH_PASS']+'\n');stdin.flush();assert stdout.readline().strip()=='READY','PRIVATE_DESTINATION_NOT_READY';stdin.channel.sendall(data);stdin.channel.shutdown_write();result=json.loads(stdout.read());assert stdout.channel.recv_exit_status()==0 and result['stored']==3,'PRIVATE_DESTINATION_INSTALL_FAILED';print(json.dumps({'reusedProjectHttpProxyCount':3,'localSecretFileCreated':False,'openAiCalls':0,'destinationMode':result['mode']}))
except Exception as e:
 print(json.dumps({'error':type(e).__name__,'operation':'protected_project_http_proxy_setup'}));sys.exit(1)
finally:
 for c in connections:c.close()
