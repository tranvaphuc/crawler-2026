set -euo pipefail
python3 - <<'PY'
from pathlib import Path
import json,sqlite3
for p in Path('/proc').iterdir():
 if not p.name.isdigit():continue
 try:
  cmd=(p/'cmdline').read_bytes().replace(b'\0',b' ').decode()
  if 'node scripts/apply_news_category_coverage.mjs' in cmd:print(json.dumps({'pid':p.name,'cmd':cmd,'status':(p/'status').read_text().splitlines()[:3]}))
 except (OSError,UnicodeError):pass
d=sqlite3.connect('file:/var/lib/news-flow/category-coverage-20261123/audit.sqlite?mode=ro',uri=True)
print(json.dumps({'articleApplications':d.execute('SELECT outcome,count(*) FROM article_applications GROUP BY outcome').fetchall(),'sectionApplications':d.execute('SELECT outcome,count(*) FROM section_applications GROUP BY outcome').fetchall()}))
d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True)
print(json.dumps({'backfill':d.execute("SELECT a.parse_status,count(*) FROM news_category_backfill c JOIN article_links a ON a.parse_key=c.parse_key GROUP BY a.parse_status").fetchall(),'hints':d.execute('SELECT state,count(*) FROM news_category_hints GROUP BY state').fetchall()}))
PY
