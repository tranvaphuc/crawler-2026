set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining29-20261122
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-remaining29-tintuc-api-20261122.mjs" "$root/tintuc-api.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/tintuc-api.mjs"
install -o "$SUDO_USER" -m 0600 "$root/tintuc-api.json" "$upload_dir/.qc-remaining29-tintuc-api-result-20261122.json"
