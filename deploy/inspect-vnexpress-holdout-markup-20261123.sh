set -euo pipefail
python3 - <<'PY'
import json,gzip,re,os
r=json.load(open('/var/lib/news-flow/vnexpress-miss-20261123/holdouts.json'))
for a in r['rows']:
 print(json.dumps({k:v for k,v in a.items() if k not in ['doc','proof']},ensure_ascii=False))
 if a['state']=='done' or not os.path.exists(a['file']):continue
 s=gzip.open(a['file'],'rt').read()
 for m in re.finditer(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>',s,re.S):print(m.group(1)[:7000])
 print('HEADINGS',re.findall(r'<h1[^>]*>.*?</h1>',s,re.S)[:2])
 print('META',re.findall(r'<meta[^>]*(?:pubdate|og:title|og:url|article:published)[^>]*>',s))
PY
