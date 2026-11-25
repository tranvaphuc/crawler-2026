set -euo pipefail
date -u +%FT%TZ
readlink -f /opt/news-flow/current
systemctl show news-flow-seed.service news-flow-parse.service news-flow-import.service -p Id -p ActiveState -p MainPID
python3 - <<'PY'
import sqlite3,json,datetime,pathlib
d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True)
queries={
 'links':"SELECT parse_status,error,count(*) FROM article_links WHERE site='suckhoecong.vn' GROUP BY parse_status,error",
 'recent_links':"SELECT url,parse_status,error,findtime,first_at FROM article_links WHERE site='suckhoecong.vn' ORDER BY first_at DESC LIMIT 8",
 'latest_tasks':"SELECT url,role,state,reason,created FROM tasks WHERE site='suckhoecong.vn' AND role='article' ORDER BY id DESC LIMIT 8",
 'newest_article':"SELECT url,parse_status,error,findtime,first_at FROM article_links WHERE site='suckhoecong.vn' AND url LIKE '%104794%'",
 'queue':"SELECT role,state,count(*) FROM tasks WHERE site='suckhoecong.vn' AND state IN ('pending','running') GROUP BY role,state",
 'outbox':"SELECT state,reason,count(*) FROM outbox WHERE json_extract(doc,'$._source.siteName')='suckhoecong.vn' GROUP BY state,reason",
 'events':"SELECT at,kind,details FROM events WHERE site='suckhoecong.vn' ORDER BY id DESC LIMIT 5",
 'receipts':"SELECT status,count(*),max(imported_at) FROM import_receipts WHERE url LIKE 'https://suckhoecong.vn/%' GROUP BY status"
}
for k,q in queries.items():print(k,json.dumps(d.execute(q).fetchall(),ensure_ascii=False))
c=json.loads(pathlib.Path('/opt/news-flow/current/config/web-sources/news/suckhoecong.vn.json').read_text());print('time_config',json.dumps({k:c.get(k) for k in ['publishedDate','publicationEvidencePolicy','timezone']}))
PY
