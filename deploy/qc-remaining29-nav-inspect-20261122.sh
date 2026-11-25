set -euo pipefail
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {createRequire} from 'node:module';const require=createRequire('/opt/news-flow/current/package.json'),ch=require('cheerio'),probe=JSON.parse(fs.readFileSync('/var/lib/news-flow/qc-remaining29-20261122/probe.json'));
for(const domain of ['vntravel.org.vn','tieudungplus.vn']){const s=probe.sites.find(s=>s.site===domain),p=s.seeds.find(p=>p.file&&!p.error),$=ch.load(gunzipSync(fs.readFileSync(p.file)).toString());console.log(JSON.stringify({site:domain,links:$('a[href]').toArray().filter(e=>/\/c\//.test($(e).attr('href'))).slice(0,5).map(e=>({url:$(e).attr('href'),text:$(e).text(),parents:$(e).parents().toArray().slice(0,5).map(e=>({tag:e.tagName,attr:$(e).attr()}))})),head:$('head script:not([src])').map((i,e)=>$(e).text()).get().filter(s=>/WN_Data|WN_Blog/.test(s)).map(s=>s.slice(0,2500))}));}
NODE
