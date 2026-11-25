set -euo pipefail
python3 - <<'PY'
import sqlite3,json
d=sqlite3.connect('file:/var/lib/news-flow/category-coverage-20261123/audit.sqlite?mode=ro',uri=True);d.row_factory=sqlite3.Row
print(json.dumps([dict(x) for x in d.execute("SELECT site,url,final_url,title,article_count,category_count,parent,depth FROM pages WHERE origin='discovered' AND state='done' AND listing=1 AND error IS NULL ORDER BY site,url LIMIT 100")],ensure_ascii=False))
PY
