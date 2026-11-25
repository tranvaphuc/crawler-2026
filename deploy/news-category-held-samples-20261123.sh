set -euo pipefail
python3 - <<'PY'
import sqlite3,json,gzip,re,html
d=sqlite3.connect('file:/var/lib/news-flow/news-flow-runtime/write.sqlite?mode=ro',uri=True);d.row_factory=sqlite3.Row
groups=[dict(x) for x in d.execute("SELECT c.site,a.error,count(*) n FROM news_category_backfill c JOIN article_links a ON a.parse_key=c.parse_key WHERE a.parse_status='fail' AND a.error='NEWS_PUBLICATION_JSONLD_NOT_URL_BOUND' GROUP BY c.site,a.error ORDER BY n DESC LIMIT 10")]
for g in groups:
 g['samples']=[]
 for r in d.execute("SELECT url,reason,html FROM review_samples WHERE site=? AND kind='fail' LIMIT 2",[g['site']]):
  try:s=gzip.decompress(r['html']).decode()
  except Exception:continue
  titles=[html.unescape(re.sub('<[^>]+>','',v)).strip() for v in re.findall(r'<h1[^>]*>(.*?)</h1>',s,re.S|re.I)][:3]
  schemas=[]
  for raw in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>',s,re.S|re.I):
   try:
    o=json.loads(raw);objects=o if isinstance(o,list) else o.get('@graph',[o]);schemas.extend({k:a.get(k) for k in ['headline','datePublished','url','@id']} for a in objects if isinstance(a,dict) and a.get('headline'))
   except Exception:pass
  g['samples'].append({'url':r['url'],'reason':r['reason'],'h1':titles,'schemas':schemas[:2]})
print(json.dumps(groups,ensure_ascii=False))
PY
