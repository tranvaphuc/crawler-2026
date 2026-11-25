set -euo pipefail
systemctl show news-category-audit-20261123 news-category-hint-expansion-20261123 -p ActiveState -p SubState -p NRestarts -p ExecMainStatus || true
journalctl -u news-category-audit-20261123 -n 3 --no-pager -o cat | cut -c 1-1200
journalctl -u news-category-hint-expansion-20261123 -n 5 --no-pager -o cat | cut -c 1-1600
python3 - <<'PY'
import sqlite3,json
p='/var/lib/news-flow/category-coverage-20261123/audit.sqlite';d=sqlite3.connect('file:'+p+'?mode=ro',uri=True);d.row_factory=sqlite3.Row;print(json.dumps([dict(r) for r in d.execute("SELECT site,url,parent,state FROM pages WHERE state!='done' LIMIT 10")],ensure_ascii=False))
PY
