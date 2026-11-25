import json,hashlib,subprocess
from pathlib import Path
root=Path('/var/lib/forum-flow/recovery-all-20261123');r={'files':[],'service':subprocess.check_output(['systemctl','show','forum-flow','forum-flow-writer','-p','Id,MainPID,ActiveState,NRestarts'],text=True)}
for rel in ['src/forumFlow/state.mjs','src/forumFlow/runtime.mjs']:
 p=Path('/opt/forum-flow/current')/rel;b=p.read_bytes();(root/('before-'+p.name)).write_bytes(b);r['files'].append({'path':str(p),'sha256':hashlib.sha256(b).hexdigest(),'text':b.decode('utf-8')})
print(json.dumps(r,ensure_ascii=True))
