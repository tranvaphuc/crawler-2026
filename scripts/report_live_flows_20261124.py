"""Read-only remote flow snapshots; write diagnostic evidence locally only."""
import concurrent.futures, datetime, json, shlex, subprocess, sys
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path('.cache/project-refresh-python').resolve()))
sys.path.insert(0, str(Path('.cache/forum-deploy-python').resolve()))
import paramiko
from dotenv import dotenv_values

sys.stdout.reconfigure(encoding='utf-8')
out = Path('outputs/flow-report-2026-11-24')
out.mkdir(parents=True, exist_ok=True)
source = Path('scripts/qc_stability_snapshot_20261123.py').read_text(encoding='utf-8')
source = source.replace("root.mkdir(exist_ok=True,mode=0o700)", 'None')
source = source.split("r['finishedAt']=")[0]
source += "\nr['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()\nprint(json.dumps(r,ensure_ascii=False))\n"
news = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import fs from 'node:fs';import dotenv from 'dotenv';const e=dotenv.parse(fs.readFileSync('../social-trend/.env'));process.stdout.write(JSON.stringify({SSH_HOST:e.SSH_HOST,SSH_USER:e.SSH_USER,SSH_PASS:e.SSH_PASS}));"], text=True))
forum = dotenv_values('../cms-2026/.env')

def snapshot(flow, env):
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    pin = Path('outputs/news-deploy-2026-11-13/known_hosts')
    if pin.exists():
        client.load_host_keys(str(pin))
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    target = urlparse(env['SSH_HOST'] if '://' in env['SSH_HOST'] else 'ssh://' + env['SSH_HOST'])
    try:
        client.connect(target.hostname, port=target.port or 22, username=env['SSH_USER'], password=env['SSH_PASS'], look_for_keys=False, allow_agent=False, timeout=20)
        stdin, stdout, stderr = client.exec_command('sudo -S -p "" python3 -c ' + shlex.quote(source), timeout=180)
        stdin.write(env['SSH_PASS'] + '\n')
        stdin.flush()
        stdin.channel.shutdown_write()
        result = stdout.read().decode()
        status = stdout.channel.recv_exit_status()
        if status:
            raise RuntimeError('REMOTE_READ_FAILED ' + stderr.read().decode()[-500:])
        data = json.loads(result)
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        path = out / (flow + '-' + stamp + '.json')
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'flow':flow,'at':data['at'],'path':str(path),'services':data['services'],'imports15m':data.get('imports15m'),'events15m':data.get('events15m'),'outbox':data.get('outbox'),'aiUsage':data.get('aiUsage'),'aiPolicy':data.get('aiPolicy'),'kernelAlerts':data['kernelAlerts']}, ensure_ascii=False), flush=True)
    finally:
        client.close()

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
    futures = [executor.submit(snapshot, flow, env) for flow, env in [('news',news),('forum',forum)]]
    for future in futures:
        future.result()
