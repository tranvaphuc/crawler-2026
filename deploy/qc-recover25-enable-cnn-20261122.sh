set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-recover25-20261122
install -o root -g root -m 0600 "$upload_dir/.qc-recover25-apply-cnn.mjs" "$root/apply-cnn.mjs"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-recover25-run-cnn.mjs" /opt/news-flow/current/.qc-recover25-run-cnn.mjs
cd /opt/news-flow/current
trap 'systemctl start news-flow-seed news-flow-parse' EXIT
systemctl stop news-flow-seed news-flow-parse
/opt/news-flow/node/bin/node "$root/apply-cnn.mjs"
runuser -u news-flow -- /opt/news-flow/node/bin/node .qc-recover25-run-cnn.mjs
systemctl start news-flow-seed news-flow-parse
trap - EXIT
install -o "$SUDO_USER" -m 0600 "$root/cnn-apply-result.json" "$upload_dir/.qc-recover25-cnn-apply-result.json"
install -o "$SUDO_USER" -m 0600 "$root/cnn-real-flow.json" "$upload_dir/.qc-recover25-cnn-real-flow.json"
