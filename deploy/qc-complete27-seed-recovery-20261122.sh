set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-complete27-20261122
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc27-complete-seed-recovery.mjs" "$root/seed-recovery.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/seed-recovery.mjs"
install -o "$SUDO_USER" -m 0600 "$root/seed-recovery.json" "$upload_dir/.qc27-complete-seed-recovery.json"
