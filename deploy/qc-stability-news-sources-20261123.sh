set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/stability-20261123
chown news-flow:news-flow "$root"
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-stability-news-sources.mjs" "$root/source-probe.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node "$root/source-probe.mjs"
install -o "$SUDO_USER" -m 0600 "$root/news-source-probe.json" "$upload_dir/.qc-stability-news-source-probe.json"
