set -euo pipefail
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import {DatabaseSync} from 'node:sqlite';import {loadNewsRegistry} from './src/newsFlow/registry.mjs';import {registerOriginalSources} from './src/newsFlow/baomoiOriginalBranch.mjs';import {ThreeFlowState} from './src/newsFlow/threeFlowState.mjs';import {collectDiscoveryHealth} from './src/newsFlow/discoveryHealth.mjs';
const db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true}),registry=await loadNewsRegistry();registerOriginalSources(db,registry);ThreeFlowState.prototype.loadOverlays.call({db,configureSites:()=>{}},registry);const h=collectDiscoveryHealth(db,registry.sources.values()),live=h.sites.filter(s=>s.alerts.includes('live_articles_waiting_over_five_minutes'));console.log(JSON.stringify({at:h.checkedAt,sources:registry.sources.size,delayedLivePublishers:live.length,delayedLive:live.map(s=>({site:s.site,...s.liveWaiting})),fireantPresent:[...registry.sources.keys()].some(s=>/(^|\.)fireant\.vn$/.test(s)),ai:db.prepare('SELECT * FROM ai_usage ORDER BY day DESC LIMIT 1').get()}));db.close();
NODE
python3 - <<'PY'
import json,sqlite3,time
from pathlib import Path
r=Path('/var/lib/news-flow/category-coverage-20261123');b=json.loads((r/'adaptive-slots-baseline.json').read_text());d=sqlite3.connect('file:'+str(r/'audit.sqlite')+'?mode=ro',uri=True);now=int(time.time()*1000);n=d.execute("SELECT count(*) FROM pages WHERE site='quochoi.vn' AND state='done'").fetchone()[0];print(json.dumps({'adaptiveSlotMinutes':round((now-b['at'])/60000,2),'pagesChecked':n-b['checked'],'recentResponses':d.execute("SELECT status,error,count(*) FROM pages WHERE site='quochoi.vn' AND state='done' AND checked_at>? GROUP BY 1,2",[b['at']]).fetchall(),'remaining':d.execute("SELECT count(*) FROM pages WHERE state!='done'").fetchone()[0]}))
PY
