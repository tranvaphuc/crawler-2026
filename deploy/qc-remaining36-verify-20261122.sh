set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-remaining36-verify-20261122.mjs" /var/lib/news-flow/qc-remaining36-20261122/verify.mjs
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node /var/lib/news-flow/qc-remaining36-20261122/verify.mjs
install -o "$SUDO_USER" -m 0600 /var/lib/news-flow/qc-remaining36-20261122/verified-sources.json "$upload_dir/.qc-remaining36-verified-result-20261122.json"
