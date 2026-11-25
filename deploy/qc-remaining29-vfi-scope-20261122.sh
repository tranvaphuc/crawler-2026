set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining29-20261122
install -o root -g root -m 0600 "$upload_dir/.qc-remaining29-vfi-scope-20261122.mjs" "$root/vfi-scope.mjs"
cd /opt/news-flow/current
trap 'systemctl start news-flow-parse' EXIT
systemctl stop news-flow-parse
/opt/news-flow/node/bin/node "$root/vfi-scope.mjs"
systemctl start news-flow-parse
trap - EXIT
install -o "$SUDO_USER" -m 0600 "$root/vfi-scope.json" "$upload_dir/.qc-remaining29-vfi-scope-result-20261122.json"
