set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining29-20261122
test ! -e /opt/news-flow/current/test/news-vntravel-author-profile.test.mjs
install -o root -g news-flow -m 0640 "$upload_dir/.qc-remaining29-author-profile-test-20261122.mjs" /opt/news-flow/current/test/news-vntravel-author-profile.test.mjs
install -o root -g root -m 0600 "$upload_dir/.qc-remaining29-apply-profiles-20261122.mjs" "$root/apply-profiles.mjs"
cd /opt/news-flow/current
trap 'systemctl start news-flow-seed news-flow-parse' EXIT
systemctl stop news-flow-seed news-flow-parse
/opt/news-flow/node/bin/node "$root/apply-profiles.mjs"
systemctl start news-flow-seed news-flow-parse
trap - EXIT
install -o "$SUDO_USER" -m 0600 "$root/profile-apply.json" "$upload_dir/.qc-remaining29-profile-apply-result-20261122.json"
