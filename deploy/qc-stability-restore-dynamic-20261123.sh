set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/stability-20261123
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-stability-restore-dynamic.mjs" "$root/restore-dynamic.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/restore-dynamic.mjs"
install -o "$SUDO_USER" -m 0600 "$root/dynamic-seed-recovery.json" "$upload_dir/.qc-stability-dynamic-seed-recovery.json"
