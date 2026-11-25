set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/recovery-all-20261123
systemctl kill --kill-who=main --signal=SIGTERM news-recovery-stage-v3-20261123
for i in $(seq 1 40); do
  if ! systemctl is-active --quiet news-recovery-stage-v3-20261123; then break; fi
  sleep 1
done
if systemctl is-active --quiet news-recovery-stage-v3-20261123; then echo STAGE_STILL_DRAINING; exit 1; fi
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-recovery-all-stage-v4.mjs" "$root/stage-v4.mjs"
python3 - <<'PY'
import sqlite3
p='/var/lib/news-flow/recovery-all-20261123/audit.sqlite';db=sqlite3.connect(p);db.execute("DELETE FROM stage_results WHERE status='not_staged'");db.commit();db.close()
PY
systemd-run --unit=news-recovery-stage-v4-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=3G --property=CPUQuota=200% --property=TasksMax=60 --working-directory=/opt/news-flow/current /opt/news-flow/node/bin/node --max-old-space-size=1024 "$root/stage-v4.mjs"
