set -euo pipefail
python3 - <<'PY'
import json,sqlite3
d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);d.row_factory=sqlite3.Row
q="FROM news_category_backfill c JOIN article_links a ON a.parse_key=c.parse_key"
print(json.dumps({'failures':[dict(r) for r in d.execute("SELECT a.error,count(*) n "+q+" WHERE a.parse_status='fail' GROUP BY a.error ORDER BY n DESC LIMIT 30")],'receipts':[dict(r) for r in d.execute("SELECT r.status,count(*) n FROM news_category_backfill c JOIN import_receipts r ON r.id=c.es_id AND r.es_index=c.es_index GROUP BY r.status")],'vnexpress':[dict(r) for r in d.execute("SELECT a.parse_status,a.error,count(*) n "+q+" WHERE c.site='vnexpress.net' GROUP BY a.parse_status,a.error")],'vnexpress_sections':d.execute("SELECT count(*) FROM news_category_sections WHERE site='vnexpress.net'").fetchone()[0]},ensure_ascii=False))
PY
