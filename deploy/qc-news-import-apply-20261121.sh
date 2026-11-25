set -euo pipefail
umask 077
python3 - <<'PY'
import sqlite3,json,time
from pathlib import Path
db=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);db.row_factory=sqlite3.Row
rows=[dict(r) for r in db.execute("SELECT * FROM outbox WHERE state='held' AND reason='ES5_CREATE_UNCONFIRMED'")]
usage=[dict(r) for r in db.execute('SELECT * FROM ai_usage ORDER BY day')]
Path('/var/lib/news-flow/qc-20261121/import-held-before.json').write_text(json.dumps({'at':time.time(),'rows':rows,'ai_usage':usage}))
print(json.dumps({'backedUpHeldImports':len(rows),'aiUsageLedgerPreserved':True}))
PY
runuser -u news-flow -- /opt/news-flow/node/bin/node /var/lib/news-flow/qc-20261121/reconcile.mjs --apply > /var/lib/news-flow/qc-20261121/import-repair.json
python3 - <<'PY'
import json
from pathlib import Path
d=json.loads(Path('/var/lib/news-flow/qc-20261121/import-repair.json').read_text());d.pop('decisions',None);print(json.dumps(d))
PY
