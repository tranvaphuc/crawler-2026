"""Run authorized repair scripts on the existing VPSes without exposing credentials."""
import argparse, base64, hashlib, json, shlex, subprocess, sys, time
from pathlib import Path
from urllib.parse import urlparse
sys.path.insert(0,str(Path('.cache/project-refresh-python').resolve()))
sys.path.insert(0,str(Path('.cache/forum-deploy-python').resolve()))
import paramiko
from dotenv import dotenv_values
sys.stdout.reconfigure(encoding='utf-8')
p=argparse.ArgumentParser();p.add_argument('flow',choices=['news','forum']);p.add_argument('mode',choices=['python','bash','node','put','get']);p.add_argument('file');p.add_argument('remote',nargs='?');p.add_argument('--output');a=p.parse_args()
if a.flow=='news':
 env=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import fs from 'node:fs';import dotenv from 'dotenv';const e=dotenv.parse(fs.readFileSync('../social-trend/.env'));process.stdout.write(JSON.stringify({SSH_HOST:e.SSH_HOST,SSH_USER:e.SSH_USER,SSH_PASS:e.SSH_PASS}));"],text=True))
else:env=dotenv_values('../cms-2026/.env')
target=urlparse(env['SSH_HOST'] if '://' in env['SSH_HOST'] else 'ssh://'+env['SSH_HOST'])
def safe(s):
 for k in ['SSH_PASS','SSH_HOST','SSH_USER']:
  v=env.get(k)
  if v and len(v)>3:s=s.replace(v,'[REDACTED]')
 return s
c=paramiko.SSHClient();c.load_system_host_keys();pin=Path('outputs/news-deploy-2026-11-13/known_hosts')
if pin.exists():c.load_host_keys(str(pin))
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
 c.connect(target.hostname,port=target.port or 22,username=env['SSH_USER'],password=env['SSH_PASS'],look_for_keys=False,allow_agent=False,timeout=20);c.get_transport().set_keepalive(15)
 if a.mode in ['put','get']:
  with c.open_sftp() as s:
   if a.mode=='put':s.put(a.file,a.remote);s.chmod(a.remote,0o600)
   else:s.get(a.remote,a.file)
  print('TRANSFER_COMPLETE')
 else:
  code=Path(a.file).read_text(encoding='utf-8').replace('\r\n','\n')
  command={'python':'python3 -c '+shlex.quote(code),'bash':'/bin/bash -s','node':'/opt/'+a.flow+'-flow/node/bin/node --input-type=module -e '+shlex.quote(code)}[a.mode]
  stdin,stdout,stderr=c.exec_command('cd /opt/'+a.flow+'-flow/current && sudo -S -p "" -- '+command,timeout=3600)
  stdin.write(env['SSH_PASS']+'\n'+(code if a.mode=='bash' else ''));stdin.flush();stdin.channel.shutdown_write()
  channel=stdout.channel;buffer=b'';collected=[]
  while True:
   for ready,recv in [(channel.recv_ready,channel.recv),(channel.recv_stderr_ready,channel.recv_stderr)]:
    if ready():buffer+=recv(65536)
   while b'\n' in buffer:
    line,buffer=buffer.split(b'\n',1);line=safe(line.decode(errors='replace'));collected.append(line);print(line,flush=True)
   if channel.exit_status_ready() and not channel.recv_ready() and not channel.recv_stderr_ready():break
   time.sleep(.05)
  if buffer:line=safe(buffer.decode(errors='replace'));collected.append(line);print(line,flush=True)
  if a.output:Path(a.output).write_text('\n'.join(collected)+'\n',encoding='utf-8')
  sys.exit(channel.recv_exit_status())
except Exception as e:
 print(safe(type(e).__name__+': '+str(e)),flush=True);sys.exit(1)
finally:c.close()
