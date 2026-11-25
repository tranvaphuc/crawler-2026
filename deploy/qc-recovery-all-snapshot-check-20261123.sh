set -euo pipefail
python3 - <<'PY'
import json,subprocess,sqlite3
from pathlib import Path
root=Path('/var/lib/news-flow/recovery-all-20261123');p=root/'audit.sqlite';r={'processes':subprocess.check_output(['pgrep','-af','qc-recovery-all-snapshot.py'],text=True).splitlines(),'files':[{ 'name':x.name,'size':x.stat().st_size} for x in root.iterdir() if x.is_file()]};db=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);r['indexes']=[tuple(x) for x in db.execute('PRAGMA index_list(article_links)')];db.close();print(json.dumps(r))
PY
