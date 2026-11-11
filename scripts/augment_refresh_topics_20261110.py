import json,re
from pathlib import Path
from extract_project_sources import read_book
root=Path('outputs/project-refresh-2026-11-10');p=root/'topics-original.json';topics=json.loads(p.read_text(encoding='utf-8'))
id='1qtPtqt5uLoQpVS1Nz7uP8T3dZedJO7-_324kQYmbRcQ'
known={(t.get('sourceDocument',''),t['row']) for t in topics}
added=0
for s in read_book(root/'plans'/(id+'.xlsx')):
 for no,row in s['rows'].items():
  t=lambda c:row.get(c,{}).get('text','').strip()
  role=re.sub(r'\s','',t('G')).lower()
  if role not in ('mainbrand','competitor') or not re.fullmatch('[a-f0-9]{24}',t('D')) or (id,no) in known:continue
  topics.append(dict(row=no,client=t('B'),project=t('C'),projectIds=t('D'),subject=t('E'),topicId=t('F'),planUrl=t('H'),role='Mainbrand' if role=='mainbrand' else 'Competitor',sourceDocument=id,sourceSheet=s['name'],scopeStatus=t('I')));added+=1
p.write_text(json.dumps(topics,ensure_ascii=False,indent=2),encoding='utf-8');print('Added topic roles:',added)
