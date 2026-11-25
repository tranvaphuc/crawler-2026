set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-complete27-20261122
install -o root -g root -m 0600 "$upload_dir/.qc27-complete-apply.mjs" "$root/apply.mjs"
cd /opt/news-flow/current
trap 'systemctl start news-flow-seed news-flow-parse' EXIT
systemctl stop news-flow-seed news-flow-parse
/opt/news-flow/node/bin/node "$root/apply.mjs"
systemctl start news-flow-seed news-flow-parse
trap - EXIT
install -o "$SUDO_USER" -m 0600 "$root/apply-result.json" "$upload_dir/.qc27-complete-apply-result.json"
