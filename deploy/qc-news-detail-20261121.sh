set -euo pipefail
python3 - <<'PY'
import sqlite3,json,time,hashlib
from pathlib import Path
db=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True,timeout=20);db.row_factory=sqlite3.Row
out={}
def q(k,s,a=()):
 try:out[k]=[dict(r) for r in db.execute(s,a)]
 except Exception as e:out[k]={'error':str(e)}
h=json.loads(Path('/var/lib/news-flow/discovery-health/latest.json').read_text());out['discovery']=h
q('event_counts',"SELECT kind,count(*) n,max(at) latest FROM events WHERE at>? GROUP BY kind",(int(time.time()*1000)-3600000,))
q('recent_failures',"SELECT site,error,count(*) n FROM article_links WHERE first_at>? AND parse_status='fail' GROUP BY site,error ORDER BY n DESC LIMIT 25",(int(time.time()*1000)-86400000,))
q('held_schema',"SELECT sql FROM sqlite_master WHERE name='outbox'")
q('held_samples',"SELECT id,url,site,reason,created,substr(doc,1,250) doc FROM outbox LIMIT 4")
q('held_times',"SELECT min(created) first,max(created) last,count(*) n FROM outbox")
out['hashes']={p:hashlib.sha256(Path('/opt/news-flow/current',p).read_bytes()).hexdigest() for p in ['src/newsFlow/createOnlySink.mjs','src/newsFlow/threeFlowReview.mjs']}
print(json.dumps(out,indent=2))
PY
