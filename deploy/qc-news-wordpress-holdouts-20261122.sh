set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-news-wordpress-holdouts-20261122.mjs" /var/lib/news-flow/qc-20261122/wordpress-holdouts.mjs
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node /var/lib/news-flow/qc-20261122/wordpress-holdouts.mjs
install -o "$SUDO_USER" -m 0600 /var/lib/news-flow/qc-20261122/wordpress-holdouts.json "$upload_dir/.qc-news-wordpress-holdouts-result-20261122.json"
