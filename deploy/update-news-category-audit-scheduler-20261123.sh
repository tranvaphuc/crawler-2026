set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
systemctl stop news-category-audit-20261123
install -m 0644 "$upload_dir/.audit_news_category_coverage.mjs" /opt/news-flow/current/scripts/audit_news_category_coverage.mjs
if ! systemctl start news-category-audit-20261123 2>/dev/null; then
 systemd-run --unit=news-category-audit-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=5G --property=CPUQuota=300% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=100 --working-directory=/opt/news-flow/current /opt/news-flow/node/bin/node --max-old-space-size=1024 scripts/audit_news_category_coverage.mjs
fi
systemctl is-active news-category-audit-20261123
