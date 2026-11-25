set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -m 0755 "$upload_dir/.run-news-category-maintenance.sh" /usr/local/libexec/run-news-category-maintenance.sh
install -m 0644 "$upload_dir/.news-category-maintenance.service" /etc/systemd/system/news-category-maintenance.service
install -m 0644 "$upload_dir/.news-category-maintenance.timer" /etc/systemd/system/news-category-maintenance.timer
systemd-analyze verify /etc/systemd/system/news-category-maintenance.service /etc/systemd/system/news-category-maintenance.timer
systemctl daemon-reload
systemctl enable --now news-category-maintenance.timer
systemctl list-timers news-category-maintenance.timer --no-pager
