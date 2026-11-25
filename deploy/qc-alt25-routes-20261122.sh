set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-alt25-20261122
install -d -o news-flow -g news-flow -m 0700 "$root"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-alt25-routes.mjs" /opt/news-flow/current/.qc-alt25-routes.mjs
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node .qc-alt25-routes.mjs
install -o "$SUDO_USER" -m 0600 "$root/routes.json" "$upload_dir/.qc-alt25-routes.json"
