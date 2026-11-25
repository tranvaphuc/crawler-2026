set -euo pipefail
tail -n 22 /var/lib/news-flow/vnexpress-ebank-probe.log | cut -c 1-600
python3 - <<'PY'
import json
r=json.load(open('/var/lib/news-flow/vnexpress-miss-20261123/ebank-probe.json'))
print(json.dumps({'finishedAt':r.get('finishedAt'),'seeds':[{k:v for k,v in s.items() if k not in ['articles','missing']}|{'articles':len(s.get('articles',[])),'missing':len(s.get('missing',[]))} for s in r['seeds']],'articles':[{'url':a['url'],'state':a['state'],'reason':a['reason'],'title':a.get('doc',{}).get('_source',{}).get('title')} for a in r['articles']]},ensure_ascii=False))
PY
