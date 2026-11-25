set -euo pipefail
python3 - <<'PY'
import sqlite3,json
d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);d.row_factory=sqlite3.Row
print(json.dumps({'seeds':[dict(r) for r in d.execute("SELECT * FROM seed_sources WHERE site='tuyengiao.vn'")],'failures':[dict(r) for r in d.execute("SELECT * FROM url_failures WHERE site='tuyengiao.vn' AND role!='article' ORDER BY last_at DESC LIMIT 15")],'recentSeeds':[dict(r) for r in d.execute("SELECT at,details FROM events WHERE kind='seed' AND details LIKE '%tuyengiao.vn%' ORDER BY id DESC LIMIT 5")]},indent=2))
PY
