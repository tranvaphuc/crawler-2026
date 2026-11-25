set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {createRequire} from 'node:module';const require=createRequire('/opt/news-flow/current/package.json'),ch=require('cheerio'),root='/var/lib/news-flow/qc-alt25-20261122',r=JSON.parse(fs.readFileSync(root+'/routes.json')),o={at:new Date().toISOString(),native:r.sites.filter(s=>s.markup.length).map(s=>({site:s.site,markup:s.markup})),cnn:[],biggo:[]};
for(const s of r.sites.filter(s=>s.site==='edition.cnn.com'))for(const p of s.jobs.filter(p=>p.file&&!p.error&&new URL(p.url).hostname==='lite.cnn.com')){const html=gunzipSync(fs.readFileSync(p.file)).toString(),$=ch.load(html);o.cnn.push({url:p.url,head:$('head').html()?.slice(0,8000),body:$('body').text().replace(/\s+/g,' ').slice(0,6000),links:p.links});}
const assets=JSON.parse(fs.readFileSync('/var/lib/news-flow/qc-remaining28-20261122/biggo-assets.json'));for(const p of assets.checks.filter(p=>p.hasApiModule||p.url.includes('/app/news/'))){const text=gunzipSync(fs.readFileSync(p.file)).toString(),i=text.indexOf('/news/home/list');o.biggo.push({url:p.url,readDetail:i>=0?text.slice(Math.max(0,i-1500),i+1100):undefined,apiModule:p.hasApiModule?text.slice(text.indexOf('58421:'),text.indexOf('58421:')+6500):undefined});}
fs.writeFileSync(root+'/native-inspection.json',JSON.stringify(o,null,2));console.log(JSON.stringify(o));
NODE
install -o "$SUDO_USER" -m 0600 /var/lib/news-flow/qc-alt25-20261122/native-inspection.json "$upload_dir/.qc-alt25-native-inspection.json"
