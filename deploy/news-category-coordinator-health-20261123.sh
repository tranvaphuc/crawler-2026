set -euo pipefail
systemctl show news-category-initial-backfill-20261123 news-category-transient-review-20261123 news-category-hint-expansion-20261123 -p Id,NRestarts,ActiveState,SubState
journalctl -u news-category-initial-backfill-20261123 --since '30 minutes ago' --no-pager -o cat | python3 -c 'import sys,json;lines=sys.stdin.read().splitlines();print(json.dumps({"errors":[x[:450] for x in lines if any(s in x for s in ["Error:","SQLITE","Failed with","exception","TypeError"])][-15:]}))'
python3 - <<'PY'
import sqlite3,json
d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);d.row_factory=sqlite3.Row
print(json.dumps({'rate_limited':[dict(x) for x in d.execute("SELECT c.site,count(*) n FROM news_category_backfill c JOIN article_links a ON a.parse_key=c.parse_key WHERE a.error='rate_limited' GROUP BY c.site ORDER BY n DESC LIMIT 10")]}))
PY
