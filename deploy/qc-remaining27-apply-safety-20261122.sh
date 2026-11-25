set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining27-all-20261122
install -o root -g root -m 0600 "$upload_dir/.qc27-verified-patches.json" "$root/verified-patches.json"
install -o root -g root -m 0600 "$upload_dir/.qc27-apply-safety.mjs" "$root/apply-safety.mjs"
cd /opt/news-flow/current
trap 'systemctl start news-flow-seed news-flow-parse' EXIT
systemctl stop news-flow-seed news-flow-parse
/opt/news-flow/node/bin/node "$root/apply-safety.mjs"
systemctl start news-flow-seed news-flow-parse
trap - EXIT
install -o "$SUDO_USER" -m 0600 "$root/safety-apply-result.json" "$upload_dir/.qc27-safety-apply-result.json"
install -o "$SUDO_USER" -m 0600 "$root/safety-tests-vps.txt" "$upload_dir/.qc27-safety-tests-vps.txt"
