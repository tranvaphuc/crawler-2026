set -euo pipefail
python3 - <<'PY'
import sqlite3,json
d=sqlite3.connect('file:/var/lib/news-flow/category-coverage-20261123/applications.sqlite?mode=ro',uri=True);d.row_factory=sqlite3.Row
proofs=[dict(x) for x in d.execute('SELECT (verified_articles>=2) verified,count(*) n FROM candidate_article_proofs GROUP BY 1')] if d.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='candidate_article_proofs'").fetchone() else []
print(json.dumps({'qualified':[dict(x) for x in d.execute('SELECT listing,reason,count(*) n FROM candidate_qualifications GROUP BY 1,2 ORDER BY n DESC LIMIT 10')],'originalArticleProofs':proofs,'removed':[dict(x) for x in d.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='removed_sections'")]},ensure_ascii=False))
PY
systemctl show news-category-original-proof-20261123 -p ActiveState,SubState,MemoryCurrent
journalctl -u news-category-original-proof-20261123 -n 3 --no-pager | cut -c 1-1000
