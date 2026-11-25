set -euo pipefail
python3 - <<'PY'
import json
p='/var/lib/news-flow/vnexpress-miss-20261123/audit.json'
r=json.load(open(p));a=r.get('article',{});d=r.get('doc',{});audit=a.get('audit',{});parsed=audit.get('parsed',{})
print(json.dumps({'at':r['at'],'finishedAt':r.get('finishedAt'),'article':{k:v for k,v in a.items() if k!='audit'},'auditError':audit.get('error'),'quality':audit.get('quality'),'extracted':parsed.get('extracted'),'doc':{'index':d.get('_index'),'id':d.get('_id'),'source':{k:v for k,v in d.get('_source',{}).items() if k!='content'}},'es':r.get('es'),'seeds':[{'url':s['url'],'n':len(s.get('articles',[])),'target':s.get('hasTarget')} for s in r['seeds']]},ensure_ascii=False))
PY
