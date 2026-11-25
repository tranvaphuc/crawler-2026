set -euo pipefail
python3 - <<'PY'
import sqlite3,json
d=sqlite3.connect('file:/var/lib/news-flow/category-coverage-20261123/audit.sqlite?mode=ro',uri=True);d.row_factory=sqlite3.Row
top=[dict(x) for x in d.execute("SELECT site,count(*) remaining,max(depth) depth FROM pages WHERE state!='done' GROUP BY site ORDER BY remaining DESC LIMIT 15")]
for row in top:row['examples']=[x[0] for x in d.execute("SELECT url FROM pages WHERE state='pending' AND site=? ORDER BY key LIMIT 3",[row['site']])]
print(json.dumps(top,ensure_ascii=False))
PY
