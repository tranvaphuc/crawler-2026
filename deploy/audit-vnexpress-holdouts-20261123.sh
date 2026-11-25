set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -m 0644 "$upload_dir/.audit-vnexpress-holdouts-20261123.mjs" /opt/news-flow/current/scripts/audit_vnexpress_holdouts_20261123.mjs
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/audit_vnexpress_holdouts_20261123.mjs > /var/lib/news-flow/vnexpress-holdouts.log 2>&1
tail -n 18 /var/lib/news-flow/vnexpress-holdouts.log
