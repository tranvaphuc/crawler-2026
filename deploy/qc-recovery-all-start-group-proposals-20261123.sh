set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/recovery-all-20261123
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-recovery-all-group-proposals.mjs" "$root/group-proposals.mjs"
systemd-run --unit=news-recovery-group-proposals-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=5G --property=CPUQuota=200% --property=TasksMax=80 --working-directory=/opt/news-flow/current /opt/news-flow/node/bin/node --max-old-space-size=1536 "$root/group-proposals.mjs"
