set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -m 0755 "$upload_dir/.run-news-category-initial-backfill.sh" /usr/local/libexec/run-news-category-initial-backfill.sh
install -m 0755 "$upload_dir/.run-news-category-maintenance.sh" /usr/local/libexec/run-news-category-maintenance.sh
install -m 0644 "$upload_dir/.news-category-maintenance.service" /etc/systemd/system/news-category-maintenance.service
systemctl daemon-reload
systemd-run --unit=news-category-initial-backfill-20261123 --property=MemoryMax=3G --property=CPUQuota=200% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=64 --property=Restart=on-failure --property=RestartSec=30 --working-directory=/opt/news-flow/current /usr/bin/flock --exclusive --nonblock --no-fork /var/lib/news-flow/locks/category-initial-apply.lock /usr/local/libexec/run-news-category-initial-backfill.sh
systemctl is-active news-category-initial-backfill-20261123
