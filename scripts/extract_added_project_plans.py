import json,re,sys
from pathlib import Path
from extract_project_sources import read_book

root=Path('outputs/source-audit-additions-2026-10-22')
old=json.loads(Path('outputs/project-sources-2026-10-21/plans-manifest.json').read_text())
known={d['id'] for d in old}
sheet=next(s for s in read_book(root/'project-list.xlsx') if s['name']=='Main')
projects=[];docs={}
for rowno,row in sheet['rows'].items():
 if rowno==1:continue
 text=lambda col:row.get(col,{}).get('text','')
 raw=' '.join([text('D'),row.get('D',{}).get('link',''),row.get('D',{}).get('note','')])
 p={'row':rowno,'project':text('A'),'projectIds':text('B'),'url':raw,'status':text('E'),'note':text('F')}
 projects.append(p)
 for url in re.findall(r'https?://[^\s<>"\x00]+',raw):
  m=re.search(r'(?:spreadsheets/d|file/d)/([\w-]+)',url)
  if not m or m[1] in known:continue
  d=docs.setdefault(m[1],{'id':m[1],'url':url,'kind':'sheet' if '/spreadsheets/' in url else 'drive','projects':[]})
  if p not in d['projects']:d['projects'].append(p)
(root/'projects-current.json').write_text(json.dumps(projects,ensure_ascii=False,indent=2))
(root/'new-plans.json').write_text(json.dumps(list(docs.values()),ensure_ascii=False,indent=2))
print(json.dumps({'projects':len(projects),'knownPlans':len(known),'newPlans':list(docs.values())},ensure_ascii=False))
