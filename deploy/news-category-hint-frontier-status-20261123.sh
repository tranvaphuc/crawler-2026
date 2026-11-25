set -euo pipefail
python3 - <<'PY'
from pathlib import Path
import sqlite3,json
r=Path('/var/lib/news-flow/category-coverage-20261123')
for name in ['hint-expansion-status.json','hint-expansion-progress.json','manual-admission-final.json']:
 if (r/name).exists():print(name+': '+(r/name).read_text())
d=sqlite3.connect('file:'+str(r/'audit.sqlite')+'?mode=ro',uri=True);d.row_factory=sqlite3.Row
if d.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='hint_expansions'").fetchone():print(json.dumps({'expanded':[dict(x) for x in d.execute('SELECT h.site,count(*) n FROM hint_expansions h GROUP BY site ORDER BY n DESC LIMIT 10')]}))
PY
systemctl show news-category-hint-expansion-20261123 -p ActiveState,SubState,NRestarts
journalctl -u news-category-hint-expansion-20261123 -n 3 --no-pager -o cat | cut -c 1-1800
