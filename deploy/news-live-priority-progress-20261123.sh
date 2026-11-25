set -euo pipefail
python3 - <<'PY'
import sqlite3,json,time
from pathlib import Path
p=Path('/var/lib/news-flow/live-priority-20261123');d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);d.row_factory=sqlite3.Row;now=int(time.time()*1000);marker=json.loads(d.execute("SELECT value FROM flow_meta WHERE key='live_priority_deployed_20261123'").fetchone()[0]);start=marker['at']
def rows(q,args=()):return [dict(x) for x in d.execute(q,args)]
r={'at':now,'since':start,'minutes':round((now-start)/60000,2),'normalQueue':rows("SELECT a.parse_status,count(*) n,min(a.first_at) oldest,max(a.first_at) newest FROM article_links a WHERE NOT EXISTS(SELECT 1 FROM news_category_backfill b WHERE b.parse_key=a.parse_key) AND a.parse_status IN ('pending','queued','running') GROUP BY 1"),'liveTasks':rows("SELECT role,state,count(*) n FROM tasks WHERE reason='live_priority' OR cycle LIKE 'live-%' GROUP BY 1,2"),'newImportReceipts':rows('SELECT status,count(*) n FROM import_receipts WHERE imported_at>=? GROUP BY 1',[start]),'verifiedToday':rows("SELECT substr(json_extract(details,'$.publishedDate'),1,10) day,count(*) n FROM events WHERE kind='verified' AND at>=? GROUP BY 1 ORDER BY 1 DESC LIMIT 4",[start]),'freshVerified':rows("SELECT count(*) n FROM events WHERE kind='verified' AND at>=? AND julianday(json_extract(details,'$.publishedDate'))>=julianday('now','-1 hour')",[start]),'liveVerified':rows("SELECT count(*) n FROM tasks WHERE cycle LIKE 'live-article-%' AND state='done' AND reason='verified_outbox'"),'homepages':rows("SELECT site,url,status,last_at FROM seed_sources WHERE url IN ('https://vnexpress.net/','https://vnexpress.net/rss/tin-moi-nhat.rss','https://dantri.com.vn/','https://thanhnien.vn/','https://vietnamnet.vn/')"),'ai':rows('SELECT * FROM ai_usage ORDER BY day DESC LIMIT 1')}
p.joinpath('progress.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(json.dumps(r,ensure_ascii=False))
PY
systemctl show news-flow-parse -p ActiveState -p SubState -p NRestarts
journalctl -u news-flow-parse --since '2 minutes ago' --no-pager -o cat | tail -n 2 | cut -c 1-1500
