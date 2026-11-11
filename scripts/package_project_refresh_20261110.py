import json,csv,collections,gzip,zipfile,re
from pathlib import Path
from finalize_keywords_20261110 import norm
root=Path('outputs/project-refresh-2026-11-10')
def read(n):return json.loads((root/n).read_text(encoding='utf-8'))
def save(n,x):(root/n).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf-8')
raw=read('keyword-cells-separated.json');final=read('keywords-search.json');review=read('keywords-review.json');subjects=read('subjects-leveled.json');sources=read('project-source-inventory.json');projects=read('projects-current.json');manifest=read('plans-manifest.json');evidence=read('search-evidence.json')
beforeIds={s['_id'] for s in read('system-sources-before.json')};sourceById={}
for s in sources:
 if s['_id'] not in sourceById:sourceById[s['_id']]={**s,'existing':s['_id'] in beforeIds}
 else:
  target=sourceById[s['_id']]
  for field in ('projects','projectIds','originalLinks','origins'):
   for item in s.get(field,[]):
    if item not in target[field]:target[field].append(item)
sources=list(sourceById.values());save('project-source-inventory.json',sources)
for r in final:
 e=[x for x in evidence if norm(x['query'])==norm(r['query'])]
 if e:r['validation']='; '.join(x['platform']+': '+x['outcome'] for x in e)
save('keywords-search.json',final)
priorityGroups=collections.defaultdict(list)
for k in final:
 canonical=re.sub(r'^'+re.escape(k['project'])+r'\s*[-_:]\s*','',k['subject'],flags=re.I).strip()
 priorityGroups[(k['project'],norm(canonical),k['level'])].append({**k,'canonicalSubject':canonical})
priority=[]
for rows in priorityGroups.values():
 def order(k):
  live=0 if 'Có data đúng' in k['validation'] else 1
  exact=0 if norm(k['query'])==norm(k['canonicalSubject']) and len(norm(k['query']).replace(' ',''))>=4 else 1
  return (live,exact,len(k['query'].split()),len(k['query']))
 chosen=min(rows,key=order)
 priority.append({**chosen,'subject':chosen['canonicalSubject'],'alternativeCount':len(rows)-1,'selectionRule':'Ưu tiên key có data đúng đã test, sau đó key định danh ngắn; các biến thể khác giữ ở Keyword_de_xuat'})
save('keywords-priority.json',priority)
groups={}
for r in raw:
 k=(r['project'],r['documentId'],r['sheet'],r['block'],r.get('group'),r['subject'])
 g=groups.setdefault(k,dict(project=r['project'],subject=r['subject'],main=[],sub=[],exclude=[],hashtag=[],planUrl=r['planUrl'],sheet=r['sheet'],cells=[]))
 if r['value'] not in g[r['kind']]:g[r['kind']].append(r['value'])
 g['cells'].append(r['cell'])
save('keywords-separated-groups.json',list(groups.values()))
rg={}
for r in review:
 k=(r['project'],r['documentId'],r['sheet'],r['cell'],r['reason'])
 g=rg.setdefault(k,{**r,'terms':[]})
 if r.get('term') and r['term'] not in g['terms']:g['terms'].append(r['term'])
save('keywords-review-cells.json',list(rg.values()))
summary=[]
for p in projects:
 ps=[s for s in sources if p['project'] in s['projects']];ks=[x for x in final if x['project']==p['project']];rs=[x for x in raw if x['project']==p['project']];rv=[x for x in rg.values() if x['project']==p['project']]
 ds=[d for d in manifest if any(q['row']==p['row'] for q in d['projects'])]
 summary.append({**p,'plans':len(ds),'downloadedPlans':sum(d['status']=='DOWNLOADED' for d in ds),'sources':len(ps),'newSources':sum(not s['existing'] for s in ps),'rawKeywordCells':len(rs),'searchQueries':len(ks),'level1':sum(x['level']==1 for x in ks),'level2':sum(x['level']==2 for x in ks),'reviewCells':len(rv),'state':'Thiếu plan' if not ds else 'Plan lỗi/thiếu quyền' if any(d['status']!='DOWNLOADED' for d in ds) else 'Có bản tách; query đề xuất cần kiểm tra thêm' if rv or any('chưa kiểm tra' in x['validation'] for x in ks) else 'Đã tách dữ liệu'})
save('project-summary.json',summary)
missing=[{'project':' | '.join(p['project'] for p in d['projects']),'planUrl':d['url'],'status':d['status'],'error':d.get('error','')} for d in manifest if d['status']!='DOWNLOADED']
save('inaccessible-plans.json',missing)
for name,rows in [('keywords-original-cells.csv',raw),('keywords-priority.csv',priority),('keywords-search.csv',final),('keywords-review.csv',list(rg.values())),('project-source-inventory.csv',sources),('project-summary.csv',summary),('subjects-leveled.csv',subjects)]:
 with (root/name).open('w',encoding='utf-8-sig',newline='') as f:
  fields=list(dict.fromkeys(k for r in rows for k in r));w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
  for row in rows:w.writerow({k:json.dumps(v,ensure_ascii=False) if isinstance(v,(list,dict)) else v for k,v in row.items()})
result={'projectRows':len(projects),'plans':len(manifest),'availablePlans':sum(d['status']=='DOWNLOADED' for d in manifest),'inaccessiblePlans':len(missing),'keywordRawCells':len(raw),'keywordGroups':len(groups),'subjects':len(subjects),'proposedSearchQueries':len(final),'priorityQueries':len(priority),'reviewCells':len(rg),'liveSearchChecks':len(evidence),'sourceImport':{'before':24115,'after':29248,'inserted':5133,'eligibleNew':361,'pendingNew':4772,'modifiedAssociations':1388},'status':'Source nhập xong; bản tách đã tạo. Keyword mới là đề xuất, chưa chốt hết do còn query chưa kiểm tra live, vai trò chưa rõ và plan không truy cập được.'}
save('delivery-summary.json',result)
with zipfile.ZipFile(root/'du-lieu-chi-tiet-2026-11-10.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in root.glob('*.csv'):z.write(p,p.name)
 for n in ['delivery-summary.json','search-evidence.json','inaccessible-plans.json','keywords-search.json','keyword-unparsed-rows.json']:z.write(root/n,n)
print(json.dumps(result,ensure_ascii=False))
