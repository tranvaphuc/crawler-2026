set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -m 0644 "$upload_dir/.admit_news_category_backfill_20261123.mjs" /opt/news-flow/current/scripts/admit_news_category_backfill_20261123.mjs
install -m 0755 "$upload_dir/.run-news-category-final-admission-20261123.sh" /usr/local/libexec/run-news-category-final-admission-20261123.sh
sed -i 's/\r$//' /usr/local/libexec/run-news-category-final-admission-20261123.sh
/opt/news-flow/node/bin/node --check /opt/news-flow/current/scripts/admit_news_category_backfill_20261123.mjs
bash -n /usr/local/libexec/run-news-category-final-admission-20261123.sh
systemd-run --unit=news-category-final-admission-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=1G --property=CPUQuota=200% --property=CPUWeight=10 --property=Nice=10 --property=Restart=on-failure --property=RestartSec=30 --working-directory=/opt/news-flow/current /usr/local/libexec/run-news-category-final-admission-20261123.sh
