set -euo pipefail
python3 - <<'PY'
import sqlite3,json
r='/var/lib/news-flow/category-coverage-20261123';d=sqlite3.connect('file:'+r+'/audit.sqlite?mode=ro',uri=True);d.row_factory=sqlite3.Row
print(json.dumps({'rechecks':[dict(x) for x in d.execute('SELECT r.old_error,p.error current_error,count(*) n FROM section_manual_rechecks r JOIN pages p ON p.site=r.site AND p.key=r.key GROUP BY 1,2')],'blocked_vnexpress':[dict(x) for x in d.execute("SELECT url,error FROM pages WHERE site='vnexpress.net' AND error IS NOT NULL ORDER BY error,url")]},ensure_ascii=False))
PY
