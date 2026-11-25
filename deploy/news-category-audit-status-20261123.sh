set -euo pipefail
python3 - <<'PY'
import json,sqlite3,os
r='/var/lib/news-flow/category-coverage-20261123';d=sqlite3.connect('file:'+r+'/audit.sqlite?mode=ro',uri=True);d.row_factory=sqlite3.Row
print(json.dumps({'progress':json.load(open(r+'/progress.json')) if os.path.exists(r+'/progress.json') else None,'newSections':[dict(x) for x in d.execute("SELECT site,count(*) n FROM pages WHERE origin='discovered' AND state='done' AND listing=1 AND error IS NULL GROUP BY site ORDER BY n DESC LIMIT 15")],'vnexpress':[dict(x) for x in d.execute("SELECT origin,state,error,count(*) n FROM pages WHERE site='vnexpress.net' GROUP BY origin,state,error")],'errors':[dict(x) for x in d.execute("SELECT error,count(*) n FROM pages WHERE error IS NOT NULL GROUP BY error ORDER BY n DESC LIMIT 12")],'unfinishedSites':d.execute("SELECT count(DISTINCT site) FROM pages WHERE state!='done'").fetchone()[0]},ensure_ascii=False))
PY
systemctl show news-category-audit-20261123 -p ActiveState,SubState,MemoryCurrent,CPUUsageNSec
df -h /var/lib/news-flow
