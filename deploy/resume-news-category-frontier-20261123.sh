set -euo pipefail
base=$(readlink -f /opt/news-flow/current)
systemd-run --unit=news-category-audit-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=5G --property=CPUQuota=300% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=100 --working-directory="$base" /opt/news-flow/node/bin/node --max-old-space-size=1024 scripts/audit_news_category_coverage.mjs
systemd-run --unit=news-category-hint-expansion-20261123 --property=MemoryMax=3G --property=CPUQuota=200% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=32 --property=Restart=on-failure --property=RestartSec=30 --working-directory="$base" /usr/local/libexec/run-news-category-hint-expansion-20261123.sh
systemctl is-active news-flow-seed news-flow-parse news-flow-import news-category-audit-20261123 news-category-hint-expansion-20261123
