set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-complete27-20261122
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc27-complete-residual-articles.mjs" "$root/residual-articles.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/residual-articles.mjs"
install -o "$SUDO_USER" -m 0600 "$root/residual-articles.json" "$upload_dir/.qc27-complete-residual-articles.json"
