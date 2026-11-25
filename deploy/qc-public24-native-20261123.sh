set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-public24-20261123
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-public24-native.mjs" "$root/native.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/native.mjs"
install -o "$SUDO_USER" -m 0600 "$root/native-paths.json" "$upload_dir/.qc-public24-native.json"
