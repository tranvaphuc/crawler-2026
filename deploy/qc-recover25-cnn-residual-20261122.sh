set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-recover25-cnn-residual.mjs" /opt/news-flow/current/.qc-recover25-cnn-residual.mjs
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node .qc-recover25-cnn-residual.mjs
install -o "$SUDO_USER" -m 0600 /var/lib/news-flow/qc-recover25-20261122/cnn-residual-recovery.json "$upload_dir/.qc-recover25-cnn-residual-recovery.json"
