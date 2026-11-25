"""Password SSH helper for the user-authorized news VPS; secrets stay out of argv/logs."""
import sys,subprocess,json,shlex,time,hashlib,base64
from pathlib import Path
from urllib.parse import urlparse
sys.path.insert(0,str(Path('.cache/project-refresh-python').resolve()))
import paramiko
sys.stdout.reconfigure(encoding='utf-8')
settings=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import fs from 'node:fs';import dotenv from 'dotenv';const ssh=dotenv.parse(fs.readFileSync('../social-trend/.env'));const local=dotenv.parse(fs.readFileSync('.env'));process.stdout.write(JSON.stringify({SSH_HOST:ssh.SSH_HOST,SSH_USER:ssh.SSH_USER,SSH_PASS:ssh.SSH_PASS,ES5_HOST:local.ES5_HOST}));"],text=True))
if not all(settings.get(k) for k in ['SSH_HOST','SSH_USER','SSH_PASS']):raise RuntimeError('SSH_SETTINGS_MISSING')
target=urlparse(settings['SSH_HOST'] if '://' in settings['SSH_HOST'] else 'ssh://'+settings['SSH_HOST'])
root=Path('outputs/news-deploy-2026-11-13');root.mkdir(parents=True,exist_ok=True)
pin=root/'known_hosts';pin.touch(exist_ok=True)
client=paramiko.SSHClient();client.load_system_host_keys();client.load_host_keys(str(pin))
class PinFirstKey(paramiko.MissingHostKeyPolicy):
 def missing_host_key(self,client,hostname,key):
  client.get_host_keys().add(hostname,key.get_name(),key);client.save_host_keys(str(pin))
  print('SSH_HOST_KEY_PINNED SHA256:'+base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip('='),flush=True)
client.set_missing_host_key_policy(PinFirstKey())
def safe(text):
 for value in settings.values():
  if value and len(value)>3:text=text.replace(value,'[REDACTED]')
 return text
try:
 client.connect(target.hostname,port=target.port or 22,username=settings['SSH_USER'],password=settings['SSH_PASS'],look_for_keys=False,allow_agent=False,timeout=20,banner_timeout=20,auth_timeout=20)
 client.get_transport().set_keepalive(15)
 mode=sys.argv[1]
 if mode in ['exec','sudo']:
  script=Path(sys.argv[2]).read_text(encoding='utf-8').replace('\r\n','\n')
  channel=client.get_transport().open_session();channel.exec_command("sudo -S -p '' -- /bin/bash -s" if mode=='sudo' else 'bash -s')
  channel.sendall(((settings['SSH_PASS']+'\n' if mode=='sudo' else '')+script).encode());channel.shutdown_write();pending=b''
  while True:
   chunk=b''
   if channel.recv_ready():chunk+=channel.recv(65536)
   if channel.recv_stderr_ready():chunk+=channel.recv_stderr(65536)
   pending+=chunk
   while b'\n' in pending:
    line,pending=pending.split(b'\n',1);print(safe(line.decode(errors='replace')),flush=True)
   if channel.exit_status_ready() and not channel.recv_ready() and not channel.recv_stderr_ready():break
   time.sleep(.05)
  if pending:print(safe(pending.decode(errors='replace')),flush=True)
  sys.exit(channel.recv_exit_status())
 elif mode=='upload-release':
  uploads=[('outputs/news-deploy-2026-11-13/release.tar.gz','.news-flow-release-20261113.tar.gz'),('outputs/news-deploy-2026-11-13/news.env','.news-flow-config-20261113.env'),('outputs/news-flow-runtime/proxies.credentials.json','.news-flow-proxy-20261113.json'),('outputs/news-deploy-2026-11-13/identity-proof.summary.json','.news-flow-proof-20261113.json')]
  with client.open_sftp() as s:
   for local,remote in uploads:s.put(local,remote);s.chmod(remote,0o600)
  print('RELEASE_AND_PRIVATE_CONFIG_UPLOADED',flush=True)
 elif mode=='upload-ai':
  private_ai=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import fs from 'node:fs';import dotenv from 'dotenv';const e=dotenv.parse(fs.readFileSync('../social-trend/.env'));const project=dotenv.parse(fs.readFileSync('.env'));process.stdout.write(JSON.stringify({key:e.OPENAI_API_KEY||e.AI_GPT_KEY,calls:e.AI_DAILY_MAX_CALLS,budget:project.AI_DAILY_BUDGET_USD??e.AI_DAILY_BUDGET_USD}));"],text=True))
  key=private_ai.get('key');calls=int(private_ai.get('calls') or 200);budget=float(private_ai.get('budget') or 1)
  if not key or calls<1 or budget<=0:raise RuntimeError('AUTHORIZED_AI_SETTINGS_INVALID')
  settings['AI_GPT_KEY']=key
  body='NEWS_AI_ENABLED=true\nNEWS_AI_MODEL=gpt-5.4-mini\nAI_GPT_KEY='+json.dumps(key)+'\nAI_DAILY_MAX_CALLS='+str(calls)+'\nAI_DAILY_BUDGET_USD='+str(budget)+'\n'
  with client.open_sftp() as s:
   with s.file('.news-flow-ai.env','w') as f:
    s.chmod('.news-flow-ai.env',0o600);f.write(body);f.flush()
  print('AUTHORIZED_AI_CONFIG_UPLOADED_PRIVATE',flush=True)
 elif mode=='put':
  with client.open_sftp() as s:s.put(sys.argv[2],sys.argv[3]);s.chmod(sys.argv[3],0o600)
  print('UPLOAD_COMPLETE',flush=True)
 elif mode=='get':
  with client.open_sftp() as s:s.get(sys.argv[2],sys.argv[3])
  print('DOWNLOAD_COMPLETE',flush=True)
 else:raise RuntimeError('INVALID_REMOTE_MODE')
except Exception as error:
 print(safe('NEWS_SSH_ERROR '+type(error).__name__+': '+str(error)),flush=True);sys.exit(1)
finally:client.close()
