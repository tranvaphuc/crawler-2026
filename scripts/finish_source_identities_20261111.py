import json,re,html,unicodedata
from pathlib import Path
root=Path('outputs/project-refresh-2026-11-10'); out=root/'completion'
load=lambda n:json.loads((out/n).read_text(encoding='utf8'))
src=json.loads((root/'sources-to-add.json').read_text(encoding='utf8'))
resolved={x['_id']:x for x in load('resolved-source-identities.json')}
group_ids={'mujisale':'1832678350641855','uniqloguvn':'3141226689344779','641174085421881':'641174085421881','1378604019581735':'1378604019581735','265949210203707':'265949210203707','1882651235299265':'1882651235299265','yeunhadep':'2377972135598835','menhadepp':'245121083236195','nghiendecor9999':'2503959256525358','yeubep.nghiennha.vn':'1101498673328863','2403938036571273':'2403938036571273','phongcachsongtoigian':'554314558447237','423933691340408':'423933691340408','rwmypham':'367089020688300','skincarelamdep':'238717657303540','beautytips.reviews':'821721584576791','tuidepcaudep':'3330230617074721','165377948076458':'165377948076458','1537395366422655':'1537395366422655','officialcaex':'802350585821932','hoiphuhuynhquoctehanoi':'1016044025847931'}
for s in src:
 slug=s['url'].rstrip('/').split('/')[-1]
 if s['platform']=='facebook' and '/groups/' in s['url'] and slug in group_ids:
  native=group_ids[slug]
  resolved[s['_id']]={'_id':s['_id'],'platform':'facebook','nativeId':native,'type':'group','name':s['name'],'url':'https://www.facebook.com/groups/'+native,'decision':'IDENTITY_CONFIRMED','evidence':'Chrome logged-in public group header + /groups/'+native+'/members/ link; group name corresponds to input source','checkedAt':'2026-11-10T17:00:00Z'}
def walk(v):
 if isinstance(v,dict):
  yield v
  for x in v.values():yield from walk(x)
 elif isinstance(v,list):
  for x in v:yield from walk(x)
def norm(s):return re.sub(r'\W','',unicodedata.normalize('NFKC',s).casefold())
for r in load('retry-public-results.json'):
 if r['platform']=='youtube' and r.get('id') and r.get('status')=='live':
  resolved[r['_id']]={'_id':r['_id'],'platform':'youtube','nativeId':r['id'],'type':'channel','name':r['name'],'url':r['url'],'decision':'IDENTITY_CONFIRMED','evidence':r['identityEvidence'],'checkedAt':r['checkedAt']}
 if r['platform']!='facebook' or not r.get('name'):continue
 text=Path(r['responseFile']).read_text(encoding='utf8'); candidates=[]
 for tag in re.findall(r'<script[^>]*type="application/json"[^>]*>([\s\S]*?)</script>',text):
  try: values=list(walk(json.loads(tag)))
  except (json.JSONDecodeError,RecursionError):continue
  for v in values:
   name=v.get('name','')
   if not isinstance(name,str) or len(norm(name))<5 or norm(name) not in norm(r['name']):continue
   delegate=v.get('delegate_page')
   if isinstance(delegate,dict) and re.fullmatch(r'\d+',str(delegate.get('id',''))):candidates.append((str(delegate['id']),name,'Matched owner name + delegate_page.id'))
   elif v.get('__typename')=='Page' and re.fullmatch(r'\d+',str(v.get('id',''))):candidates.append((str(v['id']),name,'Matched Page object id + source title'))
 if len(set(x[0] for x in candidates))==1:
  native,name,evidence=candidates[0]
  resolved[r['_id']]={'_id':r['_id'],'platform':'facebook','nativeId':native,'type':'page','name':name,'url':'https://www.facebook.com/'+native,'decision':'IDENTITY_CONFIRMED','evidence':evidence,'checkedAt':r['checkedAt']}
(out/'resolved-source-identities-final.json').write_text(json.dumps(list(resolved.values()),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'resolved':len(resolved),'facebook':sum(x['platform']=='facebook' for x in resolved.values()),'youtube':sum(x['platform']=='youtube' for x in resolved.values())}))
