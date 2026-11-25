set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining28-20261122
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc28-verify-seed.mjs" "$root/verify-seed.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/verify-seed.mjs"
install -o "$SUDO_USER" -m 0600 "$root/seed-verified.json" "$upload_dir/.qc28-seed-verified.json"
