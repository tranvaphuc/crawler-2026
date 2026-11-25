set -euo pipefail
upload_dir=$(getent passwd "$SUDO_USER" | cut -d: -f6)
root=/var/lib/news-flow/qc-close25-20261122
cd /opt/news-flow/current
runuser -u news-flow -- /opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import fs from 'node:fs';import {gunzipSync} from 'node:zlib';const old=JSON.parse(fs.readFileSync('/var/lib/news-flow/qc-remaining28-20261122/biggo-public-api.json')),report={at:new Date().toISOString(),biggo:[]};for(const p of old.checks.filter(p=>!p.error&&p.file)){const d=JSON.parse(gunzipSync(fs.readFileSync(p.file)).toString()),out={url:p.url,examples:[]};let n=0;function walk(v){if(!v||typeof v!=='object'||++n>5000)return;if(Array.isArray(v)){v.slice(0,30).forEach(walk);return;}if(v.id&&v.title&&out.examples.length<4)out.examples.push({id:v.id,title:v.title,fields:Object.fromEntries(Object.entries(v).filter(([k])=>/content|summary|timestamp|date/i.test(k)).map(([k,x])=>[k,{type:typeof x,chars:typeof x==='string'?x.length:JSON.stringify(x||null).length,preview:typeof x==='string'?x.slice(0,400):JSON.stringify(x||null).slice(0,600)}]))});for(const x of Object.values(v))if(x&&typeof x==='object')walk(x);}walk(d);report.biggo.push(out);}fs.writeFileSync('/var/lib/news-flow/qc-close25-20261122/payload-inspection.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
NODE
install -o "$SUDO_USER" -m 0600 "$root/payload-inspection.json" "$upload_dir/.qc-close25-payload-inspection.json"
