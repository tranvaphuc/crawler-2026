set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-public24-20261123
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-public24-readback.mjs" "$root/readback.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/readback.mjs"
install -o "$SUDO_USER" -m 0600 "$root/native-es-readback.json" "$upload_dir/.qc-public24-native-es-readback.json"
