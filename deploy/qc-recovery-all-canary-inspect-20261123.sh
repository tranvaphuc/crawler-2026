set -euo pipefail
python3 - <<'PY'
import json,collections,os
from pathlib import Path
r=Path('/var/lib/news-flow/recovery-all-20261123');d=json.loads((r/'redirect-candidates.json').read_text());processes=[]
for p in Path('/proc').iterdir():
 if p.name.isdigit():
  try:
   args=(p/'cmdline').read_bytes().decode().split(chr(0))
   if str(r/'redirect-canary.mjs') in args:processes.append({'pid':int(p.name),'executable':(p/'exe').resolve().name})
  except (OSError,UnicodeError):pass
print(json.dumps({'candidateSites':dict(collections.Counter(x['site'] for x in d['candidates'])),'processes':processes,'oldCanaryApproved':json.loads((r/'redirect-canary.json').read_text()).get('approved')}))
PY
