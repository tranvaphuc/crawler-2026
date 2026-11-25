set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining28-20261122
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc28-public-followup.mjs" "$root/public-followup.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/public-followup.mjs"
install -o "$SUDO_USER" -m 0600 "$root/public-followup.json" "$upload_dir/.qc28-public-followup.json"
