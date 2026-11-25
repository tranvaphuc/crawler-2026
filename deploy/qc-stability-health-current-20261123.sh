set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {loadNewsRegistry} from './src/newsFlow/registry.mjs';import {registerOriginalSources} from './src/newsFlow/baomoiOriginalBranch.mjs';import {collectDiscoveryHealth} from './src/newsFlow/discoveryHealth.mjs';const root='/var/lib/news-flow/stability-20261123',db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true}),registry=await loadNewsRegistry();registerOriginalSources(db,registry);const r=collectDiscoveryHealth(db,registry.sources.values());db.close();fs.writeFileSync(root+'/current-discovery-health.json',JSON.stringify(r,null,2));console.log(JSON.stringify({at:r.checkedAt,totalSites:r.totalSites,alertSites:r.alertSites,counts:r.counts,sites:r.sites.map(s=>({site:s.site,alerts:s.alerts}))}));
NODE
install -o "$SUDO_USER" -m 0600 /var/lib/news-flow/stability-20261123/current-discovery-health.json "$upload_dir/.qc-stability-current-discovery-health.json"
