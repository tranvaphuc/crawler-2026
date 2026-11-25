set -euo pipefail
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import {gunzipSync} from 'node:zlib';const r=JSON.parse(fs.readFileSync('/var/lib/news-flow/qc-remaining29-20261122/public-api.json')),p=r.checks.find(p=>p.url.includes('/js/app.js')),s=gunzipSync(fs.readFileSync(p.file)).toString();for(const term of ['/api/posts/homepage','/api/posts','/api/ticker-news']){const i=s.indexOf(term);console.log(JSON.stringify({term,contract:s.slice(Math.max(0,i-180),i+1450)}));}
NODE
