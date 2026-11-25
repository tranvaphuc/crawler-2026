set -euo pipefail
cd /opt/news-flow/current
python3 - <<'PY'
import sqlite3,json
from pathlib import Path
d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True)
for site in ['vnexpress.net','quasa.io']:
 c=json.loads((Path('config/web-sources/news')/(site+'.json')).read_text());o=d.execute('SELECT config FROM parser_overlays WHERE site=?',[site]).fetchone()
 def limits(c):return {k:c.get('http',{}).get(k) for k in ['maxConcurrentArticles','maxConcurrentSeeds']}
 print(json.dumps({'site':site,'configured':limits(c),'overlay':limits(json.loads(o[0])) if o else None,'running':dict(d.execute("SELECT role,count(*) FROM tasks WHERE site=? AND state='running' GROUP BY role",[site]))}))
PY
systemctl is-active news-flow-seed news-flow-parse news-flow-import
