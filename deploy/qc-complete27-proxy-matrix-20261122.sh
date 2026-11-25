set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-complete27-20261122
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc27-complete-proxy-matrix.mjs" "$root/proxy-matrix.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/proxy-matrix.mjs"
install -o "$SUDO_USER" -m 0600 "$root/proxy-matrix.json" "$upload_dir/.qc27-complete-proxy-matrix.json"
