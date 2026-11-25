set -euo pipefail
python3 - <<'PY'
import json,sqlite3
r='/var/lib/news-flow/category-coverage-20261123';d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);d.row_factory=sqlite3.Row;d.execute('ATTACH DATABASE ? AS scan',[r+'/audit.sqlite'])
for site in ['vnexpress.net','motor1.com','de.motor1.com']:
 rows=[dict(x) for x in d.execute("SELECT h.url,h.parent FROM news_category_hints h LEFT JOIN scan.pages p ON p.site=h.site AND p.key=h.key WHERE h.site=? AND h.state='pending' AND p.key IS NULL LIMIT 8",[site])]
 print(json.dumps({'site':site,'samples':rows},ensure_ascii=False))
PY
