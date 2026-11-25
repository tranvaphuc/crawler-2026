set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
cd /opt/news-flow/current
install -m 644 "$upload_dir/.fetch-camau-holdouts.mjs" scripts/fetch_camau_holdouts_20261120.mjs
runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/fetch_camau_holdouts_20261120.mjs
tar -czf "$upload_dir/.camau-holdouts.tgz" -C /var/lib/news-flow/baocamau-remaining-20261120/holdouts .
chown "$SUDO_USER" "$upload_dir/.camau-holdouts.tgz"
chmod 600 "$upload_dir/.camau-holdouts.tgz"
