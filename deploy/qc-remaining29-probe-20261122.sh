set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining29-20261122
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-remaining29-probe-20261122.mjs" "$root/probe.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/probe.mjs"
install -o "$SUDO_USER" -m 0600 "$root/probe.json" "$upload_dir/.qc-remaining29-probe-result-20261122.json"
