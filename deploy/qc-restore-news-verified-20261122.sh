set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-news-restore-verified-20261122.mjs" /var/lib/news-flow/qc-20261122/restore-verified.mjs
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node /var/lib/news-flow/qc-20261122/restore-verified.mjs
install -o "$SUDO_USER" -m 0600 /var/lib/news-flow/qc-20261122/verified-recovery.json "$upload_dir/.qc-news-verified-recovery-20261122.json"
systemctl start news-discovery-health.service
