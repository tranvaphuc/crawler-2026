set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
cp /opt/news-flow/current/src/web/newsResearchTransport.mjs "$upload_dir/.original-transport.mjs"
chown "$SUDO_USER" "$upload_dir/.original-transport.mjs"
chmod 600 "$upload_dir/.original-transport.mjs"
