set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining29-20261122
test ! -e /opt/news-flow/current/test/news-repeated-publisher-content.test.mjs
install -o root -g news-flow -m 0640 "$upload_dir/.qc-remaining29-repeated-content-test-20261122.mjs" /opt/news-flow/current/test/news-repeated-publisher-content.test.mjs
install -o root -g root -m 0600 "$upload_dir/.qc-remaining29-apply-20261122.mjs" "$root/apply.mjs"
cd /opt/news-flow/current
systemctl show news-flow-seed news-flow-parse news-flow-import -p Id,MainPID,ActiveState > "$root/services-before.txt"
trap 'systemctl start news-flow-seed news-flow-parse' EXIT
systemctl stop news-flow-seed news-flow-parse
/opt/news-flow/node/bin/node "$root/apply.mjs"
systemctl start news-flow-seed news-flow-parse
trap - EXIT
systemctl show news-flow-seed news-flow-parse news-flow-import -p Id,MainPID,ActiveState,NRestarts
install -o "$SUDO_USER" -m 0600 "$root/apply-result.json" "$upload_dir/.qc-remaining29-apply-result-20261122.json"
