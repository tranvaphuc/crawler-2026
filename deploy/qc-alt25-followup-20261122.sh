set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-alt25-followup.mjs" /opt/news-flow/current/.qc-alt25-followup.mjs
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node .qc-alt25-followup.mjs
install -o "$SUDO_USER" -m 0600 /var/lib/news-flow/qc-alt25-20261122/followup.json "$upload_dir/.qc-alt25-followup.json"
