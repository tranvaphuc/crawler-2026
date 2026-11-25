set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -m 0644 "$upload_dir/.report_news_category_coverage.py" /opt/news-flow/current/scripts/report_news_category_coverage.py
python3 /opt/news-flow/current/scripts/report_news_category_coverage.py
