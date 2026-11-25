set -euo pipefail
python3 - <<'PY'
import json,sqlite3
from pathlib import Path
r=Path('/var/lib/news-flow/category-coverage-20261123')
print((r/'transient-review-progress.json').read_text() if (r/'transient-review-progress.json').exists() else '{}')
if (r/'transient-reviews-v2.sqlite').exists():
 d=sqlite3.connect('file:'+str(r/'transient-reviews-v2.sqlite')+'?mode=ro',uri=True);d.row_factory=sqlite3.Row
 print(json.dumps({'reasons':[dict(x) for x in d.execute('SELECT reason,count(*) n FROM reviews GROUP BY reason ORDER BY n DESC LIMIT 8')],'activations':[dict(x) for x in d.execute('SELECT activation,count(*) n FROM reviews WHERE activation IS NOT NULL GROUP BY activation')]}))
PY
systemctl show news-category-transient-review-20261123 -p ActiveState,SubState,NRestarts,MemoryCurrent
journalctl -u news-category-transient-review-20261123 -n 3 --no-pager -o cat | cut -c 1-1200
