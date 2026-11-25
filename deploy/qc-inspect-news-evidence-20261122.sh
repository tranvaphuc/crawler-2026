set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-news-inspect-evidence-20261122.mjs" /var/lib/news-flow/qc-20261122/inspect-evidence.mjs
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node /var/lib/news-flow/qc-20261122/inspect-evidence.mjs > /var/lib/news-flow/qc-20261122/inspection-log.json
install -o "$SUDO_USER" -m 0600 /var/lib/news-flow/qc-20261122/parser-evidence-inspection.json "$upload_dir/.qc-news-parser-inspection-20261122.json"
