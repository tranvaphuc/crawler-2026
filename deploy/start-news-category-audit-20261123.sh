set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=/opt/news-flow/current
root=/var/lib/news-flow/category-coverage-20261123
install -d -o news-flow -g news-flow -m 0750 "$root"
install -m 0644 "$upload_dir/.categoryCoverage.mjs" "$base/src/newsFlow/categoryCoverage.mjs"
install -m 0644 "$upload_dir/.categoryCoverageWorker.mjs" "$base/src/newsFlow/categoryCoverageWorker.mjs"
install -m 0644 "$upload_dir/.audit_news_category_coverage.mjs" "$base/scripts/audit_news_category_coverage.mjs"
systemd-run --unit=news-category-audit-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=5G --property=CPUQuota=600% --property=TasksMax=100 --property=TimeoutStopSec=30 --working-directory="$base" /opt/news-flow/node/bin/node --max-old-space-size=1024 scripts/audit_news_category_coverage.mjs
systemctl is-active news-category-audit-20261123
