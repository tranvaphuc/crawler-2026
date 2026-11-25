set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/recovery-all-20261123
python3 - <<'PY'
import json
from pathlib import Path
assert json.loads(Path('/var/lib/news-flow/recovery-all-20261123/redirect-canary.json').read_text())['approved']
PY
if systemctl is-active --quiet news-recovery-all-20261123; then
  systemctl kill --kill-who=main --signal=SIGTERM news-recovery-all-20261123
  for i in $(seq 1 50); do
    if ! systemctl is-active --quiet news-recovery-all-20261123; then break; fi
    sleep 1
  done
fi
if systemctl is-active --quiet news-recovery-all-20261123; then echo AUDIT_STILL_DRAINING; exit 1; fi
python3 - <<'PY'
import sqlite3,json
from pathlib import Path
r=Path('/var/lib/news-flow/recovery-all-20261123');d=sqlite3.connect('file:'+str(r/'audit.sqlite')+'?mode=ro',uri=True)
assert d.execute("SELECT count(*) FROM cohort WHERE status='running'").fetchone()[0]==0
if (r/'audit-summary.json').exists():(r/'audit-summary-run-1.json').write_bytes((r/'audit-summary.json').read_bytes())
print(json.dumps({'remaining':d.execute("SELECT count(*) FROM cohort WHERE status!='done'").fetchone()[0]}))
PY
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-recovery-all-audit-v2.mjs" "$root/audit-v2.mjs"
systemd-run --unit=news-recovery-all-v2-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=14G --property=CPUQuota=800% --property=TasksMax=160 --working-directory=/opt/news-flow/current /opt/news-flow/node/bin/node --max-old-space-size=4096 "$root/audit-v2.mjs"
