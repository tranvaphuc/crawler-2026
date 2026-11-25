set -euo pipefail
date -u +%FT%TZ
readlink -f /opt/news-flow/current
systemctl show news-flow-seed.service news-flow-parse.service news-flow-import.service -p Id -p ActiveState -p MainPID -p ExecMainStartTimestamp
python3 - <<'PY'
import sqlite3,json,pathlib
root=pathlib.Path('/opt/news-flow/current')
p=root/'config/web-sources/news/suckhoecong.vn.json'
c=json.loads(p.read_text()) if p.exists() else {}
print('LIVE_CONFIG',json.dumps({'exists':p.exists(),'enabled':c.get('enabled'),'siteName':c.get('siteName')}))
print('REGISTRY_CODE', (root/'src/newsFlow/registry.mjs').read_text())
for p in pathlib.Path('/var/lib/news-flow').rglob('*.sqlite'):
 if 'backup' in str(p) or 'diagnostic' in str(p):continue
 print('DATABASE',str(p))
 db=sqlite3.connect('file:'+str(p)+'?mode=ro',uri=True,timeout=10)
 db.execute('PRAGMA query_only=ON')
 tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
 queries={
 'seed_sources':"SELECT status,reason,count(*),max(last_at) FROM seed_sources WHERE site='suckhoecong.vn' GROUP BY status,reason",
 'article_links':"SELECT parse_status,error,count(*),max(findtime) FROM article_links WHERE site='suckhoecong.vn' GROUP BY parse_status,error",
 'tasks':"SELECT role,state,reason,count(*),max(created) FROM tasks WHERE site='suckhoecong.vn' GROUP BY role,state,reason",
 'outbox':"SELECT state,reason,count(*),max(created) FROM outbox WHERE json_extract(doc,'$._source.siteName')='suckhoecong.vn' GROUP BY state,reason",
 'import_receipts':"SELECT status,count(*),max(imported_at) FROM import_receipts WHERE url LIKE 'https://suckhoecong.vn/%' GROUP BY status",
 'events':"SELECT at,kind,details FROM events WHERE site='suckhoecong.vn' ORDER BY id DESC LIMIT 8",
 'parser_overlays':"SELECT site,revision,verified_at FROM parser_overlays WHERE site='suckhoecong.vn'"
 }
 for t,q in queries.items():
  if t in tables:
   try:print(t,json.dumps(db.execute(q).fetchall(),ensure_ascii=False))
   except Exception as e:print(t,type(e).__name__,str(e))
 db.close()
PY
