import json,subprocess,hashlib
from pathlib import Path
unit=Path('/etc/systemd/system/forum-flow.service');text=unit.read_text();pid=int(subprocess.check_output(['systemctl','show','forum-flow','-p','MainPID','--value'],text=True));args=Path('/proc/'+str(pid)+'/cmdline').read_bytes().decode().split(chr(0)) if pid else [];children=[]
if pid:
 for child in Path('/proc/'+str(pid)+'/task/'+str(pid)+'/children').read_text().split():
  cargs=Path('/proc/'+child+'/cmdline').read_bytes().decode().split(chr(0));children.append({'pid':child,'options':[{a:cargs[i+1] if i+1<len(cargs) and cargs[i+1].isdigit() else 'set'} for i,a in enumerate(cargs) if a.startswith('--max-')]})
print(json.dumps({'pid':pid,'executable':Path('/proc/'+str(pid)+'/exe').resolve().name if pid else None,'flagLineIndexes':[i for i,l in enumerate(text.splitlines()) if '--max-catchup' in l],'standaloneBadFlag':any(l.strip().startswith('--max-catchup') for l in text.splitlines()),'literalBackslashN':chr(92)+'n' in text,'options':[{a:args[i+1] if i+1<len(args) and args[i+1].isdigit() else 'set'} for i,a in enumerate(args) if a.startswith('--max-')],'children':children,'unitSha':hashlib.sha256(unit.read_bytes()).hexdigest(),'services':subprocess.check_output(['systemctl','show','forum-flow','forum-flow-writer','-p','Id,MainPID,ActiveState,NRestarts'],text=True)}))
