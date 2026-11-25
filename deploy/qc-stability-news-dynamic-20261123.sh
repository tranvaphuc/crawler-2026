set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/stability-20261123
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-stability-news-dynamic.mjs" "$root/dynamic-probe.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/dynamic-probe.mjs"
install -o "$SUDO_USER" -m 0600 "$root/news-source-followup.json" "$upload_dir/.qc-stability-news-source-followup.json"
