set -euo pipefail
python3 - <<'PY'
import json,subprocess,sqlite3
from pathlib import Path
root=Path('/var/lib/news-flow/recovery-all-20261123');r={'services':subprocess.check_output(['systemctl','show','news-recovery-all-20261123','news-flow-seed','news-flow-parse','news-flow-import','-p','Id,MainPID,ActiveState,NRestarts,MemoryCurrent,Result'],text=True)}
db=sqlite3.connect('file:'+str(root/'audit.sqlite')+'?mode=ro',uri=True);db.row_factory=sqlite3.Row;r['counts']=[dict(x) for x in db.execute('SELECT status,outcome,count(*) n FROM cohort GROUP BY status,outcome')];r['reasonCounts']=[dict(x) for x in db.execute("SELECT reason,count(*) n FROM cohort WHERE status='done' GROUP BY reason ORDER BY n DESC LIMIT 12")];db.close()
r['journal']=subprocess.check_output(['journalctl','-u','news-recovery-all-20261123','-n','8','-o','cat','--no-pager'],text=True).splitlines();print(json.dumps(r))
PY
