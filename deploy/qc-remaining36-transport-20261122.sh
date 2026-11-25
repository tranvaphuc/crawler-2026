set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -d -o news-flow -g news-flow -m 0700 /var/lib/news-flow/qc-remaining36-20261122
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-remaining36-cohort-20261122.json" /var/lib/news-flow/qc-remaining36-20261122/cohort.json
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-remaining36-transport-20261122.mjs" /var/lib/news-flow/qc-remaining36-20261122/transport.mjs
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node /var/lib/news-flow/qc-remaining36-20261122/transport.mjs
install -o "$SUDO_USER" -m 0600 /var/lib/news-flow/qc-remaining36-20261122/route-diagnosis.json "$upload_dir/.qc-remaining36-routes-result-20261122.json"
