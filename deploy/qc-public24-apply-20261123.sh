set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-public24-20261123
install -o root -g root -m 0600 "$upload_dir/.qc-public24-apply.mjs" "$root/apply.mjs"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-public24-run.mjs" "$root/run.mjs"
cd /opt/news-flow/current
trap 'systemctl start news-flow-seed news-flow-parse' EXIT
systemctl stop news-flow-seed news-flow-parse
/opt/news-flow/node/bin/node "$root/apply.mjs"
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/run.mjs"
systemctl start news-flow-seed news-flow-parse
trap - EXIT
install -o "$SUDO_USER" -m 0600 "$root/apply-result.json" "$upload_dir/.qc-public24-apply-result.json"
install -o "$SUDO_USER" -m 0600 "$root/real-flow.json" "$upload_dir/.qc-public24-real-flow.json"
install -o "$SUDO_USER" -m 0600 "$root/deployed-tieudungso.json" "$upload_dir/.qc-public24-deployed-tieudungso.json"
