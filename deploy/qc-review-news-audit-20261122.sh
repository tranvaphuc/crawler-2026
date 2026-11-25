set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-news-audit-20261122.mjs" /var/lib/news-flow/qc-20261122/audit.mjs
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-news-cohort-20261122.json" /var/lib/news-flow/qc-20261122/cohort.json
chown news-flow:news-flow /var/lib/news-flow/qc-20261122 /var/lib/news-flow/qc-20261122/baseline.json
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node /var/lib/news-flow/qc-20261122/audit.mjs
install -o "$SUDO_USER" -m 0600 /var/lib/news-flow/qc-20261122/news-audit.json "$upload_dir/.qc-news-audit-result-20261122.json"
