set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -m 0755 "$upload_dir/.run-news-category-finalize-20261123.sh" /usr/local/libexec/run-news-category-finalize-20261123.sh
install -m 0755 "$upload_dir/.news-category-es-readback-20261123.sh" /usr/local/libexec/news-category-es-readback-20261123.sh
sed -i 's/\r$//' /usr/local/libexec/run-news-category-finalize-20261123.sh /usr/local/libexec/news-category-es-readback-20261123.sh
bash -n /usr/local/libexec/run-news-category-finalize-20261123.sh
systemd-run --unit=news-category-finalize-20261123 --property=MemoryMax=3G --property=CPUQuota=200% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=32 --property=Restart=on-failure --property=RestartSec=120 --setenv="NEWS_CATEGORY_EXPORT_USER=$SUDO_USER" --working-directory=/opt/news-flow/current /usr/local/libexec/run-news-category-finalize-20261123.sh
systemctl is-active news-category-finalize-20261123
