set -euo pipefail
python3 - <<'PY'
import os,signal,json,time,hashlib
from pathlib import Path
r=Path('/var/lib/news-flow/recovery-all-20261123');current=json.loads((r/'redirect-canary.json').read_text())
if current.get('approved'):print(json.dumps({'alreadyApproved':True}));raise SystemExit(0)
stopped=[]
for p in Path('/proc').iterdir():
 if p.name.isdigit():
  try:
   args=(p/'cmdline').read_bytes().decode().split(chr(0))
   if str(r/'redirect-canary.mjs') in args and (p/'exe').resolve().name=='node':os.kill(int(p.name),signal.SIGTERM);stopped.append(int(p.name))
  except (OSError,UnicodeError):pass
p=Path('/opt/news-flow/current/src/newsFlow/processor.mjs');assert hashlib.sha256(p.read_bytes()).hexdigest()=='8c0552b0b6e61da90f69365adf7e560656bcb4742eb4cbe8f44fa33f0ece4458';old=(r/'before-processor-redirect.mjs').read_bytes();assert hashlib.sha256(old).hexdigest()=='40c94264af311fd4433e539e23273f9eeea7b3634d0305689738b377733aa2a8';p.write_bytes(old);(r/'redirect-canary-attempt-1.json').write_text(json.dumps(current,indent=2));print(json.dumps({'stoppedOwnCanary':stopped,'processorRestored':True,'mainServicesNotRestarted':True}))
PY
