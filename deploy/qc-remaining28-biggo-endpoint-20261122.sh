set -euo pipefail
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import {gunzipSync} from 'node:zlib';const r=JSON.parse(fs.readFileSync('/var/lib/news-flow/qc-remaining28-20261122/biggo-assets.json')),p=r.checks.find(p=>p.url.includes('/app/news/')),s=gunzipSync(fs.readFileSync(p.file)).toString(),i=s.indexOf('/news/home/list');console.log(s.slice(Math.max(0,i-450),i+1600));
NODE
