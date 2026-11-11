import sys,json,re,shlex
from pathlib import Path
from urllib.parse import urlparse
sys.path.insert(0,str(Path('.cache/project-refresh-python').resolve()))
import paramiko
sys.stdout.reconfigure(encoding='utf-8')
env={}
for line in Path('.env').read_text(encoding='utf-8').splitlines():
 m=re.match(r'^([\w]+)=(.*)$',line)
 if m:env[m[1]]=m[2].strip().strip('"').strip("'")
h=urlparse(env['SSH_CRAWL_HOST'] if '://' in env['SSH_CRAWL_HOST'] else 'ssh://'+env['SSH_CRAWL_HOST'])
c=paramiko.SSHClient();c.load_system_host_keys(str(Path.home()/'.ssh/known_hosts'))
pin=Path('outputs/project-refresh-2026-11-10/ssh-known-hosts')
if pin.exists():c.load_host_keys(str(pin))
else:
 pin.touch();c.load_host_keys(str(pin));c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
 c.connect(h.hostname,port=h.port or 22,username=env['SSH_CRAWL_NAME'],password=env['SSH_CRAWL_PASS'],look_for_keys=False,allow_agent=False,timeout=20)
 if sys.argv[1] in ('exec','apply'):
  if sys.argv[1]=='apply':
   with c.open_sftp() as s:s.put('outputs/project-refresh-2026-11-10/source-import-payload.json.gz','/tmp/project-refresh-import-20261110.json.gz')
  command=Path(sys.argv[2]).read_text(encoding='utf-8'); _,out,err=c.exec_command('bash -c '+shlex.quote(command),timeout=300)
  text=out.read().decode('utf-8',errors='replace')+err.read().decode('utf-8',errors='replace')
  for k,v in env.items():
   if re.search('PASS|KEY|TOKEN|URI',k) and len(v)>5:text=text.replace(v,'[REDACTED]')
  print(text);sys.exit(out.channel.recv_exit_status())
 elif sys.argv[1]=='put':
  with c.open_sftp() as s:s.put(sys.argv[2],sys.argv[3])
 elif sys.argv[1]=='get':
  with c.open_sftp() as s:s.get(sys.argv[2],sys.argv[3])
finally:c.close()
