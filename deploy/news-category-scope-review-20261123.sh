set -euo pipefail
python3 - <<'PY'
import sqlite3,json
d=sqlite3.connect('file:/var/lib/news-flow/category-coverage-20261123/audit.sqlite?mode=ro',uri=True);d.row_factory=sqlite3.Row
for site in ['finance.yahoo.com','vnexpress.net','luatvietnam.vn','world.kbs.co.kr']:
 print(json.dumps({'site':site,'new':[dict(x) for x in d.execute("SELECT url,final_url,title,listing,article_count,error FROM pages WHERE site=? AND origin='discovered' AND state='done' ORDER BY key LIMIT 42",[site])]},ensure_ascii=False))
PY
