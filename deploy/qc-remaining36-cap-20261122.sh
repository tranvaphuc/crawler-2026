set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining36-20261122
install -o root -g root -m 0600 "$upload_dir/.qc-remaining36-cap-20261122.mjs" "$root/cap.mjs"
trap 'systemctl start news-flow-parse' EXIT
systemctl stop news-flow-parse
/opt/news-flow/node/bin/node "$root/cap.mjs"
systemctl start news-flow-parse
trap - EXIT
install -o "$SUDO_USER" -m 0600 "$root/apply-result.json" "$upload_dir/.qc-remaining36-apply-result-20261122.json"
