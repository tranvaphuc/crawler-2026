set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
install -m 0644 "$upload_dir/.remember_saved_news_category_hints_20261123.mjs" "$base/scripts/remember_saved_news_category_hints_20261123.mjs"
/opt/news-flow/node/bin/node --check "$base/scripts/remember_saved_news_category_hints_20261123.mjs"
systemd-run --unit=news-category-cached-breadcrumbs-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=2G --property=CPUQuota=200% --property=CPUWeight=10 --property=Nice=10 --working-directory="$base" /opt/news-flow/node/bin/node scripts/remember_saved_news_category_hints_20261123.mjs
