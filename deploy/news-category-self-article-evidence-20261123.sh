set -euo pipefail
python3 - <<'PY'
import sqlite3,json,gzip,re,html
p=sqlite3.connect('file:/var/lib/news-flow/category-coverage-20261123/applications.sqlite?mode=ro',uri=True);p.row_factory=sqlite3.Row;p.execute('ATTACH DATABASE ? AS scan',['/var/lib/news-flow/category-coverage-20261123/audit.sqlite'])
for site in ['thegioiphuongtien.vn','ashui.com','kinhtevataichinh.vn']:
 counts=[dict(r) for r in p.execute('SELECT listing,reason,count(*) n FROM candidate_qualifications WHERE site=? GROUP BY 1,2',[site])];samples=[]
 for r in p.execute("SELECT a.url,a.evidence,q.listing,q.reason FROM pages a LEFT JOIN candidate_qualifications q ON q.site=a.site AND q.key=a.key WHERE a.site=? AND a.evidence IS NOT NULL AND a.origin='discovered' AND a.url LIKE '%.html' LIMIT 2",[site]):
  s=gzip.decompress(open(r['evidence'],'rb').read()).decode();o=dict(r);o['h1']=[html.unescape(re.sub('<[^>]+>','',x)).strip() for x in re.findall('<h1[^>]*>(.*?)</h1>',s,re.I|re.S)];o['meta']=[x for x in re.findall('<meta[^>]+>',s,re.I) if re.search('date|published|og:type',x,re.I)][:8];o['contentDetail']='content-detail' in s;o['schemas']=list(set(re.findall(r'"@type"\s*:\s*"([^"]+)"',s)))[:10];samples.append(o)
 print(json.dumps({'site':site,'counts':counts,'samples':samples},ensure_ascii=False))
PY
