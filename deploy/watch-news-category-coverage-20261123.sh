set -euo pipefail
python3 -u - <<'PY'
import sqlite3,json,time,subprocess
from pathlib import Path
from datetime import datetime,timezone
r=Path('/var/lib/news-flow/category-coverage-20261123')
def ro(file):return sqlite3.connect('file:'+str(file)+'?mode=ro',uri=True)
audit=ro(r/'audit.sqlite');live=ro('/var/lib/news-flow/news-flow-runtime/write.sqlite')
while True:
 states=dict(live.execute('SELECT a.parse_status,count(*) FROM news_category_backfill c JOIN article_links a ON a.parse_key=c.parse_key GROUP BY a.parse_status'))
 audit_remaining=audit.execute("SELECT count(*) FROM pages WHERE state!='done'").fetchone()[0]
 final=json.loads((r/'finalization-status.json').read_text()) if (r/'finalization-status.json').exists() else {}
 active={u:subprocess.run(['systemctl','is-active','--quiet',u],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0 for u in ['news-flow-seed','news-flow-parse','news-flow-import','news-category-audit-20261123','news-category-initial-backfill-20261123','news-category-transient-review-20261123','news-category-hint-expansion-20261123','news-category-finalize-20261123']}
 try:review=json.loads((r/'transient-review-progress.json').read_text())
 except (OSError,ValueError):review={}
 fresh=live.execute("SELECT count(*) FROM events WHERE kind='verified' AND at>=? AND julianday(json_extract(details,'$.publishedDate'))>=julianday('now','-1 hour')",[int(time.time()*1000)-300000]).fetchone()[0]
 s={'recovery_checked':review.get('reviewed'),'recovery_verified':review.get('activation',{}).get('offered'),'fresh_verified_5m':fresh,'at':datetime.now(timezone.utc).isoformat(),'audit_remaining':audit_remaining,'parsed':states.get('done',0),'held':states.get('fail',0),'waiting':sum(states.get(k,0) for k in ['pending','queued','running']),'final_phase':final.get('phase'),'active':active}
 if final.get('phase')=='finalized':s['done']=True;print(json.dumps(s),flush=True);break
 broken=[u for u in ['news-flow-seed','news-flow-parse','news-flow-import'] if not active[u]]
 if audit_remaining and not active['news-category-audit-20261123'] and not active['news-category-hint-expansion-20261123']:broken.append('audit_stopped_before_terminal')
 if not active['news-category-finalize-20261123']:broken.append('finalizer_not_active')
 if broken:s['attention']=broken;print(json.dumps(s),flush=True);raise SystemExit(2)
 print(json.dumps(s),flush=True);time.sleep(50)
PY
