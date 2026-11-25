set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
install -m 0644 "$upload_dir/.news-live-admission-hotfix-20261123.mjs" "$base/src/newsFlow/liveAdmission.mjs.new"
mv "$base/src/newsFlow/liveAdmission.mjs.new" "$base/src/newsFlow/liveAdmission.mjs"
install -m 0644 "$upload_dir/.news-live-priority-test-20261123.mjs" "$base/test/news-live-priority.test.mjs"
cd "$base"
/opt/news-flow/node/bin/node --test test/news-live-priority.test.mjs > /var/lib/news-flow/live-priority-20261123/final-tests.tap 2>&1
tail -n 9 /var/lib/news-flow/live-priority-20261123/final-tests.tap
install -d -m 0755 /run/systemd/system/news-flow-seed.service.d
printf '[Service]\nTimeoutStopSec=180\n' > /run/systemd/system/news-flow-seed.service.d/live-priority-drain-20261123.conf
cleanup() { systemctl start news-flow-seed; rm -f /run/systemd/system/news-flow-seed.service.d/live-priority-drain-20261123.conf; systemctl daemon-reload; }
trap cleanup EXIT
systemctl daemon-reload
systemctl stop news-flow-seed
systemctl start news-flow-seed
systemctl is-active news-flow-seed news-flow-parse news-flow-import
