import sys,json,re,urllib.request,concurrent.futures,time
from pathlib import Path
from extract_project_sources import read_book
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path('outputs/project-refresh-2026-11-10'); (ROOT/'plans').mkdir(exist_ok=True)
def save(name,data): (ROOT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
sheets=list(read_book(ROOT/'project-list.xlsx'))
projects=[]; docs={}; topics=[]
for s in sheets:
 for no,row in s['rows'].items():
  if no==1:continue
  t=lambda c:row.get(c,{}).get('text','').strip()
  if s['name']=='Sheet1':
   topics.append(dict(row=no,client=t('A'),project=t('B'),projectIds=t('C'),subject=t('D'),topicId=t('E'),planUrl=t('F'),role=t('G')))
  if s['name']!='Main' or not t('A'):continue
  p=dict(row=no,project=t('A'),projectIds=t('B'),status=t('E'),note=t('F'),url=t('D'))
  projects.append(p)
  for u in re.findall(r'https?://[^\s<>]+',t('D')+' '+row.get('D',{}).get('link','')):
   m=re.search(r'(?:spreadsheets/d|file/d)/([\w-]+)',u)
   if not m:continue
   d=docs.setdefault(m[1],dict(id=m[1],url=u,projects=[],file=str(ROOT/'plans'/(m[1]+'.xlsx'))))
   if p not in d['projects']:d['projects'].append(p)
save('projects-current.json',projects);save('topics-original.json',topics)
def fetch(d):
 path=Path(d['file'])
 if path.exists():d['status']='DOWNLOADED';return d
 try:
  req=urllib.request.Request('https://docs.google.com/spreadsheets/d/'+d['id']+'/export?format=xlsx',headers={'User-Agent':'Mozilla/5.0'})
  with urllib.request.urlopen(req,timeout=45) as r: b=r.read()
  if b[:2]!=b'PK':raise ValueError('Not an XLSX export')
  path.write_bytes(b); d['status']='DOWNLOADED'
 except Exception as e:d['status']='ACCESS_OR_EXPORT_ERROR';d['error']=str(e)
 return d
if '--download' in sys.argv:
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  for i,d in enumerate(pool.map(fetch,docs.values())):
   save('plans-manifest.json',list(docs.values()))
   print(json.dumps(dict(done=i+1,total=len(docs),id=d['id'],status=d['status'])),flush=True)
else:save('plans-manifest.json',list(docs.values()))
print(json.dumps(dict(projects=len(projects),plans=len(docs),topics=len(topics))))
