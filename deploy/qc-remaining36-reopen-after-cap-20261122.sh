set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining36-20261122
install -o root -g root -m 0600 "$upload_dir/.qc-remaining36-reopen-after-cap-20261122.mjs" "$root/reopen-after-cap.mjs"
cd /opt/news-flow/current
/opt/news-flow/node/bin/node "$root/reopen-after-cap.mjs"
install -o "$SUDO_USER" -m 0600 "$root/after-cap-reopen.json" "$upload_dir/.qc-remaining36-after-cap-reopen-result-20261122.json"
