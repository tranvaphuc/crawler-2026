set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
systemctl stop news-category-finalize-20261123 2>/dev/null || true
install -m 0755 "$upload_dir/.run-news-category-finalize-20261123.sh" /usr/local/libexec/run-news-category-finalize-20261123.sh
sed -i 's/\r$//' /usr/local/libexec/run-news-category-finalize-20261123.sh
install -m 0644 "$upload_dir/.report_news_category_coverage.py" /opt/news-flow/current/scripts/report_news_category_coverage.py
bash -n /usr/local/libexec/run-news-category-finalize-20261123.sh
if ! systemctl start news-category-finalize-20261123 2>/dev/null; then
 systemd-run --unit=news-category-finalize-20261123 --property=MemoryMax=3G --property=CPUQuota=200% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=32 --property=Restart=on-failure --property=RestartSec=120 --setenv="NEWS_CATEGORY_EXPORT_USER=$SUDO_USER" --working-directory=/opt/news-flow/current /usr/local/libexec/run-news-category-finalize-20261123.sh
fi
systemctl is-active news-category-finalize-20261123
