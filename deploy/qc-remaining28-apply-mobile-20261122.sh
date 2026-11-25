set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining28-20261122
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc28-mobile-test.mjs" "$root/candidate/news-tieudungplus-mobile.test.mjs"
install -o root -g root -m 0600 "$upload_dir/.qc28-apply-mobile.mjs" "$root/apply-mobile.mjs"
cd /opt/news-flow/current
trap 'systemctl start news-flow-seed news-flow-parse' EXIT
systemctl stop news-flow-seed news-flow-parse
/opt/news-flow/node/bin/node "$root/apply-mobile.mjs"
systemctl start news-flow-seed news-flow-parse
trap - EXIT
install -o "$SUDO_USER" -m 0600 "$root/mobile-apply-result.json" "$upload_dir/.qc28-mobile-apply-result.json"
install -o "$SUDO_USER" -m 0600 "$root/mobile-tests-vps.txt" "$upload_dir/.qc28-mobile-tests-vps.txt"
