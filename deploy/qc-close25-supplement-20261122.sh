set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-close25-20261122
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-close25-supplement.mjs" /opt/news-flow/current/.qc-close25-supplement.mjs
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node .qc-close25-supplement.mjs
install -o "$SUDO_USER" -m 0600 "$root/supplement.json" "$upload_dir/.qc-close25-supplement.json"
