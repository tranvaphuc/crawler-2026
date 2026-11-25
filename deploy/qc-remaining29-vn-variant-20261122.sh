set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining29-20261122
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-remaining29-vn-variant-20261122.mjs" "$root/vn-variant.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/vn-variant.mjs"
install -o "$SUDO_USER" -m 0600 "$root/vn-variant.json" "$upload_dir/.qc-remaining29-vn-variant-result-20261122.json"
