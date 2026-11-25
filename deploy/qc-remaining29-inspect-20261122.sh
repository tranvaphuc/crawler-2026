set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining29-20261122
install -d -o news-flow -g news-flow -m 0700 "$root"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-remaining29-inspect-20261122.mjs" "$root/inspect.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/inspect.mjs"
install -o "$SUDO_USER" -m 0600 "$root/inspection.json" "$upload_dir/.qc-remaining29-inspection-result-20261122.json"
