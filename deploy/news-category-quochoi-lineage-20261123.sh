set -euo pipefail
python3 - <<'PY'
import sqlite3,json,gzip,re
p='/var/lib/news-flow/category-coverage-20261123/audit.sqlite';d=sqlite3.connect('file:'+p+'?mode=ro',uri=True);d.row_factory=sqlite3.Row
print('QH_COUNTS',json.dumps([dict(r) for r in d.execute("SELECT state,depth,count(*) n FROM pages WHERE site='quochoi.vn' GROUP BY 1,2")]))
for r in d.execute("SELECT url,parent,depth,title,listing,article_count,validation_reason,status,error,final_url,evidence FROM pages WHERE site='quochoi.vn' AND state='done' ORDER BY checked_at DESC LIMIT 8"):
 r=dict(r);file=r.pop('evidence');h=gzip.open(file,'rt',errors='replace').read() if file else '';r['canonical']=re.findall(r'<link[^>]+(?:rel=[\"\']canonical[\"\'][^>]+href=[\"\']([^\"\']+)|href=[\"\']([^\"\']+)[\"\'][^>]+rel=[\"\']canonical)',h,re.I)[:1];print(json.dumps(r,ensure_ascii=False))
row=d.execute("SELECT * FROM pages WHERE site='quochoi.vn' AND state='pending' ORDER BY depth,key LIMIT 1").fetchone()
for i in range(9):
 if not row:break
 print('LINEAGE',json.dumps({k:row[k] for k in ['url','parent','depth','listing','title','status','validation_reason']},ensure_ascii=False));row=d.execute("SELECT * FROM pages WHERE site='quochoi.vn' AND url=?",[row['parent']]).fetchone()
PY
