set -euo pipefail
python3 - <<'PY'
import json
from pathlib import Path
b=Path('/opt/news-flow/current');r=Path('/var/lib/news-flow/recovery-all-20261123')
print('POLICY', (b/'src/web/newsSeedTransientFailures.mjs').read_text())
p=r/'new-operational-source-audit.json'
if p.exists():
 v=json.loads(p.read_text());print('NEW_SOURCES',json.dumps(v,ensure_ascii=False))
print('CONFIG_REFS')
for p in (b/'configs').rglob('*.json'):
 t=p.read_text()
 if 'seedTransient' in t:print(str(p),t[:1200])
PY
