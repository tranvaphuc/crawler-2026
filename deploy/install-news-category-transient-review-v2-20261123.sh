set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
systemctl stop news-category-transient-review-20261123 2>/dev/null || true
install -m 0644 "$upload_dir/.categoryReviewedRecovery.mjs" "$base/src/newsFlow/categoryReviewedRecovery.mjs"
install -m 0644 "$upload_dir/.recheck_news_category_transients_v2.mjs" "$base/scripts/recheck_news_category_transients_v2.mjs"
install -m 0644 "$upload_dir/.news-category-reviewed-recovery.test.mjs" "$base/test/news-category-reviewed-recovery.test.mjs"
cd "$base"
/opt/news-flow/node/bin/node --check scripts/recheck_news_category_transients_v2.mjs
/opt/news-flow/node/bin/node --test test/news-category-reviewed-recovery.test.mjs > /var/lib/news-flow/category-coverage-20261123/reviewed-recovery-tests.tap 2>&1
tail -n 10 /var/lib/news-flow/category-coverage-20261123/reviewed-recovery-tests.tap
runuser -u news-flow -- env NEWS_CATEGORY_REVIEW_WAIT=0 NEWS_CATEGORY_REVIEW_LIMIT=4 /opt/news-flow/node/bin/node scripts/recheck_news_category_transients_v2.mjs
python3 - <<'PY'
import json
from pathlib import Path
r=json.loads(Path('/var/lib/news-flow/category-coverage-20261123/transient-review-report.json').read_text())
if not r['complete'] or r['reviewed']!=4 or r['apply'] or r['activation']['offered'] or r['paidAiCalls']:raise RuntimeError('V2_REVIEW_CONTROLS_FAILED')
print('FOUR_FRESH_REVIEW_CONTROLS_WITHOUT_LIVE_ACTIVATION_OR_AI')
PY
systemd-run --unit=news-category-transient-review-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=3G --property=CPUQuota=200% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=32 --property=Restart=on-failure --property=RestartSec=30 --property=TimeoutStopSec=60 --setenv=NEWS_CATEGORY_REVIEW_APPLY=1 --working-directory="$base" /opt/news-flow/node/bin/node scripts/recheck_news_category_transients_v2.mjs
