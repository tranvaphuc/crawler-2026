set -euo pipefail
cd /opt/news-flow/current
/opt/news-flow/node/bin/node --input-type=module - <<'NODE'
import {DatabaseSync} from 'node:sqlite';import {loadNewsRegistry} from './src/newsFlow/registry.mjs';import {categoryUrl} from './src/newsFlow/categoryCoverage.mjs';
const db=new DatabaseSync('/var/lib/news-flow/category-coverage-20261123/audit.sqlite',{readOnly:true}),registry=await loadNewsRegistry(),source=registry.sources.get('quochoi.vn');const rows=db.prepare("SELECT url,origin,depth FROM pages WHERE site='quochoi.vn' AND state='pending' ORDER BY depth,key LIMIT 8").all().map(r=>{let path=new URL(r.url).pathname,decoded=[];for(let n=0;n<3;n++){try{path=decodeURIComponent(path);decoded.push(path);}catch{break;}}return {...r,accepted:!!categoryUrl(r.url,r.url,source),decoded};});console.log(JSON.stringify({remaining:db.prepare("SELECT count(*) n FROM pages WHERE site='quochoi.vn' AND state!='done'").get().n,rows}));db.close();
NODE
