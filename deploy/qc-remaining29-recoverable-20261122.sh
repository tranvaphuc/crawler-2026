set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining29-20261122
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-remaining29-recoverable-20261122.mjs" "$root/recoverable.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/recoverable.mjs"
install -o "$SUDO_USER" -m 0600 "$root/recoverable.json" "$upload_dir/.qc-remaining29-recoverable-result-20261122.json"
