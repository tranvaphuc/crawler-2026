set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-remaining36-20261122
install -o root -g root -m 0600 "$upload_dir/.qc-remaining36-es-readback-20261122.mjs" "$root/es-readback.mjs"
cd /opt/news-flow/current
/opt/news-flow/node/bin/node "$root/es-readback.mjs"
install -o "$SUDO_USER" -m 0600 "$root/es-readback.json" "$upload_dir/.qc-remaining36-es-readback-result-20261122.json"
