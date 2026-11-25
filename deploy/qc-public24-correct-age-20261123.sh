set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-public24-20261123
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-public24-correct-age.mjs" "$root/correct-age.mjs"
cd /opt/news-flow/current
trap 'systemctl start news-flow-seed news-flow-parse' EXIT
systemctl stop news-flow-seed news-flow-parse
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/correct-age.mjs"
systemctl start news-flow-seed news-flow-parse
trap - EXIT
install -o "$SUDO_USER" -m 0600 "$root/age-correction.json" "$upload_dir/.qc-public24-age-correction.json"
