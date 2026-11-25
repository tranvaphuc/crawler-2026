set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining36-20261122
install -o root -g root -m 0600 "$upload_dir/.qc-remaining36-apply-20261122.mjs" "$root/apply.mjs"
cd /opt/news-flow/current
systemctl show news-flow-seed news-flow-parse news-flow-import -p Id,ActiveState,MainPID > "$root/services-before.txt"
trap 'systemctl start news-flow-seed news-flow-parse' EXIT
systemctl stop news-flow-seed news-flow-parse
/opt/news-flow/node/bin/node "$root/apply.mjs"
systemctl start news-flow-seed news-flow-parse
trap - EXIT
systemctl show news-flow-seed news-flow-parse news-flow-import -p Id,ActiveState,MainPID
install -o "$SUDO_USER" -m 0600 "$root/apply-result.json" "$upload_dir/.qc-remaining36-apply-result-20261122.json"
