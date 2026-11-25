set -euo pipefail
cd /opt/news-flow/current
python3 - <<'PY'
import json,sqlite3
from pathlib import Path
d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True)
config=json.loads(Path('config/web-sources/news/vnexpress.net.json').read_text())
overlay=d.execute('SELECT config FROM parser_overlays WHERE site=?',['vnexpress.net']).fetchone()
def limits(c):return {k:c.get('http',{}).get(k) for k in ['maxConcurrentArticles','maxConcurrentSeeds']}
print(json.dumps({'configured_limits':limits(config),'overlay_limits':limits(json.loads(overlay[0])) if overlay else None,'article_infrastructure':[{'reason':r,'n':n} for r,n in d.execute("SELECT a.error,count(*) FROM news_category_backfill c JOIN article_links a ON a.parse_key=c.parse_key WHERE a.parse_status='fail' AND (a.error LIKE '%WORKER%' OR a.error LIKE '%POOL%' OR a.error='service_interrupted_no_retry') GROUP BY a.error")],'vnexpress_recent_failures':[{'at':r[0],'reason':r[1],'count':r[2]} for r in d.execute("SELECT strftime('%H:%M',reviewed_at/1000,'unixepoch'),error,count(*) FROM article_links WHERE site='vnexpress.net' AND first_at>=? AND parse_status='fail' GROUP BY 1,2 ORDER BY 1 DESC LIMIT 15",[1763863200000])]},ensure_ascii=False))
PY
