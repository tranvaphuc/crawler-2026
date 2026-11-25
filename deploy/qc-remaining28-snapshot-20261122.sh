set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining28-20261122
install -d -o news-flow -g news-flow -m 0700 "$root"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-remaining28-cohort-20261122.json" "$root/cohort.json"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-remaining28-snapshot-20261122.mjs" "$root/snapshot.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/snapshot.mjs"
install -o "$SUDO_USER" -m 0600 "$root/baseline.json" "$upload_dir/.qc-remaining28-baseline-result-20261122.json"
