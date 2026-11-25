set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/recovery-all-20261123
install -o news-flow -g news-flow -m 0600 "$upload_dir/.qc-recovery-all-redirect-candidates.mjs" "$root/redirect-candidates.mjs"
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node --max-old-space-size=1024 "$root/redirect-candidates.mjs"
