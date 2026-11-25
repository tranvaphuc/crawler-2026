import json,re,sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
r=Path('outputs/project-refresh-2026-11-10')
a=[json.loads(x) for x in (r/'completion/source-checks.jsonl').read_text(encoding='utf-8').splitlines()]
out=[]
for v in [x for x in a if x['platform']=='facebook' and x.get('responseFile')][:12]:
 h=Path(v['responseFile']).read_text(encoding='utf-8')
 ids={k:list(dict.fromkeys(re.findall(r'"'+k+r'"\s*:\s*"?(\d+)',h)))[:6] for k in ['groupID','group_id','pageID','page_id','profile_id']}
 out.append({'url':v['inputUrl'],'title':v.get('responseTitle'),'ids':ids,'candidate':v.get('candidateNativeId')})
print(json.dumps(out,ensure_ascii=False))
