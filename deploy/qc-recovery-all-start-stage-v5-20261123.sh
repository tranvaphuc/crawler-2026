set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/recovery-all-20261123
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-recovery-all-stage-v5.mjs" "$root/stage-v5.mjs"
python3 - <<'PY'
import sqlite3
p='/var/lib/news-flow/recovery-all-20261123/audit.sqlite';db=sqlite3.connect(p);db.execute("DELETE FROM stage_results WHERE status IN ('not_staged','alias_concurrent_change')");db.commit();db.close()
PY
systemd-run --unit=news-recovery-stage-v5-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=3G --property=CPUQuota=200% --property=TasksMax=60 --working-directory=/opt/news-flow/current /opt/news-flow/node/bin/node --max-old-space-size=1024 "$root/stage-v5.mjs"
