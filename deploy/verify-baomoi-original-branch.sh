set -euo pipefail
release=/opt/news-flow/releases/20261120-baomoi-original-03
test "$(readlink -f /opt/news-flow/current)" = "$release"
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -m 644 "$upload_dir/.verify-baomoi-original.mjs" "$release/scripts/verify_baomoi_original_branch.mjs"
systemctl is-active news-flow-seed news-flow-parse news-flow-import news-flow-baomoi-original
systemctl show news-flow-baomoi-original.service -p NRestarts -p MainPID -p ActiveState
cd "$release"
runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/verify_baomoi_original_branch.mjs
journalctl -u news-flow-baomoi-original.service -n 4 --no-pager -o cat
