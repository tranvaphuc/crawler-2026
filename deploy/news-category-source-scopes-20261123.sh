set -euo pipefail
python3 - <<'PY'
import json
r=json.load(open('/var/lib/news-flow/category-coverage-20261123/source-snapshot.json'))
for site in ['prnewswire.com','quasa.io','ashui.com','akauto.com.vn','gioitrengaynay.net','dulichgiaitri.com','minhtuanmobile.com','thitruonghanghoa.com']:
 c=r[site]['config'];print(json.dumps({'site':site,'homepage':c.get('homepage'),'discovery':{k:v for k,v in c.get('discovery',{}).items() if k not in ['categories']} ,'categories':c.get('discovery',{}).get('categories',[])[:5],'scope':c.get('publisherUrlScopes'),'requiredArticlePattern':c.get('discovery',{}).get('requiredArticlePattern'),'samples':c.get('validation',{}).get('sampleUrls',[])[:2]},ensure_ascii=False))
PY
