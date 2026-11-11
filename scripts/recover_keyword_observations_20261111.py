"""Recover only q/t search records already returned by our browser tool in this chat.
No browser profile, cookies, private application state or other chats are read.
"""
import json,re,ast
from pathlib import Path
transcript=Path('C:/Users/PC Master Race/.codex/sessions/2026/11/10/rollout-2026-11-10T22-33-10-01a1c617-7dfa-7582-b4b3-169fe10720c7.jsonl')
out=Path('outputs/project-refresh-2026-11-10/completion')
quoted=r'''(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)'''
pattern=re.compile(r'\{\s*q:\s*('+quoted+r')\s*,\s*t:\s*\[((?:\s*'+quoted+r'\s*,?)*)\]',re.S)
def value(s):
 if s.startswith('`'):return s[1:-1].replace(r'\`','`')
 return ast.literal_eval(s)
calls={};records=[]
for line in transcript.open(encoding='utf8'):
 try:item=json.loads(line)
 except json.JSONDecodeError:continue
 if item.get('type')!='response_item':continue
 p=item['payload']
 if p.get('type')=='function_call' and p.get('name')=='js':
  try:code=json.loads(p.get('arguments','{}')).get('code','')
  except (ValueError,TypeError):continue
  batch=re.search(r'let\s+(\w+)\s*=\s*await\s+(?:validateBatch2026|validateDetailedBatch2026)',code)
  if batch:calls[p['call_id']]=batch[1]
 if p.get('type')=='function_call_output' and p.get('call_id') in calls:
  content=p.get('output',[])
  texts=[v.get('text','') for v in content if isinstance(v,dict)] if isinstance(content,list) else [str(content)]
  rows=[]
  for text in texts:
   for m in pattern.finditer(text):
    try:rows.append({'q':value(m[1]),'t':[value(z[0]) for z in re.finditer(quoted,m[2])]})
    except (ValueError,SyntaxError):continue
  for i,row in enumerate(rows):records.append({**row,'batch':calls[p['call_id']],'index':i,'observedAt':item.get('timestamp'),'callId':p['call_id']})
(out/'recovered-browser-observations.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
review=json.loads((out/'batch-adjudications.json').read_text(encoding='utf8'))
accepted=[]
for x in records:
 decision=review.get(x['batch'])
 if decision is None:continue
 good=decision=='all' or isinstance(decision,dict) and x['index'] not in decision.get('reject',[]) and (not decision.get('acceptOnly') or x['index'] in decision['acceptOnly'])
 if good and x['t']:accepted.append(x)
(out/'batch-accepted-observations.json').write_text(json.dumps(accepted,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'observed':len(records),'accepted':len(accepted),'batches':{b:sum(x['batch']==b for x in records) for b in dict.fromkeys(x['batch'] for x in records)}}))
