set -euo pipefail
python3 - <<'PY'
import json,re,subprocess
from pathlib import Path
unit='news-flow-baomoi-original.service'
r={'services':subprocess.check_output(['systemctl','show',unit,'-p','Id,MainPID,NRestarts,Result,ExecMainCode,ExecMainStatus,ExecMainStartTimestamp,WatchdogUSec,WatchdogTimestamp,ControlGroup'],text=True),'messages':[]}
for line in subprocess.check_output(['journalctl','-u',unit,'--since','30 minutes ago','-n','220','-o','json','--no-pager'],text=True).splitlines():
 try:v=json.loads(line);m=v.get('MESSAGE','')
 except ValueError:continue
 if not isinstance(m,str):continue
 try:
  a=json.loads(m)
  if not isinstance(a,dict):continue
  entry={k:a[k] for k in ['at','event','status','code','reason','paidAiCalls','admitted'] if k in a and not isinstance(a[k],(dict,list))}
  entry['keys']=list(a)
  if 'error' in a:entry['error']=a['error'] if isinstance(a['error'],str) and re.fullmatch(r'[\w :.,_-]{1,200}',a['error']) else 'REDACTED_NONCODE_ERROR'
  r['messages'].append(entry)
 except ValueError:
  if re.search('watchdog|oom|core.dump|failed|killed|fatal|Error:|code=',m,re.I):
   r['messages'].append({'time':v.get('__REALTIME_TIMESTAMP'),'systemd':m[:240] if re.fullmatch(r'[\w .,:;=+()\[\]/_-]{1,400}',m) else 'EXCEPTION_TEXT_REDACTED','codes':re.findall(r'SQLITE_[A-Z_]+|ERR_[A-Z_]+|NEWS_[A-Z_]+|SIG[A-Z]+',m)})
cg=next((s.split('=',1)[1] for s in r['services'].splitlines() if s.startswith('ControlGroup=')),None)
if cg:
 for name in ['memory.events','cpu.stat']:
  p=Path('/sys/fs/cgroup'+cg+'/'+name)
  if p.exists():r[name]=p.read_text()
Path('/var/lib/news-flow/stability-20261123/baomoi-branch-inspection.json').write_text(json.dumps(r,indent=2))
print(json.dumps(r))
PY
