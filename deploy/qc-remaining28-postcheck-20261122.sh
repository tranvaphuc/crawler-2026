set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining28-20261122
install -o root -g root -m 0600 "$upload_dir/.qc28-postcheck.mjs" "$root/postcheck.mjs"
cd /opt/news-flow/current
/opt/news-flow/node/bin/node "$root/postcheck.mjs"
install -o "$SUDO_USER" -m 0600 "$root/postcheck.json" "$upload_dir/.qc28-postcheck.json"
install -o "$SUDO_USER" -m 0600 "$root/deployed-tieudungplus.vn.json" "$upload_dir/.qc28-deployed-tieudungplus.vn.json"
