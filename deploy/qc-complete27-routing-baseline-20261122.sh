set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -o "$SUDO_USER" -m 0600 /opt/news-flow/current/src/newsFlow/transport.mjs "$upload_dir/.qc27-complete-transport-baseline.mjs"
