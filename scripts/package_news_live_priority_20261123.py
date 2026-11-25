"""Package the final live-priority changes against the fetched VPS baseline."""
from pathlib import Path
import json,tarfile
out=Path('outputs/news-category-coverage-20261123');changes=[]
def file_text(p):return Path(p).read_text(encoding='utf-8')
def claim_block(s):
 start=s.index("    const key='three_flow_site_cursor_'+role")
 return s[start:s.index('\n   }\n   if(!task)',start)]
old=file_text(out/'live-state-freshness-before.mjs');new=file_text('src/newsFlow/threeFlowState.mjs')
changes.append({'path':'src/newsFlow/threeFlowState.mjs','before':claim_block(old),'after':claim_block(new)})
p='src/newsFlow/threeFlowRuntime.mjs';before=file_text(out/'live-runtime-freshness-before.mjs');after=file_text(p)
changes.append({'path':p,'before':before,'after':after})
p='src/newsFlow/discoveryHealth.mjs';changes.append({'path':p,'before':file_text(out/'live-health-freshness-before.mjs'),'after':file_text(p)})
(out/'live-priority-delta.json').write_text(json.dumps(changes),encoding='utf-8')
with tarfile.open(out/'live-priority.tar.gz','w:gz') as t:
 t.add(out/'live-priority-delta.json',arcname='delta.json')
 for p in ['src/newsFlow/liveAdmission.mjs','test/news-live-priority.test.mjs','test/news-discovery-health.test.mjs']:t.add(p,arcname=p)
print('FINAL_LIVE_PRIORITY_BUNDLE_PACKAGED')
