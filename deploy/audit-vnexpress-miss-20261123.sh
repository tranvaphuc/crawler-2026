set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -m 0644 "$upload_dir/.audit-vnexpress-miss-20261123.mjs" /opt/news-flow/current/scripts/audit_vnexpress_miss_20261123.mjs
cd /opt/news-flow/current
mkdir -p /var/lib/news-flow/vnexpress-miss-20261123
chown -R news-flow:news-flow /var/lib/news-flow/vnexpress-miss-20261123
runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/audit_vnexpress_miss_20261123.mjs > /var/lib/news-flow/vnexpress-miss-audit.log 2>&1
tail -n 30 /var/lib/news-flow/vnexpress-miss-audit.log
