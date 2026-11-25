set -euo pipefail
python3 - <<'PY'
import sqlite3,json,gzip,re
r='/var/lib/news-flow/category-coverage-20261123';d=sqlite3.connect('file:'+r+'/transient-reviews-v2.sqlite?mode=ro',uri=True);d.row_factory=sqlite3.Row
print('RECENT_REASONS',json.dumps([dict(x) for x in d.execute("SELECT reason,count(*) n FROM reviews WHERE site='vnexpress.net' AND checked_at>(SELECT max(checked_at)-300000 FROM reviews) GROUP BY reason")]))
for row in d.execute("SELECT url,reason,proof FROM reviews WHERE site='vnexpress.net' ORDER BY checked_at DESC LIMIT 8"):
 row=dict(row);p=json.loads(row.pop('proof') or '{}');requests=p.get('requests',[]);row['requests']=[{k:q.get(k) for k in ['url','status','error','file']} for q in requests];files=[q['file'] for q in requests if q.get('file')]
 if files:
  h=gzip.open(files[-1],'rt',encoding='utf-8',errors='replace').read();row['bytes']=len(h);row['title']=re.findall(r'<title[^>]*>(.*?)</title>',h,re.I|re.S)[:1];row['h1']=re.findall(r'<h1[^>]*>(.*?)</h1>',h,re.I|re.S)[:1];row['bodySelectors']={s:h.count(s) for s in ['fck_detail','title-detail','section-content','wrapper-content','datePublished','captcha','access denied']}
 print(json.dumps(row,ensure_ascii=False))
PY
