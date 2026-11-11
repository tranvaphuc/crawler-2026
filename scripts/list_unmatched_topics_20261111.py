import json,collections
from pathlib import Path
p=Path('outputs/project-refresh-2026-11-10/completion')
rows=json.loads((p/'topic-decisions-final.json').read_text(encoding='utf8'))
projects=json.loads((p/'projects-final-summary.json').read_text(encoding='utf8'))
active={x['project'] for x in projects if x['status']!='stop'}
groups=collections.defaultdict(list)
for x in rows:
 if x['project'] in active and x['decision']=='EXCLUDED':groups[x['project']].append(x['subject'])
for name,subjects in groups.items():
 if not __import__('sys').argv[1:] or name in __import__('sys').argv[1:]:print(name+' ('+str(len(subjects))+')\n'+'\n'.join(subjects))
