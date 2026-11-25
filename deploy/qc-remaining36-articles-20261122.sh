set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-remaining36-articles-20261122.mjs" /var/lib/news-flow/qc-remaining36-20261122/articles.mjs
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node /var/lib/news-flow/qc-remaining36-20261122/articles.mjs
install -o "$SUDO_USER" -m 0600 /var/lib/news-flow/qc-remaining36-20261122/article-diagnosis.json "$upload_dir/.qc-remaining36-articles-result-20261122.json"
