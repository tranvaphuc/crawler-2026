set -euo pipefail
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {loadNewsRegistry} from './src/newsFlow/registry.mjs';import {registerOriginalSources} from './src/newsFlow/baomoiOriginalBranch.mjs';import {ThreeFlowState} from './src/newsFlow/threeFlowState.mjs';
const db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true}),registry=await loadNewsRegistry(),staticCount=registry.sources.size;registerOriginalSources(db,registry);ThreeFlowState.prototype.loadOverlays.call({db,configureSites:()=>{}},registry);console.log(JSON.stringify({at:new Date().toISOString(),staticSources:staticCount,totalSources:registry.sources.size,configSeeds:[...registry.sources.values()].reduce((n,s)=>n+s.seeds.length,0),liveSeeds:db.prepare('SELECT status,count(*) n FROM seed_sources GROUP BY status').all(),sourcesQuarantined:[...registry.sources.values()].filter(s=>s.config.originalPublicationBlockedReason).length,aiUsage:db.prepare('SELECT * FROM ai_usage ORDER BY day DESC LIMIT 1').all(),queue:db.prepare("SELECT role,state,count(*) n FROM tasks WHERE state IN ('pending','running') GROUP BY role,state").all(),schema:db.prepare("SELECT name,sql FROM sqlite_master WHERE type='index' AND tbl_name IN ('article_links','import_receipts')").all()}));db.close();
NODE
free -m
uptime
systemctl list-units --type=service --state=running --no-legend 'news-*'
