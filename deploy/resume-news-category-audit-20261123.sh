set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
install -m 0644 "$upload_dir/.audit_news_category_coverage.mjs" /opt/news-flow/current/scripts/audit_news_category_coverage.mjs
install -m 0644 "$upload_dir/.apply_news_category_coverage.mjs" /opt/news-flow/current/scripts/apply_news_category_coverage.mjs
python3 - <<'PY'
import sqlite3,json
d=sqlite3.connect('/var/lib/news-flow/category-coverage-20261123/audit.sqlite')
reopened=d.execute("UPDATE pages SET state='pending',error=NULL,checked_at=NULL WHERE error IN ('NEWS_NETWORK_POOL_CLOSED','repair_pool_closed','ERR_SQLITE_ERROR','CATEGORY_AUDIT_EXCEPTION') OR state='running'").rowcount
d.commit();print(json.dumps({'infrastructureCheckpointsReopened':reopened}))
PY
systemctl reset-failed news-category-audit-20261123 2>/dev/null || true
systemd-run --unit=news-category-audit-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=5G --property=CPUQuota=600% --property=TasksMax=100 --property=TimeoutStopSec=30 --working-directory=/opt/news-flow/current /opt/news-flow/node/bin/node --max-old-space-size=1024 scripts/audit_news_category_coverage.mjs
systemctl is-active news-category-audit-20261123
