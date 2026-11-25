set -euo pipefail
python3 - <<'PY'
import sqlite3,json,os
from datetime import datetime,timezone
r='/var/lib/news-flow/category-coverage-20261123'
def db(p):return sqlite3.connect('file:'+p+'?mode=ro',uri=True)
a=db(r+'/audit.sqlite');p=db(r+'/applications.sqlite');d=db('/var/lib/news-flow/news-flow-runtime/write.sqlite')
status=json.load(open(r+'/coordinator-status.json')) if os.path.exists(r+'/coordinator-status.json') else None
print(json.dumps({'at':datetime.now(timezone.utc).isoformat(),'audit':a.execute("SELECT state,count(*) FROM pages GROUP BY state").fetchall(),'strict_sections':p.execute('SELECT count(*) FROM candidate_qualifications q JOIN candidate_article_proofs p ON p.site=q.site AND p.key=q.key WHERE q.listing=1 AND p.verified_articles>=2').fetchone()[0],'registered_sections':d.execute('SELECT count(*) FROM news_category_sections').fetchone()[0],'backfill':d.execute("SELECT a.parse_status,count(*) FROM news_category_backfill c JOIN article_links a ON a.parse_key=c.parse_key GROUP BY a.parse_status").fetchall(),'coordinator':status,'ai':d.execute('SELECT day,calls,usd FROM ai_usage ORDER BY day DESC LIMIT 1').fetchall()}))
PY
systemctl is-active news-category-audit-20261123 news-category-initial-backfill-20261123 news-flow-seed news-flow-parse news-flow-import news-category-maintenance.timer || true
journalctl -u news-category-initial-backfill-20261123 -n 3 --no-pager -o cat | cut -c 1-1000
