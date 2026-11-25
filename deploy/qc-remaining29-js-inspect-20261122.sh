set -euo pipefail
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import {gunzipSync} from 'node:zlib';const r=JSON.parse(fs.readFileSync('/var/lib/news-flow/qc-remaining29-20261122/public-api.json'));for(const p of r.checks.filter(p=>p.kind==='js'&&p.file)){const s=gunzipSync(fs.readFileSync(p.file)).toString(),index=s.indexOf('/ajax/load-new-news');if(index>=0)console.log(JSON.stringify({url:p.url,readOnlyListingCode:s.slice(Math.max(0,index-750),index+1600)}));}
NODE
