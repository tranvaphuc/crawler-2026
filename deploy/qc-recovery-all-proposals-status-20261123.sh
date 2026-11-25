set -euo pipefail
python3 - <<'PY'
import json,subprocess
from pathlib import Path
r=Path('/var/lib/news-flow/recovery-all-20261123');p=r/'proposal-summary.json'
summary=json.loads(p.read_text()) if p.exists() else {}
print(json.dumps({'unit':subprocess.run(['systemctl','show','news-recovery-proposals-20261123','-p','ActiveState,MainPID,Result,MemoryCurrent'],capture_output=True,text=True).stdout,'summary':summary,'journal':subprocess.run(['journalctl','-u','news-recovery-proposals-20261123','-n','5','-o','cat','--no-pager'],capture_output=True,text=True).stdout}))
PY
