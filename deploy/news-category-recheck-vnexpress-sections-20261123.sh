set -euo pipefail
base=$(readlink -f /opt/news-flow/current)
systemctl stop news-category-audit-20261123
python3 - <<'PY'
import sqlite3,json,time
from pathlib import Path
r=Path('/var/lib/news-flow/category-coverage-20261123');d=sqlite3.connect(r/'audit.sqlite',timeout=20);d.row_factory=sqlite3.Row
d.execute('CREATE TABLE IF NOT EXISTS section_manual_rechecks(site TEXT,key TEXT,at INTEGER,old_error TEXT,PRIMARY KEY(site,key))')
rows=d.execute("SELECT p.* FROM pages p LEFT JOIN section_manual_rechecks r ON r.site=p.site AND r.key=p.key WHERE p.site='vnexpress.net' AND p.state='done' AND p.error IN ('request_deadline_exceeded','http_406','ECONNRESET','http_500','http_503') AND r.key IS NULL").fetchall()
with d:
 for row in rows:
  d.execute('INSERT INTO section_manual_rechecks VALUES(?,?,?,?)',[row['site'],row['key'],int(time.time()*1000),row['error']]);d.execute("UPDATE pages SET state='pending' WHERE site=? AND key=? AND state='done' AND error=? AND checked_at=?",[row['site'],row['key'],row['error'],row['checked_at']])
(r/'vnexpress-section-rechecks-before.json').write_text(json.dumps([dict(x) for x in rows],ensure_ascii=False,indent=2));print(json.dumps({'targeted_temporary_section_rechecks':len(rows),'article_failures_reset':0,'ai_calls':0}))
PY
if ! systemctl start news-category-audit-20261123 2>/dev/null; then
 systemd-run --unit=news-category-audit-20261123 --uid=news-flow --gid=news-flow --property=MemoryMax=5G --property=CPUQuota=300% --property=CPUWeight=10 --property=Nice=10 --property=TasksMax=100 --working-directory="$base" /opt/news-flow/node/bin/node --max-old-space-size=1024 scripts/audit_news_category_coverage.mjs
fi
systemctl is-active news-category-audit-20261123
