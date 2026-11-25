set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/recovery-all-20261123
systemctl kill --kill-who=main --signal=SIGTERM news-recovery-offline-repair-20261123
for i in $(seq 1 40); do
  if ! systemctl is-active --quiet news-recovery-offline-repair-20261123; then break; fi
  sleep 1
done
if systemctl is-active --quiet news-recovery-offline-repair-20261123; then echo REPAIR_STILL_DRAINING; exit 1; fi
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-recovery-all-offline-repair-v2.mjs" "$root/offline-repair-v2.mjs"
systemd-run --unit=news-recovery-offline-repair-v2-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=3G --property=CPUQuota=200% --property=TasksMax=60 --working-directory=/opt/news-flow/current /opt/news-flow/node/bin/node --max-old-space-size=1024 "$root/offline-repair-v2.mjs"
