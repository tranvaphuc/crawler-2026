set -euo pipefail
python3 - <<'PY'
import sqlite3,json
from pathlib import Path
db=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);db.row_factory=sqlite3.Row
h=json.loads(Path('/var/lib/news-flow/discovery-health/latest.json').read_text())
out=[]
for row in h['sites']:
 if 'no_successful_parse_after_article_failures' in row['alerts']:
  rows=[dict(r) for r in db.execute("SELECT error,count(*) n,min(url) sample FROM article_links WHERE site=? AND parse_status='fail' GROUP BY error ORDER BY n DESC LIMIT 3",(row['articleOwner'],))]
  out.append({'site':row['site'],'errors':rows})
print(json.dumps(out,indent=2))
PY
