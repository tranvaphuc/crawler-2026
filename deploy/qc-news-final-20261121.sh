set -euo pipefail
python3 - <<'PY'
import sqlite3,json,time,hashlib
from pathlib import Path
db=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);db.row_factory=sqlite3.Row
check=json.loads(Path('/var/lib/news-flow/qc-20261121/import-check.json').read_text())
before=json.loads(Path('/var/lib/news-flow/qc-20261121/import-held-before.json').read_text())
ids=[r['id'] for r in before['rows']]
receipts=[dict(r) for r in db.execute('SELECT status,count(*) n FROM import_receipts WHERE id IN ('+','.join('?' for _ in ids)+') GROUP BY status',ids)]
left=[dict(r) for r in db.execute('SELECT state,reason,count(*) n FROM outbox GROUP BY state,reason')]
usage=[dict(r) for r in db.execute('SELECT * FROM ai_usage ORDER BY day')]
h=json.loads(Path('/var/lib/news-flow/discovery-health/latest.json').read_text())
restored=json.loads(Path('/var/lib/news-flow/qc-20261121/seed-recovery.json').read_text())
progress=[]
for r in restored['restored']:
 row=db.execute('SELECT status,reason,last_at,links_found,new_links FROM seed_sources WHERE url=?',(r['url'],)).fetchone();progress.append({'site':r['site'],'url':r['url'],**dict(row)})
out={'at':time.time(),'review':check,'repairedImportReceipts':receipts,'outbox':left,'aiLedgerUnchanged':usage==before['ai_usage'],'aiUsage':usage[-3:],'discoveryHealth':{k:h[k] for k in ['checkedAt','totalSites','alertSites','counts']},'remainingSourceAlerts':h['sites'],'seedRecovery':progress}
print(json.dumps(out,indent=2))
PY
