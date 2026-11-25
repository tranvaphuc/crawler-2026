set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
systemctl stop news-category-transient-review-20261123 2>/dev/null || true
install -m 0644 "$upload_dir/.recheck_news_category_transients_v2.mjs" "$base/scripts/recheck_news_category_transients_v2.mjs"
cd "$base"
/opt/news-flow/node/bin/node --check scripts/recheck_news_category_transients_v2.mjs
systemd-run --unit=news-category-transient-review-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=3G --property=CPUQuota=200% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=32 --property=Restart=on-failure --property=RestartSec=30 --property=TimeoutStopSec=60 --setenv=NEWS_CATEGORY_REVIEW_APPLY=1 --working-directory="$base" /opt/news-flow/node/bin/node scripts/recheck_news_category_transients_v2.mjs
