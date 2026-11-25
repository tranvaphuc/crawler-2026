set -euo pipefail
systemctl is-active news-flow-seed news-flow-parse news-flow-import news-category-maintenance.timer
systemctl is-enabled news-category-maintenance.timer
systemctl show news-flow-seed news-flow-parse news-flow-import -p Id -p NRestarts -p ActiveState
python3 - <<'PY'
from pathlib import Path
import json,sqlite3
allowed={'AI_DAILY_BUDGET_USD','AI_DAILY_MAX_CALLS'};values={}
for line in Path('/etc/news-flow/ai.env').read_text().splitlines():
 if '=' in line:
  k,v=line.split('=',1)
  if k in allowed:values[k]=v.strip().strip('\"\'')
d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);values['usage']=d.execute('SELECT day,calls,usd FROM ai_usage ORDER BY day DESC LIMIT 2').fetchall();print(json.dumps(values))
PY
