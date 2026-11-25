set -euo pipefail
systemctl set-property --runtime news-category-audit-20261123.service CPUQuota=300% CPUWeight=10
if systemctl is-active --quiet news-category-primary-review-20261123.service; then systemctl set-property --runtime news-category-primary-review-20261123.service CPUQuota=100% CPUWeight=10; fi
python3 - <<'PY'
from pathlib import Path
import subprocess,os
for unit in ['news-category-audit-20261123','news-category-primary-review-20261123']:
 pid=int(subprocess.check_output(['systemctl','show',unit,'-p','MainPID','--value'],text=True).strip() or 0)
 if pid:
  for p in (Path('/proc')/str(pid)/'task').iterdir():
   try:os.setpriority(os.PRIO_PROCESS,int(p.name),10)
   except ProcessLookupError:pass
PY
systemctl show news-category-audit-20261123 news-category-primary-review-20261123 -p Id,CPUQuotaPerSecUSec,CPUWeight
