set -euo pipefail
python3 - <<'PY'
import json,sqlite3
d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);d.row_factory=sqlite3.Row
sites=['founder.com.vn','otopro.com.vn','tuyengiao.vn','voh.com.vn','dulich.thethaovanhoa.vn']
print(json.dumps({'seeds':[dict(r) for r in d.execute('SELECT site,status,reason,count(*) n,max(last_at) latest FROM seed_sources WHERE site IN ('+','.join('?' for _ in sites)+') GROUP BY site,status,reason',sites)]}));d.close()
PY
