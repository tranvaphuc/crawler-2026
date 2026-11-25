set -euo pipefail
python3 - <<'PY'
import sqlite3,json,collections
from urllib.parse import urlsplit
r='/var/lib/news-flow/category-coverage-20261123';d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);d.execute('ATTACH DATABASE ? AS r',['file:'+r+'/transient-reviews-v2.sqlite?mode=ro']);groups=collections.defaultdict(list)
for row in d.execute("SELECT a.url FROM news_category_backfill c JOIN article_links a ON a.parse_key=c.parse_key WHERE a.site='vnexpress.net' AND a.parse_status='fail' AND a.error IN ('rate_limited','request_deadline_exceeded','ECONNRESET') AND NOT EXISTS(SELECT 1 FROM r.reviews p WHERE p.parse_key=a.parse_key)"):
 u=row[0];parts=urlsplit(u).path.strip('/').split('/');groups['/'+ '/'.join(parts[:5]) if len(parts)>5 else '/'+ '/'.join(parts[:-1])].append(u)
print(json.dumps([{'prefix':k,'n':len(v),'examples':v[:2]} for k,v in sorted(groups.items(),key=lambda t:-len(t[1]))][:20],ensure_ascii=False))
PY
