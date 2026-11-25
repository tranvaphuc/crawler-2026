set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-public24-20261123
install -d -o news-flow -g news-flow -m 0700 "$root"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-public24-paths.mjs" /opt/news-flow/current/.qc-public24-paths.mjs
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node .qc-public24-paths.mjs
install -o "$SUDO_USER" -m 0600 "$root/paths.json" "$upload_dir/.qc-public24-paths.json"
