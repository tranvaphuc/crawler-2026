set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-close25-20261122
install -d -o news-flow -g news-flow -m 0700 "$root"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-close25-cohort.json" "$root/cohort.json"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-close25-batch.mjs" "$root/batch.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/batch.mjs"
install -o "$SUDO_USER" -m 0600 "$root/batch.json" "$upload_dir/.qc-close25-batch.json"
