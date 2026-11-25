set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining29-20261122
install -o root -g root -m 0600 "$upload_dir/.qc-remaining29-apply-vn-feed-20261122.mjs" "$root/apply-vn-feed.mjs"
cd /opt/news-flow/current
trap 'systemctl start news-flow-seed news-flow-parse' EXIT
systemctl stop news-flow-seed news-flow-parse
/opt/news-flow/node/bin/node "$root/apply-vn-feed.mjs"
systemctl start news-flow-seed news-flow-parse
trap - EXIT
install -o "$SUDO_USER" -m 0600 "$root/feed-apply-result.json" "$upload_dir/.qc-remaining29-feed-apply-result-20261122.json"
