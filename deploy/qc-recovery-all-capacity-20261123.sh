set -euo pipefail
python3 - <<'PY'
import json,sqlite3,subprocess
from pathlib import Path
r=Path('/var/lib/news-flow/recovery-all-20261123');d=sqlite3.connect('file:'+str(r/'audit.sqlite')+'?mode=ro',uri=True);d.row_factory=sqlite3.Row
print(json.dumps({'cpus':subprocess.check_output(['nproc'],text=True).strip(),'load':Path('/proc/loadavg').read_text().strip(),'service':subprocess.check_output(['systemctl','show','news-recovery-all-20261123','-p','CPUUsageNSec,CPUQuotaPerSecUSec,MemoryCurrent,MemoryMax,TasksCurrent'],text=True),'largestRemaining':[dict(x) for x in d.execute("SELECT site,sum(status='done') done,sum(status!='done') remaining,count(*) total FROM cohort GROUP BY site ORDER BY remaining DESC LIMIT 20")],'repair':[dict(x) for x in d.execute('SELECT site,outcome,count(*) n FROM repair_results GROUP BY site,outcome')]}))
PY
