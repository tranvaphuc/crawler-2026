set -euo pipefail
python3 - <<'PY'
import sqlite3,json
x=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);x.row_factory=sqlite3.Row
print(json.dumps([dict(r) for r in x.execute("SELECT site,url,first_at FROM article_links WHERE parse_status='pending' ORDER BY first_at LIMIT 15")]))
PY
