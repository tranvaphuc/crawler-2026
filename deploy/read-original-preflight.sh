set -euo pipefail
python3 - <<'PY'
import json
from pathlib import Path
r=Path('/var/lib/news-flow/baomoi-original-branch-20261120')
for p in r.glob('*/result.json'):
 d=json.loads(p.read_text());print(json.dumps({'host':p.parent.name,'approved':d['approved'],'articles':[{'url':a['url'],'error':a.get('error'),'issues':a.get('issues'),'state':a['state']} for a in d['report']['articles']],'pages':d['report']['pages']}))
PY
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
tar -czf "$upload_dir/.original-preflight.tgz" -C /var/lib/news-flow/baomoi-original-branch-20261120 .
chown "$SUDO_USER" "$upload_dir/.original-preflight.tgz"
chmod 600 "$upload_dir/.original-preflight.tgz"
