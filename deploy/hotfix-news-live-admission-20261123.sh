set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
install -m 0644 "$upload_dir/.news-live-admission-hotfix-20261123.mjs" "$base/src/newsFlow/liveAdmission.mjs.new"
mv "$base/src/newsFlow/liveAdmission.mjs.new" "$base/src/newsFlow/liveAdmission.mjs"
systemctl is-active news-flow-parse || true
journalctl -u news-flow-parse -n 4 --no-pager -o cat | cut -c 1-2000
