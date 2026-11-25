set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-complete27-20261122
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc27-controls-holdouts.mjs" "$root/controls-holdouts.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/controls-holdouts.mjs"
install -o "$SUDO_USER" -m 0600 "$root/qualified-sites.json" "$upload_dir/.qc27-complete-qualified.json"
