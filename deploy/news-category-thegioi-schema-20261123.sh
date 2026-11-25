set -euo pipefail
python3 - <<'PY'
import sqlite3,gzip,re,json
d=sqlite3.connect('file:/var/lib/news-flow/category-coverage-20261123/audit.sqlite?mode=ro',uri=True)
r=d.execute("SELECT evidence FROM pages WHERE site='thegioiphuongtien.vn' AND evidence IS NOT NULL AND url LIKE '%bat-can-tai-xe-khien-lexus%' LIMIT 1").fetchone();s=gzip.decompress(open(r[0],'rb').read()).decode()
for raw in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>',s,re.S|re.I):
 try:
  o=json.loads(raw)
  print(json.dumps(o,ensure_ascii=False)[:5000])
 except Exception as e:print('INVALID_JSONLD:'+str(e)+':'+raw[:200])
PY
