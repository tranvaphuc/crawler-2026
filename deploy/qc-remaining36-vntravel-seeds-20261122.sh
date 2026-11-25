set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining36-20261122
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-remaining36-vntravel-seeds-20261122.mjs" "$root/vntravel-seeds.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/vntravel-seeds.mjs"
install -o "$SUDO_USER" -m 0600 "$root/vntravel-seeds.json" "$upload_dir/.qc-remaining36-vntravel-seeds-result-20261122.json"
