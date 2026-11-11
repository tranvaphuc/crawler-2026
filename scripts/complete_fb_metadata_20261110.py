import json,re,sys,html,unicodedata
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8');root=Path('outputs/project-refresh-2026-11-10');out=root/'completion'
checks=[json.loads(l) for l in (out/'source-checks.jsonl').read_text(encoding='utf-8').splitlines()];existing=json.loads((out/'resolved-source-identities.json').read_text(encoding='utf-8'));resolved={r['_id']:r for r in existing}
def norm(s):return re.sub(r'\W','',unicodedata.normalize('NFKC',s).casefold())
def walk(v,fn):
 if isinstance(v,dict):
  fn(v)
  for x in v.values():walk(x,fn)
 elif isinstance(v,list):
  for x in v:walk(x,fn)
for c in checks:
 if c['platform']!='facebook' or not c.get('responseFile') or c['_id'] in resolved:continue
 text=Path(c['responseFile']).read_text(encoding='utf-8');candidate=c.get('candidateNativeId');identities=[]
 def visit(v):
  delegate=v.get('delegate_page')
  if isinstance(delegate,dict) and str(delegate.get('id'))==str(candidate) and v.get('name'):identities.append({'id':str(candidate),'name':v['name'],'type':'page','evidence':'Facebook owner object name + matching delegate_page.id'})
  if v.get('__typename')=='Page' and str(v.get('id'))==str(candidate) and v.get('name'):identities.append({'id':str(candidate),'name':v['name'],'type':'page','evidence':'Facebook Page object id + name matching source title'})
 for tag in re.findall(r'<script[^>]*type="application/json"[^>]*>([\s\S]*?)</script>',text):
  try:walk(json.loads(tag),visit)
  except (json.JSONDecodeError,RecursionError):pass
 title=c.get('responseTitle','');match=next((x for x in identities if norm(x['name']) in norm(title) or norm(title.split('|')[0]) in norm(x['name'])),None)
 if match:
  resolved[c['_id']]={'_id':c['_id'],'platform':'facebook','nativeId':match['id'],'type':match['type'],'name':match['name'],'url':'https://www.facebook.com/'+match['id'],'decision':'IDENTITY_CONFIRMED','evidence':match['evidence'],'checkedAt':c['checkedAt']}
(out/'resolved-source-identities.json').write_text(json.dumps(list(resolved.values()),ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'resolvedFacebook':len(resolved),'types':{t:sum(r['type']==t for r in resolved.values()) for t in ['page','group','user']}}))
