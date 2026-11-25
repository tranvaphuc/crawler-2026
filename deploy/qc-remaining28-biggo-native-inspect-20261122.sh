set -euo pipefail
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {createRequire} from 'node:module';const require=createRequire('/opt/news-flow/current/package.json'),ch=require('cheerio'),r=JSON.parse(fs.readFileSync('/var/lib/news-flow/qc-remaining28-20261122/public-followup.json'));for(const p of r.checks.filter(p=>p.route==='direct_diagnostic'&&p.file)){const html=gunzipSync(fs.readFileSync(p.file)).toString(),$=ch.load(html);console.log(JSON.stringify({url:p.url,scripts:$('script[src]').map((i,e)=>$(e).attr('src')).get().filter(u=>/app\/.*page-/.test(u)),api:html.match(/.{0,100}(?:api\.biggo\.com|\/api\/v\d\/|news_id).{0,180}/g)?.slice(0,8),free:$('script[type="application/ld+json"]').text().slice(0,900)}));}
const js=r.checks.find(p=>p.kind==='js');if(js){const s=gunzipSync(fs.readFileSync(js.file)).toString();console.log(JSON.stringify({code:s.slice(0,1500),networkRefs:s.match(/.{0,160}(?:fetch\(|\.get\(|axios|endpoint|api\/|newsList|newsDetail).{0,230}/g)?.slice(0,14)}));}
NODE
