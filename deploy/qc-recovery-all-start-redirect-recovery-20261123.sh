set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/recovery-all-20261123
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-recovery-all-redirect-recovery.mjs" "$root/redirect-recovery.mjs"
systemd-run --unit=news-recovery-redirect-recovery-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=4G --property=CPUQuota=300% --property=TasksMax=80 --working-directory=/opt/news-flow/current /opt/news-flow/node/bin/node --max-old-space-size=1536 "$root/redirect-recovery.mjs"
