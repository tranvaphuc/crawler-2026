set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining28-20261122
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-remaining28-routes-20261122.mjs" "$root/routes.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/routes.mjs"
install -o "$SUDO_USER" -m 0600 "$root/routes.json" "$upload_dir/.qc-remaining28-routes-result-20261122.json"
