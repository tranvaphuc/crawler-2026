set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining29-20261122
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-remaining29-public-routes-20261122.mjs" "$root/public-routes.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/public-routes.mjs"
install -o "$SUDO_USER" -m 0600 "$root/public-routes.json" "$upload_dir/.qc-remaining29-public-routes-result-20261122.json"
