set -euo pipefail
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import {gunzipSync} from 'node:zlib';const r=JSON.parse(fs.readFileSync('/var/lib/news-flow/qc-remaining28-20261122/biggo-assets.json'));for(const p of r.checks.filter(p=>p.hasApiModule||p.url.includes('/app/news/'))){const s=gunzipSync(fs.readFileSync(p.file)).toString();console.log(JSON.stringify({url:p.url,newsDetail:s.match(/.{0,160}(?:concat\(e|concat\(t|news_id:e|newsId|params:.*locale).{0,200}/g)?.filter(s=>/news|_.wi/.test(s)).slice(0,8),apiSetup:p.hasApiModule?s.slice(s.indexOf('58421:'),s.indexOf('58421:')+4000):undefined}));}
NODE
