set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining29-20261122
install -o root -g root -m 0600 "$upload_dir/.qc-remaining29-postcheck-20261122.mjs" "$root/postcheck.mjs"
cd /opt/news-flow/current
/opt/news-flow/node/bin/node "$root/postcheck.mjs"
install -o "$SUDO_USER" -m 0600 "$root/postcheck.json" "$upload_dir/.qc-remaining29-postcheck-result-20261122.json"
