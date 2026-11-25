set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/recovery-all-20261123
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-recovery-all-apply-overlays.mjs" "$root/apply-overlays.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/apply-overlays.mjs"
systemctl restart news-flow-seed news-flow-parse
systemctl show news-flow-seed news-flow-parse news-flow-import -p Id,ActiveState,MainPID,NRestarts
