set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
systemctl stop news-category-primary-review-20261123
systemctl stop news-category-audit-20261123
python3 - "$upload_dir/.category-checkpoint-performance.tar.gz" "$base" <<'PY'
import sys,tarfile
from pathlib import Path
with tarfile.open(sys.argv[1]) as t:
 for name in ['src/newsFlow/categoryCoverage.mjs','scripts/qualify_news_category_coverage.mjs','scripts/apply_news_category_coverage.mjs','scripts/clean_news_category_false_positives.mjs']:
  dst=Path(sys.argv[2])/name;dst.write_bytes(t.extractfile(name).read());dst.chmod(0o644)
PY
if ! systemctl start news-category-audit-20261123 2>/dev/null; then
 systemd-run --unit=news-category-audit-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=5G --property=CPUQuota=600% --property=TasksMax=100 --property=TimeoutStopSec=30 --working-directory="$base" /opt/news-flow/node/bin/node --max-old-space-size=1024 scripts/audit_news_category_coverage.mjs
fi
if ! systemctl start news-category-primary-review-20261123 2>/dev/null; then
 systemd-run --unit=news-category-primary-review-20261123 --property=MemoryMax=2G --property=CPUQuota=400% --property=TasksMax=32 --working-directory="$base" /opt/news-flow/node/bin/node scripts/qualify_news_category_coverage.mjs
fi
install -m 0755 "$upload_dir/.run-news-category-maintenance.sh" /usr/local/libexec/run-news-category-maintenance.sh
systemctl is-active news-category-audit-20261123 news-category-primary-review-20261123
