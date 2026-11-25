set -euo pipefail
python3 - <<'PY'
import sqlite3,json
d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);d.row_factory=sqlite3.Row
print(json.dumps({'held':[dict(x) for x in d.execute("SELECT c.site,o.reason,count(*) n FROM news_category_backfill c JOIN outbox o ON o.id=c.es_id WHERE o.state='held' GROUP BY c.site,o.reason")],'samples':[dict(x) for x in d.execute("SELECT c.site,c.url,o.id,o.reason,json_extract(o.doc,'$._index') es_index FROM news_category_backfill c JOIN outbox o ON o.id=c.es_id WHERE o.state='held' LIMIT 5")]},ensure_ascii=False))
PY
