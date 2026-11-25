from pathlib import Path
import sys,json,shlex
sys.path.insert(0,str(Path('.cache/forum-deploy-python').resolve()))
import paramiko
from dotenv import dotenv_values
source=dotenv_values('.env');env=dotenv_values('../social-trend/.env') if '--news-server' in sys.argv else {'SSH_HOST':source.get('SSH_CRAWL_HOST'),'SSH_USER':source.get('SSH_CRAWL_NAME'),'SSH_PASS':source.get('SSH_CRAWL_PASS')};client=paramiko.SSHClient();client.load_system_host_keys();client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
 client.connect(env['SSH_HOST'],username=env['SSH_USER'],password=env['SSH_PASS'],timeout=15,allow_agent=False,look_for_keys=False)
 code=r'''
import subprocess,json,os,shutil
listing=subprocess.run(['systemctl','list-units','--type=service','--all','--plain','--no-legend','crawler*'],capture_output=True,text=True,check=True).stdout
names=[line.split()[0] for line in listing.splitlines() if line.strip()]
units=[]
for name in names:
 props=subprocess.run(['systemctl','show',name,'--property=ActiveState,SubState,MainPID,WorkingDirectory'],capture_output=True,text=True,check=True).stdout
 parsed=dict(line.split('=',1) for line in props.splitlines() if '=' in line)
 units.append({'unit':name,**parsed})
docker=subprocess.run(['docker','ps','--format','{{.Names}}\t{{.Status}}\t{{.Ports}}'],capture_output=True,text=True).stdout if shutil.which('docker') else ''
print(json.dumps({'services':units,'crawlerCurrent':os.path.realpath('/opt/crawler-v8/current'),'containers':docker.splitlines()}))
'''
 stdin,stdout,stderr=client.exec_command('sudo -S -p "" python3 -c '+shlex.quote(code),timeout=60);stdin.write(env['SSH_PASS']+'\n');stdin.flush();stdin.channel.shutdown_write();output=stdout.read().decode();status=stdout.channel.recv_exit_status()
 if output:
  result=json.loads(output);result['server']=env['SSH_HOST'];out=Path('outputs/social-queue-location-2026-11-17.json');out.write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
 if status:print(json.dumps({'exit':status,'error':stderr.read().decode()[:800]}))
 assert status==0,'Inventory failed'
finally:client.close()
