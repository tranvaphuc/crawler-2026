set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
systemctl stop news-category-transient-review-20261123
python3 - "$upload_dir/.category-review-hints.tar.gz" "$base" <<'PY'
import tarfile,sys
from pathlib import Path
with tarfile.open(sys.argv[1]) as t:
 for name in ['src/newsFlow/categoryCoverage.mjs','src/newsFlow/categoryReviewedRecovery.mjs','scripts/recheck_news_category_transients_v2.mjs','scripts/remember_reviewed_category_hints_20261123.mjs','test/news-category-coverage.test.mjs','test/news-category-reviewed-recovery.test.mjs']:
  dst=Path(sys.argv[2])/name;temp=dst.with_name(dst.name+'.review-hints.tmp');temp.write_bytes(t.extractfile(name).read());temp.chmod(0o644);temp.replace(dst)
PY
cd "$base"
/opt/news-flow/node/bin/node --test test/news-category-coverage.test.mjs test/news-category-reviewed-recovery.test.mjs > /var/lib/news-flow/category-coverage-20261123/review-hints-tests.tap 2>&1
tail -n 10 /var/lib/news-flow/category-coverage-20261123/review-hints-tests.tap
runuser -u news-flow -- /opt/news-flow/node/bin/node scripts/remember_reviewed_category_hints_20261123.mjs
systemd-run --unit=news-category-transient-review-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=3G --property=CPUQuota=200% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=32 --property=Restart=on-failure --property=RestartSec=30 --property=TimeoutStopSec=60 --setenv=NEWS_CATEGORY_REVIEW_APPLY=1 --working-directory="$base" /opt/news-flow/node/bin/node scripts/recheck_news_category_transients_v2.mjs
