set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/recovery-all-20261123
python3 - <<'PY'
import sqlite3
d=sqlite3.connect('file:/var/lib/news-flow/recovery-all-20261123/audit.sqlite?mode=ro',uri=True)
assert d.execute("SELECT count(*) FROM cohort WHERE status!='done'").fetchone()[0]==0,'FULL_COHORT_STILL_RUNNING'
PY
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-recovery-all-final-groups.mjs" "$root/final-groups.mjs"
systemd-run --unit=news-recovery-final-groups-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=5G --property=CPUQuota=300% --property=TasksMax=80 --working-directory=/opt/news-flow/current /opt/news-flow/node/bin/node --max-old-space-size=1536 "$root/final-groups.mjs"
