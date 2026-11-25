set -euo pipefail
cd /opt/news-flow/current
python3 - <<'PY'
import json,subprocess,hashlib
from pathlib import Path
r={}
for file in ['src/newsFlow/originalReconciliationRead.mjs','scripts/run_baomoi_original_branch.mjs','src/web/newsPublicationPageIdentity.mjs']:
 p=Path(file)
 if p.exists():r[file]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'text':p.read_text()}
logs=subprocess.check_output(['journalctl','-u','news-flow-baomoi-original','--since','2026-11-23 01:50:00 UTC','-o','cat','--no-pager'],text=True).splitlines()
r['stack']=[s for i,s in enumerate(logs) if 'StatusCodeError: Request Timeout' in s for s in logs[max(0,i-5):i+14] if not any(v in s.lower() for v in ['authorization','password','host:','headers:'])]
for site in ['cadn.com.vn','depviet.net.vn']:
 p=Path('config/web-sources/news')/(site+'.json');c=json.loads(p.read_text());r[site]={k:v for k,v in c.items() if 'timezone' in k.lower() or 'policy' in k.lower() or 'provenance' in k.lower()}
print(json.dumps(r,ensure_ascii=False))
PY
