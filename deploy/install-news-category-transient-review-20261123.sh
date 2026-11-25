set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
base=$(readlink -f /opt/news-flow/current)
install -m 0644 "$upload_dir/.recheck_news_category_transients.mjs" "$base/scripts/recheck_news_category_transients.mjs"
cd "$base"
/opt/news-flow/node/bin/node --check scripts/recheck_news_category_transients.mjs
runuser -u news-flow -- env NEWS_CATEGORY_REVIEW_WAIT=0 NEWS_CATEGORY_REVIEW_LIMIT=4 /opt/news-flow/node/bin/node scripts/recheck_news_category_transients.mjs
python3 - <<'PY'
import json
from pathlib import Path
r=Path('/var/lib/news-flow/category-coverage-20261123/transient-review-report.json')
s=json.loads(r.read_text())
if s['targets']!=4 or s['reviewed']!=4 or s['apply'] or s['paidAiCalls']!=0:raise RuntimeError('TRANSIENT_REVIEW_CONTROL_FAILED')
print('FOUR_REVIEW_CONTROLS_FINISHED_WITHOUT_REQUEUE_OR_AI')
PY
systemd-run --unit=news-category-transient-review-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=3G --property=CPUQuota=200% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=32 --setenv=NEWS_CATEGORY_REVIEW_APPLY=1 --working-directory="$base" /opt/news-flow/node/bin/node scripts/recheck_news_category_transients.mjs
